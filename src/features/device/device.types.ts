export type DeviceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type DeviceConnectionErrorCode =
  | "UNSUPPORTED_BROWSER"
  | "PERMISSION_DENIED"
  | "DEVICE_NOT_FOUND"
  | "CONNECTION_TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "NOT_OVIS_DEVICE"
  | "UNSUPPORTED_API_VERSION";

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

export interface UseDeviceConnection {
  state: DeviceConnectionState;
  device: OvisDeviceInfo | null;
  error: DeviceConnectionErrorCode | null;
  connectedAt: Date | null;
  connect(): Promise<void>;
  disconnect(): void;
  retry(): Promise<void>;
}
