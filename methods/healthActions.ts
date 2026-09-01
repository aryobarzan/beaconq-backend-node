import mongoose from 'mongoose';
import { Request, Response } from 'express';

/**
 * Public service status.
 *
 * `/health` (registered in server.ts) is the liveness probe: it touches nothing
 * and answers as long as the process can serve a request. It is what Docker's
 * HEALTHCHECK and the deploy script use, and it must stay cheap and dependency
 * free — a liveness probe that fails when the database is down would make Docker
 * restart a perfectly healthy container.
 *
 * `/status` is the readiness/diagnostic view, for a status screen in the client
 * app. It reports whether the database is actually reachable and how quickly it
 * answers.
 *
 * This endpoint is unauthenticated on purpose: it is most useful precisely when
 * logging in does not work. It therefore reports only coarse facts, and no
 * hostnames, versions, replica set topology, connection strings or counts —
 * nothing that helps someone attack the service or identify its internals.
 */

const STARTED_AT = Date.now();

// A ping per request would let an unauthenticated caller generate database load,
// so the probe result is reused briefly. Long enough to blunt that, short enough
// that a status screen still feels live.
const CACHE_TTL_MS = 5_000;

// A hung socket must not hold the response open; mongoose would otherwise wait
// for its own server selection timeout.
const PROBE_TIMEOUT_MS = 2_000;

type DatabaseStatus = {
  status: 'ok' | 'unreachable';
  latencyMs: number | null;
};

type ServiceStatus = {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  services: {
    api: { status: 'ok' };
    database: DatabaseStatus;
  };
};

let cachedAt = 0;
let cached: DatabaseStatus | null = null;
// Collapses concurrent misses onto a single probe.
let inFlight: Promise<DatabaseStatus> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('database probe timed out')),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runProbe(): Promise<DatabaseStatus> {
  // 1 === connected. Anything else (connecting, disconnecting, disconnected)
  // means there is nothing to ping.
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { status: 'unreachable', latencyMs: null };
  }

  const startedAt = process.hrtime.bigint();
  try {
    // Ping the application database rather than `admin`: the application user
    // holds readWrite on project_elpis only, and does not need admin rights
    // just to answer a status request.
    await withTimeout(
      mongoose.connection.db.command({ ping: 1 }),
      PROBE_TIMEOUT_MS
    );
    const elapsedNs = Number(process.hrtime.bigint() - startedAt);
    return { status: 'ok', latencyMs: Math.round(elapsedNs / 1e6) };
  } catch {
    // Deliberately swallowed: the reason a probe failed is operational detail
    // that an unauthenticated caller should not receive.
    return { status: 'unreachable', latencyMs: null };
  }
}

async function probeDatabase(): Promise<DatabaseStatus> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = runProbe()
    .then((result) => {
      cached = result;
      cachedAt = Date.now();
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

const functions = {
  getStatus: async function (_req: Request, res: Response) {
    const database = await probeDatabase();

    const payload: ServiceStatus = {
      // The API answered, so it is up by definition; "degraded" means the API
      // is serving but a dependency it needs is not available.
      status: database.status === 'ok' ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'ok' },
        database,
      },
    };

    // 503 when degraded so uptime monitors and clients can rely on the status
    // code alone, without parsing the body.
    return res
      .status(payload.status === 'ok' ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json(payload);
  },
};

export default functions;
