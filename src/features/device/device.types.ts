export type DeviceState =
  | "idle"
  | "scanning"
  | "results"
  | "connecting"
  | "recovering"
  | "connected"
  | "error";

export type DeviceConnectionErrorCode =
  | "UNSUPPORTED_BROWSER"
  | "PERMISSION_DENIED"
  | "LOCAL_NETWORK_PERMISSION_DENIED"
  | "LOCAL_NETWORK_BLOCKED"
  | "SCAN_NETWORK_ERROR"
  | "NO_DEVICE_FOUND"
  | "DEVICE_NOT_FOUND"
  | "CONNECTION_TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "NOT_OVIS_DEVICE"
  | "UNSUPPORTED_API_VERSION"
  | "DEVICE_CHANGED"
  | "DEVICE_DISCONNECTED";

export interface OvisDeviceInfo {
  protocol: "ovis-device";
  api_version: number;
  device_id: string;
  name: string;
  model: string;
  serial: string;
  firmware_version: string;
  manager_version: string;
}

export interface DiscoveredDevice {
  apiBaseUrl: string;
  info: OvisDeviceInfo;
  status: "online" | "offline";
}

export type LocalNetworkPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

export interface DiscoveryReport {
  devices: DiscoveredDevice[];
  durationMs: number;
  attempted: number;
  timedOut: number;
  immediateFailures: number;
  permissionState: LocalNetworkPermissionState;
  failureReason?: "permission-denied" | "browser-blocked" | "network-error";
}

export interface UseDeviceConnection {
  state: DeviceState;
  devices: DiscoveredDevice[];
  selectedDevice: DiscoveredDevice | null;
  device: OvisDeviceInfo | null;
  error: DeviceConnectionErrorCode | null;
  connectedAt: Date | null;
  applicationLocked: boolean;
  discoveryReport: DiscoveryReport | null;
  scan(): Promise<void>;
  cancelScan(): void;
  selectDevice(deviceId: string): void;
  connect(): Promise<void>;
  connectManualAddress(ipAddress: string): Promise<void>;
  disconnect(): void;
  rescan(): Promise<void>;
  retry(): Promise<void>;
  setApplicationLocked(locked: boolean): void;
  adoptRecoveredDevice(apiBaseUrl: string, info: OvisDeviceInfo): void;
}
