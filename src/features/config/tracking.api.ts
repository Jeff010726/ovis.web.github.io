import i18n from "../../i18n";
import { fetchLocalDevice, LocalRequestTimeoutError } from "../device/local-request";
import type { TrackingStatus, TrackingTargetSource } from "./config.types";

const REQUEST_TIMEOUT_MS = 5_000;

export type TrackingTargetRequest =
  | { source: "detection"; detection_id: number }
  | { source: "fastsam"; point: { x: number; y: number } }
  | {
      source: "color" | "box";
      box: { x: number; y: number; width: number; height: number };
    };

export class TrackingApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TrackingApiError";
  }
}

const trackingErrorMessage = (code: string | undefined, fallback: string) => {
  if (code === "DETECTION_NOT_ENABLED") {
    return i18n.t("config.tracking.errors.detectionNotEnabled");
  }
  if (code === "AI_RESOURCE_CONFLICT") {
    return i18n.t("config.tracking.errors.resourceConflict");
  }
  if (code === "DETECTION_TARGET_NOT_FOUND") {
    return i18n.t("config.tracking.errors.DETECTION_TARGET_NOT_FOUND");
  }
  if (code === "TRACKING_NOT_ENABLED") {
    return i18n.t("config.tracking.errors.TRACKING_NOT_ENABLED");
  }
  if (code === "TRACKING_TARGET_INVALID") {
    return i18n.t("config.tracking.errors.TRACKING_TARGET_INVALID");
  }
  if (code === "TRACKING_EXTRACT_FAILED") {
    return i18n.t("config.tracking.errors.TRACKING_EXTRACT_FAILED");
  }
  if (code === "TRACKING_INIT_FAILED") {
    return i18n.t("config.tracking.errors.TRACKING_INIT_FAILED");
  }
  return fallback;
};

async function requestTrackingApi<T>(
  apiBaseUrl: string,
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  try {
    const response = await fetchLocalDevice(
      `${apiBaseUrl.replace(/\/$/, "")}${path}`,
      {
        method,
        mode: "cors",
        cache: "no-store",
        headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      },
      {
        timeoutMs: REQUEST_TIMEOUT_MS,
        signal: options.signal,
        retry: method === "GET",
      },
    );
    if (!response.ok) {
      let code: string | undefined;
      let message: string = i18n.t("config.tracking.errors.requestFailed", {
        status: response.status,
      });
      try {
        const body = (await response.json()) as {
          code?: string;
          error?: string | { code?: string; message?: string };
          message?: string;
        };
        const nestedError =
          typeof body.error === "object" && body.error !== null
            ? body.error
            : undefined;
        code =
          body.code ??
          nestedError?.code ??
          (typeof body.error === "string" ? body.error : undefined);
        message = trackingErrorMessage(
          code,
          body.message ?? nestedError?.message ?? message,
        );
      } catch {
        // Keep the status-specific fallback.
      }
      throw new TrackingApiError(message, code, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TrackingApiError) throw error;
    if (
      error instanceof LocalRequestTimeoutError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new TrackingApiError(i18n.t("config.tracking.errors.timeout"));
    }
    throw new TrackingApiError(i18n.t("config.tracking.errors.unreachable"));
  }
}

export const getTrackingStatus = (apiBaseUrl: string, signal?: AbortSignal) =>
  requestTrackingApi<TrackingStatus>(apiBaseUrl, "/tracking/status", { signal });

export const setTrackingTarget = (
  apiBaseUrl: string,
  target: TrackingTargetRequest,
  signal?: AbortSignal,
) => {
  const valid =
    target.source === "detection"
      ? Number.isInteger(target.detection_id) && target.detection_id >= 0
      : target.source === "fastsam"
        ? isNormalizedCoordinate(target.point.x) &&
          isNormalizedCoordinate(target.point.y)
        : isNormalizedCoordinate(target.box.x) &&
          isNormalizedCoordinate(target.box.y) &&
          isNormalizedCoordinate(target.box.width) &&
          isNormalizedCoordinate(target.box.height) &&
          target.box.width > 0 &&
          target.box.height > 0 &&
          target.box.x + target.box.width <= 1 &&
          target.box.y + target.box.height <= 1;
  if (!valid) {
    return Promise.reject(
      new TrackingApiError(
        i18n.t("config.tracking.errors.TRACKING_TARGET_INVALID"),
        "TRACKING_TARGET_INVALID",
      ),
    );
  }
  return requestTrackingApi<TrackingStatus>(apiBaseUrl, "/tracking/target", {
    method: "POST",
    body: target,
    signal,
  });
};

export const clearTrackingTarget = (apiBaseUrl: string, signal?: AbortSignal) =>
  requestTrackingApi<TrackingStatus>(apiBaseUrl, "/tracking/target", {
    method: "DELETE",
    signal,
  });

export const isNormalizedCoordinate = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= 1;

export const supportsTrackingSource = (
  source: string,
): source is TrackingTargetSource =>
  ["detection", "fastsam", "color", "box"].includes(source);
