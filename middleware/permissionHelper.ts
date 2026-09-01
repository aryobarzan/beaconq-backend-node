import process from 'process';
import crypto from 'crypto';
import type { Request } from 'express';

/**
 * Header carrying the admin password.
 *
 * It used to be a URL path segment (`/admin/users/:adminPassword`), which meant
 * every admin request wrote the password into the HTTP request log and into
 * nginx's access log. A header keeps it out of both: pino redacts it (see
 * middleware/requestLogger.ts) and nginx does not log request headers.
 */
export const ADMIN_PASSWORD_HEADER = 'x-admin-password';

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * crypto.timingSafeEqual throws when the buffers differ in length, and the
 * length of the supplied value is itself attacker-controlled, so both sides are
 * hashed first: SHA-256 digests are always 32 bytes, so the comparison is
 * well-defined and constant time with respect to the secret.
 */
function secretsMatch(supplied: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

const functions = {
  /**
   * Read the admin password from the request.
   *
   * Prefers the header. Falls back to the request body, which is where
   * changeUserPassword has always carried it — request bodies are not logged,
   * so that route never leaked and does not need to change.
   */
  getAdminPassword: function (req: Request): string {
    const header = req.headers[ADMIN_PASSWORD_HEADER];
    if (typeof header === 'string') {
      return header;
    }
    if (Array.isArray(header)) {
      return header[0] ?? '';
    }
    const body = (req.body ?? {}) as { adminPassword?: unknown };
    return typeof body.adminPassword === 'string' ? body.adminPassword : '';
  },

  isUserAdmin: function (userId: string, adminPassword: string): boolean {
    const expectedUserId = process.env.ADMIN_USER_ID;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedUserId || !expectedPassword) {
      return false;
    }
    if (!userId || !adminPassword) {
      return false;
    }

    // Both comparisons are evaluated before combining them, so the outcome does
    // not reveal which of the two failed.
    const userIdMatches = secretsMatch(userId, expectedUserId);
    const passwordMatches = secretsMatch(adminPassword, expectedPassword);

    return userIdMatches && passwordMatches;
  },
};

export default functions;
