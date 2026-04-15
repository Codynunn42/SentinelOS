import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtPayload = {
  aud?: string | string[];
  iss?: string;
  tid?: string;
  oid?: string;
  upn?: string;
  email?: string;
  preferred_username?: string;
  roles?: unknown[];
  scp?: string;
  nbf?: number;
  exp?: number;
  [key: string]: unknown;
};

type JwksKey = {
  kid: string;
  kty: 'RSA';
  n: string;
  e: string;
};

type JwksResponse = {
  keys: JwksKey[];
};

const jwksCache = new Map<string, { expiresAt: number; keys: Map<string, JwksKey> }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

function getAllowedIssuers(tenantId: string): string[] {
  return [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];
}

export function isProductionLikeRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    typeof process.env.CONTAINER_APP_NAME === 'string' ||
    typeof process.env.CONTAINER_APP_REVISION === 'string'
  );
}

export function isSmokeAuthAllowed(): boolean {
  return process.env.SENTINEL_SMOKE_AUTH === '1' && !isProductionLikeRuntime();
}

function trySmokeIdentity(req: Request): Express.SentinelIdentity | null {
  if (!isSmokeAuthAllowed()) {
    return null;
  }

  const roleHeader = req.headers['x-sentinel-smoke-role'];
  const actorHeader = req.headers['x-sentinel-smoke-actor'];
  const tenantHeader = req.headers['x-sentinel-smoke-tenant'];

  const roles = Array.isArray(roleHeader)
    ? roleHeader.flatMap((value) => value.split(','))
    : typeof roleHeader === 'string'
      ? roleHeader.split(',')
      : [];

  return {
    tenantId:
      typeof tenantHeader === 'string' && tenantHeader.length > 0
        ? tenantHeader
        : '00000000-0000-0000-0000-000000000000',
    actorId:
      typeof actorHeader === 'string' && actorHeader.length > 0
        ? actorHeader
        : 'sentinel-smoke-actor',
    operator: 'sentinel-smoke',
    roles: roles.map((role) => role.trim()).filter(Boolean),
    raw: { smoke: true },
  };
}

function getAuthConfig() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const audience = process.env.AZURE_API_AUDIENCE;
  if (!tenantId || !audience) {
    return null;
  }

  return {
    tenantId,
    audience,
    issuers: getAllowedIssuers(tenantId),
  };
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function parseJwt(token: string): { header: JwtHeader; payload: JwtPayload; signingInput: string; signature: Buffer } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as JwtHeader;
  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as JwtPayload;

  return {
    header,
    payload,
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: decodeBase64Url(encodedSignature),
  };
}

async function getJwksKey(tenantId: string, kid: string): Promise<JwksKey | null> {
  const now = Date.now();
  const cached = jwksCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.keys.get(kid) ?? null;
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = (await response.json()) as JwksResponse;
  const keys = new Map(jwks.keys.map((key) => [key.kid, key]));
  jwksCache.set(tenantId, {
    expiresAt: now + JWKS_TTL_MS,
    keys,
  });

  return keys.get(kid) ?? null;
}

function audienceMatches(expected: string, actual: string | string[] | undefined): boolean {
  if (typeof actual === 'string') {
    return actual === expected;
  }
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }
  return false;
}

function extractRoles(payload: JwtPayload): string[] {
  const tokenRoles = Array.isArray(payload.roles)
    ? payload.roles.filter((role): role is string => typeof role === 'string')
    : [];
  const scopes =
    typeof payload.scp === 'string'
      ? payload.scp
          .split(' ')
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [];

  const effectiveRoles = [...tokenRoles, ...scopes];

  // Azure CLI delegated tokens commonly arrive with the API scope but without app roles.
  // Treat the delegated scope as operator access while keeping admin routes role-gated.
  if (scopes.includes('user_impersonation')) {
    effectiveRoles.push('billing.operator');
  }

  return [...new Set(effectiveRoles)];
}

export async function azureAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const smokeIdentity = trySmokeIdentity(req);
  if (smokeIdentity) {
    req.sentinelIdentity = smokeIdentity;
    next();
    return;
  }

  const authConfig = getAuthConfig();
  if (!authConfig) {
    res.status(503).json({
      error: 'auth_misconfigured',
      message: 'AZURE_TENANT_ID or AZURE_API_AUDIENCE is missing',
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'missing_token',
      message: 'Authorization header missing or malformed',
    });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const { header, payload, signingInput, signature } = parseJwt(token);

    if (header.alg !== 'RS256' || !header.kid) {
      res.status(401).json({ error: 'invalid_token', message: 'Unsupported token format' });
      return;
    }

    const jwk = await getJwksKey(authConfig.tenantId, header.kid);
    if (!jwk) {
      res.status(401).json({ error: 'invalid_token', message: 'Signing key not found' });
      return;
    }

    const publicKey = createPublicKey({
      key: {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
      },
      format: 'jwk',
    });

    const validSignature = verifySignature(
      'RSA-SHA256',
      Buffer.from(signingInput),
      publicKey,
      signature
    );

    if (!validSignature) {
      res.status(401).json({ error: 'invalid_token', message: 'Token validation failed' });
      return;
    }

    if (!audienceMatches(authConfig.audience, payload.aud)) {
      res.status(401).json({ error: 'invalid_audience', message: 'Token audience mismatch' });
      return;
    }

    if (typeof payload.iss !== 'string' || !authConfig.issuers.includes(payload.iss)) {
      res.status(401).json({ error: 'invalid_issuer', message: 'Token issuer mismatch' });
      return;
    }

    if (payload.tid !== authConfig.tenantId) {
      res.status(401).json({ error: 'invalid_tenant', message: 'Token tenant mismatch' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) {
      res.status(401).json({ error: 'invalid_token', message: 'Token not yet valid' });
      return;
    }
    if (typeof payload.exp === 'number' && payload.exp <= now - 60) {
      res.status(401).json({ error: 'invalid_token', message: 'Token expired' });
      return;
    }

    if (typeof payload.oid !== 'string' || payload.oid.length === 0) {
      res.status(401).json({ error: 'invalid_claims', message: 'Token actor claim missing' });
      return;
    }

    const operatorValue = payload.preferred_username ?? payload.upn ?? payload.email;
    const operator = typeof operatorValue === 'string' && operatorValue.length > 0 ? operatorValue : null;

    req.sentinelIdentity = {
      tenantId: payload.tid,
      actorId: payload.oid,
      operator,
      roles: extractRoles(payload),
      raw: payload,
    };

    next();
  } catch {
    res.status(401).json({ error: 'invalid_token', message: 'Token validation failed' });
  }
}
