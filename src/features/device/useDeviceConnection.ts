import { useCallback, useEffect, useRef, useState } from "react";
import {
  DeviceConnectionError,
  fetchDeviceInfo,
  isSupportedBrowser,
} from "./device.api";
import type {
  DeviceConnectionErrorCode,
  DeviceConnectionState,
  OvisDeviceInfo,
  UseDeviceConnection,
} from "./device.types";

const HEARTBEAT_INTERVAL_MS = 3_000;
const MAX_CONSECUTIVE_FAILURES = 2;

export function useDeviceConnection(): UseDeviceConnection {
  const browserSupported = isSupportedBrowser();
  const [state, setState] = useState<DeviceConnectionState>(
    browserSupported ? "idle" : "error",
  );
  const [device, setDevice] = useState<OvisDeviceInfo | null>(null);
  const [error, setError] = useState<DeviceConnectionErrorCode | null>(
    browserSupported ? null : "UNSUPPORTED_BROWSER",
  );
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const connectionGeneration = useRef(0);

  const disconnect = useCallback(() => {
    connectionGeneration.current += 1;
    setState("idle");
    setDevice(null);
    setError(null);
    setConnectedAt(null);
  }, []);

  const connect = useCallback(async () => {
    const generation = connectionGeneration.current + 1;
    connectionGeneration.current = generation;

    if (!isSupportedBrowser()) {
      setState("error");
      setDevice(null);
      setConnectedAt(null);
      setError("UNSUPPORTED_BROWSER");
      return;
    }

    setState("connecting");
    setDevice(null);
    setConnectedAt(null);
    setError(null);

    try {
      const info = await fetchDeviceInfo();
      if (connectionGeneration.current !== generation) return;
      setDevice(info);
      setConnectedAt(new Date());
      setState("connected");
    } catch (requestError) {
      if (connectionGeneration.current !== generation) return;
      setState("error");
      setError(
        requestError instanceof DeviceConnectionError
          ? requestError.code
          : "NETWORK_ERROR",
      );
    }
  }, []);

  const retry = useCallback(async () => {
    await connect();
  }, [connect]);

  useEffect(() => {
    if (state !== "connected") return;

    const generation = connectionGeneration.current;
    let failures = 0;
    let heartbeatRunning = false;

    const heartbeat = window.setInterval(async () => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;

      try {
        const info = await fetchDeviceInfo();
        if (connectionGeneration.current !== generation) return;
        failures = 0;
        setDevice(info);
      } catch {
        if (connectionGeneration.current !== generation) return;
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          window.clearInterval(heartbeat);
          setState("disconnected");
          setError("NETWORK_ERROR");
        }
      } finally {
        heartbeatRunning = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(heartbeat);
  }, [state]);

  return { state, device, error, connectedAt, connect, disconnect, retry };
}
