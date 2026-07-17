import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, LoaderCircle, Network, Usb } from "lucide-react";
import { fetchDeviceInfo } from "./device.api";
import { getDeviceImage } from "./device.assets";
import type { InitializedDevice, OvisDeviceInfo, UninitializedDevice } from "./device.types";
import {
  initializeOvisUsbDevice,
  onOvisUsbDeviceDisconnected,
  OvisUsbInitializationError,
  type OvisUsbInitializationPhase,
} from "./webusb.api";

interface DeviceInitializationProps {
  device: UninitializedDevice;
  initializedDevices: InitializedDevice[];
  onCancel: () => void;
  onInitialized: (apiBaseUrl: string, info: OvisDeviceInfo) => void;
}

const extractThirdOctet = (ipAddress: string) => {
  const octets = ipAddress.split(".");
  if (
    octets.length !== 4 ||
    octets[0] !== "192" ||
    octets[1] !== "168" ||
    !/^\d{1,3}$/.test(octets[2])
  ) {
    return null;
  }
  const subnet = Number(octets[2]);
  return subnet >= 0 && subnet <= 255 ? subnet : null;
};

export function DeviceInitialization({
  device,
  initializedDevices,
  onCancel,
  onInitialized,
}: DeviceInitializationProps) {
  const { t } = useTranslation();
  const [subnetDraft, setSubnetDraft] = useState("");
  const [phase, setPhase] = useState<OvisUsbInitializationPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busy = phase !== null && phase !== "complete";
  const occupiedSubnets = useMemo(
    () =>
      new Set(
        initializedDevices
          .map((entry) => extractThirdOctet(entry.ipAddress))
          .filter((entry): entry is number => entry !== null),
      ),
    [initializedDevices],
  );

  useEffect(() => {
    return onOvisUsbDeviceDisconnected(device.usbSession, () => {
      controllerRef.current?.abort();
      setPhase(null);
      setError(t("usb.errors.DEVICE_DISCONNECTED"));
    });
  }, [device.usbSession, t]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const initialize = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = subnetDraft.trim();
    const subnet = /^\d{1,3}$/.test(value) ? Number(value) : Number.NaN;
    if (!Number.isInteger(subnet) || subnet < 0 || subnet > 255) {
      setError(t("usb.invalidSubnet"));
      return;
    }
    const ipAddress = `192.168.${subnet}.1`;
    if (occupiedSubnets.has(subnet)) {
      setError(t("usb.subnetOccupied", { ipAddress }));
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPhase("checking-address");
    try {
      const initialized = await initializeOvisUsbDevice(device.usbSession, subnet, {
        occupiedSubnets,
        signal: controller.signal,
        onPhase: setPhase,
        probeNetworkDevice: async (apiBaseUrl, timeoutMs, signal) => {
          try {
            return await fetchDeviceInfo(apiBaseUrl, { timeoutMs, signal });
          } catch {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            return null;
          }
        },
      });
      onInitialized(initialized.apiBaseUrl, initialized.info);
    } catch (nextError) {
      setPhase(null);
      if (nextError instanceof OvisUsbInitializationError) {
        setError(nextError.message);
      } else if (controller.signal.aborted) {
        setError(t("usb.errors.DEVICE_DISCONNECTED"));
      } else {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const productImage = getDeviceImage("OVIS");

  return (
    <div className="device-initialization">
      <aside className="device-initialization__identity">
        <div className="device-initialization__transport">
          <Usb size={15} />
          <span>{t("usb.transport")}</span>
        </div>
        <div className="device-initialization__visual">
          {productImage && <img src={productImage} alt={t("discovery.productImage", { name: t("usb.deviceName") })} />}
        </div>
        <span className="eyebrow">{t("usb.needsSetup")}</span>
        <h2>{t("usb.deviceName")}</h2>
        <dl>
          <div>
            <dt>{t("usb.deviceIdentity")}</dt>
            <dd>{device.deviceId}</dd>
          </div>
          <div>
            <dt>{t("usb.subnetInput")}</dt>
            <dd>{t("usb.uninitializedModel")}</dd>
          </div>
        </dl>
      </aside>

      <main className="device-initialization__workspace">
        <header>
          <span className="eyebrow">{t("usb.setupEyebrow")}</span>
          <h1>{t("usb.setupTitle")}</h1>
          <p>{t("usb.setupDescription")}</p>
        </header>

        <form onSubmit={(event) => void initialize(event)} noValidate>
          <label htmlFor="ovis-subnet">{t("usb.subnetInput")}</label>
          <div className="subnet-input">
            <span>192.168.</span>
            <input
              id="ovis-subnet"
              type="number"
              min="0"
              max="255"
              inputMode="numeric"
              autoComplete="off"
              value={subnetDraft}
              disabled={busy}
              aria-invalid={error !== null}
              onChange={(event) => {
                setSubnetDraft(event.target.value);
                setError(null);
              }}
            />
            <span>.1</span>
          </div>
          <small>{t("usb.subnetHint")}</small>

          {phase && (
            <div className="initialization-progress" role="status">
              {phase === "complete" ? (
                <CheckCircle2 size={18} />
              ) : (
                <LoaderCircle className="button-spinner" size={18} />
              )}
              <span>{t(`usb.phases.${phase}`)}</span>
            </div>
          )}
          {error && <div className="initialization-error" role="alert">{error}</div>}

          <div className="device-initialization__actions">
            <button className="button button--ghost" type="button" disabled={busy} onClick={onCancel}>
              <ArrowLeft size={15} />
              {t("usb.cancelSetup")}
            </button>
            <button className="button button--primary" type="submit" disabled={busy || subnetDraft.trim() === ""}>
              {busy ? <LoaderCircle className="button-spinner" size={16} /> : <Network size={16} />}
              {t("usb.initialize")}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
