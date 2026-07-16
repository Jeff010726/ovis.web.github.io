import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearPendingConfigApplication,
  readPendingConfigApplication,
} from "../config/config.session";
import { reconnectConfigDevice } from "../config/config.recovery";
import {
  buildDeviceApiBaseUrl,
  DeviceConnectionError,
  discoverDevices,
  fetchDeviceInfo,
  isSupportedBrowser,
} from "./device.api";
import type {
  DeviceConnectionErrorCode,
  DiscoveryReport,
  DeviceState,
  DiscoveredDevice,
  OvisDeviceInfo,
  UseDeviceConnection,
} from "./device.types";

const HEARTBEAT_INTERVAL_MS = 3_000;
const MAX_CONSECUTIVE_FAILURES = 2;
const LAST_DEVICE_ADDRESS_KEY = "ovis_last_device_api_base_url";

interface ConnectedTarget {
  apiBaseUrl: string;
  deviceId: string;
}

const readLastSuccessfulAddress = () => {
  try {
    return window.sessionStorage.getItem(LAST_DEVICE_ADDRESS_KEY);
  } catch {
    return null;
  }
};

const writeLastSuccessfulAddress = (apiBaseUrl: string) => {
  try {
    window.sessionStorage.setItem(LAST_DEVICE_ADDRESS_KEY, apiBaseUrl);
  } catch {
    // Discovery still works when session storage is unavailable.
  }
};

const reportErrorCode = (
  report: DiscoveryReport,
): DeviceConnectionErrorCode | null => {
  if (report.failureReason === "permission-denied") {
    return "LOCAL_NETWORK_PERMISSION_DENIED";
  }
  if (report.failureReason === "browser-blocked") {
    return "LOCAL_NETWORK_BLOCKED";
  }
  if (report.failureReason === "network-error") {
    return "SCAN_NETWORK_ERROR";
  }
  return report.devices.length === 0 ? "NO_DEVICE_FOUND" : null;
};

export function useDeviceConnection(): UseDeviceConnection {
  const browserSupported = isSupportedBrowser();
  const startupPending = useMemo(() => readPendingConfigApplication(), []);
  const [state, setState] = useState<DeviceState>(
    startupPending ? "recovering" : browserSupported ? "idle" : "error",
  );
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [device, setDevice] = useState<OvisDeviceInfo | null>(null);
  const [error, setError] = useState<DeviceConnectionErrorCode | null>(
    startupPending || browserSupported ? null : "UNSUPPORTED_BROWSER",
  );
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [applicationLocked, setApplicationLockedState] = useState(
    startupPending !== null,
  );
  const [discoveryReport, setDiscoveryReport] =
    useState<DiscoveryReport | null>(null);
  const applicationLockedRef = useRef(startupPending !== null);
  const operationGeneration = useRef(0);
  const scanController = useRef<AbortController | null>(null);
  const devicesRef = useRef<DiscoveredDevice[]>([]);
  const connectedTarget = useRef<ConnectedTarget | null>(null);
  const lastSuccessfulAddress = useRef<string | null>(
    readLastSuccessfulAddress(),
  );

  const updateDevices = useCallback((nextDevices: DiscoveredDevice[]) => {
    devicesRef.current = nextDevices;
    setDevices(nextDevices);
  }, []);

  const setApplicationLocked = useCallback((locked: boolean) => {
    applicationLockedRef.current = locked;
    setApplicationLockedState(locked);
  }, []);

  const adoptRecoveredDevice = useCallback(
    (apiBaseUrl: string, info: OvisDeviceInfo) => {
      const recoveredDevice: DiscoveredDevice = {
        apiBaseUrl,
        info,
        status: "online",
      };
      const withoutRecovered = devicesRef.current.filter(
        (entry) => entry.info.device_id !== info.device_id,
      );
      updateDevices([recoveredDevice, ...withoutRecovered]);
      setSelectedDeviceId(info.device_id);
      setDevice(info);
      setError(null);
      setConnectedAt(new Date());
      connectedTarget.current = { apiBaseUrl, deviceId: info.device_id };
      lastSuccessfulAddress.current = apiBaseUrl;
      writeLastSuccessfulAddress(apiBaseUrl);
      setState("connected");
    },
    [updateDevices],
  );

  const selectedDevice = useMemo(
    () =>
      devices.find((entry) => entry.info.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  useEffect(() => {
    if (!startupPending) return;
    const controller = new AbortController();
    operationGeneration.current += 1;
    setState("recovering");
    setApplicationLocked(true);

    void reconnectConfigDevice(startupPending, controller.signal)
      .then((recovered) => {
        if (controller.signal.aborted) return;
        adoptRecoveredDevice(recovered.apiBaseUrl, recovered.info);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        clearPendingConfigApplication();
        setApplicationLocked(false);
        setError("NETWORK_ERROR");
        setState("error");
      });

    return () => controller.abort();
  }, [adoptRecoveredDevice, setApplicationLocked, startupPending]);

  const scan = useCallback(async () => {
    if (applicationLockedRef.current) return;
    scanController.current?.abort();
    const generation = operationGeneration.current + 1;
    operationGeneration.current = generation;
    connectedTarget.current = null;

    if (!isSupportedBrowser()) {
      setState("error");
      setDevice(null);
      setConnectedAt(null);
      setError("UNSUPPORTED_BROWSER");
      return;
    }

    const controller = new AbortController();
    scanController.current = controller;
    setState("scanning");
    setSelectedDeviceId(null);
    setDevice(null);
    setConnectedAt(null);
    setError(null);
    setDiscoveryReport(null);

    try {
      const report = await discoverDevices(
        controller.signal,
        lastSuccessfulAddress.current,
      );
      if (operationGeneration.current !== generation) return;

      scanController.current = null;
      setDiscoveryReport(report);
      updateDevices(report.devices);
      const reportError = reportErrorCode(report);
      if (reportError) {
        setError(reportError);
        setState("error");
      } else {
        setState("results");
      }
    } catch {
      if (
        operationGeneration.current !== generation ||
        controller.signal.aborted
      ) {
        return;
      }
      scanController.current = null;
      setError("SCAN_NETWORK_ERROR");
      setState("error");
    }
  }, [updateDevices]);

  const cancelScan = useCallback(() => {
    if (applicationLockedRef.current) return;
    scanController.current?.abort();
    scanController.current = null;
    operationGeneration.current += 1;
    setState(devicesRef.current.length > 0 ? "results" : "idle");
    setError(null);
  }, []);

  const selectDevice = useCallback((deviceId: string) => {
    if (applicationLockedRef.current) return;
    setSelectedDeviceId(deviceId);
    setError(null);
  }, []);

  const connect = useCallback(async () => {
    if (applicationLockedRef.current) return;
    const target = devicesRef.current.find(
      (entry) => entry.info.device_id === selectedDeviceId,
    );
    if (!target) return;

    scanController.current?.abort();
    const generation = operationGeneration.current + 1;
    operationGeneration.current = generation;
    setState("connecting");
    setDevice(null);
    setConnectedAt(null);
    setError(null);

    try {
      const info = await fetchDeviceInfo(target.apiBaseUrl);
      if (operationGeneration.current !== generation) return;
      if (info.device_id !== target.info.device_id) {
        throw new DeviceConnectionError("DEVICE_CHANGED");
      }

      const updatedDevices = devicesRef.current.map((entry) =>
        entry.info.device_id === target.info.device_id
          ? { ...entry, info, status: "online" as const }
          : entry,
      );
      updateDevices(updatedDevices);
      connectedTarget.current = {
        apiBaseUrl: target.apiBaseUrl,
        deviceId: target.info.device_id,
      };
      lastSuccessfulAddress.current = target.apiBaseUrl;
      writeLastSuccessfulAddress(target.apiBaseUrl);
      setDevice(info);
      setConnectedAt(new Date());
      setState("connected");
    } catch (requestError) {
      if (operationGeneration.current !== generation) return;
      setState("error");
      setError(
        requestError instanceof DeviceConnectionError
          ? requestError.code
          : "NETWORK_ERROR",
      );
    }
  }, [selectedDeviceId, updateDevices]);

  const connectManualAddress = useCallback(
    async (ipAddress: string) => {
      if (applicationLockedRef.current) return;
      const apiBaseUrl = buildDeviceApiBaseUrl(ipAddress);
      if (!apiBaseUrl) {
        setError("INVALID_RESPONSE");
        setState("error");
        return;
      }

      scanController.current?.abort();
      const generation = operationGeneration.current + 1;
      operationGeneration.current = generation;
      setSelectedDeviceId(null);
      setDevice(null);
      setConnectedAt(null);
      setError(null);
      setState("connecting");

      try {
        const info = await fetchDeviceInfo(apiBaseUrl);
        if (operationGeneration.current !== generation) return;
        const manualDevice: DiscoveredDevice = {
          apiBaseUrl,
          info,
          status: "online",
        };
        updateDevices([
          manualDevice,
          ...devicesRef.current.filter(
            (entry) => entry.info.device_id !== info.device_id,
          ),
        ]);
        setSelectedDeviceId(info.device_id);
        connectedTarget.current = { apiBaseUrl, deviceId: info.device_id };
        lastSuccessfulAddress.current = apiBaseUrl;
        writeLastSuccessfulAddress(apiBaseUrl);
        setDevice(info);
        setConnectedAt(new Date());
        setState("connected");
      } catch (requestError) {
        if (operationGeneration.current !== generation) return;
        const code =
          requestError instanceof DeviceConnectionError
            ? requestError.code
            : "NETWORK_ERROR";
        setError(
          code === "PERMISSION_DENIED"
            ? "LOCAL_NETWORK_PERMISSION_DENIED"
            : code,
        );
        setState("error");
      }
    },
    [updateDevices],
  );

  const disconnect = useCallback(() => {
    if (applicationLockedRef.current) return;
    operationGeneration.current += 1;
    connectedTarget.current = null;
    setState(devicesRef.current.length > 0 ? "results" : "idle");
    setDevice(null);
    setError(null);
    setConnectedAt(null);
  }, []);

  const rescan = useCallback(async () => {
    if (applicationLockedRef.current) return;
    await scan();
  }, [scan]);

  const retry = useCallback(async () => {
    if (applicationLockedRef.current) return;
    if (selectedDeviceId) {
      await connect();
      return;
    }
    await scan();
  }, [connect, scan, selectedDeviceId]);

  useEffect(() => {
    if (
      state !== "connected" ||
      !connectedTarget.current ||
      applicationLocked
    ) {
      return;
    }

    const generation = operationGeneration.current;
    const target = connectedTarget.current;
    let failures = 0;
    let heartbeatRunning = false;

    const heartbeat = window.setInterval(async () => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;

      try {
        const info = await fetchDeviceInfo(target.apiBaseUrl);
        if (operationGeneration.current !== generation) return;
        if (info.device_id !== target.deviceId) {
          throw new DeviceConnectionError("DEVICE_CHANGED");
        }
        failures = 0;
        setDevice(info);
      } catch {
        if (operationGeneration.current !== generation) return;
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          window.clearInterval(heartbeat);
          connectedTarget.current = null;
          updateDevices(
            devicesRef.current.map((entry) =>
              entry.info.device_id === target.deviceId
                ? { ...entry, status: "offline" as const }
                : entry,
            ),
          );
          setDevice(null);
          setConnectedAt(null);
          setState("error");
          setError("DEVICE_DISCONNECTED");
        }
      } finally {
        heartbeatRunning = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(heartbeat);
  }, [applicationLocked, state, updateDevices]);

  useEffect(
    () => () => {
      scanController.current?.abort();
      operationGeneration.current += 1;
    },
    [],
  );

  return {
    state,
    devices,
    selectedDevice,
    device,
    error,
    connectedAt,
    applicationLocked,
    discoveryReport,
    scan,
    cancelScan,
    selectDevice,
    connect,
    connectManualAddress,
    disconnect,
    rescan,
    retry,
    setApplicationLocked,
    adoptRecoveredDevice,
  };
}
