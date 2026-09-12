import type { ClientInfo, Server } from "./types.js";
import { DEFAULT_USER_AGENT, joinUrl } from "./utils.js";

interface GetIpPayload {
  processedString?: string;
  rawIspInfo?: Record<string, unknown> | string | null;
}

function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function clientFromIsp(
  processedString: string | undefined,
  raw: Record<string, unknown> | undefined,
): ClientInfo {
  const client: ClientInfo = {};
  if (processedString) client.processedString = processedString;

  if (raw) {
    client.ip = pickString(raw, "ip");
    client.hostname = pickString(raw, "hostname");
    client.city = pickString(raw, "city");
    client.region = pickString(raw, "region");
    client.country = pickString(raw, "country");
    client.loc = pickString(raw, "loc");
    client.org = pickString(raw, "org", "as_name", "organization");
    client.postal = pickString(raw, "postal");
    client.timezone = pickString(raw, "timezone");
  }

  if (!client.ip && processedString) {
    const first = processedString.split(/\s+/)[0];
    if (first && /^[\d.:a-fA-F]+$/.test(first)) {
      client.ip = first;
    }
  }

  return client;
}

export async function getIpInfo(
  server: Server,
  distance: "km" | "mi" | "NM" = "km",
  signal?: AbortSignal,
): Promise<ClientInfo> {
  const url = new URL(joinUrl(server.server, server.getIpURL));
  url.searchParams.set("isp", "true");
  url.searchParams.set("distance", distance);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "User-Agent": DEFAULT_USER_AGENT },
    signal,
  });

  const text = await res.text();
  if (!text) return {};

  try {
    const data = JSON.parse(text) as GetIpPayload;
    const raw =
      data.rawIspInfo && typeof data.rawIspInfo === "object"
        ? (data.rawIspInfo as Record<string, unknown>)
        : undefined;
    return clientFromIsp(data.processedString, raw);
  } catch {
    return clientFromIsp(text, undefined);
  }
}
