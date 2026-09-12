import type { ProgressEvent, Server, TransferResult } from "./types.js";
import { ByteCounter, sleep, startProgressTicker } from "./download.js";
import { DEFAULT_USER_AGENT, joinUrl } from "./utils.js";

function createUploadPayload(sizeKiB: number): Uint8Array {
  const size = sizeKiB * 1024;
  const payload = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    payload[i] = (i * 31 + 17) & 0xff;
  }
  const random = new Uint8Array(Math.min(4096, size));
  crypto.getRandomValues(random);
  payload.set(random, 0);
  return payload;
}

/**
 * Concurrent upload test. Uses a Blob body so Content-Length is set
 * (avoids chunked encoding issues with some backends, e.g. librespeed-rs).
 */
export async function measureUpload(
  server: Server,
  options: {
    concurrency: number;
    uploadSizeKiB: number;
    durationSec: number;
    signal?: AbortSignal;
    onProgress?: (event: ProgressEvent) => void;
  },
): Promise<TransferResult> {
  const { concurrency, uploadSizeKiB, durationSec, signal, onProgress } =
    options;
  const url = joinUrl(server.server, server.ulURL);
  const payload = createUploadPayload(uploadSizeKiB);

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
        const body = new Blob([payload]);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept-Encoding": "identity",
            "Content-Type": "application/octet-stream",
          },
          body,
          signal: combined,
        });
        counter.add(payload.byteLength);
        await res.arrayBuffer().catch(() => undefined);
      } catch {
        if (combined.aborted) break;
      }
    }
  };

  counter.start();
  const stopProgress = startProgressTicker(
    "upload",
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
    // aborted
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
