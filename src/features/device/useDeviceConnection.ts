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
import {
  closeOvisUsbDevice,
  getAuthorizedOvisUsbDevices,
  isWebUsbAvailable,
  onWebUsbDeviceChange,
  requestOvisUsbDevice,
} from "./webusb.api";
import type {
  DeviceConnectionErrorCode,
  DiscoveryReport,
  DeviceState,
  DiscoveredOvisDevice,
  InitializedDevice,
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

const toUninitializedDevice = (
  usbSession: Awaited<ReturnType<typeof getAuthorizedOvisUsbDevices>>[number],
): DiscoveredOvisDevice => ({
  initialization: "uninitialized",
  source: "webusb",
  deviceId: usbSession.info.device_id,
  usbSession,
  info: usbSession.info,
});

function mergeDiscoveredDevices(
  initialized: InitializedDevice[],
  uninitialized: DiscoveredOvisDevice[],
): DiscoveredOvisDevice[] {
  const devicesById = new Map<string, DiscoveredOvisDevice>();
  uninitialized.forEach((entry) => devicesById.set(entry.deviceId, entry));
  initialized.forEach((entry) => devicesById.set(entry.deviceId, entry));
  return [...devicesById.values()];
}

export function useDeviceConnection(): UseDeviceConnection {
  const browserSupported = isSupportedBrowser();
  const startupPending = useMemo(() => readPendingConfigApplication(), []);
  const [state, setState] = useState<DeviceState>(
    startupPending ? "recovering" : browserSupported ? "idle" : "error",
  );
  const [devices, setDevices] = useState<DiscoveredOvisDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [device, setDevice] = useState<OvisDeviceInfo | null>(null);
  const [error, setError] = useState<DeviceConnectionErrorCode | null>(
    startupPending || browserSupported ? null : "UNSUPPORTED_BROWSER",
  );
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [applicationLocked, setApplicationLockedState] = useState(
    startupPending !== null,
  );
  const [usbAuthorizing, setUsbAuthorizing] = useState(false);
  const [usbError, setUsbError] = useState<string | null>(null);
  const [discoveryReport, setDiscoveryReport] =
    useState<DiscoveryReport | null>(null);
  const applicationLockedRef = useRef(startupPending !== null);
  const operationGeneration = useRef(0);
  const scanController = useRef<AbortController | null>(null);
  const devicesRef = useRef<DiscoveredOvisDevice[]>([]);
  const connectedTarget = useRef<ConnectedTarget | null>(null);
  const lastSuccessfulAddress = useRef<string | null>(
    readLastSuccessfulAddress(),
  );

  const updateDevices = useCallback((nextDevices: DiscoveredOvisDevice[]) => {
    devicesRef.current = nextDevices;
    setDevices(nextDevices);
  }, []);

  const setApplicationLocked = useCallback((locked: boolean) => {
    applicationLockedRef.current = locked;
    setApplicationLockedState(locked);
  }, []);

  const adoptRecoveredDevice = useCallback(
    (apiBaseUrl: string, info: OvisDeviceInfo) => {
      const recoveredDevice: InitializedDevice = {
        initialization: "initialized",
        source: "network",
        deviceId: info.device_id,
        ipAddress: new URL(apiBaseUrl).hostname,
        apiBaseUrl,
        info,
        status: "online",
      };
      const withoutRecovered = devicesRef.current.filter(
        (entry) => entry.deviceId !== info.device_id,
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
      devices.find((entry) => entry.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const initializedDevices = useMemo(
    () =>
      devices.filter(
        (entry): entry is InitializedDevice =>
          entry.initialization === "initialized",
      ),
    [devices],
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
    setUsbError(null);
    setDiscoveryReport(null);
    let usbDiscovery: ReturnType<typeof getAuthorizedOvisUsbDevices> | null = null;

    try {
      const networkDiscovery = discoverDevices(
        controller.signal,
        lastSuccessfulAddress.current,
      );
      usbDiscovery = getAuthorizedOvisUsbDevices().catch(() => []);
      const [networkReport, usbSessions] = await Promise.all([
        networkDiscovery,
        usbDiscovery,
      ]);
      if (operationGeneration.current !== generation) return;

      scanController.current = null;
      const initialized = networkReport.devices.filter(
        (entry): entry is InitializedDevice =>
          entry.initialization === "initialized",
      );
      const initializedIds = new Set(initialized.map((entry) => entry.deviceId));
      usbSessions.forEach((session) => {
        if (initializedIds.has(session.info.device_id)) {
          void closeOvisUsbDevice(session).catch(() => undefined);
        }
      });
      const combinedDevices = mergeDiscoveredDevices(
        initialized,
        usbSessions.map(toUninitializedDevice),
      );
      const report: DiscoveryReport = {
        ...networkReport,
        devices: combinedDevices,
      };
      setDiscoveryReport(report);
      updateDevices(combinedDevices);
      const reportError =
        combinedDevices.length > 0 ? null : reportErrorCode(report);
      if (reportError) {
        setError(reportError);
        setState("error");
      } else {
        setState("results");
      }
    } catch {
      if (usbDiscovery) {
        void usbDiscovery.then((sessions) =>
          Promise.allSettled(sessions.map(closeOvisUsbDevice)),
        );
      }
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

  const authorizeUsbDevice = useCallback(async () => {
    if (applicationLockedRef.current || usbAuthorizing) return;
    setUsbAuthorizing(true);
    setUsbError(null);
    try {
      const session = await requestOvisUsbDevice();
      const usbDevice = toUninitializedDevice(session);
      const initialized = devicesRef.current.filter(
        (entry): entry is InitializedDevice =>
          entry.initialization === "initialized",
      );
      if (initialized.some((entry) => entry.deviceId === usbDevice.deviceId)) {
        await closeOvisUsbDevice(session).catch(() => undefined);
      }
      const uninitialized = [
        usbDevice,
        ...devicesRef.current.filter(
          (entry) =>
            entry.initialization === "uninitialized" &&
            entry.deviceId !== usbDevice.deviceId,
        ),
      ];
      const combined = mergeDiscoveredDevices(initialized, uninitialized);
      updateDevices(combined);
      setSelectedDeviceId(usbDevice.deviceId);
      setError(null);
      setState("results");
    } catch (nextError) {
      if (!(nextError instanceof DOMException && nextError.name === "NotFoundError")) {
        setUsbError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    } finally {
      setUsbAuthorizing(false);
    }
  }, [updateDevices, usbAuthorizing]);

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
      (entry) => entry.deviceId === selectedDeviceId,
    );
    if (!target) return;

    if (target.initialization === "uninitialized") {
      scanController.current?.abort();
      operationGeneration.current += 1;
      setDevice(null);
      setConnectedAt(null);
      setError(null);
      setState("initializing");
      return;
    }

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
        entry.initialization === "initialized" &&
        entry.deviceId === target.deviceId
          ? { ...entry, info, status: "online" as const }
          : entry,
      );
      updateDevices(updatedDevices);
      connectedTarget.current = {
        apiBaseUrl: target.apiBaseUrl,
        deviceId: target.deviceId,
      };
      lastSuccessfulAddress.current = target.apiBaseUrl;
      writeLastSuccessfulAddress(target.apiBaseUrl);
      setDevice(info);
      setConnectedAt(new Date());
      setState("connected");
    } catch (requestError) {
      if (operationGeneration.current !== generation) return;
      setState("error");
      const code =
        requestError instanceof DeviceConnectionError
          ? requestError.code
          : "NETWORK_ERROR";
      setError(
        code === "PERMISSION_DENIED"
          ? "LOCAL_NETWORK_PERMISSION_DENIED"
          : code,
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
        const manualDevice: InitializedDevice = {
          initialization: "initialized",
          source: "network",
          deviceId: info.device_id,
          ipAddress: new URL(apiBaseUrl).hostname,
          apiBaseUrl,
          info,
          status: "online",
        };
        updateDevices([
          manualDevice,
          ...devicesRef.current.filter(
            (entry) => entry.deviceId !== info.device_id,
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

  const cancelInitialization = useCallback(() => {
    operationGeneration.current += 1;
    setState(devicesRef.current.length > 0 ? "results" : "idle");
    setError(null);
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
              entry.initialization === "initialized" &&
              entry.deviceId === target.deviceId
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

  useEffect(() => {
    if (!isWebUsbAvailable()) return;
    return onWebUsbDeviceChange(() => {
      void getAuthorizedOvisUsbDevices()
        .then((sessions) => {
          const initialized = devicesRef.current.filter(
            (entry): entry is InitializedDevice =>
              entry.initialization === "initialized",
          );
          const combined = mergeDiscoveredDevices(
            initialized,
            sessions.map(toUninitializedDevice),
          );
          updateDevices(combined);
          if (
            selectedDeviceId &&
            !combined.some((entry) => entry.deviceId === selectedDeviceId)
          ) {
            setSelectedDeviceId(null);
            if (state === "initializing") setState("results");
          }
        })
        .catch(() => undefined);
    });
  }, [selectedDeviceId, state, updateDevices]);

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
    initializedDevices,
    device,
    error,
    connectedAt,
    applicationLocked,
    usbAvailable: isWebUsbAvailable(),
    usbAuthorizing,
    usbError,
    discoveryReport,
    scan,
    cancelScan,
    authorizeUsbDevice,
    selectDevice,
    connect,
    connectManualAddress,
    disconnect,
    rescan,
    retry,
    cancelInitialization,
    setApplicationLocked,
    adoptRecoveredDevice,
  };
}
