import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, LoaderCircle, Network, Pencil, Usb } from "lucide-react";
import {
  configureOvisUsbSubnets,
  getAuthorizedOvisUsbDevices,
  isWebUsbAvailable,
  onWebUsbDeviceChange,
  requestOvisUsbDevice,
} from "./webusb.api";
import type { OvisUsbSubnetAssignment, OvisUsbDevice } from "./webusb.api";

interface UsbProvisioningProps {
  onProvisioned: () => void;
}

type UsbProvisioningPhase = "idle" | "loading" | "configuring" | "success" | "error";

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function UsbProvisioning({ onProvisioned }: UsbProvisioningProps) {
  const { t } = useTranslation();
  const supported = isWebUsbAvailable();
  const [devices, setDevices] = useState<OvisUsbDevice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<UsbProvisioningPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "loading" || phase === "configuring";

  const updateDevices = useCallback((nextDevices: OvisUsbDevice[]) => {
    setDevices(nextDevices);
    setDrafts((current) => {
      const next = { ...current };
      nextDevices.forEach((device) => {
        if (!(device.info.device_id in next)) {
          next[device.info.device_id] = device.info.subnet >= 0
            ? String(device.info.subnet)
            : "";
        }
      });
      return next;
    });
    setEditing((current) => {
      const next = new Set(current);
      nextDevices.forEach((device) => {
        if (device.info.subnet < 0) next.add(device.info.device_id);
      });
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!supported) return;
    setPhase("loading");
    try {
      updateDevices(await getAuthorizedOvisUsbDevices());
      setError(null);
      setPhase("idle");
    } catch (nextError) {
      setError(formatError(nextError));
      setPhase("error");
    }
  }, [supported, updateDevices]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supported || busy || phase === "success") return;
    return onWebUsbDeviceChange(() => void refresh());
  }, [busy, phase, refresh, supported]);

  const pendingDeviceIds = useMemo(
    () => devices
      .filter((device) => editing.has(device.info.device_id))
      .map((device) => device.info.device_id),
    [devices, editing],
  );

  const addDevice = async () => {
    setPhase("loading");
    setError(null);
    try {
      await requestOvisUsbDevice();
      updateDevices(await getAuthorizedOvisUsbDevices());
      setPhase("idle");
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === "NotFoundError") {
        setPhase("idle");
        return;
      }
      setError(formatError(nextError));
      setPhase("error");
    }
  };

  const configure = async () => {
    const assignments: OvisUsbSubnetAssignment[] = pendingDeviceIds.map((deviceId) => {
      const value = drafts[deviceId]?.trim() ?? "";
      return {
        deviceId,
        subnet: /^\d{1,3}$/.test(value) ? Number(value) : Number.NaN,
      };
    });
    if (assignments.some(({ subnet }) => !Number.isInteger(subnet) || subnet < 0 || subnet > 255)) {
      setError(t("usb.invalidSubnet"));
      setPhase("error");
      return;
    }

    setPhase("configuring");
    setError(null);
    try {
      await configureOvisUsbSubnets(devices, assignments);
      setDevices((current) => current.map((device) => {
        const assignment = assignments.find(
          ({ deviceId }) => deviceId === device.info.device_id,
        );
        return assignment
          ? { ...device, info: { ...device.info, subnet: assignment.subnet } }
          : device;
      }));
      setEditing(new Set());
      setPhase("success");
      window.setTimeout(() => {
        setPhase("idle");
        onProvisioned();
      }, 2500);
    } catch (nextError) {
      setError(formatError(nextError));
      setPhase("error");
    }
  };

  const editDevice = (device: OvisUsbDevice) => {
    setDrafts((current) => ({
      ...current,
      [device.info.device_id]: device.info.subnet >= 0 ? String(device.info.subnet) : "",
    }));
    setEditing((current) => new Set(current).add(device.info.device_id));
    setPhase("idle");
    setError(null);
  };

  if (!supported) {
    return (
      <div className="usb-provisioning usb-provisioning--unavailable">
        <Usb size={16} />
        <span>{t("usb.unsupported")}</span>
      </div>
    );
  }

  return (
    <section className="usb-provisioning" aria-label={t("usb.title")}>
      <header className="usb-provisioning__heading">
        <span><Usb size={16} /></span>
        <div>
          <strong>{t("usb.title")}</strong>
          <small>{t("usb.deviceCount", { count: devices.length })}</small>
        </div>
      </header>

      {devices.length > 0 && (
        <div className="usb-provisioning__devices">
          {devices.map((device) => {
            const isEditing = editing.has(device.info.device_id);
            return (
              <div className="usb-provisioning__device" key={device.info.device_id}>
                <code title={device.info.device_id}>{device.info.device_id}</code>
                {isEditing ? (
                  <label className="usb-provisioning__address">
                    <span>192.168.</span>
                    <input
                      aria-label={t("usb.subnetLabel", { device: device.info.device_id })}
                      inputMode="numeric"
                      max="255"
                      min="0"
                      placeholder="42"
                      type="number"
                      value={drafts[device.info.device_id] ?? ""}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [device.info.device_id]: event.target.value,
                      }))}
                    />
                    <span>.1</span>
                  </label>
                ) : (
                  <div className="usb-provisioning__configured">
                    <small>{`192.168.${device.info.subnet}.1`}</small>
                    <button
                      aria-label={t("usb.reconfigure")}
                      className="icon-button"
                      title={t("usb.reconfigure")}
                      type="button"
                      onClick={() => editDevice(device)}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="usb-provisioning__actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={busy || phase === "success"}
          onClick={() => void addDevice()}
        >
          <Usb size={15} />
          {t("usb.addDevice")}
        </button>
        {pendingDeviceIds.length > 0 && (
          <button
            className="button button--primary"
            type="button"
            disabled={busy || phase === "success"}
            onClick={() => void configure()}
          >
            {phase === "configuring" ? (
              <LoaderCircle className="button-spinner" size={15} />
            ) : phase === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <Network size={15} />
            )}
            {phase === "configuring"
              ? t("usb.configuring")
              : phase === "success"
                ? t("usb.configured")
                : t("usb.configure")}
          </button>
        )}
      </div>

      {error && <small className="usb-provisioning__error" role="alert">{error}</small>}
    </section>
  );
}
