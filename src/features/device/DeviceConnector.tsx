import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  AlertTriangle,
  Cable,
  Check,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Search,
  Square,
  Usb,
} from "lucide-react";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DeviceConfiguration } from "../config/DeviceConfiguration";
import { buildDeviceApiBaseUrl, DEVICE_HOSTS } from "./device.api";
import { getDeviceImage } from "./device.assets";
import { DeviceInitialization } from "./DeviceInitialization";
import type {
  DeviceConnectionErrorCode,
  DeviceConnectionFailure,
  DeviceState,
  DiscoveredOvisDevice,
  InitializedDevice,
  OvisDeviceInfo,
} from "./device.types";

const OvisModelViewer = lazy(() => import("./OvisModelViewer"));

interface DeviceConnectorProps {
  state: DeviceState;
  devices: DiscoveredOvisDevice[];
  selectedDevice: DiscoveredOvisDevice | null;
  initializedDevices: InitializedDevice[];
  device: OvisDeviceInfo | null;
  error: DeviceConnectionErrorCode | null;
  connectedAt: Date | null;
  applicationLocked: boolean;
  usbAvailable: boolean;
  usbPreflightReady: boolean;
  usbAuthorizationPending: boolean;
  usbIssue: string | null;
  scanInProgress: boolean;
  connectionFailure: DeviceConnectionFailure | null;
  onScan: () => void;
  onCancelScan: () => void;
  onSelectDevice: (deviceId: string) => void;
  onConnect: () => void;
  onManualConnect: (ipAddress: string) => void;
  onDisconnect: () => void;
  onResetNetwork: () => Promise<void>;
  onRescan: () => void;
  onRetry: () => void;
  onCancelInitialization: () => void;
  onRemoveUninitializedDevice: (deviceId: string) => void;
  onApplicationLockChange: (locked: boolean) => void;
  onDeviceRecovered: (apiBaseUrl: string, info: OvisDeviceInfo) => void;
}

const endpointLabel = (apiBaseUrl: string) => {
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return apiBaseUrl;
  }
};

interface ManualAddressFormProps {
  onConnect: (ipAddress: string) => void;
}

function ManualAddressForm({ onConnect }: ManualAddressFormProps) {
  const { t } = useTranslation();
  const [ipAddress, setIpAddress] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!buildDeviceApiBaseUrl(ipAddress)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onConnect(ipAddress.trim());
  };

  return (
    <form className="manual-connect" onSubmit={submit} noValidate>
      <label htmlFor="manual-device-ip">{t("discovery.manualAddress")}</label>
      <div className="manual-connect__controls">
        <input
          id="manual-device-ip"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={ipAddress}
          placeholder="192.168.42.1"
          aria-invalid={invalid}
          aria-describedby={invalid ? "manual-device-ip-error" : undefined}
          onChange={(event) => {
            setIpAddress(event.target.value);
            if (invalid) setInvalid(false);
          }}
        />
        <button className="button button--secondary" type="submit">
          <Cable size={15} />
          {t("discovery.manualConnect")}
        </button>
      </div>
      {invalid && (
        <small id="manual-device-ip-error" role="alert">
          {t("discovery.invalidManualAddress")}
        </small>
      )}
    </form>
  );
}

export function DeviceConnector({
  state,
  devices,
  selectedDevice,
  initializedDevices,
  device,
  error,
  connectedAt,
  applicationLocked,
  usbAvailable,
  usbPreflightReady,
  usbAuthorizationPending,
  usbIssue,
  scanInProgress,
  connectionFailure,
  onScan,
  onCancelScan,
  onSelectDevice,
  onConnect,
  onManualConnect,
  onDisconnect,
  onResetNetwork,
  onRescan,
  onRetry,
  onCancelInitialization,
  onRemoveUninitializedDevice,
  onApplicationLockChange,
  onDeviceRecovered,
}: DeviceConnectorProps) {
  const { t } = useTranslation();
  if (
    state === "connected" &&
    device &&
    selectedDevice?.initialization === "initialized"
  ) {
    return (
      <DeviceConfiguration
        device={device}
        selectedDevice={selectedDevice}
        connectedAt={connectedAt}
        applicationLocked={applicationLocked}
        onDisconnect={onDisconnect}
        onResetNetwork={onResetNetwork}
        onRescan={onRescan}
        onApplicationLockChange={onApplicationLockChange}
        onDeviceRecovered={onDeviceRecovered}
      />
    );
  }

  if (
    state === "initializing" &&
    selectedDevice?.initialization === "uninitialized"
  ) {
    return (
      <DeviceInitialization
        device={selectedDevice}
        initializedDevices={initializedDevices}
        onCancel={onCancelInitialization}
        onDisconnected={onRemoveUninitializedDevice}
        onInitialized={onDeviceRecovered}
      />
    );
  }

  if (state === "error" && error) {
    return (
      <div className="connector-state connector-state--error">
        <div className="connector-error-stack">
          <ErrorMessage
            code={error}
            onRetry={onRetry}
            retryLabel={selectedDevice ? t("common.reconnect") : t("common.rescan")}
            onRescan={selectedDevice ? onRescan : undefined}
          />
          <ManualAddressForm onConnect={onManualConnect} />
          <div className="usb-policy-notice">
            <Usb size={15} />
            <span>{usbIssue ?? (usbAvailable ? t("usb.searchHint") : t("usb.unsupported"))}</span>
          </div>
        </div>
      </div>
    );
  }

  if (state === "scanning") {
    return (
      <div className="connector-state connector-state--loading" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true">
          <LoaderCircle size={28} />
        </div>
        <h2>{t("discovery.scanningTitle")}</h2>
        <p>{t("discovery.scanningDescription", { count: DEVICE_HOSTS.length })}</p>
        <small>{t("discovery.scanningTimeout")}</small>
        <button
          className="button button--secondary loading-cancel"
          type="button"
          onClick={onCancelScan}
        >
          <Square size={13} fill="currentColor" />
          {t("discovery.cancelScan")}
        </button>
      </div>
    );
  }

  if (state === "recovering") {
    return (
      <div className="connector-state connector-state--loading" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true">
          <LoaderCircle size={28} />
        </div>
        <h2>{t("discovery.recoveringTitle")}</h2>
        <p>{t("discovery.recoveringDescription")}</p>
        <small>{t("discovery.recoveringTimeout")}</small>
      </div>
    );
  }

  if (state === "connecting") {
    return (
      <div className="connector-state connector-state--loading" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true">
          <LoaderCircle size={28} />
        </div>
        <h2>
          {selectedDevice
            ? t("discovery.connectingTitle", {
                name:
                  selectedDevice.initialization === "initialized"
                    ? selectedDevice.info.name
                    : t("usb.deviceName"),
              })
            : t("discovery.manualConnectingTitle")}
        </h2>
        <p>
          {selectedDevice
            ? t("discovery.connectingDescription")
            : t("discovery.manualConnectingDescription")}
        </p>
        {selectedDevice?.initialization === "initialized" && (
          <small>
            {t("discovery.connectingTimeout", {
              endpoint: endpointLabel(selectedDevice.apiBaseUrl),
            })}
          </small>
        )}
      </div>
    );
  }

  if (state === "results") {
    const hasUninitializedDevice = devices.some(
      (entry) => entry.initialization === "uninitialized",
    );
    return (
      <div className="connector-state connector-state--results">
        <header className="discovery-heading">
          <div>
            <span className="eyebrow">{t("discovery.eyebrow")}</span>
            <h2>
              {devices.length > 0
                ? t("discovery.found", { count: devices.length })
                : t("discovery.noneFound")}
            </h2>
          </div>
          <p>
            {devices.length > 0
              ? t("discovery.selectPrompt")
              : t("discovery.checkPrompt")}
          </p>
        </header>

        {(!hasUninitializedDevice || usbIssue || usbAuthorizationPending) && (
          <div className="usb-policy-notice usb-policy-notice--results">
            <Usb size={15} />
            <span>
              {usbAuthorizationPending
                ? t("usb.authorizationPending")
                : usbIssue ??
                  (usbAvailable ? t("usb.searchHint") : t("usb.unsupported"))}
            </span>
          </div>
        )}

        {connectionFailure && (
          <div className="device-connect-failure" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              {t("discovery.connectionFailed", {
                endpoint: endpointLabel(connectionFailure.apiBaseUrl),
              })}
              <small>{t(`errors.${connectionFailure.code}.detail`)}</small>
            </span>
            <button className="button button--ghost" type="button" onClick={onConnect}>
              <RefreshCw size={14} />
              {t("discovery.retryConnection")}
            </button>
          </div>
        )}

        {devices.length > 0 ? (
          <div
            className="device-results"
            role="radiogroup"
            aria-label={t("discovery.resultList")}
          >
            {devices.map((entry) => {
              const selected =
                selectedDevice?.deviceId === entry.deviceId;
              const initialized = entry.initialization === "initialized";
              const name = initialized ? entry.info.name : t("usb.deviceName");
              const model = initialized ? entry.info.model : t("usb.uninitializedModel");
              const serial = initialized ? entry.info.serial : entry.deviceId;
              const deviceImage = getDeviceImage(initialized ? entry.info.model : "OVIS");
              return (
                <button
                  className="device-result"
                  data-status={initialized ? entry.status : "setup"}
                  data-initialization={entry.initialization}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${name} ${serial}`}
                  key={entry.deviceId}
                  onClick={() => onSelectDevice(entry.deviceId)}
                >
                  <span className="device-result__visual">
                    {deviceImage ? (
                      <img
                        src={deviceImage}
                        alt={t("discovery.productImage", { name })}
                        loading="lazy"
                      />
                    ) : (
                      <span className="device-result__placeholder" aria-hidden="true">
                        <ImageOff size={24} strokeWidth={1.3} />
                        {model}
                      </span>
                    )}
                    <span className="device-result__selector" aria-hidden="true">
                      {selected && <Check size={13} strokeWidth={2.4} />}
                    </span>
                    <span className="device-result__status">
                      {initialized
                        ? entry.status === "online"
                          ? t("discovery.online")
                          : t("discovery.offline")
                        : t("usb.needsSetup")}
                    </span>
                  </span>
                  <span className="device-result__details">
                    <span className="device-result__identity">
                      <strong>{name}</strong>
                      <small>{model}</small>
                    </span>
                    <span className="device-result__serial">{serial}</span>
                    <span className="device-result__endpoint">
                      {initialized ? endpointLabel(entry.apiBaseUrl) : t("usb.transport")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-results">
            <Search size={24} strokeWidth={1.4} aria-hidden="true" />
            <span>{t("discovery.empty")}</span>
          </div>
        )}

        <footer className="discovery-actions">
          <div className="discovery-actions__secondary">
            <button
              className="button button--ghost"
              type="button"
              onClick={scanInProgress ? onCancelScan : onRescan}
            >
              {scanInProgress ? (
                <Square size={13} fill="currentColor" />
              ) : (
                <RefreshCw size={15} />
              )}
              {scanInProgress
                ? t("discovery.cancelBackgroundScan")
                : t("common.rescan")}
            </button>
            {scanInProgress && (
              <span className="discovery-background-status" aria-live="polite">
                <LoaderCircle size={14} />
                {t("discovery.backgroundScanning")}
              </span>
            )}
          </div>
          {devices.length > 0 && (
            <button
              className="button button--primary discovery-connect"
              type="button"
              disabled={!selectedDevice}
              onClick={onConnect}
            >
              <Cable size={17} />
              {selectedDevice?.initialization === "uninitialized"
                ? t("usb.initialize")
                : connectionFailure?.deviceId === selectedDevice?.deviceId
                  ? t("discovery.retryConnection")
                  : t("discovery.connect")}
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
          <h2>{t("discovery.idleTitle")}</h2>
          <p>{t("discovery.idleDescription")}</p>
          <button
            className="button button--primary"
            type="button"
            disabled={usbAvailable && !usbPreflightReady}
            onClick={onScan}
          >
            <Search size={18} />
            {t("discovery.scan")}
            <ArrowRight className="button__arrow" size={17} />
          </button>
          <ManualAddressForm onConnect={onManualConnect} />
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
