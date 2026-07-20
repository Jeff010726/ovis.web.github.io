import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import i18n from "../../i18n";
import type { OvisDeviceInfo } from "../device/device.types";
import {
  ConfigRequestError,
  applyConfig,
  getConfigCapabilities,
  getConfigTask,
  getCurrentConfig,
  resetConfig,
  saveConfig,
  validateConfig,
} from "./config.api";
import {
  CONFIG_RECONNECT_TIMEOUT_MS,
  ConfigReconnectTimeoutError,
  reconnectConfigDevice,
} from "./config.recovery";
import {
  clearPendingConfigApplication,
  readPendingConfigApplication,
  writePendingConfigApplication,
} from "./config.session";
import type { PendingConfigApplication } from "./config.session";
import type {
  ConfigApplicationState,
  ConfigApplicationConfirmation,
  ConfigCapabilities,
  ConfigIssue,
  ConfigPayload,
  ConfigTask,
  ConfigValidationResponse,
  ConfigurationOutcome,
  ConfigurationStatus,
  DeviceConfigDocument,
  DeviceConfigValues,
  TpuFeatureId,
} from "./config.types";

const TASK_VERIFY_INTERVAL_MS = 1_500;
const MAX_RESET_TASK_POLLS = 60;

const cloneValues = (values: DeviceConfigValues) => structuredClone(values);

const serializeConfigValues = (
  values: DeviceConfigValues,
): DeviceConfigValues => {
  const serialized: DeviceConfigValues = {
    video: {
      main: {
        profile: values.video.main.profile,
        fps: values.video.main.fps,
        bitrate_kbps: values.video.main.bitrate_kbps,
      },
      sub: {
        enabled: values.video.sub.enabled,
        profile: values.video.sub.profile,
        fps: values.video.sub.fps,
        bitrate_kbps: values.video.sub.bitrate_kbps,
      },
    },
    overlay: {
      enabled: values.overlay.enabled,
    },
    detection: {
      person: {
        enabled: values.detection.person.enabled,
        threshold: values.detection.person.threshold,
      },
      face: {
        enabled: values.detection.face.enabled,
        threshold: values.detection.face.threshold,
      },
      motion: {
        enabled: values.detection.motion.enabled,
        sensitivity: values.detection.motion.sensitivity,
      },
    },
  };

  if (values.outputs) {
    serialized.outputs = {
      rtsp: {
        enabled: values.outputs.rtsp.enabled,
      },
      uvc: {
        enabled: values.outputs.uvc.enabled,
      },
    };
  }

  if (values.detection.human_pose) {
    serialized.detection.human_pose = {
      enabled: values.detection.human_pose.enabled,
      threshold: values.detection.human_pose.threshold,
    };
  }
  if (values.detection.object_tracking) {
    serialized.detection.object_tracking = {
      enabled: values.detection.object_tracking.enabled,
      search_method: values.detection.object_tracking.search_method,
      use_kalman: values.detection.object_tracking.use_kalman,
      score_threshold: values.detection.object_tracking.score_threshold,
    };
  }

  return serialized;
};

const formatError = (error: unknown) => {
  if (error instanceof ConfigRequestError) return error.message;
  if (error instanceof ConfigReconnectTimeoutError) return error.message;
  return i18n.t("config.validation.operationFailed");
};

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

const TPU_FEATURE_IDS: TpuFeatureId[] = [
  "person",
  "face",
  "human_pose",
  "object_tracking",
];

const isTpuFeatureId = (value: string): value is TpuFeatureId =>
  TPU_FEATURE_IDS.includes(value as TpuFeatureId);

const tpuFeatureEnabled = (
  values: DeviceConfigValues,
  featureId: TpuFeatureId,
) => {
  if (featureId === "person" || featureId === "face") {
    return values.detection[featureId].enabled;
  }
  return values.detection[featureId]?.enabled === true;
};

function validateDraftLocally(
  capabilities: ConfigCapabilities,
  values: DeviceConfigValues,
): ConfigIssue[] {
  const errors: ConfigIssue[] = [];

  const validateStream = (
    field: "video.main" | "video.sub",
    stream: DeviceConfigValues["video"]["main"],
    profiles: ConfigCapabilities["video"]["main"]["profiles"],
    validateBitrate = true,
  ) => {
    const profile = profiles.find((entry) => entry.id === stream.profile);
    if (profiles.length > 0 && !profile) {
      errors.push({
        field: `${field}.profile`,
        code: "UNSUPPORTED_PROFILE",
        message: i18n.t("config.validation.unsupportedProfile"),
      });
      return;
    }
    if (!Number.isInteger(stream.fps) || stream.fps <= 0) {
      errors.push({
        field: `${field}.fps`,
        code: "INVALID_FPS",
        message: i18n.t("config.validation.invalidFps"),
      });
    } else if (profile && !profile.fps_options.includes(stream.fps)) {
      errors.push({
        field: `${field}.fps`,
        code: "UNSUPPORTED_FPS",
        message: i18n.t("config.validation.unsupportedFps"),
      });
    }
    if (
      validateBitrate &&
      (!Number.isInteger(stream.bitrate_kbps) || stream.bitrate_kbps <= 0)
    ) {
      errors.push({
        field: `${field}.bitrate_kbps`,
        code: "INVALID_BITRATE",
        message: i18n.t("config.validation.invalidBitrate"),
      });
    } else if (
      validateBitrate &&
      profile &&
      (stream.bitrate_kbps < profile.bitrate_min ||
        stream.bitrate_kbps > profile.bitrate_max)
    ) {
      errors.push({
        field: `${field}.bitrate_kbps`,
        code: "OUT_OF_RANGE",
        message: i18n.t("config.validation.bitrateRange", {
          min: profile.bitrate_min,
          max: profile.bitrate_max,
        }),
      });
    }
  };

  const rtspEnabled =
    capabilities.outputs?.rtsp.supported !== true ||
    values.outputs?.rtsp.enabled === true;
  validateStream(
    "video.main",
    values.video.main,
    capabilities.video.main.profiles,
    rtspEnabled,
  );
  if (rtspEnabled && values.video.sub.enabled) {
    validateStream("video.sub", values.video.sub, capabilities.video.sub.profiles);
  }

  const thresholdFields: Array<[string, number | undefined]> = [];
  (capabilities.ai?.features ?? []).forEach((feature) => {
    if (feature.id === "person" || feature.id === "face") {
      thresholdFields.push([
        `detection.${feature.id}.threshold`,
        values.detection[feature.id].threshold,
      ]);
    } else if (feature.id === "human_pose") {
      thresholdFields.push([
        "detection.human_pose.threshold",
        values.detection.human_pose?.threshold,
      ]);
    } else if (feature.id === "object_tracking") {
      thresholdFields.push([
        "detection.object_tracking.score_threshold",
        values.detection.object_tracking?.score_threshold,
      ]);
    }
  });
  thresholdFields.forEach(([field, value]) => {
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
      errors.push({
        field,
        code: "OUT_OF_RANGE",
        message: i18n.t("config.validation.thresholdRange"),
      });
    }
  });
  if (
    capabilities.ai?.motion_detection &&
    (!Number.isFinite(values.detection.motion.sensitivity) ||
      (values.detection.motion.sensitivity < 0 ||
        values.detection.motion.sensitivity > 100))
  ) {
    errors.push({
      field: "detection.motion.sensitivity",
      code: "OUT_OF_RANGE",
      message: i18n.t("config.validation.sensitivityRange"),
    });
  }

  const activeTpuFeatures = (capabilities.ai?.features ?? [])
    .map((feature) => feature.id)
    .filter(isTpuFeatureId)
    .filter((featureId) => tpuFeatureEnabled(values, featureId));
  if (
    activeTpuFeatures.length >
    (capabilities.ai?.max_active_tpu_features ?? 0)
  ) {
    errors.push({
      field: "detection",
      code: "AI_FEATURE_CONFLICT",
      message: i18n.t("config.validation.aiFeatureConflict"),
    });
  }
  return errors;
}

interface UseDeviceConfigurationOptions {
  apiBaseUrl: string;
  deviceId: string;
  onApplicationLockChange: (locked: boolean) => void;
  onDeviceRecovered: (apiBaseUrl: string, info: OvisDeviceInfo) => void;
}

interface VerificationResult {
  document: DeviceConfigDocument;
  capabilities: ConfigCapabilities;
  task: ConfigTask | null;
}

interface PendingValidatedApplication {
  payload: ConfigPayload;
  controller: AbortController;
}

export function useDeviceConfiguration({
  apiBaseUrl,
  deviceId,
  onApplicationLockChange,
  onDeviceRecovered,
}: UseDeviceConfigurationOptions) {
  const pendingAtMount = useMemo(() => {
    const pending = readPendingConfigApplication();
    return pending?.device_id === deviceId ? pending : null;
  }, [deviceId]);
  const [status, setStatus] = useState<ConfigurationStatus>("loading");
  const [applicationState, setApplicationState] =
    useState<ConfigApplicationState>(
      pendingAtMount ? "reconnecting" : "idle",
    );
  const [capabilities, setCapabilities] = useState<ConfigCapabilities | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [targetRevision, setTargetRevision] = useState<string | null>(
    pendingAtMount?.target_revision ?? null,
  );
  const [original, setOriginal] = useState<DeviceConfigValues | null>(null);
  const [draft, setDraft] = useState<DeviceConfigValues | null>(null);
  const [validation, setValidation] =
    useState<ConfigValidationResponse | null>(null);
  const [task, setTask] = useState<ConfigTask | null>(null);
  const [outcome, setOutcome] = useState<ConfigurationOutcome | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [applicationConfirmation, setApplicationConfirmation] =
    useState<ConfigApplicationConfirmation | null>(null);
  const operationController = useRef<AbortController | null>(null);
  const pendingValidatedApplication =
    useRef<PendingValidatedApplication | null>(null);

  const hasChanges = useMemo(
    () =>
      original !== null &&
      draft !== null &&
      JSON.stringify(original) !== JSON.stringify(draft),
    [draft, original],
  );

  const applicationBusy = [
    "validating",
    "confirming",
    "saving",
    "applying",
    "restart_pending",
    "reconnecting",
    "verifying",
  ].includes(applicationState);

  const beginOperation = useCallback(() => {
    operationController.current?.abort();
    const controller = new AbortController();
    operationController.current = controller;
    return controller;
  }, []);

  const assignDocument = useCallback((document: DeviceConfigDocument) => {
    setRevision(document.revision);
    setOriginal(cloneValues(document.values));
    setDraft(cloneValues(document.values));
  }, []);

  const load = useCallback(async () => {
    const controller = beginOperation();
    setStatus("loading");
    setRequestError(null);
    setOutcome(null);
    setValidation(null);
    setTask(null);
    try {
      const [nextCapabilities, document] = await Promise.all([
        getConfigCapabilities(apiBaseUrl, controller.signal),
        getCurrentConfig(apiBaseUrl, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setCapabilities(nextCapabilities);
      assignDocument(document);
      setApplicationState("idle");
      setStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setRequestError(formatError(error));
      setStatus("error");
    }
  }, [apiBaseUrl, assignDocument, beginOperation]);

  const getTaskAllowMissing = useCallback(
    async (
      activeApiBaseUrl: string,
      taskId: number,
      signal: AbortSignal,
    ) => {
      try {
        return await getConfigTask(activeApiBaseUrl, taskId, signal);
      } catch (error) {
        if (error instanceof ConfigRequestError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    [],
  );

  const verifyRecoveredApplication = useCallback(
    async (
      pending: PendingConfigApplication,
      activeApiBaseUrl: string,
      controller: AbortController,
    ): Promise<VerificationResult> => {
      const deadline = pending.started_at + CONFIG_RECONNECT_TIMEOUT_MS;
      let nextCapabilities = capabilities;

      while (!controller.signal.aborted && Date.now() < deadline) {
        setApplicationState("verifying");
        try {
          const [nextTask, document, loadedCapabilities] = await Promise.all([
            getTaskAllowMissing(
              activeApiBaseUrl,
              pending.task_id,
              controller.signal,
            ),
            getCurrentConfig(activeApiBaseUrl, controller.signal),
            nextCapabilities
              ? Promise.resolve(nextCapabilities)
              : getConfigCapabilities(activeApiBaseUrl, controller.signal),
          ]);
          nextCapabilities = loadedCapabilities;
          setTask(nextTask);

          if (nextTask?.state === "failed") {
            return { document, capabilities: loadedCapabilities, task: nextTask };
          }
          if (nextTask?.state === "succeeded") {
            return { document, capabilities: loadedCapabilities, task: nextTask };
          }
          if (nextTask === null) {
            return { document, capabilities: loadedCapabilities, task: nextTask };
          }
          await delay(
            Math.min(TASK_VERIFY_INTERVAL_MS, Math.max(0, deadline - Date.now())),
            controller.signal,
          );
        } catch (error) {
          if (controller.signal.aborted) throw error;
          setApplicationState("reconnecting");
          const recovered = await reconnectConfigDevice(
            { ...pending, api_base_url: activeApiBaseUrl },
            controller.signal,
          );
          activeApiBaseUrl = recovered.apiBaseUrl;
          onDeviceRecovered(recovered.apiBaseUrl, recovered.info);
          writePendingConfigApplication({
            ...pending,
            api_base_url: recovered.apiBaseUrl,
          });
        }
      }

      throw new ConfigReconnectTimeoutError();
    },
    [capabilities, getTaskAllowMissing, onDeviceRecovered],
  );

  const finishRecoveredApplication = useCallback(
    (
      pending: PendingConfigApplication,
      result: VerificationResult,
    ) => {
      setCapabilities(result.capabilities);
      assignDocument(result.document);
      clearPendingConfigApplication();
      onApplicationLockChange(false);
      setStatus("ready");

      if (result.task?.state === "failed") {
        setApplicationState("failed");
        setOutcome({
          type: "error",
          message: result.task.message,
          rolledBack: result.task.rolled_back === true,
        });
        return;
      }
      if (result.document.revision === pending.target_revision) {
        setApplicationState("success");
        setOutcome({
          type: "success",
          message: i18n.t("config.validation.applySuccess"),
        });
        return;
      }
      setApplicationState("failed");
      setOutcome({
        type: "error",
        message: i18n.t("config.validation.rolledBack"),
        rolledBack: result.task?.rolled_back,
      });
    },
    [assignDocument, onApplicationLockChange],
  );

  const resumeApplication = useCallback(
    async (
      pending: PendingConfigApplication,
      controller: AbortController,
    ) => {
      onApplicationLockChange(true);
      setTargetRevision(pending.target_revision);
      setApplicationState("reconnecting");
      setRequestError(null);
      try {
        const recovered = await reconnectConfigDevice(pending, controller.signal);
        if (controller.signal.aborted) return;
        onDeviceRecovered(recovered.apiBaseUrl, recovered.info);
        const updatedPending = {
          ...pending,
          api_base_url: recovered.apiBaseUrl,
        };
        writePendingConfigApplication(updatedPending);
        const result = await verifyRecoveredApplication(
          updatedPending,
          recovered.apiBaseUrl,
          controller,
        );
        if (controller.signal.aborted) return;
        finishRecoveredApplication(updatedPending, result);
      } catch (error) {
        if (controller.signal.aborted) return;
        clearPendingConfigApplication();
        onApplicationLockChange(false);
        setApplicationState("failed");
        setRequestError(formatError(error));
        setOutcome({ type: "error", message: formatError(error) });
        setStatus(capabilities && draft ? "ready" : "error");
      }
    },
    [
      capabilities,
      draft,
      finishRecoveredApplication,
      onApplicationLockChange,
      onDeviceRecovered,
      verifyRecoveredApplication,
    ],
  );

  useEffect(() => {
    if (pendingAtMount) {
      const controller = beginOperation();
      void resumeApplication(pendingAtMount, controller);
    } else {
      void load();
    }
    return () => operationController.current?.abort();
    // Recovery updates its own callbacks and API address; only a device change restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    if (!hasChanges || applicationBusy) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [applicationBusy, hasChanges]);

  const updateDraft = useCallback(
    (mutator: (nextDraft: DeviceConfigValues) => void) => {
      if (applicationBusy) return;
      setDraft((current) => {
        if (!current) return current;
        const nextDraft = cloneValues(current);
        mutator(nextDraft);
        return nextDraft;
      });
      setValidation(null);
      setOutcome(null);
      setRequestError(null);
      if (applicationState === "success" || applicationState === "failed") {
        setApplicationState("idle");
      }
    },
    [applicationBusy, applicationState],
  );

  const finishApplicationError = useCallback(
    async (error: unknown, controller: AbortController) => {
      if (controller.signal.aborted) return;
      pendingValidatedApplication.current = null;
      setApplicationConfirmation(null);
      clearPendingConfigApplication();
      onApplicationLockChange(false);

      if (error instanceof ConfigRequestError && error.status === 409) {
        try {
          const [nextCapabilities, document] = await Promise.all([
            getConfigCapabilities(apiBaseUrl, controller.signal),
            getCurrentConfig(apiBaseUrl, controller.signal),
          ]);
          if (controller.signal.aborted) return;
          setCapabilities(nextCapabilities);
          assignDocument(document);
          setValidation(null);
          setRequestError(null);
          setStatus("ready");
          setApplicationState("failed");
          setOutcome({
            type: "error",
            message: i18n.t("config.validation.revisionConflict"),
          });
          return;
        } catch (reloadError) {
          if (controller.signal.aborted) return;
          setStatus("error");
          setApplicationState("failed");
          setRequestError(
            i18n.t("config.validation.revisionConflictReloadFailed", {
              message: formatError(reloadError),
            }),
          );
          return;
        }
      }

      setApplicationState("failed");
      setRequestError(formatError(error));
      setOutcome({ type: "error", message: formatError(error) });
    },
    [apiBaseUrl, assignDocument, onApplicationLockChange],
  );

  const persistValidatedApplication = useCallback(
    async ({ payload, controller }: PendingValidatedApplication) => {
      pendingValidatedApplication.current = null;
      setApplicationConfirmation(null);
      setApplicationState("saving");

      try {
        const saved = await saveConfig(apiBaseUrl, payload, controller.signal);
        if (!saved.saved) {
          throw new ConfigRequestError(i18n.t("config.validation.notSaved"));
        }
        setTargetRevision(saved.revision);

        setApplicationState("applying");
        const startedAt = Date.now();
        const taskReference = await applyConfig(
          apiBaseUrl,
          saved.revision,
          controller.signal,
        );
        const pending: PendingConfigApplication = {
          device_id: deviceId,
          api_base_url: apiBaseUrl,
          task_id: taskReference.task_id,
          target_revision: saved.revision,
          started_at: startedAt,
        };
        writePendingConfigApplication(pending);
        setApplicationState("restart_pending");
        await delay(700, controller.signal);
        await resumeApplication(pending, controller);
      } catch (error) {
        await finishApplicationError(error, controller);
      }
    },
    [apiBaseUrl, deviceId, finishApplicationError, resumeApplication],
  );

  const saveAndApply = useCallback(async () => {
    if (
      !capabilities ||
      !draft ||
      !original ||
      !revision ||
      !hasChanges ||
      applicationBusy
    ) {
      return;
    }
    const localErrors = validateDraftLocally(capabilities, draft);
    if (localErrors.length > 0) {
      setValidation({ valid: false, errors: localErrors, warnings: [], requires: [] });
      return;
    }

    const controller = beginOperation();
    const payload = { revision, values: serializeConfigValues(draft) };
    setApplicationState("validating");
    onApplicationLockChange(true);
    setRequestError(null);
    setOutcome(null);
    setTask(null);
    try {
      const validationResult = await validateConfig(
        apiBaseUrl,
        payload,
        controller.signal,
      );
      setValidation(validationResult);
      if (!validationResult.valid) {
        setApplicationState("idle");
        onApplicationLockChange(false);
        return;
      }

      const managementReconnect = validationResult.requires.includes(
        "management_reconnect",
      );
      const uvcChanged =
        capabilities.outputs?.uvc.supported === true &&
        original.outputs?.uvc.enabled !== draft.outputs?.uvc.enabled;
      const needsConfirmation =
        managementReconnect ||
        uvcChanged ||
        validationResult.warnings.length > 0;

      if (needsConfirmation) {
        pendingValidatedApplication.current = { payload, controller };
        setApplicationConfirmation({
          managementReconnect: managementReconnect || uvcChanged,
          warnings: validationResult.warnings,
        });
        setApplicationState("confirming");
        return;
      }

      await persistValidatedApplication({ payload, controller });
    } catch (error) {
      await finishApplicationError(error, controller);
    }
  }, [
    apiBaseUrl,
    applicationBusy,
    beginOperation,
    capabilities,
    draft,
    finishApplicationError,
    hasChanges,
    onApplicationLockChange,
    original,
    persistValidatedApplication,
    revision,
  ]);

  const confirmApplication = useCallback(() => {
    const pending = pendingValidatedApplication.current;
    if (!pending) return;
    void persistValidatedApplication(pending);
  }, [persistValidatedApplication]);

  const cancelApplication = useCallback(() => {
    const pending = pendingValidatedApplication.current;
    pending?.controller.abort();
    pendingValidatedApplication.current = null;
    setApplicationConfirmation(null);
    setValidation(null);
    setApplicationState("idle");
    onApplicationLockChange(false);
  }, [onApplicationLockChange]);

  const pollResetTask = useCallback(
    async (taskId: number, controller: AbortController) => {
      for (let index = 0; index < MAX_RESET_TASK_POLLS; index += 1) {
        if (index > 0) await delay(TASK_VERIFY_INTERVAL_MS, controller.signal);
        const nextTask = await getConfigTask(apiBaseUrl, taskId, controller.signal);
        setTask(nextTask);
        if (
          nextTask.state === "failed" ||
          nextTask.state === "succeeded"
        ) {
          return nextTask;
        }
      }
      throw new ConfigRequestError(i18n.t("config.validation.resetTimeout"));
    },
    [apiBaseUrl],
  );

  const restoreDefaults = useCallback(async () => {
    if (applicationBusy) return;
    const controller = beginOperation();
    onApplicationLockChange(true);
    setStatus("resetting");
    setValidation(null);
    setOutcome(null);
    setRequestError(null);
    setTask(null);
    try {
      const taskReference = await resetConfig(apiBaseUrl, controller.signal);
      const completedTask = await pollResetTask(taskReference.task_id, controller);
      try {
        const document = await getCurrentConfig(apiBaseUrl, controller.signal);
        assignDocument(document);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRequestError(
          i18n.t("config.validation.afterReset", {
            message: formatError(error),
          }),
        );
      }
      setStatus("ready");
      onApplicationLockChange(false);
      if (completedTask.state === "failed") {
        setOutcome({
          type: "error",
          message: completedTask.message,
          rolledBack: completedTask.rolled_back === true,
        });
        return;
      }
      setOutcome({
        type: "success",
        message:
          completedTask.message || i18n.t("config.validation.resetSuccess"),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      onApplicationLockChange(false);
      setRequestError(formatError(error));
      setStatus("ready");
    }
  }, [
    apiBaseUrl,
    applicationBusy,
    assignDocument,
    beginOperation,
    onApplicationLockChange,
    pollResetTask,
  ]);

  const dismissOutcome = useCallback(() => {
    setOutcome(null);
    if (applicationState === "success" || applicationState === "failed") {
      setApplicationState("idle");
    }
  }, [applicationState]);

  return {
    status,
    applicationState,
    applicationBusy,
    capabilities,
    revision,
    targetRevision,
    original,
    draft,
    validation,
    task,
    outcome,
    requestError,
    applicationConfirmation,
    hasChanges,
    load,
    updateDraft,
    saveAndApply,
    confirmApplication,
    cancelApplication,
    restoreDefaults,
    dismissOutcome,
  };
}
