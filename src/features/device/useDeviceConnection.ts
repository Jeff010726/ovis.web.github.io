import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DeviceConnectionError,
  discoverDevices,
  fetchDeviceInfo,
  isSupportedBrowser,
} from "./device.api";
import type {
  DeviceConnectionErrorCode,
  DeviceState,
  DiscoveredDevice,
  OvisDeviceInfo,
  UseDeviceConnection,
} from "./device.types";

const HEARTBEAT_INTERVAL_MS = 3_000;
const MAX_CONSECUTIVE_FAILURES = 2;

interface ConnectedTarget {
  apiBaseUrl: string;
  deviceId: string;
}

export function useDeviceConnection(): UseDeviceConnection {
  const browserSupported = isSupportedBrowser();
  const [state, setState] = useState<DeviceState>(
    browserSupported ? "idle" : "error",
  );
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [device, setDevice] = useState<OvisDeviceInfo | null>(null);
  const [error, setError] = useState<DeviceConnectionErrorCode | null>(
    browserSupported ? null : "UNSUPPORTED_BROWSER",
  );
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const operationGeneration = useRef(0);
  const scanController = useRef<AbortController | null>(null);
  const devicesRef = useRef<DiscoveredDevice[]>([]);
  const connectedTarget = useRef<ConnectedTarget | null>(null);

  const updateDevices = useCallback((nextDevices: DiscoveredDevice[]) => {
    devicesRef.current = nextDevices;
    setDevices(nextDevices);
  }, []);

  const selectedDevice = useMemo(
    () =>
      devices.find((entry) => entry.info.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const scan = useCallback(async () => {
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

    const foundDevices = await discoverDevices(controller.signal);
    if (operationGeneration.current !== generation) return;

    scanController.current = null;
    updateDevices(foundDevices);
    setState("results");
  }, [updateDevices]);

  const cancelScan = useCallback(() => {
    scanController.current?.abort();
    scanController.current = null;
    operationGeneration.current += 1;
    setState(devicesRef.current.length > 0 ? "results" : "idle");
    setError(null);
  }, []);

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setError(null);
  }, []);

  const connect = useCallback(async () => {
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

  const disconnect = useCallback(() => {
    operationGeneration.current += 1;
    connectedTarget.current = null;
    setState(devicesRef.current.length > 0 ? "results" : "idle");
    setDevice(null);
    setError(null);
    setConnectedAt(null);
  }, []);

  const rescan = useCallback(async () => {
    await scan();
  }, [scan]);

  const retry = useCallback(async () => {
    if (selectedDeviceId) {
      await connect();
      return;
    }
    await scan();
  }, [connect, scan, selectedDeviceId]);

  useEffect(() => {
    if (state !== "connected" || !connectedTarget.current) return;

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
  }, [state, updateDevices]);

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
    scan,
    cancelScan,
    selectDevice,
    connect,
    disconnect,
    rescan,
    retry,
  };
}
