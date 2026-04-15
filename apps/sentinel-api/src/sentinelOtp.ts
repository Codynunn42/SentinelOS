import type { SentinelCommandEnvelope } from './sentinelCommandTypes.js';

function getConfiguredOtp(): string | null {
  const allowInsecureSmokeOtp =
    process.env.SENTINEL_SMOKE_AUTH === '1' &&
    process.env.NODE_ENV !== 'production';

  const configured =
    process.env.SENTINEL_COMMAND_OTP ??
    process.env.SENTINEL_ADMIN_OTP ??
    (allowInsecureSmokeOtp ? '123456' : null);

  if (typeof configured !== 'string') {
    return null;
  }

  const trimmed = configured.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateCommandOtp(envelope: SentinelCommandEnvelope): {
  ok: boolean;
  code?: string;
  message?: string;
} {
  if (!envelope.requires?.otp) {
    return { ok: true };
  }

  if (!envelope.otp) {
    return {
      ok: false,
      code: 'SENTINEL_OTP_REQUIRED',
      message: 'OTP is required for this command',
    };
  }

  const configuredOtp = getConfiguredOtp();
  if (!configuredOtp) {
    return {
      ok: false,
      code: 'SENTINEL_OTP_UNAVAILABLE',
      message: 'OTP validation is not configured for this command',
    };
  }

  if (envelope.otp !== configuredOtp) {
    return {
      ok: false,
      code: 'SENTINEL_OTP_INVALID',
      message: 'OTP validation failed',
    };
  }

  return { ok: true };
}
