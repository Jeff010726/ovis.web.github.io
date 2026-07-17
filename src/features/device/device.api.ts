import type {
  DeviceConnectionErrorCode,
  DiscoveryReport,
  InitializedDevice,
  LocalNetworkPermissionState,
  OvisDeviceInfo,
} from "./device.types";
import { getRememberedOvisDeviceHosts } from "./webusb.api";

const CONNECTION_TIMEOUT_MS = 3_000;
const SCAN_TIMEOUT_MS = 1_500;
const MAX_SCAN_CONCURRENCY = 16;
const SUPPORTED_API_VERSION = 1;
const IMMEDIATE_FAILURE_THRESHOLD_MS = 300;

export const DEVICE_HOSTS = Array.from(
  { length: 256 },
  (_, index) => `192.168.${index}.1`,
);

export const DEVICE_API_BASE_URLS = DEVICE_HOSTS.map(
  (host) => `http://${host}:8080/api/v1`,
);

interface FetchDeviceInfoOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface DiscoveryAttempt {
  apiBaseUrl: string;
  device?: InitializedDevice;
  timedOut: boolean;
  immediateFailure: boolean;
  networkFailure: boolean;
  permissionDenied: boolean;
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

function isTopLevelDocument(): boolean {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

export function canRequestLocalNetwork(): boolean {
  return window.isSecureContext && isTopLevelDocument();
}

export async function queryLocalNetworkPermission(): Promise<LocalNetworkPermissionState> {
  if (!("permissions" in navigator) || !navigator.permissions?.query) {
    return "unsupported";
  }

  const permissionNames = ["local-network", "local-network-access"] as const;
  for (const name of permissionNames) {
    try {
      const result = await navigator.permissions.query({
        name: name as PermissionName,
      });
      if (
        result.state === "granted" ||
        result.state === "denied" ||
        result.state === "prompt"
      ) {
        return result.state;
      }
    } catch {
      // Try the Chromium compatibility alias before reporting unsupported.
    }
  }
  return "unsupported";
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

  const requestOptions: RequestInit & { targetAddressSpace: "local" } = {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    signal: controller.signal,
    targetAddressSpace: "local",
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

export function buildDeviceApiBaseUrl(ipAddress: string): string | null {
  const normalized = ipAddress.trim();
  const octets = normalized.split(".");
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !/^\d{1,3}$/.test(octet) ||
        Number(octet) < 0 ||
        Number(octet) > 255,
    )
  ) {
    return null;
  }
  return `http://${octets.map(Number).join(".")}:8080/api/v1`;
}

function prioritizedApiBaseUrls(preferredApiBaseUrl?: string | null) {
  const preferred = preferredApiBaseUrl?.replace(/\/$/, "");
  const remembered = getRememberedOvisDeviceHosts().map(
    (host) => `http://${host}:8080/api/v1`,
  );
  return [
    ...(preferred ? [preferred] : []),
    ...remembered,
    ...DEVICE_API_BASE_URLS,
  ].filter((url, index, urls) => urls.indexOf(url) === index);
}

async function attemptDiscoveryAddress(
  apiBaseUrl: string,
  signal: AbortSignal,
): Promise<DiscoveryAttempt> {
  const startedAt = performance.now();
  try {
    const info = await fetchDeviceInfo(apiBaseUrl, {
      timeoutMs: SCAN_TIMEOUT_MS,
      signal,
    });
    return {
      apiBaseUrl,
      device: {
        initialization: "initialized",
        source: "network",
        deviceId: info.device_id,
        ipAddress: new URL(apiBaseUrl).hostname,
        apiBaseUrl,
        info,
        status: "online",
      },
      timedOut: false,
      immediateFailure: false,
      networkFailure: false,
      permissionDenied: false,
    };
  } catch (error) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const requestError =
      error instanceof DeviceConnectionError
        ? error
        : new DeviceConnectionError("NETWORK_ERROR");
    const elapsedMs = performance.now() - startedAt;
    const permissionDenied = requestError.code === "PERMISSION_DENIED";
    const networkFailure = requestError.code === "NETWORK_ERROR";
    return {
      apiBaseUrl,
      timedOut: requestError.code === "CONNECTION_TIMEOUT",
      immediateFailure:
        permissionDenied ||
        (networkFailure && elapsedMs < IMMEDIATE_FAILURE_THRESHOLD_MS),
      networkFailure,
      permissionDenied,
    };
  }
}

export async function discoverDevices(
  signal: AbortSignal,
  preferredApiBaseUrl?: string | null,
): Promise<DiscoveryReport> {
  const startedAt = performance.now();
  let permissionState: LocalNetworkPermissionState = "unsupported";

  const createReport = (
    attempts: DiscoveryAttempt[],
    failureReason?: DiscoveryReport["failureReason"],
  ): DiscoveryReport => {
    const uniqueDevices = new Map<string, InitializedDevice>();
    attempts.forEach(({ device }) => {
      if (device && !uniqueDevices.has(device.info.device_id)) {
        uniqueDevices.set(device.info.device_id, device);
      }
    });
    return {
      devices: [...uniqueDevices.values()],
      durationMs: Math.round(performance.now() - startedAt),
      attempted: attempts.length,
      timedOut: attempts.filter((attempt) => attempt.timedOut).length,
      immediateFailures: attempts.filter((attempt) => attempt.immediateFailure)
        .length,
      permissionState,
      ...(failureReason ? { failureReason } : {}),
    };
  };

  if (!canRequestLocalNetwork()) {
    return createReport([], "browser-blocked");
  }

  const apiBaseUrls = prioritizedApiBaseUrls(preferredApiBaseUrl);
  const attempts: DiscoveryAttempt[] = [];

  // Keep this request as the first async operation after the search button click
  // so Chrome can associate its Local Network Access prompt with that gesture.
  const permissionProbe = await attemptDiscoveryAddress(apiBaseUrls[0], signal);
  attempts.push(permissionProbe);

  permissionState = await queryLocalNetworkPermission();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (permissionState === "denied" || permissionProbe.permissionDenied) {
    return createReport(attempts, "permission-denied");
  }

  let nextIndex = 1;

  const worker = async () => {
    while (!signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= apiBaseUrls.length) return;
      attempts.push(await attemptDiscoveryAddress(apiBaseUrls[index], signal));
    }
  };

  await Promise.all(
    Array.from({ length: MAX_SCAN_CONCURRENCY }, () => worker()),
  );

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const devices = attempts.flatMap((attempt) =>
    attempt.device ? [attempt.device] : [],
  );
  if (devices.length > 0) return createReport(attempts);

  const immediateFailures = attempts.filter(
    (attempt) => attempt.immediateFailure,
  ).length;
  if (attempts.length > 0 && immediateFailures === attempts.length) {
    return createReport(attempts, "browser-blocked");
  }
  if (attempts.some((attempt) => attempt.networkFailure)) {
    return createReport(attempts, "network-error");
  }
  return createReport(attempts);
}
