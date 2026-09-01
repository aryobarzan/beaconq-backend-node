import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Rate limiters.
 *
 * A note on why several of these are keyed by username rather than by IP.
 *
 * This app is used by classes of students, frequently on campus, where everyone
 * shares a small number of public addresses behind NAT. An IP-keyed limit on
 * login would therefore be a self-inflicted outage: one lecture hall starting a
 * quiz at the same moment looks identical to a brute-force attempt, and the
 * whole room gets locked out.
 *
 * Keying credential endpoints by the account being targeted avoids that. It
 * bounds attempts per account, which is the thing actually worth bounding, and
 * a shared address no longer couples unrelated users together.
 *
 * The second reason is that the client IP is not currently trustworthy: the
 * nginx site config does not set X-Forwarded-For, so the address Express sees is
 * the proxy's, not the user's. Until that is fixed (see docs/MIGRATION.md), an
 * IP-keyed limiter would place every request on earth in one bucket. The
 * generous IP limiters below are written to be harmless in that state; the
 * strict limiters do not depend on the IP at all.
 */

const MINUTE = 60 * 1000;

// Shared response, so a limited caller gets something actionable rather than
// bare HTML from the default handler.
const message = {
  message: 'Too many requests. Please wait a moment and try again.',
};

function usernameKey(req: Request): string {
  const body = (req.body ?? {}) as { username?: unknown };
  const fromBody = typeof body.username === 'string' ? body.username : '';
  const fromParams =
    typeof req.params?.username === 'string' ? req.params.username : '';
  const username = (fromBody || fromParams).trim().toLowerCase();
  // Fall back to a single shared bucket when no username was supplied at all:
  // such requests are malformed and cannot be a legitimate user's login.
  return username || 'anonymous';
}

/**
 * Login. Keyed by account, and only failures count — a user logging in
 * successfully many times is not an attack, and should never be throttled.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  keyGenerator: usernameKey,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Account recovery: secret-question lookup and password reset.
 *
 * Also keyed by account. The secret-question route additionally reveals whether
 * a username exists, so limiting it slows enumeration as well as guessing.
 */
export const accountRecoveryLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  keyGenerator: usernameKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Admin endpoints. These sit behind JWT auth already, so a caller always has a
 * token; keying on the authenticated user id bounds password guessing per
 * account and, again, avoids depending on the client IP.
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 20,
  keyGenerator: (req: Request) => req.token?._id ?? 'unauthenticated',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Unauthenticated write endpoints: registration and feedback (which accepts
 * file uploads). Keyed by IP, deliberately generous, so that it still bounds
 * scripted abuse without punishing a shared campus address.
 */
export const publicWriteLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Public status endpoint. The database probe behind it is cached, so this is
 * only a backstop against a client polling in a tight loop.
 */
export const statusLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});
