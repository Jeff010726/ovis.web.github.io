import { discoverDevices, fetchDeviceInfo } from "../device/device.api";
import type { OvisDeviceInfo } from "../device/device.types";
import i18n from "../../i18n";
import type { PendingConfigApplication } from "./config.session";

export const CONFIG_RECONNECT_TIMEOUT_MS = 90_000;
const RECONNECT_INTERVAL_MS = 1_500;
const ORIGINAL_FAILURES_BEFORE_SCAN = 3;

export interface RecoveredConfigDevice {
  apiBaseUrl: string;
  info: OvisDeviceInfo;
}

export class ConfigReconnectTimeoutError extends Error {
  constructor() {
    super(i18n.t("config.validation.reconnectTimeout"));
    this.name = "ConfigReconnectTimeoutError";
  }
}

const delay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });

export async function reconnectConfigDevice(
  pending: PendingConfigApplication,
  signal: AbortSignal,
): Promise<RecoveredConfigDevice> {
  const deadline = pending.started_at + CONFIG_RECONNECT_TIMEOUT_MS;
  let originalFailures = 0;

  while (!signal.aborted && Date.now() < deadline) {
    try {
      const info = await fetchDeviceInfo(pending.api_base_url, {
        timeoutMs: RECONNECT_INTERVAL_MS,
        signal,
      });
      if (info.device_id === pending.device_id) {
        return { apiBaseUrl: pending.api_base_url, info };
      }
    } catch {
      // A rebooting device is expected to refuse or time out temporarily.
    }
    originalFailures += 1;

    if (originalFailures >= ORIGINAL_FAILURES_BEFORE_SCAN) {
      const report = await discoverDevices(signal, pending.api_base_url);
      const matchingDevice = report.devices.find(
        (device) =>
          device.initialization === "initialized" &&
          device.deviceId === pending.device_id,
      );
      if (matchingDevice?.initialization === "initialized") {
        return {
          apiBaseUrl: matchingDevice.apiBaseUrl,
          info: matchingDevice.info,
        };
      }
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await delay(Math.min(RECONNECT_INTERVAL_MS, remaining), signal);
    }
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  throw new ConfigReconnectTimeoutError();
}
