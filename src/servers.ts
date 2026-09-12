import type { Server, ServerListOptions } from "./types.js";
import {
  DEFAULT_SERVER_LIST_URL,
  DEFAULT_USER_AGENT,
  preprocessServers,
  resolveForceScheme,
  timeoutSignal,
  wellKnownServerListUrl,
} from "./utils.js";

function resolveServerIds(options: ServerListOptions): number[] | undefined {
  if (options.serverIds && options.serverIds.length > 0) {
    return options.serverIds;
  }
  if (options.serverId != null) {
    return [options.serverId];
  }
  return undefined;
}

async function fetchServerListJson(
  url: string,
  signal?: AbortSignal,
): Promise<Server[]> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": DEFAULT_USER_AGENT },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch server list (${res.status}): ${url}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Server list JSON must be an array");
  }
  return data as Server[];
}

/**
 * Load and optionally filter LibreSpeed backend servers.
 *
 * By default fetches from LibreSpeed.org. Pass `servers` for an inline list,
 * or `serverListUrl` for a custom remote JSON file.
 */
export async function listServers(
  options: ServerListOptions = {},
): Promise<Server[]> {
  const forceScheme = resolveForceScheme(options.secure, options.insecure);
  const serverIds = resolveServerIds(options);
  const { signal, cleanup } = timeoutSignal(options.timeoutMs, options.signal);

  try {
    let raw: Server[];
    if (options.servers) {
      raw = options.servers;
    } else {
      const url = options.serverListUrl ?? DEFAULT_SERVER_LIST_URL;
      try {
        raw = await fetchServerListJson(url, signal);
      } catch (err) {
        if (options.signal?.aborted) throw err;
        const fallback = wellKnownServerListUrl(url);
        raw = await fetchServerListJson(fallback, signal);
      }
    }

    return preprocessServers(
      raw,
      forceScheme,
      serverIds,
      options.excludeIds,
      true,
    );
  } finally {
    cleanup();
  }
}
