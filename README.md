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

`npm install` also installs a **pre-commit** hook (`simple-git-hooks`) that runs `npm install` and `check`. Skip once with `SKIP_SIMPLE_GIT_HOOKS=1 git commit …`.

## Releases

Release notes are generated from Conventional Commits (`feat:`, `fix:`, `chore:`, …) with [git-cliff](https://git-cliff.org/) — see [CHANGELOG.md](./CHANGELOG.md) and GitHub Releases.

Preview notes for commits since the last tag:

```bash
npm run changelog
```

Regenerate the full file:

```bash
npm run changelog:write
```

### Cut a release

```bash
npm run release:prep -- patch    # or: minor | major | 0.1.1
```

That bumps `package.json` and rewrites `CHANGELOG.md` for the new tag.

Then:

1. Commit the bump + changelog: `git commit -m "chore(release): vX.Y.Z"`
2. Push and wait for CI to pass.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. **Release** creates the GitHub Release with git-cliff notes; **Publish** publishes to npm on the same tag push (OIDC). Both are triggered by the tag push — not by the GitHub Release event (Actions started with `GITHUB_TOKEN` do not cascade).

### One-time npm trusted publisher setup

On npmjs.com → package **Settings → Trusted Publisher**:

| Field | Value |
|---|---|
| Provider | GitHub Actions |
| Organization | DrMint |
| Repository | librespeed-js |
| Workflow filename | `publish.yml` |
| Allowed action | npm publish |

No `NPM_TOKEN` secret is required for CI. Local emergency publishes still need `npm login` + 2FA OTP.

## License

MIT. Protocol and server list format come from the LibreSpeed project ([LGPL-3.0](https://github.com/librespeed/speedtest/blob/master/LICENSE)).
