import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  ScanFace,
  Settings2,
  Unplug,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { getDeviceImage } from "../device/device.assets";
import type {
  DiscoveredDevice,
  OvisDeviceInfo,
} from "../device/device.types";
import type {
  ConfigIssue,
  DeviceConfigValues,
  StreamConfigValues,
  VideoProfileCapability,
} from "./config.types";
import { useDeviceConfiguration } from "./useDeviceConfiguration";

interface DeviceConfigurationProps {
  device: OvisDeviceInfo;
  selectedDevice: DiscoveredDevice;
  connectedAt: Date | null;
  applicationLocked: boolean;
  onDisconnect: () => void;
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

const endpointLabel = (apiBaseUrl: string) =>
  apiBaseUrl.replace(/^https?:\/\//, "");

const formatConnectionTime = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(value)
    : "-";

const profileLabel = (profile: VideoProfileCapability) =>
  `${profile.id} · ${profile.width}×${profile.height}`;

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
  issues: ConfigIssue[];
  updateDraft: (mutator: (draft: DeviceConfigValues) => void) => void;
}

function StreamEditor({
  title,
  streamKey,
  values,
  profiles,
  disabled,
  issues,
  updateDraft,
}: StreamEditorProps) {
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
        {disabled && <small>已关闭</small>}
      </div>
      <div className="config-fields">
        <label className="config-field">
          <span>分辨率预设</span>
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
          <span>帧率</span>
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
          <span>码率</span>
          <span className="number-input">
            <input
              type="number"
              min={activeProfile?.bitrate_min ?? 1}
              max={activeProfile?.bitrate_max ?? 100_000}
              step="1"
              value={values.bitrate_kbps}
              disabled={disabled}
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

interface DetectionRowProps {
  icon: React.ReactNode;
  title: string;
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
}

function DetectionRow({
  icon,
  title,
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
}: DetectionRowProps) {
  return (
    <div className="feature-row">
      <div className="feature-row__identity">
        <span aria-hidden="true">{icon}</span>
        <div>
          <strong>{title}</strong>
          <small>{supported ? (enabled ? "已启用" : "已关闭") : "设备不支持"}</small>
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
    </div>
  );
}

const busyStatusLabel = {
  saving: "正在保存配置",
  restart_pending: "配置已保存，设备正在重启",
  reconnecting: "正在等待设备恢复连接",
  verifying: "设备已恢复，正在确认配置",
  resetting: "正在恢复默认配置",
} as const;

type ConfigSectionId = "video" | "detection";

const CONFIG_SECTIONS: Array<{
  id: ConfigSectionId;
  index: string;
  label: string;
}> = [
  { id: "video", index: "01", label: "视频码流" },
  { id: "detection", index: "02", label: "智能检测" },
];

export function DeviceConfiguration({
  device,
  selectedDevice,
  connectedAt,
  applicationLocked,
  onDisconnect,
  onRescan,
  onApplicationLockChange,
  onDeviceRecovered,
}: DeviceConfigurationProps) {
  const configuration = useDeviceConfiguration({
    apiBaseUrl: selectedDevice.apiBaseUrl,
    deviceId: device.device_id,
    onApplicationLockChange,
    onDeviceRecovered,
  });
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeSection, setActiveSection] =
    useState<ConfigSectionId>("video");
  const editorRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<ConfigSectionId, HTMLElement | null>>({
    video: null,
    detection: null,
  });
  const productImage = getDeviceImage(device.model);
  const issues = configuration.validation?.errors ?? [];
  const isBusy = configuration.applicationBusy || configuration.status === "resetting";
  const activeStatus = (
    configuration.status === "resetting"
      ? "resetting"
      : configuration.applicationState
  ) as keyof typeof busyStatusLabel;
  const taskProgress = Math.min(100, Math.max(0, configuration.task?.progress ?? 0));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const updateActiveSection = () => {
      const editorTop = editor.getBoundingClientRect().top;
      let nextSection: ConfigSectionId = "video";
      CONFIG_SECTIONS.forEach(({ id }) => {
        const section = sectionRefs.current[id];
        if (section && section.getBoundingClientRect().top <= editorTop + 150) {
          nextSection = id;
        }
      });
      setActiveSection(nextSection);
    };

    editor.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    updateActiveSection();
    return () => {
      editor.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("scroll", updateActiveSection);
    };
  }, [configuration.status]);

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

  const detectionRows = useMemo(() => {
    if (!configuration.capabilities || !configuration.draft) return [];
    const { capabilities, draft } = configuration;
    return [
      {
        key: "person",
        icon: <Settings2 size={17} />,
        title: "人员检测",
        supported: capabilities.features.person_detection,
        enabled: draft.detection.person.enabled,
        value: draft.detection.person.threshold,
        min: 0,
        max: 1,
        step: 0.01,
        valueLabel: draft.detection.person.threshold.toFixed(2),
        rangeLabel: "阈值",
      },
      {
        key: "face",
        icon: <ScanFace size={17} />,
        title: "人脸检测",
        supported: capabilities.features.face_detection,
        enabled: draft.detection.face.enabled,
        value: draft.detection.face.threshold,
        min: 0,
        max: 1,
        step: 0.01,
        valueLabel: draft.detection.face.threshold.toFixed(2),
        rangeLabel: "阈值",
      },
      {
        key: "motion",
        icon: <Activity size={17} />,
        title: "移动检测",
        supported: capabilities.features.motion_detection,
        enabled: draft.detection.motion.enabled,
        value: draft.detection.motion.sensitivity,
        min: 0,
        max: 100,
        step: 1,
        valueLabel: `${draft.detection.motion.sensitivity}`,
        rangeLabel: "灵敏度",
      },
    ] as const;
  }, [configuration]);

  const updateDetection = (
    key: "person" | "face" | "motion",
    property: "enabled" | "value",
    value: boolean | number,
  ) => {
    configuration.updateDraft((draft) => {
      if (key === "motion") {
        if (property === "enabled") draft.detection.motion.enabled = value as boolean;
        else draft.detection.motion.sensitivity = value as number;
      } else if (key === "person") {
        if (property === "enabled") draft.detection.person.enabled = value as boolean;
        else draft.detection.person.threshold = value as number;
      } else {
        if (property === "enabled") draft.detection.face.enabled = value as boolean;
        else draft.detection.face.threshold = value as number;
      }
    });
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
                  ? "正在恢复设备连接"
                  : configuration.applicationState === "verifying"
                    ? "正在确认配置应用结果"
                    : "正在读取设备配置"}
              </strong>
              <span>
                {configuration.applicationState === "reconnecting"
                  ? "只会重新连接相同 device_id 的设备"
                  : "同时获取能力范围与当前值"}
              </span>
            </div>
          )}

          {configuration.status === "error" && (
            <div className="configuration-loading" role="alert">
              <AlertTriangle size={24} />
              <strong>配置读取失败</strong>
              <span>{configuration.requestError}</span>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void configuration.load()}
              >
                <RefreshCw size={15} />重试
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
                    <h3>设备配置</h3>
                    <span
                      className={`draft-state ${configuration.hasChanges ? "draft-state--dirty" : ""}`}
                    >
                      {configuration.applicationBusy
                        ? "等待设备确认"
                        : configuration.hasChanges
                          ? "有未保存修改"
                          : "配置已同步"}
                    </span>
                  </div>
                  <div className="configuration-toolbar__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmReset(true)}
                    >
                      <RotateCcw size={15} />恢复默认
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
                      保存并应用
                    </button>
                  </div>
                </div>

                {confirmReset && (
                  <div className="reset-confirmation" role="alert">
                    <div>
                      <strong>恢复设备默认配置？</strong>
                      <span>当前草稿和设备已保存配置将被替换。</span>
                    </div>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => setConfirmReset(false)}
                    >
                      取消
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => {
                        setConfirmReset(false);
                        void configuration.restoreDefaults();
                      }}
                    >
                      确认恢复
                    </button>
                  </div>
                )}

                {isBusy && (
                  <div className="operation-progress" role="status">
                    <div>
                      <LoaderCircle size={16} />
                      <strong>{busyStatusLabel[activeStatus]}</strong>
                      <span>
                        {configuration.applicationState === "restart_pending"
                          ? "配置已保存，设备正在重启"
                          : configuration.task?.message ??
                            "网络中断不会立即判定失败"}
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
                      {configuration.outcome.type === "error" && (
                        <span>
                          {configuration.outcome.rolledBack
                            ? "自动回滚成功，页面已重新读取设备配置。"
                            : "设备未确认自动回滚，请检查当前配置。"}
                        </span>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="关闭提示"
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
                            ? "配置包含警告"
                            : "配置校验未通过"}
                        </strong>
                        {[
                          ...configuration.validation.errors,
                          ...configuration.validation.warnings,
                        ].map((issue) => (
                          <span key={`${issue.field}-${issue.code}`}>
                            {issue.message}
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
                        <span>01</span>
                        <h3 id="video-config-heading">视频码流</h3>
                      </div>
                    </div>
                    <div className="stream-grid">
                      <StreamEditor
                        title="主码流"
                        streamKey="main"
                        values={configuration.draft.video.main}
                        profiles={configuration.capabilities.video.main.profiles}
                        disabled={false}
                        issues={issues}
                        updateDraft={configuration.updateDraft}
                      />
                      <div className="sub-stream-wrap">
                        <div className="sub-stream-switch">
                          <span>子码流</span>
                          <Toggle
                            checked={configuration.draft.video.sub.enabled}
                            label="启用子码流"
                            onChange={(checked) =>
                              configuration.updateDraft((draft) => {
                                draft.video.sub.enabled = checked;
                              })
                            }
                          />
                        </div>
                        <StreamEditor
                          title="子码流"
                          streamKey="sub"
                          values={configuration.draft.video.sub}
                          profiles={configuration.capabilities.video.sub.profiles}
                          disabled={!configuration.draft.video.sub.enabled}
                          issues={issues}
                          updateDraft={configuration.updateDraft}
                        />
                      </div>
                    </div>
                  </section>

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
                        <span>02</span>
                        <h3 id="feature-config-heading">画面与智能检测</h3>
                      </div>
                    </div>
                    <div className="feature-list">
                      <div className="feature-row feature-row--simple">
                        <div className="feature-row__identity">
                          <span aria-hidden="true">
                            <Video size={17} />
                          </span>
                          <div>
                            <strong>OSD 叠加</strong>
                            <small>
                              {configuration.capabilities.features.osd
                                ? configuration.draft.overlay.enabled
                                  ? "已启用"
                                  : "已关闭"
                                : "设备不支持"}
                            </small>
                          </div>
                        </div>
                        <Toggle
                          checked={configuration.draft.overlay.enabled}
                          disabled={!configuration.capabilities.features.osd}
                          label="启用 OSD"
                          onChange={(checked) =>
                            configuration.updateDraft((draft) => {
                              draft.overlay.enabled = checked;
                            })
                          }
                        />
                      </div>
                      {detectionRows.map(({ key, ...row }) => (
                        <DetectionRow
                          key={key}
                          {...row}
                          toggleLabel={`启用${row.title}`}
                          onToggle={(checked) =>
                            updateDetection(key, "enabled", checked)
                          }
                          onValue={(value) =>
                            updateDetection(key, "value", value)
                          }
                        />
                      ))}
                    </div>
                  </section>
                </fieldset>

                <footer className="configuration-footer">
                  <span>REVISION {configuration.revision}</span>
                  <span>
                    {configuration.targetRevision
                      ? `TARGET ${configuration.targetRevision}`
                      : "所有配置请求发送至当前连接设备"}
                  </span>
                </footer>
              </main>
            )}
        </div>

        <nav className="config-section-nav" aria-label="配置分类">
          <div className="config-section-nav__header">
            <span>SECTION</span>
            <output>
              {CONFIG_SECTIONS.find((section) => section.id === activeSection)?.index}
              <small>/ {String(CONFIG_SECTIONS.length).padStart(2, "0")}</small>
            </output>
          </div>
          <div className="config-section-nav__list">
            {CONFIG_SECTIONS.map((section) => (
              <button
                type="button"
                key={section.id}
                className={activeSection === section.id ? "is-active" : ""}
                aria-current={activeSection === section.id ? "true" : undefined}
                disabled={!configuration.capabilities}
                onClick={() => scrollToSection(section.id)}
              >
                <span>{section.index}</span>
                <strong>{section.label}</strong>
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
          aria-label="当前设备仪表盘"
        >
          <div className="device-dashboard__status">
            <span />
            {applicationLocked || isBusy ? "设备重启中" : "设备在线"}
          </div>
          <div className="device-dashboard__visual">
            {productImage ? (
              <img src={productImage} alt={`${device.name} 产品图`} />
            ) : (
              <ImageOff size={28} aria-hidden="true" />
            )}
          </div>
          <div className="device-dashboard__identity">
            <div className="eyebrow">
              <Wifi size={12} />
              {applicationLocked || isBusy ? "TARGET DEVICE" : "CONNECTED DEVICE"}
            </div>
            <h2>{device.name}</h2>
            <p>{device.device_id}</p>
          </div>
          <dl className="device-dashboard__meta">
            <div>
              <dt>设备型号</dt>
              <dd>{device.model}</dd>
            </div>
            <div>
              <dt>设备地址</dt>
              <dd>{endpointLabel(selectedDevice.apiBaseUrl)}</dd>
            </div>
            <div>
              <dt>固件版本</dt>
              <dd>{device.firmware_version}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>{device.manager_version}</dd>
            </div>
            <div>
              <dt>API</dt>
              <dd>v{device.api_version}</dd>
            </div>
            <div>
              <dt>连接时间</dt>
              <dd>{formatConnectionTime(connectedAt)}</dd>
            </div>
          </dl>
          <div className="device-dashboard__actions">
            <button
              className="icon-button"
              type="button"
              onClick={onRescan}
              title="重新搜索"
              disabled={applicationLocked || isBusy}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={onDisconnect}
              title="断开连接"
              disabled={applicationLocked || isBusy}
            >
              <Unplug size={16} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
