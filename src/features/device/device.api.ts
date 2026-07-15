import type {
  DeviceConnectionErrorCode,
  OvisDeviceInfo,
} from "./device.types";

const REQUEST_TIMEOUT_MS = 3_000;
const SUPPORTED_API_VERSION = 1;

type LocalRequestInit = RequestInit & {
  targetAddressSpace: "local";
};

export class DeviceConnectionError extends Error {
  constructor(public readonly code: DeviceConnectionErrorCode) {
    super(code);
    this.name = "DeviceConnectionError";
  }
}

export function isSupportedBrowser(): boolean {
  if (typeof window === "undefined") return false;

  const supportsCoreApis =
    "fetch" in window &&
    "AbortController" in window &&
    "Request" in window;
  const userAgent = window.navigator.userAgent;
  const isChromium = /Chrome|Chromium|Edg\//.test(userAgent);
  const isExcludedChromiumFork = /OPR\//.test(userAgent);

  return supportsCoreApis && isChromium && !isExcludedChromiumFork;
}

type DeviceInfoShape = {
  protocol: string;
  api_version: number;
  device_id: string;
  name: string;
  model: string;
  serial: string;
  firmware_version: string;
  manager_version: string;
};

function isDeviceInfoShape(value: unknown): value is DeviceInfoShape {
  if (typeof value !== "object" || value === null) return false;

  const info = value as Record<string, unknown>;
  return (
    typeof info.protocol === "string" &&
    typeof info.api_version === "number" &&
    typeof info.device_id === "string" &&
    typeof info.name === "string" &&
    typeof info.model === "string" &&
    typeof info.serial === "string" &&
    typeof info.firmware_version === "string" &&
    typeof info.manager_version === "string"
  );
}

function validateDeviceInfo(value: unknown): OvisDeviceInfo {
  if (!isDeviceInfoShape(value)) {
    throw new DeviceConnectionError("INVALID_RESPONSE");
  }
  if (value.protocol !== "ovis-device") {
    throw new DeviceConnectionError("NOT_OVIS_DEVICE");
  }
  if (value.api_version !== SUPPORTED_API_VERSION) {
    throw new DeviceConnectionError("UNSUPPORTED_API_VERSION");
  }
  if (value.device_id.trim().length === 0 || value.serial.trim().length === 0) {
    throw new DeviceConnectionError("INVALID_RESPONSE");
  }

  return value as unknown as OvisDeviceInfo;
}

function mapRequestError(error: unknown): DeviceConnectionError {
  if (error instanceof DeviceConnectionError) return error;
  if (error instanceof DOMException) {
    if (error.name === "AbortError") {
      return new DeviceConnectionError("CONNECTION_TIMEOUT");
    }
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return new DeviceConnectionError("PERMISSION_DENIED");
    }
  }

  return new DeviceConnectionError("NETWORK_ERROR");
}

export async function fetchDeviceInfo(): Promise<OvisDeviceInfo> {
  const apiUrl = import.meta.env.VITE_DEVICE_API_URL?.replace(/\/$/, "");
  if (!apiUrl) {
    throw new DeviceConnectionError("NETWORK_ERROR");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestOptions: LocalRequestInit = {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    targetAddressSpace: "local",
    signal: controller.signal,
  };

  try {
    const response = await fetch(`${apiUrl}/device/info`, requestOptions);
    if (response.status === 404) {
      throw new DeviceConnectionError("DEVICE_NOT_FOUND");
    }
    if (!response.ok) {
      throw new DeviceConnectionError("NETWORK_ERROR");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DeviceConnectionError("INVALID_RESPONSE");
    }
    return validateDeviceInfo(body);
  } catch (error) {
    throw mapRequestError(error);
  } finally {
    window.clearTimeout(timeout);
  }
}
