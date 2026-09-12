import type { ForceScheme, Server } from "./types.js";

export const DEFAULT_SERVER_LIST_URL =
  "https://librespeed.org/backend-servers/servers.php";

export const DEFAULT_USER_AGENT = `librespeed-js/0.1.0`;

export function joinUrl(base: string, pathSegment: string): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = pathSegment.startsWith("/")
    ? pathSegment.slice(1)
    : pathSegment;
  return `${normalizedBase}/${normalizedPath}`;
}

export function resolveForceScheme(
  secure?: boolean,
  insecure?: boolean,
): ForceScheme {
  if (secure && insecure) {
    throw new Error("Cannot set both secure and insecure");
  }
  if (secure) return "https";
  if (insecure) return "http";
  return "none";
}

export function normalizeServerUrl(
  serverUrl: string,
  forceScheme: ForceScheme,
): string {
  let raw = serverUrl.trim();
  if (raw.startsWith("//")) {
    raw = `http:${raw}`;
  }

  const u = new URL(raw);
  if (forceScheme === "https") {
    u.protocol = "https:";
  } else if (forceScheme === "http") {
    u.protocol = "http:";
  } else if (!u.protocol || u.protocol === ":") {
    u.protocol = "http:";
  }

  return u.toString();
}

export function preprocessServers(
  servers: Server[],
  forceScheme: ForceScheme,
  serverIds: number[] | undefined,
  excludeIds: number[] | undefined,
  filter: boolean,
): Server[] {
  if (
    filter &&
    serverIds &&
    serverIds.length > 0 &&
    excludeIds &&
    excludeIds.length > 0
  ) {
    throw new Error("Cannot use both serverIds and excludeIds");
  }

  const normalized = servers.map((s) => ({
    ...s,
    server: normalizeServerUrl(s.server, forceScheme),
  }));

  if (!filter) {
    return normalized;
  }

  if (excludeIds && excludeIds.length > 0) {
    const exclude = new Set(excludeIds);
    return normalized.filter((s) => !exclude.has(s.id));
  }

  if (serverIds && serverIds.length > 0 && !serverIds.includes(-1)) {
    const want = new Set(serverIds);
    const filtered = normalized.filter((s) => want.has(s.id));
    if (filtered.length === 0) {
      throw new Error(`Specified server(s) not found: ${serverIds.join(", ")}`);
    }
    return filtered;
  }

  return normalized;
}

export function wellKnownServerListUrl(serverListUrl: string): string {
  try {
    const u = new URL(serverListUrl);
    if (u.protocol && u.host) {
      return `${u.protocol}//${u.host}/.well-known/librespeed`;
    }
  } catch {
    // fall through
  }
  return `${serverListUrl}/.well-known/librespeed`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Jitter smoothing matching librespeed-cli. */
export function computeJitter(samples: number[]): number {
  let lastPing = 0;
  let jitter = 0;
  for (let idx = 0; idx < samples.length; idx++) {
    const p = samples[idx]!;
    if (idx !== 0) {
      const instJitter = Math.abs(lastPing - p);
      if (idx > 1) {
        if (jitter > instJitter) {
          jitter = jitter * 0.7 + instJitter * 0.3;
        } else {
          jitter = instJitter * 0.2 + jitter * 0.8;
        }
      } else {
        jitter = instJitter;
      }
    }
    lastPing = p;
  }
  return jitter;
}

export function bytesToMbps(bytes: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  return (bytes * 8) / (elapsedSeconds * 1_000_000);
}

export function mergeAbortSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal | undefined {
  const active = signals.filter((s): s is AbortSignal => s != null);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => controller.abort(signal.reason),
      { once: true },
    );
  }
  return controller.signal;
}

export function timeoutSignal(
  timeoutMs: number | undefined,
  parent?: AbortSignal,
): { signal?: AbortSignal; cleanup: () => void } {
  if (timeoutMs == null || timeoutMs <= 0) {
    return { signal: parent, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
  const onParentAbort = () => {
    clearTimeout(timer);
    controller.abort(parent?.reason);
  };
  if (parent) {
    if (parent.aborted) {
      clearTimeout(timer);
      controller.abort(parent.reason);
    } else {
      parent.addEventListener("abort", onParentAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}
