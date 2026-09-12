/** LibreSpeed backend server entry (matches server-list JSON). */
export interface Server {
  id: number;
  name: string;
  /** Base URL of the backend (scheme may be http/https or originally schemeless). */
  server: string;
  dlURL: string;
  ulURL: string;
  pingURL: string;
  getIpURL: string;
  sponsorName?: string;
  sponsorURL?: string;
}

export type ForceScheme = "https" | "http" | "none";

export interface ServerListOptions {
  /** Remote JSON URL. Default: LibreSpeed.org backend server list. */
  serverListUrl?: string;
  /** Use an in-memory server list instead of fetching. */
  servers?: Server[];
  /** Keep only these server IDs. */
  serverIds?: number[];
  /** Alias for a single `serverIds` entry. */
  serverId?: number;
  /** Drop these server IDs. Cannot be combined with serverId(s). */
  excludeIds?: number[];
  /**
   * Force scheme on every server URL.
   * - `https` / `http`: override regardless of list value
   * - `none` (default): keep existing scheme; schemeless becomes `http`
   */
  secure?: boolean;
  insecure?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type TestPhase = "ping" | "download" | "upload" | "ip";

export interface PhaseProgressEvent {
  type: "phase";
  phase: TestPhase;
}

export interface TransferProgressEvent {
  type: "progress";
  phase: "download" | "upload";
  /** Elapsed seconds in this phase. */
  seconds: number;
  /** Current average rate in Mbps. */
  mbps: number;
  /** 0–100 estimated completion for this phase. */
  progress: number;
}

export type ProgressEvent = PhaseProgressEvent | TransferProgressEvent;

export interface SpeedTestOptions extends ServerListOptions {
  /** Upload/download duration in seconds. Default: 15. */
  duration?: number;
  /** Concurrent HTTP streams. Default: 3. */
  concurrency?: number;
  /** `ckSize` query for download (MiB chunks from garbage endpoint). Default: 100. */
  chunks?: number;
  /** Upload payload size in KiB. Default: 1024. */
  uploadSizeKiB?: number;
  /** Skip download measurement. */
  noDownload?: boolean;
  /** Skip upload measurement. */
  noUpload?: boolean;
  /** Distance unit for ISP info: km | mi | NM. Default: km. */
  distance?: "km" | "mi" | "NM";
  /** Number of HTTP ping samples (first discarded). Default: 10. */
  pingCount?: number;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ClientInfo {
  ip?: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
  /** Human-readable string from the backend (e.g. "1.2.3.4 - ISP"). */
  processedString?: string;
}

export interface SpeedTestResult {
  timestamp: Date;
  ping: number;
  jitter: number;
  /** Download rate in Mbps. */
  download: number;
  /** Upload rate in Mbps. */
  upload: number;
  bytesReceived: number;
  bytesSent: number;
  server: {
    id?: number;
    name: string;
    url: string;
  };
  client: ClientInfo;
  /** Reserved for future telemetry share URL. */
  share?: string;
}

export interface PingResult {
  ping: number;
  jitter: number;
}

export interface TransferResult {
  mbps: number;
  bytes: number;
}
