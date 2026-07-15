import type { DeviceConnectionState } from "../features/device/device.types";

const STATE_LABELS: Record<DeviceConnectionState, string> = {
  idle: "等待连接",
  connecting: "正在连接",
  connected: "设备在线",
  disconnected: "连接已断开",
  error: "连接异常",
};

interface ConnectionStatusProps {
  state: DeviceConnectionState;
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  return (
    <div className={`status-indicator status-indicator--${state}`} role="status">
      <span className="status-indicator__dot" aria-hidden="true" />
      <span>{STATE_LABELS[state]}</span>
    </div>
  );
}
