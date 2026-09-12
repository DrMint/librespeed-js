import { describe, expect, it, vi, afterEach } from "vitest";
import { listServers } from "../src/servers.js";
import {
  average,
  computeJitter,
  normalizeServerUrl,
  preprocessServers,
  wellKnownServerListUrl,
  bytesToMbps,
} from "../src/utils.js";
import type { Server } from "../src/types.js";

const sampleServers: Server[] = [
  {
    id: 1,
    name: "Alpha",
    server: "//alpha.example.com/backend",
    dlURL: "garbage.php",
    ulURL: "empty.php",
    pingURL: "empty.php",
    getIpURL: "getIP.php",
  },
  {
    id: 2,
    name: "Beta",
    server: "https://beta.example.com/",
    dlURL: "garbage",
    ulURL: "empty",
    pingURL: "empty",
    getIpURL: "getIP",
  },
  {
    id: 3,
    name: "Gamma",
    server: "http://gamma.example.com/speed/",
    dlURL: "garbage.php",
    ulURL: "empty.php",
    pingURL: "empty.php",
    getIpURL: "getIP.php",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("utils", () => {
  it("normalizes schemeless URLs to http by default", () => {
    expect(normalizeServerUrl("//host.example/backend", "none")).toBe(
      "http://host.example/backend",
    );
  });

  it("forces https when secure", () => {
    expect(normalizeServerUrl("http://host.example/", "https")).toBe(
      "https://host.example/",
    );
  });

  it("builds well-known fallback from origin", () => {
    expect(
      wellKnownServerListUrl(
        "https://librespeed.org/backend-servers/servers.php",
      ),
    ).toBe("https://librespeed.org/.well-known/librespeed");
  });

  it("computes average and jitter like the CLI", () => {
    expect(average([10, 20, 30])).toBe(20);
    const jitter = computeJitter([10, 12, 11, 15]);
    expect(jitter).toBeGreaterThan(0);
    expect(Number.isFinite(jitter)).toBe(true);
  });

  it("converts bytes to Mbps", () => {
    // 1_250_000 bytes in 1s = 10 Mbps
    expect(bytesToMbps(1_250_000, 1)).toBe(10);
  });

  it("filters by serverIds and excludeIds", () => {
    const byId = preprocessServers(sampleServers, "none", [2], undefined, true);
    expect(byId).toHaveLength(1);
    expect(byId[0]?.id).toBe(2);

    const excluded = preprocessServers(
      sampleServers,
      "none",
      undefined,
      [1, 3],
      true,
    );
    expect(excluded.map((s) => s.id)).toEqual([2]);
  });

  it("rejects combining serverIds and excludeIds", () => {
    expect(() =>
      preprocessServers(sampleServers, "none", [1], [2], true),
    ).toThrow(/both serverIds and excludeIds/);
  });
});

describe("listServers", () => {
  it("returns inline servers with normalized schemes", async () => {
    const servers = await listServers({ servers: sampleServers });
    expect(servers).toHaveLength(3);
    expect(servers[0]?.server).toMatch(/^http:\/\//);
    expect(servers[1]?.server).toMatch(/^https:\/\//);
  });

  it("filters by serverId", async () => {
    const servers = await listServers({
      servers: sampleServers,
      serverId: 3,
    });
    expect(servers).toHaveLength(1);
    expect(servers[0]?.name).toBe("Gamma");
  });

  it("fetches remote JSON and falls back to well-known", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sampleServers,
      });
    vi.stubGlobal("fetch", fetchMock);

    const servers = await listServers({
      serverListUrl: "https://example.com/servers.php",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://example.com/.well-known/librespeed",
    );
    expect(servers).toHaveLength(3);
  });
});
