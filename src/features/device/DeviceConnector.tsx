import { lazy, Suspense } from "react";
import {
  ArrowRight,
  Cable,
  Check,
  LoaderCircle,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DeviceSummary } from "./DeviceSummary";
import { DEVICE_HOSTS } from "./device.api";
import type {
  DeviceConnectionErrorCode,
  DeviceState,
  DiscoveredDevice,
  OvisDeviceInfo,
} from "./device.types";

const OvisModelViewer = lazy(() => import("./OvisModelViewer"));

interface DeviceConnectorProps {
  state: DeviceState;
  devices: DiscoveredDevice[];
  selectedDevice: DiscoveredDevice | null;
  device: OvisDeviceInfo | null;
  error: DeviceConnectionErrorCode | null;
  connectedAt: Date | null;
  onScan: () => void;
  onCancelScan: () => void;
  onSelectDevice: (deviceId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRescan: () => void;
  onRetry: () => void;
}

const endpointLabel = (apiBaseUrl: string) => {
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return apiBaseUrl;
  }
};

export function DeviceConnector({
  state,
  devices,
  selectedDevice,
  device,
  error,
  connectedAt,
  onScan,
  onCancelScan,
  onSelectDevice,
  onConnect,
  onDisconnect,
  onRescan,
  onRetry,
}: DeviceConnectorProps) {
  if (state === "connected" && device && selectedDevice) {
    return (
      <DeviceSummary
        device={device}
        apiBaseUrl={selectedDevice.apiBaseUrl}
        connectedAt={connectedAt}
        onDisconnect={onDisconnect}
        onRescan={onRescan}
      />
    );
  }

  if (state === "error" && error) {
    return (
      <div className="connector-state connector-state--error">
        <ErrorMessage
          code={error}
          onRetry={onRetry}
          retryLabel={selectedDevice ? "重新连接" : "重新搜索"}
          onRescan={selectedDevice ? onRescan : undefined}
        />
      </div>
    );
  }

  if (state === "scanning") {
    return (
      <div className="connector-state connector-state--loading" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true">
          <LoaderCircle size={28} />
        </div>
        <h2>正在搜索 OVIS 设备</h2>
        <p>并发探测 {DEVICE_HOSTS.length} 个本地网络地址</p>
        <small>每个地址最长等待 1.5 秒</small>
        <button
          className="button button--secondary loading-cancel"
          type="button"
          onClick={onCancelScan}
        >
          <Square size={13} fill="currentColor" />
          取消搜索
        </button>
      </div>
    );
  }

  if (state === "connecting" && selectedDevice) {
    return (
      <div className="connector-state connector-state--loading" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true">
          <LoaderCircle size={28} />
        </div>
        <h2>正在连接 {selectedDevice.info.name}</h2>
        <p>再次确认设备身份与 API 版本</p>
        <small>{endpointLabel(selectedDevice.apiBaseUrl)} · 最长等待 3 秒</small>
      </div>
    );
  }

  if (state === "results") {
    return (
      <div className="connector-state connector-state--results">
        <header className="discovery-heading">
          <div>
            <span className="eyebrow">LOCAL DEVICE DISCOVERY</span>
            <h2>
              {devices.length > 0
                ? `发现 ${devices.length} 台 OVIS 设备`
                : "未发现 OVIS 设备"}
            </h2>
          </div>
          <p>
            {devices.length > 0
              ? "选择一台设备后建立连接"
              : "请检查设备供电与本地网络连接"}
          </p>
        </header>

        {devices.length > 0 ? (
          <div
            className="device-results"
            role="radiogroup"
            aria-label="搜索到的 OVIS 设备"
          >
            {devices.map((entry) => {
              const selected =
                selectedDevice?.info.device_id === entry.info.device_id;
              return (
                <button
                  className="device-result"
                  data-status={entry.status}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${entry.info.name} ${entry.info.serial}`}
                  key={entry.info.device_id}
                  onClick={() => onSelectDevice(entry.info.device_id)}
                >
                  <span className="device-result__selector" aria-hidden="true">
                    {selected && <Check size={13} strokeWidth={2.4} />}
                  </span>
                  <span className="device-result__identity">
                    <strong>{entry.info.name}</strong>
                    <small>{entry.info.model} · {entry.info.serial}</small>
                  </span>
                  <span className="device-result__endpoint">
                    <span>{entry.status === "online" ? "在线" : "离线"}</span>
                    <small>{endpointLabel(entry.apiBaseUrl)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-results">
            <Search size={24} strokeWidth={1.4} aria-hidden="true" />
            <span>地址池中没有设备响应</span>
          </div>
        )}

        <footer className="discovery-actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={onRescan}
          >
            <RefreshCw size={15} />
            重新搜索
          </button>
          {devices.length > 0 && (
            <button
              className="button button--primary discovery-connect"
              type="button"
              disabled={!selectedDevice}
              onClick={onConnect}
            >
              <Cable size={17} />
              连接
              <ArrowRight className="button__arrow" size={16} />
            </button>
          )}
        </footer>
      </div>
    );
  }

  return (
    <div className="connector-state connector-state--idle">
      <div className="idle-layout">
        <div className="idle-copy">
          <h2>搜索 OVIS 设备</h2>
          <p>扫描本地设备网络 · API v1</p>
          <button className="button button--primary" type="button" onClick={onScan}>
            <Search size={18} />
            搜索设备
            <ArrowRight className="button__arrow" size={17} />
          </button>
        </div>
        <Suspense
          fallback={
            <div className="model-loading" aria-hidden="true">
              <LoaderCircle size={24} />
            </div>
          }
        >
          <OvisModelViewer />
        </Suspense>
      </div>
    </div>
  );
}
