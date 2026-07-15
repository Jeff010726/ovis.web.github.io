import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
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
    title: "所选设备无响应",
    detail: "设备可能已离线，请重新搜索或检查网络连接。",
  },
  CONNECTION_TIMEOUT: {
    title: "连接设备超时",
    detail: "所选设备在 3 秒内未响应，请检查网络连接。",
  },
  NETWORK_ERROR: {
    title: "无法访问所选设备",
    detail: "请检查设备供电和本地网络连接后重试。",
  },
  INVALID_RESPONSE: {
    title: "设备响应无效",
    detail: "设备返回了无法识别的数据，请确认 Manager 状态。",
  },
  NOT_OVIS_DEVICE: {
    title: "设备身份验证失败",
    detail: "所选地址当前返回的不是 OVIS 设备。",
  },
  UNSUPPORTED_API_VERSION: {
    title: "API 版本不兼容",
    detail: "当前网页仅支持设备 API v1，请更新设备或 Manager。",
  },
  DEVICE_CHANGED: {
    title: "设备身份已变化",
    detail: "所选地址对应的设备已更换，请重新搜索并确认设备。",
  },
  DEVICE_DISCONNECTED: {
    title: "设备连接已中断",
    detail: "连续两次状态检测失败，网页端已停止检测。",
  },
};

interface ErrorMessageProps {
  code: DeviceConnectionErrorCode;
  onRetry: () => void;
  retryLabel?: string;
  onRescan?: () => void;
}

export function ErrorMessage({
  code,
  onRetry,
  retryLabel = "重试",
  onRescan,
}: ErrorMessageProps) {
  const message = ERROR_MESSAGES[code];

  return (
    <div className="error-message" role="alert">
      <div className="error-message__icon" aria-hidden="true">
        <AlertTriangle size={19} strokeWidth={1.7} />
      </div>
      <div className="error-message__content">
        <strong>{message.title}</strong>
        <p>{message.detail}</p>
      </div>
      <div className="error-message__actions">
        {onRescan && (
          <button
            className="button button--ghost"
            type="button"
            onClick={onRescan}
          >
            <RefreshCw size={15} />
            重新搜索
          </button>
        )}
        <button
          className="button button--secondary"
          type="button"
          onClick={onRetry}
        >
          <RotateCcw size={16} />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
