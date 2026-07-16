import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Cable,
  Check,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DeviceConfiguration } from "../config/DeviceConfiguration";
import { buildDeviceApiBaseUrl, DEVICE_HOSTS } from "./device.api";
import { getDeviceImage } from "./device.assets";
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
  applicationLocked: boolean;
  onScan: () => void;
  onCancelScan: () => void;
  onSelectDevice: (deviceId: string) => void;
  onConnect: () => void;
  onManualConnect: (ipAddress: string) => void;
  onDisconnect: () => void;
  onRescan: () => void;
  onRetry: () => void;
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
  device,
  error,
  connectedAt,
  applicationLocked,
  onScan,
  onCancelScan,
  onSelectDevice,
  onConnect,
  onManualConnect,
  onDisconnect,
  onRescan,
  onRetry,
  onApplicationLockChange,
  onDeviceRecovered,
}: DeviceConnectorProps) {
  const { t } = useTranslation();
  if (state === "connected" && device && selectedDevice) {
    return (
      <DeviceConfiguration
        device={device}
        selectedDevice={selectedDevice}
        connectedAt={connectedAt}
        applicationLocked={applicationLocked}
        onDisconnect={onDisconnect}
        onRescan={onRescan}
        onApplicationLockChange={onApplicationLockChange}
        onDeviceRecovered={onDeviceRecovered}
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
            ? t("discovery.connectingTitle", { name: selectedDevice.info.name })
            : t("discovery.manualConnectingTitle")}
        </h2>
        <p>
          {selectedDevice
            ? t("discovery.connectingDescription")
            : t("discovery.manualConnectingDescription")}
        </p>
        {selectedDevice && (
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

        {devices.length > 0 ? (
          <div
            className="device-results"
            role="radiogroup"
            aria-label={t("discovery.resultList")}
          >
            {devices.map((entry) => {
              const selected =
                selectedDevice?.info.device_id === entry.info.device_id;
              const deviceImage = getDeviceImage(entry.info.model);
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
                  <span className="device-result__visual">
                    {deviceImage ? (
                      <img
                        src={deviceImage}
                        alt={t("discovery.productImage", { name: entry.info.name })}
                        loading="lazy"
                      />
                    ) : (
                      <span className="device-result__placeholder" aria-hidden="true">
                        <ImageOff size={24} strokeWidth={1.3} />
                        {entry.info.model}
                      </span>
                    )}
                    <span className="device-result__selector" aria-hidden="true">
                      {selected && <Check size={13} strokeWidth={2.4} />}
                    </span>
                    <span className="device-result__status">
                      {entry.status === "online" ? t("discovery.online") : t("discovery.offline")}
                    </span>
                  </span>
                  <span className="device-result__details">
                    <span className="device-result__identity">
                      <strong>{entry.info.name}</strong>
                      <small>{entry.info.model}</small>
                    </span>
                    <span className="device-result__serial">{entry.info.serial}</span>
                    <span className="device-result__endpoint">
                      {endpointLabel(entry.apiBaseUrl)}
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
          <button
            className="button button--ghost"
            type="button"
            onClick={onRescan}
          >
            <RefreshCw size={15} />
            {t("common.rescan")}
          </button>
          {devices.length > 0 && (
            <button
              className="button button--primary discovery-connect"
              type="button"
              disabled={!selectedDevice}
              onClick={onConnect}
            >
              <Cable size={17} />
              {t("discovery.connect")}
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
          <button className="button button--primary" type="button" onClick={onScan}>
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
