export type DeviceState =
  | "idle"
  | "scanning"
  | "results"
  | "connecting"
  | "initializing"
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

export interface InitializedDevice {
  initialization: "initialized";
  source: "network";
  deviceId: string;
  ipAddress: string;
  apiBaseUrl: string;
  info: OvisDeviceInfo;
  status: "online" | "offline";
}

export interface UninitializedDevice {
  initialization: "uninitialized";
  source: "webusb";
  deviceId: string;
  usbSession: import("./webusb.api").OvisUsbDevice;
  info: import("./webusb.api").OvisUsbDeviceInfo;
}

export type DiscoveredOvisDevice = InitializedDevice | UninitializedDevice;

// Existing configuration code only accepts initialized network devices.
export type DiscoveredDevice = InitializedDevice;

export type LocalNetworkPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

export interface DiscoveryReport {
  devices: DiscoveredOvisDevice[];
  durationMs: number;
  attempted: number;
  timedOut: number;
  immediateFailures: number;
  permissionState: LocalNetworkPermissionState;
  failureReason?: "permission-denied" | "browser-blocked" | "network-error";
}

export interface DeviceConnectionFailure {
  deviceId: string;
  apiBaseUrl: string;
  code: DeviceConnectionErrorCode;
}

export interface UseDeviceConnection {
  state: DeviceState;
  devices: DiscoveredOvisDevice[];
  selectedDevice: DiscoveredOvisDevice | null;
  initializedDevices: InitializedDevice[];
  device: OvisDeviceInfo | null;
  error: DeviceConnectionErrorCode | null;
  connectedAt: Date | null;
  applicationLocked: boolean;
  usbAvailable: boolean;
  usbPreflightReady: boolean;
  usbAuthorizationPending: boolean;
  usbIssue: string | null;
  discoveryReport: DiscoveryReport | null;
  scanInProgress: boolean;
  connectionFailure: DeviceConnectionFailure | null;
  scan(): Promise<void>;
  cancelScan(): void;
  selectDevice(deviceId: string): void;
  connect(): Promise<void>;
  connectManualAddress(ipAddress: string): Promise<void>;
  disconnect(): void;
  resetNetwork(): Promise<void>;
  rescan(): Promise<void>;
  retry(): Promise<void>;
  cancelInitialization(): void;
  removeUninitializedDevice(deviceId: string): void;
  setApplicationLocked(locked: boolean): void;
  adoptRecoveredDevice(apiBaseUrl: string, info: OvisDeviceInfo): void;
}
