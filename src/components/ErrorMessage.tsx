import { AlertTriangle, RotateCcw } from "lucide-react";
import type { DeviceConnectionErrorCode } from "../features/device/device.types";

const ERROR_MESSAGES: Record<
  DeviceConnectionErrorCode,
  { title: string; detail: string }
> = {
  UNSUPPORTED_BROWSER: {
    title: "当前浏览器不受支持",
    detail: "请使用最新版 Chrome 或 Edge，并允许访问本地网络。",
  },
  PERMISSION_DENIED: {
    title: "本地网络访问被拒绝",
    detail: "请在浏览器站点设置中允许本地网络访问后重试。",
  },
  DEVICE_NOT_FOUND: {
    title: "未发现 OVIS 设备",
    detail: "请确认设备已启动，且电脑已连接到设备所在网络。",
  },
  CONNECTION_TIMEOUT: {
    title: "连接设备超时",
    detail: "设备在 3 秒内未响应，请检查网络连接。",
  },
  NETWORK_ERROR: {
    title: "无法访问设备",
    detail: "请检查设备供电、网络连接和接口地址后重试。",
  },
  INVALID_RESPONSE: {
    title: "设备响应无效",
    detail: "设备返回了无法识别的数据，请确认 Manager 状态。",
  },
  NOT_OVIS_DEVICE: {
    title: "目标不是 OVIS 设备",
    detail: "当前地址返回了其他服务，请核对设备接口地址。",
  },
  UNSUPPORTED_API_VERSION: {
    title: "API 版本不兼容",
    detail: "当前网页仅支持设备 API v1，请更新设备或 Manager。",
  },
};

interface ErrorMessageProps {
  code: DeviceConnectionErrorCode;
  onRetry: () => void;
  disconnected?: boolean;
}

export function ErrorMessage({
  code,
  onRetry,
  disconnected = false,
}: ErrorMessageProps) {
  const message = disconnected
    ? {
        title: "设备连接已中断",
        detail: "连续两次状态检测失败，网页端已停止检测。",
      }
    : ERROR_MESSAGES[code];

  return (
    <div className="error-message" role="alert">
      <div className="error-message__icon" aria-hidden="true">
        <AlertTriangle size={19} strokeWidth={1.7} />
      </div>
      <div className="error-message__content">
        <strong>{message.title}</strong>
        <p>{message.detail}</p>
      </div>
      <button className="button button--secondary" type="button" onClick={onRetry}>
        <RotateCcw size={16} />
        重试
      </button>
    </div>
  );
}
