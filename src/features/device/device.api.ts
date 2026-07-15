import type {
  DeviceConnectionErrorCode,
  DiscoveredDevice,
  OvisDeviceInfo,
} from "./device.types";

const CONNECTION_TIMEOUT_MS = 3_000;
const SCAN_TIMEOUT_MS = 1_500;
const MAX_SCAN_CONCURRENCY = 4;
const SUPPORTED_API_VERSION = 1;

export const DEVICE_HOSTS = Array.from(
  { length: 16 },
  (_, index) => `192.168.${42 + index}.1`,
);

export const DEVICE_API_BASE_URLS = DEVICE_HOSTS.map(
  (host) => `http://${host}:8080/api/v1`,
);

type LocalRequestInit = RequestInit & {
  targetAddressSpace: "local";
};

interface FetchDeviceInfoOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

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

  return value as OvisDeviceInfo;
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

export async function fetchDeviceInfo(
  apiBaseUrl: string,
  options: FetchDeviceInfoOptions = {},
): Promise<OvisDeviceInfo> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? CONNECTION_TIMEOUT_MS,
  );
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });

  const requestOptions: LocalRequestInit = {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    targetAddressSpace: "local",
    signal: controller.signal,
  };

  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/$/, "")}/device/info`,
      requestOptions,
    );
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
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function discoverDevices(
  signal: AbortSignal,
): Promise<DiscoveredDevice[]> {
  const results: Array<DiscoveredDevice | undefined> = new Array(
    DEVICE_API_BASE_URLS.length,
  );
  let nextIndex = 0;

  const worker = async () => {
    while (!signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= DEVICE_API_BASE_URLS.length) return;

      const apiBaseUrl = DEVICE_API_BASE_URLS[index];
      try {
        const info = await fetchDeviceInfo(apiBaseUrl, {
          timeoutMs: SCAN_TIMEOUT_MS,
          signal,
        });
        results[index] = { apiBaseUrl, info, status: "online" };
      } catch {
        // Unreachable and incompatible addresses are expected during discovery.
      }
    }
  };

  await Promise.all(
    Array.from({ length: MAX_SCAN_CONCURRENCY }, () => worker()),
  );

  const uniqueDevices = new Map<string, DiscoveredDevice>();
  results.forEach((device) => {
    if (device && !uniqueDevices.has(device.info.device_id)) {
      uniqueDevices.set(device.info.device_id, device);
    }
  });
  return [...uniqueDevices.values()];
}
