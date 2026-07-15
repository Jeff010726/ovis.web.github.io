import { ArrowRight, Cable, LoaderCircle, ShieldCheck } from "lucide-react";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DeviceSummary } from "./DeviceSummary";
import type {
  DeviceConnectionErrorCode,
  DeviceConnectionState,
  OvisDeviceInfo,
} from "./device.types";

interface DeviceConnectorProps {
  state: DeviceConnectionState;
  device: OvisDeviceInfo | null;
  error: DeviceConnectionErrorCode | null;
  connectedAt: Date | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
}

export function DeviceConnector({
  state,
  device,
  error,
  connectedAt,
  onConnect,
  onDisconnect,
  onRetry,
}: DeviceConnectorProps) {
  if (state === "connected" && device) {
    return (
      <DeviceSummary
        device={device}
        connectedAt={connectedAt}
        onDisconnect={onDisconnect}
      />
    );
  }

  if ((state === "error" || state === "disconnected") && error) {
    return (
      <div className="connector-state connector-state--error">
        <div className="connector-state__index">CONNECTION / 01</div>
        <ErrorMessage
          code={error}
          onRetry={onRetry}
          disconnected={state === "disconnected"}
        />
      </div>
    );
  }

  if (state === "connecting") {
    return (
      <div className="connector-state connector-state--loading" aria-live="polite">
        <div className="connector-state__index">CONNECTION / 01</div>
        <div className="loading-visual" aria-hidden="true">
          <div className="loading-visual__ring">
            <LoaderCircle size={34} />
          </div>
          <span>OVIS</span>
        </div>
        <h2>正在建立本地连接</h2>
        <p>正在验证设备协议与 API 版本</p>
        <div className="loading-progress" aria-hidden="true">
          <span />
        </div>
        <small>最长等待 3 秒</small>
      </div>
    );
  }

  return (
    <div className="connector-state connector-state--idle">
      <div className="connector-state__index">CONNECTION / 01</div>
      <div className="idle-layout">
        <div className="idle-copy">
          <div className="eyebrow">
            <ShieldCheck size={13} /> LOCAL DEVICE ACCESS
          </div>
          <h2>连接你的 OVIS 设备</h2>
          <p>接口待命 · API v1 · 本地网络</p>
          <button className="button button--primary" type="button" onClick={onConnect}>
            <Cable size={18} />
            连接设备
            <ArrowRight className="button__arrow" size={17} />
          </button>
        </div>
        <div className="device-blueprint" aria-hidden="true">
          <div className="device-blueprint__axis device-blueprint__axis--x" />
          <div className="device-blueprint__axis device-blueprint__axis--y" />
          <div className="device-blueprint__body">
            <div className="device-blueprint__lens">
              <span />
            </div>
            <div className="device-blueprint__mark">OVIS</div>
            <div className="device-blueprint__port" />
          </div>
          <div className="device-blueprint__label">OPTICAL VISION SYSTEM</div>
          <div className="device-blueprint__metric">184.2</div>
        </div>
      </div>
    </div>
  );
}
