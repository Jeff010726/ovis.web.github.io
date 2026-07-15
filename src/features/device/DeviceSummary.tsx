import { Cpu, Radio, RefreshCw, Unplug } from "lucide-react";
import type { OvisDeviceInfo } from "./device.types";

interface DeviceSummaryProps {
  device: OvisDeviceInfo;
  apiBaseUrl: string;
  connectedAt: Date | null;
  onDisconnect: () => void;
  onRescan: () => void;
}

const formatConnectionTime = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(value)
    : "-";

const formatEndpoint = (apiBaseUrl: string) =>
  apiBaseUrl.replace(/^https?:\/\//, "");

export function DeviceSummary({
  device,
  apiBaseUrl,
  connectedAt,
  onDisconnect,
  onRescan,
}: DeviceSummaryProps) {
  const identityItems = [
    ["设备型号", device.model],
    ["设备名称", device.name],
    ["唯一序列号", device.serial],
    ["设备地址", formatEndpoint(apiBaseUrl)],
  ];
  const systemItems = [
    ["固件版本", device.firmware_version],
    ["Manager 版本", device.manager_version],
    ["API 版本", `v${device.api_version}`],
  ];

  return (
    <div className="device-summary">
      <section className="device-identity" aria-labelledby="device-name">
        <div className="device-identity__copy">
          <div className="eyebrow">
            <Radio size={13} /> LIVE DEVICE
          </div>
          <h2 id="device-name">{device.name}</h2>
          <p>{device.device_id}</p>
        </div>
        <div className="device-identity__online">
          <span />
          通信正常
        </div>
      </section>

      <div className="device-grid">
        <section className="info-section" aria-labelledby="identity-heading">
          <div className="info-section__heading">
            <span>01</span>
            <h3 id="identity-heading">设备标识</h3>
          </div>
          <dl>
            {identityItems.map(([label, value]) => (
              <div className="info-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="info-section" aria-labelledby="system-heading">
          <div className="info-section__heading">
            <span>02</span>
            <h3 id="system-heading">系统版本</h3>
          </div>
          <dl>
            {systemItems.map(([label, value]) => (
              <div className="info-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer className="device-summary__footer">
        <div className="connection-time">
          <Cpu size={16} />
          <span>本次连接</span>
          <time>{formatConnectionTime(connectedAt)}</time>
        </div>
        <div className="device-summary__actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={onRescan}
          >
            <RefreshCw size={15} />
            重新搜索
          </button>
          <button
            className="button button--secondary button--disconnect"
            type="button"
            onClick={onDisconnect}
          >
            <Unplug size={16} />
            断开连接
          </button>
        </div>
      </footer>
    </div>
  );
}
