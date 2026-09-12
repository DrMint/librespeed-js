import { describe, expect, it, vi, afterEach } from "vitest";
import { isServerUp, measurePing } from "../src/ping.js";
import { getIpInfo } from "../src/get-ip.js";
import { selectServer, runSpeedTest } from "../src/run.js";
import type { Server } from "../src/types.js";

const server: Server = {
  id: 10,
  name: "Test",
  server: "https://speed.example.com/",
  dlURL: "garbage.php",
  ulURL: "empty.php",
  pingURL: "empty.php",
  getIpURL: "getIP.php",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ping", () => {
  it("isServerUp requires empty 200 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );
    expect(await isServerUp(server)).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      }),
    );
    expect(await isServerUp(server)).toBe(false);
  });

  it("measurePing returns average after discarding first sample", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call++;
        // Make later calls "faster" by not sleeping; timing is wall-clock.
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }),
    );

    const result = await measurePing(server, 5);
    expect(call).toBe(5);
    expect(result.ping).toBeGreaterThanOrEqual(0);
    expect(result.jitter).toBeGreaterThanOrEqual(0);
  });
});

describe("getIpInfo", () => {
  it("parses processedString and rawIspInfo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            processedString: "1.2.3.4 - Example ISP",
            rawIspInfo: {
              ip: "1.2.3.4",
              org: "Example ISP",
              city: "Amsterdam",
              country: "NL",
            },
          }),
      }),
    );

    const info = await getIpInfo(server);
    expect(info.ip).toBe("1.2.3.4");
    expect(info.org).toBe("Example ISP");
    expect(info.city).toBe("Amsterdam");
    expect(info.processedString).toContain("Example ISP");
  });
});

describe("selectServer / runSpeedTest", () => {
  it("selectServer picks the lowest ping among up servers", async () => {
    const servers: Server[] = [
      { ...server, id: 1, name: "Slow", server: "https://slow.example/" },
      { ...server, id: 2, name: "Fast", server: "https://fast.example/" },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        // ping URL check / ping samples
        if (u.includes("slow.example")) {
          await new Promise((r) => setTimeout(r, 30));
        } else {
          await new Promise((r) => setTimeout(r, 1));
        }
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(0),
          text: async () => "",
        };
      }),
    );

    const selected = await selectServer({ servers });
    expect(selected.id).toBe(2);
  });

  it("runSpeedTest with noDownload/noUpload returns ping only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("getIP")) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                processedString: "9.9.9.9 - Test",
                rawIspInfo: { ip: "9.9.9.9" },
              }),
          };
        }
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(0),
          text: async () => "",
        };
      }),
    );

    const phases: string[] = [];
    const result = await runSpeedTest({
      servers: [server],
      serverId: 10,
      noDownload: true,
      noUpload: true,
      pingCount: 3,
      onProgress: (e) => {
        if (e.type === "phase") phases.push(e.phase);
      },
    });

    expect(result.server.name).toBe("Test");
    expect(result.download).toBe(0);
    expect(result.upload).toBe(0);
    expect(result.client.ip).toBe("9.9.9.9");
    expect(phases).toContain("ping");
    expect(phases).toContain("ip");
    expect(phases).not.toContain("download");
    expect(phases).not.toContain("upload");
  });
});

describe("live smoke (optional)", () => {
  it.skipIf(!process.env.LIBRESPEED_LIVE)(
    "lists real LibreSpeed servers",
    async () => {
      const { listServers: liveList } = await import("../src/servers.js");
      const servers = await liveList({ timeoutMs: 20_000 });
      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0]?.dlURL).toBeTruthy();
    },
    30_000,
  );
});
