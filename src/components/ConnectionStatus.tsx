import type { DeviceState } from "../features/device/device.types";

const STATE_LABELS: Record<DeviceState, string> = {
  idle: "等待搜索",
  scanning: "正在搜索",
  results: "搜索完成",
  connecting: "正在连接",
  connected: "设备在线",
  error: "操作异常",
};

interface ConnectionStatusProps {
  state: DeviceState;
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  return (
    <div className={`status-indicator status-indicator--${state}`} role="status">
      <span className="status-indicator__dot" aria-hidden="true" />
      <span>{STATE_LABELS[state]}</span>
    </div>
  );
}
