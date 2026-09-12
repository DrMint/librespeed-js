import type { PingResult, Server } from "./types.js";
import {
  average,
  computeJitter,
  DEFAULT_USER_AGENT,
  joinUrl,
} from "./utils.js";

export async function isServerUp(
  server: Server,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = joinUrl(server.server, server.pingURL);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      signal,
    });
    if (!res.ok) return false;
    const body = await res.arrayBuffer();
    return body.byteLength === 0;
  } catch {
    return false;
  }
}

/**
 * HTTP ping/jitter against the server's ping URL.
 * Discards the first sample (handshake overhead), matching librespeed-cli.
 */
export async function measurePing(
  server: Server,
  count = 10,
  signal?: AbortSignal,
): Promise<PingResult> {
  const url = joinUrl(server.server, server.pingURL);
  const samples: number[] = [];

  for (let i = 0; i < count; i++) {
    signal?.throwIfAborted();
    const start = performance.now();
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      signal,
    });
    await res.arrayBuffer();
    samples.push(performance.now() - start);
  }

  const usable = samples.length > 1 ? samples.slice(1) : samples;
  return {
    ping: average(usable),
    jitter: computeJitter(usable),
  };
}
