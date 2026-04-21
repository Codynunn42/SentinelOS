import express from 'express';
import { NextFunction, Request, Response } from 'express';
import { handlePropose } from './rpc/propose.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { azureAuth, isProductionLikeRuntime, isSmokeAuthAllowed } from './azureAuth.js';
import { requireRole } from './rbac.js';
import { handleCommand } from './rpc/command.js';
import { handleCommandQuery } from './rpc/commandQuery.js';
import { handleChat } from './rpc/chat.js';
import * as sharedLibs from 'shared-libs';
import { buildTrigentPilotDemo } from './trigentPilotDemo.js';
import rateLimit from 'express-rate-limit';

const { safeLog, safeError } = sharedLibs;

const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();

// Cookie parser for session management
app.use(cookieParser());

// Performance optimizations
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.disable('x-powered-by'); // Remove Express header for security
app.set('trust proxy', 1); // Trust first proxy for rate limiting

// Simple in-memory rate limiting (replace with Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  const clientData = rateLimitMap.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_WINDOW });
    return next();
  }

  if (clientData.count >= RATE_LIMIT) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later',
    });
  }

  clientData.count++;
  next();
}

// Apply rate limiting to all routes
app.use(rateLimit);

app.use('/v1', azureAuth, (req: Request, res: Response, next: NextFunction) => {
  if (!req.sentinelIdentity) {
    res.status(401).json({ error: 'unauthenticated', message: 'Azure identity required' });
    return;
  }
  next();
});

function getAuditMeta(req: Request) {
  return {
    tenantId: req.sentinelIdentity?.tenantId ?? null,
    actorId: req.sentinelIdentity?.actorId ?? null,
    operator: req.sentinelIdentity?.operator ?? null,
    authSource: 'azure',
    roles: req.sentinelIdentity?.roles ?? [],
    timestamp: new Date().toISOString(),
  };
}

const billingOperatorRoute = requireRole(['billing.operator', 'billing.admin'])(
  async (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      operation: 'billing.health',
      meta: getAuditMeta(req),
      service: {
        readiness: 'ready',
        uptime: process.uptime(),
      },
    });
  }
);

const billingFinalizeRoute = requireRole(['billing.operator', 'billing.admin'])(
  async (req: Request, res: Response) => {
    res.status(200).json({
      status: 'accepted',
      operation: 'billing.finalize',
      meta: getAuditMeta(req),
      request: req.body ?? {},
    });
  }
);

const billingListRoute = requireRole(['billing.operator', 'billing.admin'])(
  async (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      operation: 'billing.list',
      meta: getAuditMeta(req),
      reports: [],
      request: req.body ?? {},
    });
  }
);

const billingRetryRoute = requireRole('billing.admin')(async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'accepted',
    operation: 'billing.retry',
    meta: getAuditMeta(req),
    request: req.body ?? {},
  });
});

const billingReconcileRoute = requireRole('billing.admin')(async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'accepted',
    operation: 'billing.reconcile',
    meta: getAuditMeta(req),
    request: req.body ?? {},
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.status(200).type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sentinel Control Plane</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe4;
        --panel: #fffaf0;
        --ink: #1f2937;
        --muted: #5b6472;
        --line: #d6c8a8;
        --accent: #0f766e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(15,118,110,0.10), transparent 28%),
          linear-gradient(180deg, #f8f3e8 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 880px;
        margin: 0 auto;
        padding: 48px 20px 64px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 20px 50px rgba(31, 41, 55, 0.08);
      }
      h1, h2 { margin: 0 0 12px; }
      h1 { font-size: clamp(2rem, 4vw, 3rem); }
      h2 { font-size: 1.1rem; margin-top: 28px; }
      p, li { color: var(--muted); line-height: 1.6; }
      .status {
        display: inline-block;
        margin-bottom: 16px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(15,118,110,0.12);
        color: var(--accent);
        font-size: 0.95rem;
      }
      code {
        background: rgba(15,118,110,0.08);
        padding: 2px 6px;
        border-radius: 6px;
        color: #134e4a;
      }
      ul {
        padding-left: 20px;
        margin: 10px 0 0;
      }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <div class="status">Sentinel is online</div>
        <h1>Sentinel Control Plane</h1>
        <p>
          This endpoint hosts the Sentinel API service. It is intended for authenticated
          API clients, automation, and internal operator workflows rather than general
          browser use.
        </p>

        <h2>Health</h2>
        <ul>
          <li><a href="/health"><code>GET /health</code></a> returns service health and runtime stats.</li>
          <li><a href="/ready"><code>GET /ready</code></a> returns readiness status.</li>
        </ul>

        <h2>Pilot Demo</h2>
        <ul>
          <li><a href="/pilot/trigent/demo"><code>GET /pilot/trigent/demo</code></a> returns a Trigent pilot sample dataset, analysis, and command examples.</li>
        </ul>

        <h2>API Routes</h2>
        <ul>
          <li><code>POST /v1/command</code> executes a Sentinel command envelope.</li>
          <li><code>POST /v1/command/query</code> queries command receipts and status.</li>
          <li><code>POST /v1/chat</code> returns a conversational Sentinel operator response.</li>
          <li><code>POST /v1/actions/propose</code> accepts prototype action proposals.</li>
        </ul>

        <h2>Authentication</h2>
        <p>
          Most <code>/v1</code> routes require a valid Azure bearer token. Direct browser access to
          protected command routes will not work without API authentication.
        </p>
      </section>
    </main>
  </body>
</html>`);
});

app.get('/pilot/trigent/demo', (_req: Request, res: Response) => {
  res.status(200).json(buildTrigentPilotDemo());
});

app.get('/v1/billing/health', billingOperatorRoute);
app.post('/v1/billing/health', billingOperatorRoute);
app.post('/v1/billing/finalize-usage', billingFinalizeRoute);
app.post('/v1/billing/reports/query', billingListRoute);
app.post('/v1/billing/reports/retry-failed', billingRetryRoute);
app.post('/v1/billing/reports/reconcile', billingReconcileRoute);
const protectedChatHandler = requireRole(['billing.operator', 'billing.admin'])(handleChat);
app.post('/v1/chat', chatRateLimiter, protectedChatHandler);
app.post('/v1/command', handleCommand);
app.post('/v1/command/query', handleCommandQuery);

if (isSmokeAuthAllowed()) {
  app.get(
    '/v1/_smoke/rbac',
    smokeRbacRateLimiter,
    requireRole('billing.operator')((req: Request, res: Response) => {
      res.status(200).json({
        ok: true,
        actorId: req.sentinelIdentity?.actorId ?? null,
        roles: req.sentinelIdentity?.roles ?? [],
      });
    })
  );
}

// SECURITY WARNING: This is a prototype authentication mechanism
// TODO: Replace with proper mTLS, JWT, or API key authentication for production
app.post('/v1/actions/propose', async (req: Request, res: Response) => {
  const auth = req.headers['x-service'] as string | undefined;

  // Basic validation - MUST be replaced with proper auth in production
  if (!auth || auth !== 'nunnpay') {
    safeError(`Unauthorized access attempt from ${req.ip} with service: ${auth}`);
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Valid service authentication required',
    });
  }

  // Basic request validation
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Request body must be a valid JSON object',
    });
  }

  try {
    await handlePropose(req, res);
  } catch (error) {
    safeError('Error handling propose request:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'An internal error occurred',
    });
  }
});

// Health check endpoint with performance metrics
app.get('/health', (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
    },
  });
});

app.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// Cleanup rate limit map periodically without pinning the process during tests.
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

rateLimitCleanupTimer.unref();

// ESM entry point detection - normalize paths to handle symlinks and different separators
const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    safeLog(`Sentinel prototype listening on ${port}`);
    if (isSmokeAuthAllowed()) {
      safeLog('Sentinel smoke authentication is enabled for local development only');
    } else if (isProductionLikeRuntime()) {
      safeLog('Sentinel Azure-backed authentication is required for protected routes');
    } else {
      safeLog('WARNING: Prototype service auth remains enabled for /v1/actions/propose');
    }
  });
}

export default app;
