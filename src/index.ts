export type {
  ClientInfo,
  ForceScheme,
  PhaseProgressEvent,
  ProgressEvent,
  Server,
  ServerListOptions,
  SpeedTestOptions,
  SpeedTestResult,
  TestPhase,
  TransferProgressEvent,
  TransferResult,
  PingResult,
} from "./types.js";

export { listServers } from "./servers.js";
export { selectServer, runSpeedTest } from "./run.js";
export { DEFAULT_SERVER_LIST_URL } from "./utils.js";
