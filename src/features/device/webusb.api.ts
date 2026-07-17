import i18n from "../../i18n";

const OVIS_VENDOR_ID = 0x3346;
const OVIS_PRODUCT_ID = 0x100d;
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
  ): Promise<unknown>;
}

interface WebUsbManager {
  getDevices(): Promise<WebUsbDevice[]>;
  requestDevice(options: {
    filters: Array<{ vendorId: number; productId: number }>;
  }): Promise<WebUsbDevice>;
  addEventListener(type: "connect" | "disconnect", listener: EventListener): void;
  removeEventListener(type: "connect" | "disconnect", listener: EventListener): void;
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

const usbManager = () => (navigator as NavigatorWithUsb).usb;

function rememberSubnet(deviceId: string, subnet: number) {
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
  rememberSubnet(deviceInfo.device_id, deviceInfo.subnet);
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

export async function getAuthorizedOvisUsbDevices(): Promise<OvisUsbDevice[]> {
  const usb = usbManager();
  if (!usb) return [];
  const devices = (await usb.getDevices()).filter(
    (device) =>
      device.vendorId === OVIS_VENDOR_ID && device.productId === OVIS_PRODUCT_ID,
  );
  return Promise.all(devices.map(openOvisDevice));
}

export async function requestOvisUsbDevice(): Promise<OvisUsbDevice> {
  const usb = usbManager();
  if (!usb) throw new Error(i18n.t("usb.unsupported"));
  const device = await usb.requestDevice({
    filters: [{ vendorId: OVIS_VENDOR_ID, productId: OVIS_PRODUCT_ID }],
  });
  return openOvisDevice(device);
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

const sendCommand = (session: OvisUsbDevice, request: number, value = 0) =>
  session.device.controlTransferOut(
    transferSetup(session, request),
    new Uint8Array([value]),
  );

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

  assignments.forEach(({ deviceId, subnet }) => rememberSubnet(deviceId, subnet));
  await Promise.all(
    targetSessions.map((device) => sendCommand(device, REQUEST_COMMIT)),
  );
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
