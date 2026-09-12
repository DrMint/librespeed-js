# librespeed-js

Promise-based TypeScript client for [LibreSpeed](https://github.com/librespeed/speedtest) backends.

Talks the same HTTP protocol as [`librespeed-cli`](https://github.com/librespeed/speedtest-cli) (ping, download, upload, getIP)—no Go binary required.

## Install

```bash
npm install librespeed-js
```

Requires **Node.js 18+** (native `fetch`).

## Usage

```ts
import { listServers, runSpeedTest, selectServer } from "librespeed-js";

const servers = await listServers();
console.log(servers.map((s) => `${s.id}: ${s.name}`));

const nearest = await selectServer();
console.log("Selected", nearest.name);

const result = await runSpeedTest({
  serverId: 52,
  onProgress: (event) => {
    if (event.type === "phase") console.log("phase:", event.phase);
    if (event.type === "progress") {
      console.log(`${event.phase}: ${event.mbps.toFixed(2)} Mbps`);
    }
  },
});

console.log(result);
// { ping, jitter, download, upload, bytesReceived, bytesSent, server, client, timestamp }
```

### Custom / self-hosted backends

```ts
await runSpeedTest({
  servers: [
    {
      id: 1,
      name: "Home",
      server: "https://speed.example.com/",
      dlURL: "garbage.php",
      ulURL: "empty.php",
      pingURL: "empty.php",
      getIpURL: "getIP.php",
    },
  ],
});
```

Or load a remote list:

```ts
await listServers({
  serverListUrl: "https://example.com/my-servers.json",
});
```

## API

| Function | Description |
|---|---|
| `listServers(options?)` | Fetch/filter server list |
| `selectServer(options?)` | Lowest HTTP-ping reachable server |
| `runSpeedTest(options?)` | Full test (auto-select or `serverId`) |

### Common options

| Option | Default | Notes |
|---|---|---|
| `serverId` / `serverIds` | — | Restrict to these IDs |
| `excludeIds` | — | Drop these IDs (not with `serverId`) |
| `serverListUrl` | LibreSpeed.org list | Remote JSON |
| `servers` | — | Inline list (skips fetch) |
| `secure` / `insecure` | — | Force https / http |
| `duration` | `15` | Seconds per transfer phase |
| `concurrency` | `3` | Parallel streams |
| `chunks` | `100` | Download `ckSize` (MiB) |
| `uploadSizeKiB` | `1024` | Upload body size |
| `noDownload` / `noUpload` | `false` | Skip a phase |
| `timeoutMs` | `15000` | Used for list/select HTTP |
| `signal` | — | `AbortSignal` |
| `onProgress` | — | Phase + transfer progress |

## Testing

```bash
npm test
```

Optional live smoke (hits LibreSpeed.org):

```bash
LIBRESPEED_LIVE=1 npm test
```

## License

MIT. Protocol and server list format come from the LibreSpeed project ([LGPL-3.0](https://github.com/librespeed/speedtest/blob/master/LICENSE)).
