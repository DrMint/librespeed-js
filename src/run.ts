import { measureDownload } from "./download.js";
import { getIpInfo } from "./get-ip.js";
import { isServerUp, measurePing } from "./ping.js";
import { listServers } from "./servers.js";
import type {
  Server,
  ServerListOptions,
  SpeedTestOptions,
  SpeedTestResult,
} from "./types.js";
import { measureUpload } from "./upload.js";
import { round2, timeoutSignal } from "./utils.js";

const DEFAULTS = {
  duration: 15,
  concurrency: 3,
  chunks: 100,
  uploadSizeKiB: 1024,
  pingCount: 10,
  distance: "km" as const,
  timeoutMs: 15_000,
};

async function resolveServers(options: ServerListOptions): Promise<Server[]> {
  return listServers(options);
}

/**
 * Pick the server with the lowest HTTP ping among reachable backends.
 */
export async function selectServer(
  options: ServerListOptions = {},
): Promise<Server> {
  const { signal, cleanup } = timeoutSignal(
    options.timeoutMs ?? DEFAULTS.timeoutMs,
    options.signal,
  );

  try {
    const servers = await resolveServers({ ...options, signal });
    if (servers.length === 0) {
      throw new Error("No servers available");
    }
    if (servers.length === 1) {
      const only = servers[0]!;
      const up = await isServerUp(only, signal);
      if (!up) {
        throw new Error(`Server ${only.name} is not responding`);
      }
      return only;
    }

    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          const up = await isServerUp(server, signal);
          if (!up) return null;
          const { ping } = await measurePing(server, 3, signal);
          return { server, ping };
        } catch {
          return null;
        }
      }),
    );

    let best: { server: Server; ping: number } | null = null;
    for (const r of results) {
      if (!r || r.ping <= 0) continue;
      if (!best || r.ping < best.ping) best = r;
    }

    if (!best) {
      throw new Error("No server is currently available, please try again later");
    }
    return best.server;
  } finally {
    cleanup();
  }
}

async function runAgainstServer(
  server: Server,
  options: SpeedTestOptions,
  signal?: AbortSignal,
): Promise<SpeedTestResult> {
  const duration = options.duration ?? DEFAULTS.duration;
  const concurrency = options.concurrency ?? DEFAULTS.concurrency;
  const chunks = options.chunks ?? DEFAULTS.chunks;
  const uploadSizeKiB = options.uploadSizeKiB ?? DEFAULTS.uploadSizeKiB;
  const pingCount = options.pingCount ?? DEFAULTS.pingCount;
  const distance = options.distance ?? DEFAULTS.distance;
  const onProgress = options.onProgress;

  onProgress?.({ type: "phase", phase: "ip" });
  const client = await getIpInfo(server, distance, signal).catch(() => ({}));

  onProgress?.({ type: "phase", phase: "ping" });
  const { ping, jitter } = await measurePing(server, pingCount, signal);

  let download = 0;
  let bytesReceived = 0;
  if (!options.noDownload) {
    onProgress?.({ type: "phase", phase: "download" });
    const dl = await measureDownload(server, {
      concurrency,
      chunks,
      durationSec: duration,
      signal,
      onProgress,
    });
    download = dl.mbps;
    bytesReceived = dl.bytes;
  }

  let upload = 0;
  let bytesSent = 0;
  if (!options.noUpload) {
    onProgress?.({ type: "phase", phase: "upload" });
    const ul = await measureUpload(server, {
      concurrency,
      uploadSizeKiB,
      durationSec: duration,
      signal,
      onProgress,
    });
    upload = ul.mbps;
    bytesSent = ul.bytes;
  }

  return {
    timestamp: new Date(),
    ping: round2(ping),
    jitter: round2(jitter),
    download: round2(download),
    upload: round2(upload),
    bytesReceived,
    bytesSent,
    server: {
      id: server.id,
      name: server.name,
      url: server.server,
    },
    client,
  };
}

/**
 * Run a LibreSpeed test. If `serverId` / `serverIds` is set, those servers
 * are used; otherwise the lowest-ping server is selected automatically.
 *
 * When multiple `serverIds` are provided, the first successful result is
 * returned (multi-server batching can be added later).
 */
export async function runSpeedTest(
  options: SpeedTestOptions = {},
): Promise<SpeedTestResult> {
  const { signal, cleanup } = timeoutSignal(
    // Overall test is longer than a single HTTP timeout; only apply
    // timeoutMs to list/select unless a parent signal is provided.
    undefined,
    options.signal,
  );

  try {
    const hasExplicitServer =
      options.serverId != null ||
      (options.serverIds != null && options.serverIds.length > 0) ||
      (options.servers != null && options.servers.length === 1);

    let server: Server;
    if (hasExplicitServer) {
      const servers = await listServers({
        ...options,
        signal,
        timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      });
      if (servers.length === 0) {
        throw new Error("No matching servers found");
      }
      server = servers[0]!;
      const up = await isServerUp(server, signal);
      if (!up) {
        throw new Error(`Server ${server.name} is not responding`);
      }
    } else {
      server = await selectServer(options);
    }

    return await runAgainstServer(server, options, signal);
  } finally {
    cleanup();
  }
}
