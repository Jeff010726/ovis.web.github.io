import i18n from "../../i18n";
import type { OvisDeviceInfo } from "./device.types";

const OVIS_VENDOR_ID = 0x3346;
const OVIS_PRODUCT_ID = 0x100e;
const OVIS_INTERFACE_CLASS = 0xff;
const OVIS_INTERFACE_SUBCLASS = 0x4f;
const OVIS_INTERFACE_PROTOCOL = 0x01;
const OVIS_SUBNET_STORAGE_KEY = "ovis-ncm-subnets";

const REQUEST_GET_INFO = 0x01;
const REQUEST_QUIESCE_NCM = 0x02;
const REQUEST_SET_SUBNET = 0x03;
const REQUEST_COMMIT = 0x04;
const REQUEST_ABORT = 0x05;

interface WebUsbAlternate {
  interfaceClass: number;
  interfaceSubclass: number;
  interfaceProtocol: number;
}

interface WebUsbInterface {
  interfaceNumber: number;
  alternates: WebUsbAlternate[];
}

interface WebUsbConfiguration {
  configurationValue: number;
  interfaces: WebUsbInterface[];
}

interface WebUsbInResult {
  data?: DataView;
}

interface WebUsbOutResult {
  status: "ok" | "stall" | "babble";
}

interface WebUsbDevice {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  opened: boolean;
  configuration: WebUsbConfiguration | null;
  configurations: WebUsbConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  controlTransferIn(
    setup: {
      requestType: "vendor";
      recipient: "interface";
      request: number;
      value: number;
      index: number;
    },
    length: number,
  ): Promise<WebUsbInResult>;
  controlTransferOut(
    setup: {
      requestType: "vendor";
      recipient: "interface";
      request: number;
      value: number;
      index: number;
    },
    data: Uint8Array,
  ): Promise<WebUsbOutResult>;
}

interface WebUsbManager {
  getDevices(): Promise<WebUsbDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: EventListener): void;
  removeEventListener(type: "connect" | "disconnect", listener: EventListener): void;
}

interface WebUsbConnectionEvent extends Event {
  device?: WebUsbDevice;
}

interface WebLockManager {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
}

type NavigatorWithUsb = Navigator & {
  usb?: WebUsbManager;
  locks?: WebLockManager;
};

export interface OvisUsbDeviceInfo {
  protocol: number;
  device_id: string;
  subnet: number;
  pending_subnet: number;
  ncm_active: boolean;
}

export interface OvisUsbDevice {
  device: WebUsbDevice;
  interfaceNumber: number;
  info: OvisUsbDeviceInfo;
}

export interface OvisUsbSubnetAssignment {
  deviceId: string;
  subnet: number;
}

export interface OvisUsbDiscoveryReport {
  devices: OvisUsbDevice[];
  errors: string[];
}

const usbManager = () => (navigator as NavigatorWithUsb).usb;

export function rememberOvisSubnet(deviceId: string, subnet: number) {
  if (!Number.isInteger(subnet) || subnet < 0 || subnet > 255) return;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(OVIS_SUBNET_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    stored[deviceId] = subnet;
    window.localStorage.setItem(OVIS_SUBNET_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Discovery still works through manual entry when storage is unavailable.
  }
}

export function forgetOvisSubnet(deviceId: string) {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(OVIS_SUBNET_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    delete stored[deviceId];
    if (Object.keys(stored).length === 0) {
      window.localStorage.removeItem(OVIS_SUBNET_STORAGE_KEY);
    } else {
      window.localStorage.setItem(OVIS_SUBNET_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {
    // A stale discovery hint is harmless when storage is unavailable or invalid.
  }
}

export function getRememberedOvisDeviceHosts(): string[] {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(OVIS_SUBNET_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    return Object.values(stored)
      .filter(
        (subnet): subnet is number =>
          Number.isInteger(subnet) && (subnet as number) >= 0 && (subnet as number) <= 255,
      )
      .map((subnet) => `192.168.${subnet}.1`)
      .filter((host, index, hosts) => hosts.indexOf(host) === index);
  } catch {
    return [];
  }
}

export const isWebUsbAvailable = () =>
  window.isSecureContext && usbManager() !== undefined;

export const onWebUsbDeviceChange = (listener: EventListener) => {
  const usb = usbManager();
  usb?.addEventListener("connect", listener);
  usb?.addEventListener("disconnect", listener);
  return () => {
    usb?.removeEventListener("connect", listener);
    usb?.removeEventListener("disconnect", listener);
  };
};

const findOvisInterface = (configuration: WebUsbConfiguration | null) =>
  configuration?.interfaces.find((usbInterface) =>
    usbInterface.alternates.some(
      (alternate) =>
        alternate.interfaceClass === OVIS_INTERFACE_CLASS &&
        alternate.interfaceSubclass === OVIS_INTERFACE_SUBCLASS &&
        alternate.interfaceProtocol === OVIS_INTERFACE_PROTOCOL,
    ),
  );

const transferSetup = (session: OvisUsbDevice, request: number) => ({
  requestType: "vendor" as const,
  recipient: "interface" as const,
  request,
  value: 0,
  index: session.interfaceNumber,
});

async function readInfo(session: OvisUsbDevice): Promise<OvisUsbDeviceInfo> {
  const result = await session.device.controlTransferIn(
    transferSetup(session, REQUEST_GET_INFO),
    128,
  );
  if (!result.data) throw new Error(i18n.t("usb.invalidResponse"));
  const bytes = new Uint8Array(
    result.data.buffer,
    result.data.byteOffset,
    result.data.byteLength,
  );
  const text = new TextDecoder().decode(bytes).replace(/\0+$/, "");
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error(i18n.t("usb.invalidResponse"));
  }
  const info = value as Record<string, unknown>;
  if (
    info.protocol !== 2 ||
    typeof info.device_id !== "string" ||
    !info.device_id.startsWith("OVIS-1842-") ||
    typeof info.subnet !== "number" ||
    typeof info.pending_subnet !== "number" ||
    typeof info.ncm_active !== "boolean"
  ) {
    throw new Error(i18n.t("usb.invalidResponse"));
  }
  const deviceInfo = info as unknown as OvisUsbDeviceInfo;
  return deviceInfo;
}

async function openOvisDevice(device: WebUsbDevice): Promise<OvisUsbDevice> {
  if (device.opened) await device.close();
  await device.open();
  if (!device.configuration) {
    const configuration = device.configurations[0];
    if (!configuration) throw new Error(i18n.t("usb.interfaceUnavailable"));
    await device.selectConfiguration(configuration.configurationValue);
  }
  const usbInterface = findOvisInterface(device.configuration);
  if (!usbInterface) throw new Error(i18n.t("usb.interfaceUnavailable"));
  await device.claimInterface(usbInterface.interfaceNumber);
  const session: OvisUsbDevice = {
    device,
    interfaceNumber: usbInterface.interfaceNumber,
    info: {
      protocol: 2,
      device_id: "",
      subnet: -1,
      pending_subnet: -1,
      ncm_active: false,
    },
  };
  session.info = await readInfo(session);
  return session;
}

export async function discoverAuthorizedOvisUsbDevices(): Promise<OvisUsbDiscoveryReport> {
  const usb = usbManager();
  if (!usb) return { devices: [], errors: [] };
  const devices = (await usb.getDevices()).filter(
    (device) =>
      device.vendorId === OVIS_VENDOR_ID && device.productId === OVIS_PRODUCT_ID,
  );
  const results = await Promise.allSettled(
    devices.map(async (device) => {
      try {
        return await openOvisDevice(device);
      } catch (error) {
        if (device.opened) await device.close().catch(() => undefined);
        throw error;
      }
    }),
  );
  const sessions: OvisUsbDevice[] = [];
  const errors: string[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      continue;
    }
    const session = result.value;
    if (
      session.info.subnet === -1 &&
      session.info.pending_subnet === -1 &&
      session.info.ncm_active === false
    ) {
      sessions.push(session);
    } else {
      await session.device.close().catch(() => undefined);
    }
  }
  return { devices: sessions, errors };
}

export async function getAuthorizedOvisUsbDevices(): Promise<OvisUsbDevice[]> {
  return (await discoverAuthorizedOvisUsbDevices()).devices;
}

export async function refreshOvisUsbDeviceInfo(
  session: OvisUsbDevice,
): Promise<OvisUsbDeviceInfo> {
  session.info = await readInfo(session);
  return session.info;
}

export async function closeOvisUsbDevice(session: OvisUsbDevice) {
  if (session.device.opened) await session.device.close();
}

export function onOvisUsbDeviceDisconnected(
  session: OvisUsbDevice,
  listener: () => void,
) {
  const usb = usbManager();
  if (!usb) return () => undefined;
  const handler: EventListener = (event) => {
    const disconnected = (event as WebUsbConnectionEvent).device;
    if (!disconnected || disconnected === session.device) listener();
  };
  usb.addEventListener("disconnect", handler);
  return () => usb.removeEventListener("disconnect", handler);
}

function validateAssignments(
  devices: OvisUsbDevice[],
  assignments: OvisUsbSubnetAssignment[],
) {
  if (new Set(devices.map((device) => device.info.device_id)).size !== devices.length) {
    throw new Error(i18n.t("usb.duplicateIdentity"));
  }
  const assignmentsById = new Map(
    assignments.map((assignment) => [assignment.deviceId, assignment.subnet]),
  );
  if (assignmentsById.size !== assignments.length) {
    throw new Error(i18n.t("usb.duplicateIdentity"));
  }
  assignments.forEach(({ deviceId, subnet }) => {
    if (!devices.some((device) => device.info.device_id === deviceId)) {
      throw new Error(i18n.t("usb.invalidResponse"));
    }
    if (!Number.isInteger(subnet) || subnet < 0 || subnet > 255) {
      throw new Error(i18n.t("usb.invalidSubnet"));
    }
  });
  const configuredSubnets = devices
    .map((device) => assignmentsById.get(device.info.device_id) ?? device.info.subnet)
    .filter((subnet) => subnet >= 0);
  if (new Set(configuredSubnets).size !== configuredSubnets.length) {
    throw new Error(i18n.t("usb.duplicateSubnet"));
  }
}

const sendCommand = async (session: OvisUsbDevice, request: number, value = 0) => {
  const result = await session.device.controlTransferOut(
    transferSetup(session, request),
    new Uint8Array([value]),
  );
  if (result.status !== "ok") {
    throw new Error(i18n.t("usb.verificationFailed"));
  }
};

async function configureOvisUsbSubnetsUnlocked(
  devices: OvisUsbDevice[],
  assignments: OvisUsbSubnetAssignment[],
): Promise<OvisUsbSubnetAssignment[]> {
  if (assignments.length === 0) throw new Error(i18n.t("usb.noDevices"));
  validateAssignments(devices, assignments);
  const sessionsById = new Map(
    devices.map((device) => [device.info.device_id, device]),
  );
  const targetSessions = assignments.map(({ deviceId }) => sessionsById.get(deviceId)!);

  try {
    await Promise.all(
      targetSessions.map((device) => sendCommand(device, REQUEST_QUIESCE_NCM)),
    );
    await Promise.all(
      assignments.map(({ deviceId, subnet }) =>
        sendCommand(sessionsById.get(deviceId)!, REQUEST_SET_SUBNET, subnet),
      ),
    );
    const verified = await Promise.all(targetSessions.map(readInfo));
    assignments.forEach(({ deviceId, subnet }) => {
      const info = verified.find((entry) => entry.device_id === deviceId);
      if (!info || info.pending_subnet !== subnet) {
        throw new Error(i18n.t("usb.verificationFailed"));
      }
    });
  } catch (error) {
    await Promise.allSettled(
      targetSessions.map((device) => sendCommand(device, REQUEST_ABORT)),
    );
    throw error;
  }

  await Promise.all(
    targetSessions.map((device) => sendCommand(device, REQUEST_COMMIT)),
  );
  const committed = await Promise.all(targetSessions.map(readInfo));
  assignments.forEach(({ deviceId, subnet }) => {
    const info = committed.find((entry) => entry.device_id === deviceId);
    if (!info || info.subnet !== subnet || info.pending_subnet !== -1) {
      throw new Error(i18n.t("usb.verificationFailed"));
    }
    rememberOvisSubnet(deviceId, subnet);
  });
  return assignments;
}

export async function configureOvisUsbSubnets(
  devices: OvisUsbDevice[],
  assignments: OvisUsbSubnetAssignment[],
): Promise<OvisUsbSubnetAssignment[]> {
  const locks = (navigator as NavigatorWithUsb).locks;
  if (!locks) return configureOvisUsbSubnetsUnlocked(devices, assignments);
  return locks.request(
    "ovis-ncm-subnet-configuration",
    { mode: "exclusive" },
    () => configureOvisUsbSubnetsUnlocked(devices, assignments),
  );
}

export type OvisUsbInitializationPhase =
  | "checking-address"
  | "reading-device"
  | "writing-subnet"
  | "committing"
  | "committed"
  | "restarting"
  | "waiting"
  | "complete";

export class OvisUsbInitializationError extends Error {
  constructor(
    public readonly code:
      | "SUBNET_OCCUPIED"
      | "DEVICE_DISCONNECTED"
      | "RESTART_TIMEOUT"
      | "VERIFICATION_FAILED",
    public readonly ipAddress?: string,
  ) {
    const message = (() => {
      if (code === "SUBNET_OCCUPIED" && ipAddress) {
        return i18n.t("usb.subnetOccupied", { ipAddress });
      }
      if (code === "DEVICE_DISCONNECTED") {
        return i18n.t("usb.errors.DEVICE_DISCONNECTED");
      }
      if (code === "RESTART_TIMEOUT") {
        return i18n.t("usb.errors.RESTART_TIMEOUT");
      }
      if (code === "VERIFICATION_FAILED") {
        return i18n.t("usb.errors.VERIFICATION_FAILED");
      }
      return i18n.t("usb.errors.SUBNET_OCCUPIED");
    })();
    super(
      message,
    );
    this.name = "OvisUsbInitializationError";
  }
}

interface InitializeOvisUsbDeviceOptions {
  occupiedSubnets: ReadonlySet<number>;
  signal: AbortSignal;
  onPhase?: (phase: OvisUsbInitializationPhase) => void;
  probeNetworkDevice: (
    apiBaseUrl: string,
    timeoutMs: number,
    signal: AbortSignal,
  ) => Promise<OvisDeviceInfo | null>;
}

export interface InitializedOvisUsbDevice {
  apiBaseUrl: string;
  ipAddress: string;
  info: OvisDeviceInfo;
}

const abortableDelay = (delayMs: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

async function initializeOvisUsbDeviceUnlocked(
  session: OvisUsbDevice,
  subnet: number,
  options: InitializeOvisUsbDeviceOptions,
): Promise<InitializedOvisUsbDevice> {
  const { signal, onPhase, probeNetworkDevice } = options;
  const ipAddress = `192.168.${subnet}.1`;
  const apiBaseUrl = `http://${ipAddress}:8080/api/v1`;
  const expectedDeviceId = session.info.device_id;
  signal.throwIfAborted();

  onPhase?.("checking-address");
  if (options.occupiedSubnets.has(subnet)) {
    await sendCommand(session, REQUEST_ABORT).catch(() => undefined);
    throw new OvisUsbInitializationError("SUBNET_OCCUPIED", ipAddress);
  }
  const existingDevice = await probeNetworkDevice(apiBaseUrl, 1_500, signal);
  if (existingDevice) {
    await sendCommand(session, REQUEST_ABORT).catch(() => undefined);
    throw new OvisUsbInitializationError("SUBNET_OCCUPIED", ipAddress);
  }

  let committed = false;
  let subnetRemembered = false;
  try {
    onPhase?.("reading-device");
    const initialInfo = await refreshOvisUsbDeviceInfo(session);
    if (
      initialInfo.device_id !== expectedDeviceId ||
      initialInfo.subnet !== -1 ||
      initialInfo.pending_subnet !== -1 ||
      initialInfo.ncm_active
    ) {
      throw new OvisUsbInitializationError("VERIFICATION_FAILED");
    }

    onPhase?.("writing-subnet");
    await sendCommand(session, REQUEST_QUIESCE_NCM);
    await sendCommand(session, REQUEST_SET_SUBNET, subnet);
    const pendingInfo = await refreshOvisUsbDeviceInfo(session);
    if (
      pendingInfo.device_id !== initialInfo.device_id ||
      pendingInfo.pending_subnet !== subnet
    ) {
      throw new OvisUsbInitializationError("VERIFICATION_FAILED");
    }

    onPhase?.("committing");
    await sendCommand(session, REQUEST_COMMIT);
    committed = true;
    onPhase?.("committed");
    let committedInfo: OvisUsbDeviceInfo | null = null;
    try {
      committedInfo = await refreshOvisUsbDeviceInfo(session);
    } catch {
      // An immediate USB disconnect is expected once COMMIT starts the reboot.
    }
    if (committedInfo) {
      if (
        committedInfo.device_id !== initialInfo.device_id ||
        committedInfo.subnet !== subnet ||
        committedInfo.pending_subnet !== -1
      ) {
        throw new OvisUsbInitializationError("VERIFICATION_FAILED");
      }
      rememberOvisSubnet(initialInfo.device_id, subnet);
      subnetRemembered = true;
    }
  } catch (error) {
    if (!committed) {
      await sendCommand(session, REQUEST_ABORT).catch(() => undefined);
    }
    if (signal.aborted) {
      throw new OvisUsbInitializationError("DEVICE_DISCONNECTED");
    }
    throw error;
  }

  await closeOvisUsbDevice(session).catch(() => undefined);
  onPhase?.("restarting");
  await abortableDelay(2_000, signal);
  onPhase?.("waiting");

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const info = await probeNetworkDevice(apiBaseUrl, 1_500, signal);
    if (info?.device_id === expectedDeviceId) {
      if (!subnetRemembered) rememberOvisSubnet(expectedDeviceId, subnet);
      onPhase?.("complete");
      return { apiBaseUrl, ipAddress, info };
    }
    await abortableDelay(2_000, signal);
  }
  throw new OvisUsbInitializationError("RESTART_TIMEOUT");
}

export async function initializeOvisUsbDevice(
  session: OvisUsbDevice,
  subnet: number,
  options: InitializeOvisUsbDeviceOptions,
): Promise<InitializedOvisUsbDevice> {
  if (!Number.isInteger(subnet) || subnet < 0 || subnet > 255) {
    throw new Error(i18n.t("usb.invalidSubnet"));
  }
  const locks = (navigator as NavigatorWithUsb).locks;
  if (!locks) return initializeOvisUsbDeviceUnlocked(session, subnet, options);
  return locks.request(
    `ovis-ncm-subnet-${subnet}`,
    { mode: "exclusive" },
    () => initializeOvisUsbDeviceUnlocked(session, subnet, options),
  );
}
