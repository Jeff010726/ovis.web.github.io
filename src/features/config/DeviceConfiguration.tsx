import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ImageOff,
  LoaderCircle,
  Network,
  PersonStanding,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Save,
  ScanFace,
  Settings2,
  Unplug,
  Usb,
  Video,
  Waypoints,
  Wifi,
  X,
} from "lucide-react";
import { getDeviceImage } from "../device/device.assets";
import type {
  DiscoveredDevice,
  OvisDeviceInfo,
} from "../device/device.types";
import type {
  AiFeatureCapability,
  ConfigIssue,
  DeviceConfigValues,
  ObjectTrackingSearchMethod,
  ProcessingSize,
  ProcessingSizeCapability,
  StreamConfigValues,
  TpuFeatureId,
  VideoProfileCapability,
} from "./config.types";
import { useDeviceConfiguration } from "./useDeviceConfiguration";
import { ModelManager } from "../models/ModelManager";
import type { ModelSummary } from "../models/model.types";

interface DeviceConfigurationProps {
  device: OvisDeviceInfo;
  selectedDevice: DiscoveredDevice;
  connectedAt: Date | null;
  applicationLocked: boolean;
  onDisconnect: () => void;
  onResetNetwork: () => Promise<void>;
  onRescan: () => void;
  onApplicationLockChange: (locked: boolean) => void;
  onDeviceRecovered: (apiBaseUrl: string, info: OvisDeviceInfo) => void;
}

interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function Toggle({ checked, disabled = false, label, onChange }: ToggleProps) {
  return (
    <button
      className="config-toggle"
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

const endpointLabel = (apiBaseUrl: string) => {
  try {
    return new URL(apiBaseUrl).hostname;
  } catch {
    return apiBaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/:\d+(?:\/.*)?$/, "")
      .replace(/\/.*$/, "");
  }
};

const formatConnectionTime = (value: Date | null, locale: string) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(value)
    : "-";

const profileLabel = (profile: VideoProfileCapability) =>
  `${profile.id} · ${profile.width}×${profile.height}`;

const processingSizeConstraints = (
  capability: ProcessingSizeCapability,
) => {
  if (capability.constraints) return capability.constraints;
  if (
    Number.isFinite(capability.min_width) &&
    Number.isFinite(capability.max_width) &&
    Number.isFinite(capability.min_height) &&
    Number.isFinite(capability.max_height) &&
    Number.isFinite(capability.step)
  ) {
    return {
      minWidth: capability.min_width,
      maxWidth: capability.max_width,
      minHeight: capability.min_height,
      maxHeight: capability.max_height,
      widthStep: capability.step,
      heightStep: capability.step,
      presets: capability.default ? [capability.default] : [],
    };
  }
  return undefined;
};

const processingSizeDefault = (
  capability: ProcessingSizeCapability,
): ProcessingSize | undefined => {
  if (capability.default) return capability.default;
  if (Number.isFinite(capability.width) && Number.isFinite(capability.height)) {
    return { width: capability.width!, height: capability.height! };
  }
  return undefined;
};

function profileOptions(
  profiles: VideoProfileCapability[],
  currentProfile: string,
) {
  if (profiles.some((profile) => profile.id === currentProfile)) return profiles;
  return [
    ...profiles,
    {
      id: currentProfile,
      width: 0,
      height: 0,
      fps_options: [],
      bitrate_min: 1,
      bitrate_max: 100_000,
    },
  ];
}

interface StreamEditorProps {
  title: string;
  streamKey: "main" | "sub";
  values: StreamConfigValues;
  profiles: VideoProfileCapability[];
  disabled: boolean;
  bitrateDisabled?: boolean;
  issues: ConfigIssue[];
  updateDraft: (mutator: (draft: DeviceConfigValues) => void) => void;
}

function StreamEditor({
  title,
  streamKey,
  values,
  profiles,
  disabled,
  bitrateDisabled = disabled,
  issues,
  updateDraft,
}: StreamEditorProps) {
  const { t } = useTranslation();
  const options = profileOptions(profiles, values.profile);
  const activeProfile = profiles.find((profile) => profile.id === values.profile);
  const fpsOptions = activeProfile?.fps_options.length
    ? activeProfile.fps_options
    : [values.fps];
  const fieldIssue = (field: string) =>
    issues.find((issue) => issue.field === `video.${streamKey}.${field}`);

  const changeProfile = (profileId: string) => {
    updateDraft((draft) => {
      const stream = draft.video[streamKey];
      const profile = profiles.find((entry) => entry.id === profileId);
      stream.profile = profileId;
      if (profile && !profile.fps_options.includes(stream.fps)) {
        stream.fps = profile.fps_options[0] ?? stream.fps;
      }
      if (profile) {
        stream.bitrate_kbps = Math.min(
          profile.bitrate_max,
          Math.max(profile.bitrate_min, stream.bitrate_kbps),
        );
      }
    });
  };

  return (
    <section className="stream-panel" aria-labelledby={`stream-${streamKey}`}>
      <div className="stream-panel__heading">
        <div>
          <span>{streamKey === "main" ? "MAIN" : "SUB"}</span>
          <h4 id={`stream-${streamKey}`}>{title}</h4>
        </div>
        {disabled && <small>{t("common.disabled")}</small>}
      </div>
      <div className="config-fields">
        <label className="config-field">
          <span>{t("config.stream.resolution")}</span>
          <select
            value={values.profile}
            disabled={disabled || options.length === 0}
            aria-invalid={Boolean(fieldIssue("profile"))}
            onChange={(event) => changeProfile(event.target.value)}
          >
            {options.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.width > 0 ? profileLabel(profile) : profile.id}
              </option>
            ))}
          </select>
        </label>
        <label className="config-field">
          <span>{t("config.stream.frameRate")}</span>
          <select
            value={values.fps}
            disabled={disabled}
            aria-invalid={Boolean(fieldIssue("fps"))}
            onChange={(event) =>
              updateDraft((draft) => {
                draft.video[streamKey].fps = Number(event.target.value);
              })
            }
          >
            {fpsOptions.map((fps) => (
              <option value={fps} key={fps}>{fps} fps</option>
            ))}
          </select>
        </label>
        <label className="config-field config-field--bitrate">
          <span>{t("config.stream.bitrate")}</span>
          <span className="number-input">
            <input
              type="number"
              min={activeProfile?.bitrate_min ?? 1}
              max={activeProfile?.bitrate_max ?? 100_000}
              step="1"
              value={values.bitrate_kbps}
              disabled={bitrateDisabled}
              aria-invalid={Boolean(fieldIssue("bitrate_kbps"))}
              onChange={(event) =>
                updateDraft((draft) => {
                  draft.video[streamKey].bitrate_kbps = Number(event.target.value);
                })
              }
            />
            <small>Kbps</small>
          </span>
          {activeProfile && (
            <em>{activeProfile.bitrate_min}–{activeProfile.bitrate_max}</em>
          )}
        </label>
      </div>
    </section>
  );
}

interface ProcessingSizeEditorProps {
  label: string;
  value: ProcessingSize;
  capability: ProcessingSizeCapability;
  disabled: boolean;
  onChange: (value: ProcessingSize) => void;
}

function ProcessingSizeEditor({
  label,
  value,
  capability,
  disabled,
  onChange,
}: ProcessingSizeEditorProps) {
  const { t } = useTranslation();
  const constraints = processingSizeConstraints(capability);
  const hasEditableConstraints =
    constraints !== undefined &&
    Number.isFinite(constraints.minWidth) &&
    Number.isFinite(constraints.maxWidth) &&
    Number.isFinite(constraints.minHeight) &&
    Number.isFinite(constraints.maxHeight) &&
    Number.isFinite(constraints.widthStep) &&
    Number.isFinite(constraints.heightStep) &&
    (constraints.widthStep ?? 0) > 0 &&
    (constraints.heightStep ?? 0) > 0;
  if (!constraints || !hasEditableConstraints) {
    return (
      <div className="processing-size-editor processing-size-editor--readonly">
        <span>{label}</span>
        <output>{value.width} × {value.height}</output>
      </div>
    );
  }
  const presets = Array.isArray(constraints.presets)
    ? constraints.presets
    : [];
  const presetValue = presets.some(
    (preset) => preset.width === value.width && preset.height === value.height,
  )
    ? `${value.width}x${value.height}`
    : "custom";
  return (
    <div className="processing-size-editor">
      <span>{label}</span>
      <select
        aria-label={`${label} ${t("config.processingSize.preset")}`}
        value={presetValue}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === "custom") return;
          const [width, height] = event.target.value.split("x").map(Number);
          onChange({ width, height });
        }}
      >
        {presets.map((preset) => (
          <option
            key={`${preset.width}x${preset.height}`}
            value={`${preset.width}x${preset.height}`}
          >
            {preset.width} × {preset.height}
          </option>
        ))}
        <option value="custom">{t("config.processingSize.custom")}</option>
      </select>
      <label>
        <span>{t("config.processingSize.width")}</span>
        <input
          type="number"
          aria-label={`${label} ${t("config.processingSize.width")}`}
          min={constraints.minWidth}
          max={constraints.maxWidth}
          step={constraints.widthStep}
          value={value.width}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, width: Number(event.target.value) })
          }
        />
      </label>
      <span aria-hidden="true">×</span>
      <label>
        <span>{t("config.processingSize.height")}</span>
        <input
          type="number"
          aria-label={`${label} ${t("config.processingSize.height")}`}
          min={constraints.minHeight}
          max={constraints.maxHeight}
          step={constraints.heightStep}
          value={value.height}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, height: Number(event.target.value) })
          }
        />
      </label>
    </div>
  );
}

interface DetectionRowProps {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  supported: boolean;
  enabled: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  toggleLabel: string;
  rangeLabel: string;
  onToggle: (checked: boolean) => void;
  onValue: (value: number) => void;
  processingSize?: ProcessingSize;
  processingCapability?: ProcessingSizeCapability;
  onProcessingSize?: (value: ProcessingSize) => void;
}

function DetectionRow({
  icon,
  title,
  detail,
  supported,
  enabled,
  value,
  min,
  max,
  step,
  valueLabel,
  toggleLabel,
  rangeLabel,
  onToggle,
  onValue,
  processingSize,
  processingCapability,
  onProcessingSize,
}: DetectionRowProps) {
  const { t } = useTranslation();
  return (
    <div className="feature-row">
      <div className="feature-row__identity">
        <span aria-hidden="true">{icon}</span>
        <div>
          <strong>{title}</strong>
          <small>
            {detail && <>{detail} · </>}
            {supported
              ? enabled
                ? t("common.enabled")
                : t("common.disabled")
              : t("common.unsupported")}
          </small>
        </div>
      </div>
      <label className="feature-row__range">
        <span>{rangeLabel}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!supported || !enabled}
          onChange={(event) => onValue(Number(event.target.value))}
        />
        <output>{valueLabel}</output>
      </label>
      <Toggle
        checked={enabled}
        disabled={!supported}
        label={toggleLabel}
        onChange={onToggle}
      />
      {processingSize && processingCapability && onProcessingSize && (
        <ProcessingSizeEditor
          label={t("config.processingSize.ai")}
          value={processingSize}
          capability={processingCapability}
          disabled={!supported || !enabled}
          onChange={onProcessingSize}
        />
      )}
    </div>
  );
}

interface ObjectTrackingRowProps {
  capability: AiFeatureCapability;
  values: NonNullable<DeviceConfigValues["detection"]["object_tracking"]>;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onSearchMethod: (method: ObjectTrackingSearchMethod) => void;
  onKalman: (enabled: boolean) => void;
  onScoreThreshold: (value: number) => void;
  onDetectionProcessingSize: (value: ProcessingSize) => void;
  onTrackingProcessingSize: (value: ProcessingSize) => void;
}

function ObjectTrackingRow({
  capability,
  values,
  disabled,
  onToggle,
  onSearchMethod,
  onKalman,
  onScoreThreshold,
  onDetectionProcessingSize,
  onTrackingProcessingSize,
}: ObjectTrackingRowProps) {
  const { t } = useTranslation();
  const searchMethods = capability.search_methods ?? [];

  return (
    <div className="feature-row feature-row--tracking">
      <div className="feature-row__identity">
        <span aria-hidden="true"><Waypoints size={17} /></span>
        <div>
          <strong>{t("config.detection.objectTracking")}</strong>
          <small>
            {capability.model} · {values.enabled ? t("common.enabled") : t("common.disabled")}
          </small>
        </div>
      </div>
      <div className="tracking-controls">
        <label className="tracking-control tracking-control--method">
          <span>{t("config.detection.searchMethod")}</span>
          <select
            value={values.search_method}
            disabled={disabled || !values.enabled || searchMethods.length === 0}
            onChange={(event) =>
              onSearchMethod(event.target.value as ObjectTrackingSearchMethod)
            }
          >
            {searchMethods.map((method) => (
              <option value={method} key={method}>
                {method === "fastsam"
                  ? t("config.detection.searchFastsam")
                  : t("config.detection.searchColor")}
              </option>
            ))}
          </select>
        </label>
        <label className="feature-row__range">
          <span>{t("config.detection.scoreThreshold")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={values.score_threshold}
            disabled={disabled || !values.enabled}
            onChange={(event) => onScoreThreshold(Number(event.target.value))}
          />
          <output>{values.score_threshold.toFixed(2)}</output>
        </label>
        <div className="tracking-control tracking-control--kalman">
          <span>{t("config.detection.kalmanFilter")}</span>
          <Toggle
            checked={values.use_kalman}
            disabled={disabled || !values.enabled}
            label={t("config.detection.useKalman")}
            onChange={onKalman}
          />
        </div>
      </div>
      <Toggle
        checked={values.enabled}
        disabled={disabled}
        label={t("config.detection.enableObjectTracking")}
        onChange={onToggle}
      />
      {(capability.detection_processing_size ??
        capability.detectionProcessingSize) && (
        <ProcessingSizeEditor
          label={t("config.processingSize.trackingDetection")}
          value={
            values.detection_processing_size ??
            processingSizeDefault(
              (capability.detection_processing_size ??
                capability.detectionProcessingSize)!,
            )!
          }
          capability={
            (capability.detection_processing_size ??
              capability.detectionProcessingSize)!
          }
          disabled={disabled || !values.enabled}
          onChange={onDetectionProcessingSize}
        />
      )}
      {(capability.tracking_processing_size ?? capability.trackingProcessingSize) && (
        <ProcessingSizeEditor
          label={t("config.processingSize.tracking")}
          value={
            values.tracking_processing_size ??
            processingSizeDefault(
              (capability.tracking_processing_size ??
                capability.trackingProcessingSize)!,
            )!
          }
          capability={
            (capability.tracking_processing_size ??
              capability.trackingProcessingSize)!
          }
          disabled={disabled || !values.enabled}
          onChange={onTrackingProcessingSize}
        />
      )}
    </div>
  );
}

const TPU_FEATURE_IDS: TpuFeatureId[] = [
  "object",
  "face",
  "human_pose",
  "object_tracking",
];

const isTpuFeatureId = (value: string): value is TpuFeatureId =>
  TPU_FEATURE_IDS.includes(value as TpuFeatureId);

type ConfigSectionId = "video" | "outputs" | "detection" | "models";

interface ConfigSection {
  id: ConfigSectionId;
  index: string;
  labelKey:
    | "config.sections.video"
    | "config.sections.outputs"
    | "config.sections.detection"
    | "config.sections.models";
}

export function DeviceConfiguration({
  device,
  selectedDevice,
  connectedAt,
  applicationLocked,
  onDisconnect,
  onResetNetwork,
  onRescan,
  onApplicationLockChange,
  onDeviceRecovered,
}: DeviceConfigurationProps) {
  const { t, i18n } = useTranslation();
  const configuration = useDeviceConfiguration({
    apiBaseUrl: selectedDevice.apiBaseUrl,
    deviceId: device.device_id,
    onApplicationLockChange,
    onDeviceRecovered,
  });
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmNetworkReset, setConfirmNetworkReset] = useState(false);
  const [networkResetting, setNetworkResetting] = useState(false);
  const [networkResetError, setNetworkResetError] = useState<string | null>(null);
  const [activeDetectionModel, setActiveDetectionModel] =
    useState<ModelSummary | null>(null);
  const [modelRefreshToken, setModelRefreshToken] = useState(0);
  const [activeSection, setActiveSection] =
    useState<ConfigSectionId>("video");
  const editorRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<ConfigSectionId, HTMLElement | null>>({
    video: null,
    outputs: null,
    detection: null,
    models: null,
  });
  const productImage = getDeviceImage(device.model);
  const issues = configuration.validation?.errors ?? [];
  const isBusy = configuration.applicationBusy || configuration.status === "resetting";
  const outputCapabilities = configuration.capabilities?.outputs;
  const outputValues = configuration.draft?.outputs;
  const hasOutputServices =
    outputValues !== undefined &&
    (outputCapabilities?.rtsp.supported === true ||
      outputCapabilities?.uvc.supported === true);
  const rtspEnabled =
    outputCapabilities?.rtsp.supported !== true ||
    outputValues?.rtsp.enabled === true;
  const motionCapability = configuration.capabilities?.ai?.motion_detection;
  const motionFeatureCapability = configuration.capabilities?.ai?.features.find(
    (feature) => feature.id === "motion",
  );
  const motionDetectionSupported =
    typeof motionCapability === "object"
      ? motionCapability.supported
      : motionCapability === true;
  const motionProcessingCapability =
    motionFeatureCapability?.processing_size ??
    motionFeatureCapability?.processingSize ??
    (typeof motionCapability === "object"
      ? motionCapability.processing_size ?? motionCapability.processingSize
      : configuration.capabilities?.ai?.motion_processing_size ??
        configuration.capabilities?.ai?.motionProcessingSize);
  const configSections = useMemo<ConfigSection[]>(() => {
    const sectionIds: Array<Pick<ConfigSection, "id" | "labelKey">> = [
      { id: "video", labelKey: "config.sections.video" },
      ...(hasOutputServices
        ? [{ id: "outputs" as const, labelKey: "config.sections.outputs" as const }]
        : []),
      { id: "detection", labelKey: "config.sections.detection" },
      { id: "models", labelKey: "config.sections.models" },
    ];
    return sectionIds.map((section, index) => ({
      ...section,
      index: String(index + 1).padStart(2, "0"),
    }));
  }, [hasOutputServices]);
  const sectionIndex = (sectionId: ConfigSectionId) =>
    configSections.find((section) => section.id === sectionId)?.index;
  const activeStatus = (
    configuration.status === "resetting"
      ? "resetting"
      : configuration.applicationState
  ) as keyof typeof busyStatusLabel;
  const taskProgress = Math.min(100, Math.max(0, configuration.task?.progress ?? 0));
  const busyStatusLabel = {
    validating: t("config.validating"),
    confirming: t("config.confirming"),
    saving: t("config.saving"),
    applying: t("config.applying"),
    restart_pending: t("config.restartPending"),
    reconnecting: t("config.reconnectingStatus"),
    verifying: t("config.verifyingStatus"),
    resetting: t("config.resetting"),
  } as const;

  const issueMessage = (issue: ConfigIssue) => {
    if (issue.code === "UNSUPPORTED_PROFILE") {
      return t("config.validation.unsupportedProfile");
    }
    if (issue.code === "INVALID_FPS") {
      return t("config.validation.invalidFps");
    }
    if (issue.code === "UNSUPPORTED_FPS") {
      return t("config.validation.unsupportedFps");
    }
    if (issue.code === "INVALID_BITRATE") {
      return t("config.validation.invalidBitrate");
    }
    if (issue.code === "AI_FEATURE_CONFLICT") {
      return t("config.validation.aiFeatureConflict");
    }
    if (issue.code === "OUT_OF_RANGE") {
      if (
        issue.field.endsWith(".threshold") ||
        issue.field.endsWith(".score_threshold")
      ) {
        return t("config.validation.thresholdRange");
      }
      if (issue.field.endsWith(".sensitivity")) {
        return t("config.validation.sensitivityRange");
      }
      if (issue.field.endsWith(".bitrate_kbps")) {
        const streamKey = issue.field.startsWith("video.sub") ? "sub" : "main";
        const profileId = configuration.draft?.video[streamKey].profile;
        const profile = configuration.capabilities?.video[streamKey].profiles.find(
          (entry) => entry.id === profileId,
        );
        if (profile) {
          return t("config.validation.bitrateRange", {
            min: profile.bitrate_min,
            max: profile.bitrate_max,
          });
        }
      }
    }
    return issue.message;
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const updateActiveSection = () => {
      const editorTop = editor.getBoundingClientRect().top;
      let nextSection: ConfigSectionId = "video";
      const editorIsScrollable = editor.scrollHeight > editor.clientHeight + 1;
      const editorIsAtBottom =
        editorIsScrollable &&
        editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 2;
      if (editorIsAtBottom) {
        nextSection = configSections[configSections.length - 1].id;
      } else {
        configSections.forEach(({ id }) => {
          const section = sectionRefs.current[id];
          if (section && section.getBoundingClientRect().top <= editorTop + 150) {
            nextSection = id;
          }
        });
      }
      setActiveSection(nextSection);
    };

    editor.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    updateActiveSection();
    return () => {
      editor.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("scroll", updateActiveSection);
    };
  }, [configSections, configuration.status]);

  const scrollToSection = (sectionId: ConfigSectionId) => {
    const section = sectionRefs.current[sectionId];
    const editor = editorRef.current;
    if (!section || !editor) return;

    if (window.matchMedia("(max-width: 820px)").matches) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const sectionTop = section.getBoundingClientRect().top;
      const editorTop = editor.getBoundingClientRect().top;
      const stickyOffset =
        editor.querySelector<HTMLElement>(".configuration-toolbar")
          ?.getBoundingClientRect().height ?? 110;
      editor.scrollTo({
        top: editor.scrollTop + sectionTop - editorTop - stickyOffset,
        behavior: "smooth",
      });
    }
    setActiveSection(sectionId);
  };

  const tpuCapabilities = useMemo(
    () =>
      (configuration.capabilities?.ai?.features ?? []).filter(
        (feature): feature is AiFeatureCapability & { id: TpuFeatureId } =>
          isTpuFeatureId(feature.id),
      ),
    [configuration.capabilities],
  );

  useEffect(() => {
    if (
      configuration.applicationState === "success" ||
      configuration.applicationState === "failed"
    ) {
      setModelRefreshToken((value) => value + 1);
    }
  }, [configuration.applicationState]);

  const reloadConfiguration = configuration.load;
  const reloadAfterModelDeployment = useCallback(async () => {
    await reloadConfiguration();
  }, [reloadConfiguration]);

  const confirmCustomModelActivation = useCallback(() => {
    const draft = configuration.draft;
    const hasConflict =
      draft?.detection.face.enabled === true ||
      draft?.detection.human_pose?.enabled === true ||
      draft?.detection.object_tracking?.enabled === true;
    return !hasConflict || window.confirm(t("config.detection.conflictConfirm"));
  }, [configuration.draft, t]);

  const setTpuEnabled = (featureId: TpuFeatureId, enabled: boolean) => {
    const hasConflictingFeature =
      enabled &&
      configuration.draft !== null &&
      TPU_FEATURE_IDS.some((id) => {
        if (id === featureId) return false;
        if (id === "object" || id === "face") {
          return configuration.draft?.detection[id].enabled === true;
        }
        return configuration.draft?.detection[id]?.enabled === true;
      });
    if (
      hasConflictingFeature &&
      configuration.capabilities?.ai?.max_active_tpu_features === 1 &&
      !window.confirm(t("config.detection.conflictConfirm"))
    ) {
      return;
    }
    configuration.updateDraft((draft) => {
      if (
        enabled &&
        configuration.capabilities?.ai?.max_active_tpu_features === 1
      ) {
        draft.detection.object.enabled = false;
        draft.detection.face.enabled = false;
        if (draft.detection.human_pose) {
          draft.detection.human_pose.enabled = false;
        }
        if (draft.detection.object_tracking) {
          draft.detection.object_tracking.enabled = false;
        }
      }

      if (featureId === "object" || featureId === "face") {
        draft.detection[featureId].enabled = enabled;
      } else if (draft.detection[featureId]) {
        draft.detection[featureId].enabled = enabled;
      }
    });
  };

  const setTpuThreshold = (
    featureId: "object" | "face" | "human_pose",
    value: number,
  ) => {
    configuration.updateDraft((draft) => {
      if (featureId === "object" || featureId === "face") {
        draft.detection[featureId].threshold = value;
      } else if (draft.detection.human_pose) {
        draft.detection.human_pose.threshold = value;
      }
    });
  };

  const resetNetworkAddress = async () => {
    setNetworkResetting(true);
    setNetworkResetError(null);
    try {
      await onResetNetwork();
    } catch {
      setNetworkResetError(t("config.networkResetFailed"));
      setNetworkResetting(false);
    }
  };

  return (
    <div className="configuration-page">
      <div className="configuration-layout">
        <div className="configuration-editor" ref={editorRef}>
          {configuration.status === "loading" && (
            <div className="configuration-loading" aria-live="polite">
              <LoaderCircle size={25} />
              <strong>
                {configuration.applicationState === "reconnecting"
                  ? t("config.reconnecting")
                  : configuration.applicationState === "verifying"
                    ? t("config.verifying")
                    : t("config.loading")}
              </strong>
              <span>
                {configuration.applicationState === "reconnecting"
                  ? t("config.reconnectingDetail")
                  : t("config.loadingDetail")}
              </span>
            </div>
          )}

          {configuration.status === "error" && (
            <div className="configuration-loading" role="alert">
              <AlertTriangle size={24} />
              <strong>{t("config.readFailed")}</strong>
              <span>{configuration.requestError}</span>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void configuration.load()}
              >
                <RefreshCw size={15} />{t("common.retry")}
              </button>
            </div>
          )}

          {configuration.capabilities &&
            configuration.draft &&
            configuration.status !== "error" &&
            configuration.status !== "loading" && (
              <main className="configuration-workspace">
                <div className="configuration-toolbar">
                  <div>
                    <div className="eyebrow">
                      CONFIGURATION · SCHEMA {configuration.capabilities.schema_version}
                    </div>
                    <h3>{t("config.title")}</h3>
                    <span
                      className={`draft-state ${configuration.hasChanges ? "draft-state--dirty" : ""}`}
                    >
                      {configuration.applicationBusy
                        ? t("config.waiting")
                        : configuration.hasChanges
                          ? t("config.unsaved")
                          : t("config.synced")}
                    </span>
                  </div>
                  <div className="configuration-toolbar__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmReset(true)}
                    >
                      <RotateCcw size={15} />{t("config.restoreDefaults")}
                    </button>
                    <button
                      className="button button--primary config-save-button"
                      type="button"
                      disabled={!configuration.hasChanges || isBusy}
                      onClick={() => void configuration.saveAndApply()}
                    >
                      {isBusy ? (
                        <LoaderCircle className="button-spinner" size={16} />
                      ) : (
                        <Save size={16} />
                      )}
                      {t("config.saveApply")}
                    </button>
                  </div>
                </div>

                {confirmReset && (
                  <div className="reset-confirmation" role="alert">
                    <div>
                      <strong>{t("config.resetConfirmTitle")}</strong>
                      <span>{t("config.resetConfirmDetail")}</span>
                    </div>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => setConfirmReset(false)}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => {
                        setConfirmReset(false);
                        void configuration.restoreDefaults();
                      }}
                    >
                      {t("config.confirmReset")}
                    </button>
                  </div>
                )}

                {configuration.applicationConfirmation && (
                  <div
                    className="reset-confirmation config-apply-confirmation"
                    role="alertdialog"
                    aria-labelledby="config-apply-confirmation-title"
                  >
                    <div>
                      <strong id="config-apply-confirmation-title">
                        {t("config.applyConfirmTitle")}
                      </strong>
                      {configuration.applicationConfirmation.managementReconnect && (
                        <span>{t("config.managementReconnectWarning")}</span>
                      )}
                      {configuration.applicationConfirmation.warnings.map((warning) => (
                        <span key={`${warning.field}-${warning.code}`}>
                          {warning.message}
                        </span>
                      ))}
                    </div>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={configuration.cancelApplication}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={configuration.confirmApplication}
                    >
                      {t("config.confirmApply")}
                    </button>
                  </div>
                )}

                {isBusy && configuration.applicationState !== "confirming" && (
                  <div className="operation-progress" role="status">
                    <div>
                      <LoaderCircle size={16} />
                      <strong>{busyStatusLabel[activeStatus]}</strong>
                      <span>
                        {configuration.applicationState === "restart_pending"
                          ? t("config.restartPending")
                          : configuration.task?.message ??
                            t("config.networkTolerance")}
                      </span>
                      {configuration.task?.progress !== undefined && (
                        <output>{taskProgress}%</output>
                      )}
                    </div>
                    <span className="operation-progress__track">
                      <span
                        style={{
                          width: `${configuration.task ? taskProgress : 12}%`,
                        }}
                      />
                    </span>
                  </div>
                )}

                {configuration.outcome && (
                  <div
                    className={`config-notice config-notice--${configuration.outcome.type}`}
                    role="status"
                  >
                    {configuration.outcome.type === "success" ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <AlertTriangle size={17} />
                    )}
                    <div>
                      <strong>{configuration.outcome.message}</strong>
                      {configuration.outcome.type === "error" &&
                        configuration.outcome.rolledBack !== undefined && (
                        <span>
                          {configuration.outcome.rolledBack
                            ? t("config.rollbackSuccess")
                            : t("config.rollbackUnconfirmed")}
                        </span>
                        )}
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t("common.closeNotice")}
                      onClick={configuration.dismissOutcome}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {configuration.requestError && (
                  <div className="config-notice config-notice--error" role="alert">
                    <AlertTriangle size={17} />
                    <strong>{configuration.requestError}</strong>
                  </div>
                )}

                {configuration.validation &&
                  (!configuration.validation.valid ||
                    configuration.validation.warnings.length > 0) && (
                    <div
                      className={`config-notice ${configuration.validation.valid ? "config-notice--warning" : "config-notice--error"}`}
                      role="alert"
                    >
                      <AlertTriangle size={17} />
                      <div>
                        <strong>
                          {configuration.validation.valid
                            ? t("config.validationWarning")
                            : t("config.validationFailed")}
                        </strong>
                        {[
                          ...configuration.validation.errors,
                          ...configuration.validation.warnings,
                        ].map((issue) => (
                          <span key={`${issue.field}-${issue.code}`}>
                            {issueMessage(issue)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                <fieldset className="configuration-form" disabled={isBusy}>
                  <section
                    className="config-section"
                    aria-labelledby="video-config-heading"
                    ref={(element) => {
                      sectionRefs.current.video = element;
                    }}
                  >
                    <div className="config-section__heading">
                      <Video size={18} />
                      <div>
                        <span>{sectionIndex("video")}</span>
                        <h3 id="video-config-heading">{t("config.sections.video")}</h3>
                      </div>
                    </div>
                    <div className="stream-grid">
                      <StreamEditor
                        title={t("config.stream.main")}
                        streamKey="main"
                        values={configuration.draft.video.main}
                        profiles={configuration.capabilities.video.main.profiles}
                        disabled={false}
                        bitrateDisabled={!rtspEnabled}
                        issues={issues}
                        updateDraft={configuration.updateDraft}
                      />
                      <div className="sub-stream-wrap">
                        <div className="sub-stream-switch">
                          <span>{t("config.stream.sub")}</span>
                          <Toggle
                            checked={configuration.draft.video.sub.enabled}
                            disabled={!rtspEnabled}
                            label={t("config.stream.enableSub")}
                            onChange={(checked) =>
                              configuration.updateDraft((draft) => {
                                draft.video.sub.enabled = checked;
                              })
                            }
                          />
                        </div>
                        <StreamEditor
                          title={t("config.stream.sub")}
                          streamKey="sub"
                          values={configuration.draft.video.sub}
                          profiles={configuration.capabilities.video.sub.profiles}
                          disabled={
                            !rtspEnabled ||
                            !configuration.draft.video.sub.enabled
                          }
                          issues={issues}
                          updateDraft={configuration.updateDraft}
                        />
                      </div>
                    </div>
                  </section>

                  {hasOutputServices && outputValues && (
                    <section
                      className="config-section"
                      aria-labelledby="output-config-heading"
                      ref={(element) => {
                        sectionRefs.current.outputs = element;
                      }}
                    >
                      <div className="config-section__heading">
                        <RadioTower size={18} />
                        <div>
                          <span>{sectionIndex("outputs")}</span>
                          <h3 id="output-config-heading">
                            {t("config.sections.outputs")}
                          </h3>
                        </div>
                      </div>
                      <div className="feature-list">
                        {outputCapabilities?.rtsp.supported && (
                          <div className="feature-row feature-row--simple">
                            <div className="feature-row__identity">
                              <span aria-hidden="true">
                                <RadioTower size={17} />
                              </span>
                              <div>
                                <strong>{t("config.outputs.rtsp")}</strong>
                                <small>
                                  {outputValues.rtsp.enabled
                                    ? t("common.enabled")
                                    : t("common.disabled")}
                                </small>
                              </div>
                            </div>
                            <Toggle
                              checked={outputValues.rtsp.enabled}
                              label={t("config.outputs.enableRtsp")}
                              onChange={(checked) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.outputs) {
                                    draft.outputs.rtsp.enabled = checked;
                                  }
                                })
                              }
                            />
                          </div>
                        )}
                        {outputCapabilities?.uvc.supported && (
                          <div className="feature-row feature-row--simple">
                            <div className="feature-row__identity">
                              <span aria-hidden="true">
                                <Usb size={17} />
                              </span>
                              <div>
                                <strong>{t("config.outputs.uvc")}</strong>
                                <small>
                                  {outputValues.uvc.enabled
                                    ? t("common.enabled")
                                    : t("common.disabled")}
                                </small>
                              </div>
                            </div>
                            <Toggle
                              checked={outputValues.uvc.enabled}
                              label={t("config.outputs.enableUvc")}
                              onChange={(checked) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.outputs) {
                                    draft.outputs.uvc.enabled = checked;
                                  }
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  <section
                    className="config-section"
                    aria-labelledby="feature-config-heading"
                    ref={(element) => {
                      sectionRefs.current.detection = element;
                    }}
                  >
                    <div className="config-section__heading">
                      <Settings2 size={18} />
                      <div>
                        <span>{sectionIndex("detection")}</span>
                        <h3 id="feature-config-heading">{t("config.sections.detectionFull")}</h3>
                      </div>
                    </div>
                    <div className="feature-list">
                      <div className="feature-row feature-row--simple">
                        <div className="feature-row__identity">
                          <span aria-hidden="true">
                            <Video size={17} />
                          </span>
                          <div>
                            <strong>{t("config.overlay.title")}</strong>
                            <small>
                              {configuration.capabilities.features.osd
                                ? configuration.draft.overlay.enabled
                                  ? t("common.enabled")
                                  : t("common.disabled")
                                : t("common.unsupported")}
                            </small>
                          </div>
                        </div>
                        <Toggle
                          checked={configuration.draft.overlay.enabled}
                          disabled={!configuration.capabilities.features.osd}
                          label={t("config.overlay.enable")}
                          onChange={(checked) =>
                            configuration.updateDraft((draft) => {
                              draft.overlay.enabled = checked;
                            })
                          }
                        />
                      </div>
                      {tpuCapabilities.map((capability) => {
                        const draft = configuration.draft;
                        if (!draft) return null;
                        if (capability.id === "object_tracking") {
                          const tracking = draft.detection.object_tracking;
                          if (!tracking) return null;
                          return (
                            <ObjectTrackingRow
                              key={capability.id}
                              capability={capability}
                              values={tracking}
                              disabled={
                                (configuration.capabilities?.ai
                                  ?.max_active_tpu_features ?? 0) < 1
                              }
                              onToggle={(checked) =>
                                setTpuEnabled(capability.id, checked)
                              }
                              onSearchMethod={(method) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.detection.object_tracking) {
                                    draft.detection.object_tracking.search_method = method;
                                  }
                                })
                              }
                              onKalman={(enabled) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.detection.object_tracking) {
                                    draft.detection.object_tracking.use_kalman = enabled;
                                  }
                                })
                              }
                              onScoreThreshold={(value) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.detection.object_tracking) {
                                    draft.detection.object_tracking.score_threshold = value;
                                  }
                                })
                              }
                              onDetectionProcessingSize={(value) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.detection.object_tracking) {
                                    draft.detection.object_tracking.detection_processing_size = value;
                                  }
                                })
                              }
                              onTrackingProcessingSize={(value) =>
                                configuration.updateDraft((draft) => {
                                  if (draft.detection.object_tracking) {
                                    draft.detection.object_tracking.tracking_processing_size = value;
                                  }
                                })
                              }
                            />
                          );
                        }

                        const values =
                          capability.id === "human_pose"
                            ? draft.detection.human_pose
                            : draft.detection[capability.id];
                        if (!values) return null;
                        const title =
                          capability.id === "object"
                            ? t("config.detection.objectDetection")
                            : capability.id === "face"
                              ? t("config.detection.face")
                              : t("config.detection.humanPose");
                        const toggleLabel =
                          capability.id === "object"
                            ? t("config.detection.enablePerson")
                            : capability.id === "face"
                              ? t("config.detection.enableFace")
                              : t("config.detection.enableHumanPose");
                        const icon =
                          capability.id === "object" ? (
                            <Settings2 size={17} />
                          ) : capability.id === "face" ? (
                            <ScanFace size={17} />
                          ) : (
                            <PersonStanding size={17} />
                          );

                        const processingCapability =
                          capability.processing_size ?? capability.processingSize;
                        const processingSize =
                          values.processing_size ??
                          (processingCapability
                            ? processingSizeDefault(processingCapability)
                            : undefined);
                        const modelDetail =
                          capability.id === "object"
                            ? `${t("config.detection.currentModel")}: ${
                                activeDetectionModel?.name ??
                                draft.detection.object.model.runtime_model ??
                                draft.detection.object.model.id ??
                                capability.name
                              } · ${t("config.detection.source")}: ${
                                activeDetectionModel ||
                                draft.detection.object.model.source === "custom"
                                  ? t("config.detection.customSource")
                                  : t("config.detection.builtinSource")
                              } · ${t("config.detection.runtimeStatus")}: ${
                                values.enabled
                                  ? t("common.enabled")
                                  : t("common.disabled")
                              }`
                            : capability.model ?? capability.name;

                        return (
                          <DetectionRow
                            key={capability.id}
                            icon={icon}
                            title={title}
                            detail={modelDetail}
                            supported
                            enabled={
                              values.enabled ||
                              (capability.id === "object" &&
                                activeDetectionModel?.active === true)
                            }
                            value={values.threshold}
                            min={0}
                            max={1}
                            step={0.01}
                            valueLabel={values.threshold.toFixed(2)}
                            rangeLabel={t("config.detection.threshold")}
                            toggleLabel={toggleLabel}
                            onToggle={(checked) =>
                              setTpuEnabled(capability.id, checked)
                            }
                            onValue={(value) =>
                              setTpuThreshold(
                                capability.id as "object" | "face" | "human_pose",
                                value,
                              )
                            }
                            processingSize={processingSize}
                            processingCapability={processingCapability}
                            onProcessingSize={(value) =>
                              configuration.updateDraft((nextDraft) => {
                                if (capability.id === "object" || capability.id === "face") {
                                  nextDraft.detection[capability.id].processing_size = value;
                                } else if (nextDraft.detection.human_pose) {
                                  nextDraft.detection.human_pose.processing_size = value;
                                }
                              })
                            }
                          />
                        );
                      })}
                      {motionDetectionSupported && (
                        <DetectionRow
                          icon={<Activity size={17} />}
                          title={t("config.detection.motion")}
                          supported
                          enabled={configuration.draft.detection.motion.enabled}
                          value={configuration.draft.detection.motion.sensitivity}
                          min={0}
                          max={100}
                          step={1}
                          valueLabel={`${configuration.draft.detection.motion.sensitivity}`}
                          rangeLabel={t("config.detection.sensitivity")}
                          toggleLabel={t("config.detection.enableMotion")}
                          onToggle={(checked) =>
                            configuration.updateDraft((draft) => {
                              draft.detection.motion.enabled = checked;
                            })
                          }
                          onValue={(value) =>
                            configuration.updateDraft((draft) => {
                              draft.detection.motion.sensitivity = value;
                            })
                          }
                          processingSize={
                            configuration.draft.detection.motion.processing_size ??
                            (motionProcessingCapability
                              ? processingSizeDefault(motionProcessingCapability)
                              : undefined)
                          }
                          processingCapability={motionProcessingCapability}
                          onProcessingSize={(value) =>
                            configuration.updateDraft((draft) => {
                              draft.detection.motion.processing_size = value;
                            })
                          }
                        />
                      )}
                    </div>
                  </section>

                  <section
                    className="config-section config-section--models"
                    aria-labelledby="models-config-heading"
                    ref={(element) => {
                      sectionRefs.current.models = element;
                    }}
                  >
                    <div className="config-section__heading">
                      <Boxes size={18} />
                      <div>
                        <span>{sectionIndex("models")}</span>
                        <h3 id="models-config-heading">{t("config.sections.models")}</h3>
                      </div>
                    </div>
                    <ModelManager
                      apiBaseUrl={selectedDevice.apiBaseUrl}
                      deviceId={device.device_id}
                      disabled={isBusy}
                      refreshToken={modelRefreshToken}
                      onActiveModelChange={setActiveDetectionModel}
                      onDeploymentComplete={reloadAfterModelDeployment}
                      onBeforeActivate={confirmCustomModelActivation}
                    />
                  </section>
                </fieldset>

                <footer className="configuration-footer">
                  <span>REVISION {configuration.revision}</span>
                  <span>
                    {configuration.targetRevision
                      ? `TARGET ${configuration.targetRevision}`
                      : t("config.allRequestsTarget")}
                  </span>
                </footer>
              </main>
            )}
        </div>

        <nav className="config-section-nav" aria-label={t("config.sectionMenu")}>
          <div className="config-section-nav__header">
            <span>SECTION</span>
            <output>
              {configSections.find((section) => section.id === activeSection)?.index}
              <small>/ {String(configSections.length).padStart(2, "0")}</small>
            </output>
          </div>
          <div className="config-section-nav__list">
            {configSections.map((section) => (
              <button
                type="button"
                key={section.id}
                className={activeSection === section.id ? "is-active" : ""}
                aria-current={activeSection === section.id ? "true" : undefined}
                disabled={!configuration.capabilities}
                onClick={() => scrollToSection(section.id)}
              >
                <span>{section.index}</span>
                <strong>{t(section.labelKey)}</strong>
              </button>
            ))}
          </div>
          <div className="config-section-nav__ticks" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        </nav>

        <aside
          className={`device-dashboard ${applicationLocked || isBusy ? "device-dashboard--recovering" : ""}`}
          aria-label={t("config.currentDashboard")}
        >
          <div className="device-dashboard__status">
            <span />
            {applicationLocked || isBusy
              ? t("config.deviceRestarting")
              : t("config.deviceOnline")}
          </div>
          <div className="device-dashboard__visual">
            {productImage ? (
              <img
                src={productImage}
                alt={t("discovery.productImage", { name: device.name })}
              />
            ) : (
              <ImageOff size={28} aria-hidden="true" />
            )}
          </div>
          <div className="device-dashboard__identity">
            <div className="eyebrow">
              <Wifi size={12} />
              {applicationLocked || isBusy
                ? t("config.targetDevice")
                : t("config.connectedDevice")}
            </div>
            <h2>{device.name}</h2>
            <p>{device.device_id}</p>
          </div>
          <dl className="device-dashboard__meta">
            <div>
              <dt>{t("config.device.model")}</dt>
              <dd>{device.model}</dd>
            </div>
            <div>
              <dt>{t("config.device.address")}</dt>
              <dd>{endpointLabel(selectedDevice.apiBaseUrl)}</dd>
            </div>
            <div>
              <dt>{t("config.device.firmware")}</dt>
              <dd>{device.firmware_version}</dd>
            </div>
            <div>
              <dt>{t("config.device.manager")}</dt>
              <dd>{device.manager_version}</dd>
            </div>
            <div>
              <dt>{t("config.device.api")}</dt>
              <dd>v{device.api_version}</dd>
            </div>
            <div>
              <dt>{t("config.device.connectedAt")}</dt>
              <dd>
                {formatConnectionTime(connectedAt, i18n.resolvedLanguage ?? "en")}
              </dd>
            </div>
          </dl>
          {confirmNetworkReset && (
            <div
              className="device-network-reset-confirmation"
              role="alertdialog"
              aria-labelledby="network-reset-title"
              aria-describedby="network-reset-detail"
            >
              <strong id="network-reset-title">{t("config.networkResetConfirmTitle")}</strong>
              <span id="network-reset-detail">{t("config.networkResetConfirmDetail")}</span>
              {networkResetError && <em role="alert">{networkResetError}</em>}
              <div>
                <button
                  className="button button--ghost"
                  type="button"
                  disabled={networkResetting}
                  onClick={() => {
                    setConfirmNetworkReset(false);
                    setNetworkResetError(null);
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={networkResetting}
                  onClick={() => void resetNetworkAddress()}
                >
                  {networkResetting ? (
                    <LoaderCircle className="button-spinner" size={14} />
                  ) : (
                    <Network size={14} />
                  )}
                  {networkResetting
                    ? t("config.networkResetting")
                    : t("config.networkResetConfirm")}
                </button>
              </div>
            </div>
          )}
          <div className="device-dashboard__actions">
            <button
              className="button button--ghost device-dashboard__reset-address"
              type="button"
              disabled={applicationLocked || isBusy || networkResetting}
              onClick={() => {
                setConfirmNetworkReset(true);
                setNetworkResetError(null);
              }}
            >
              <Network size={14} />
              {t("config.networkReset")}
            </button>
            <div className="device-dashboard__utility-actions">
              <button
                className="icon-button"
                type="button"
                onClick={onRescan}
                title={t("config.rescanTitle")}
                disabled={applicationLocked || isBusy || networkResetting}
              >
                <RefreshCw size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={onDisconnect}
                title={t("config.disconnectTitle")}
                disabled={applicationLocked || isBusy || networkResetting}
              >
                <Unplug size={16} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
