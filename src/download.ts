import type { ProgressEvent, Server, TransferResult } from "./types.js";
import { bytesToMbps, DEFAULT_USER_AGENT, joinUrl, round2 } from "./utils.js";

class ByteCounter {
  total = 0;
  private startedAt = 0;

  start(): void {
    this.startedAt = performance.now();
    this.total = 0;
  }

  add(n: number): void {
    this.total += n;
  }

  elapsedSeconds(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  avgMbps(): number {
    return bytesToMbps(this.total, this.elapsedSeconds());
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readBodyCounting(
  res: Response,
  counter: ByteCounter,
  signal?: AbortSignal,
): Promise<void> {
  if (!res.body) {
    const buf = await res.arrayBuffer();
    counter.add(buf.byteLength);
    return;
  }

  const reader = res.body.getReader();
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (value) counter.add(value.byteLength);
    }
  } finally {
    reader.releaseLock();
  }
}

function startProgressTicker(
  phase: "download" | "upload",
  counter: ByteCounter,
  durationSec: number,
  onProgress?: (event: ProgressEvent) => void,
): () => void {
  if (!onProgress) return () => {};

  const started = performance.now();
  const timer = setInterval(() => {
    const seconds = (performance.now() - started) / 1000;
    onProgress({
      type: "progress",
      phase,
      seconds: round2(seconds),
      mbps: round2(counter.avgMbps()),
      progress: Math.min(100, Math.floor((seconds / durationSec) * 100)),
    });
  }, 1000);

  return () => clearInterval(timer);
}

export async function measureDownload(
  server: Server,
  options: {
    concurrency: number;
    chunks: number;
    durationSec: number;
    signal?: AbortSignal;
    onProgress?: (event: ProgressEvent) => void;
  },
): Promise<TransferResult> {
  const { concurrency, chunks, durationSec, signal, onProgress } = options;
  const base = new URL(joinUrl(server.server, server.dlURL));
  base.searchParams.set("ckSize", String(chunks));

  const counter = new ByteCounter();
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  const combined = controller.signal;
  let spawning = true;

  const runOne = async (): Promise<void> => {
    while (spawning && !combined.aborted) {
      try {
        const res = await fetch(base.toString(), {
          method: "GET",
          headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept-Encoding": "identity",
          },
          signal: combined,
        });
        await readBodyCounting(res, counter, combined);
      } catch {
        if (combined.aborted) break;
      }
    }
  };

  counter.start();
  const stopProgress = startProgressTicker(
    "download",
    counter,
    durationSec,
    onProgress,
  );

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runOne());
    if (i < concurrency - 1) {
      try {
        await sleep(200, combined);
      } catch {
        break;
      }
    }
  }

  try {
    await sleep(durationSec * 1000, combined);
  } catch {
    // aborted or finished
  } finally {
    spawning = false;
    controller.abort();
    stopProgress();
    signal?.removeEventListener("abort", onOuterAbort);
  }

  await Promise.allSettled(workers);

  return {
    mbps: counter.avgMbps(),
    bytes: counter.total,
  };
}

/** Shared helpers for upload module. */
export { ByteCounter, sleep, startProgressTicker };
