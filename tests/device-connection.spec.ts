import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

async function readCanvasSignal(page: Page) {
  return page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      return {
        width: 0,
        height: 0,
        visiblePixels: 0,
        hash: 0,
        minY: 0,
        maxY: 0,
      };
    }

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let visiblePixels = 0;
    let hash = 2166136261;
    let minY = height;
    let maxY = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 24) {
        visiblePixels += 1;
        const y = Math.floor(index / 4 / width);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (index % 388 === 0) {
        hash ^= pixels[index] + pixels[index + 1] * 3 + pixels[index + 2] * 7;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
    }
    return { width, height, visiblePixels, hash, minY, maxY };
  });
}

const deviceInfo = {
  protocol: "ovis-device",
  api_version: 1,
  device_id: "OVIS-1842-00123456",
  name: "OVIS Camera",
  model: "OVIS",
  serial: "OVIS-1842-00123456",
  firmware_version: "1.0.0",
  manager_version: "1.0.0",
};

const secondDeviceInfo = {
  ...deviceInfo,
  device_id: "OVIS-1842-00987654",
  name: "OVIS Camera B",
  serial: "OVIS-1842-00987654",
};

const requestHost = (route: Route) => new URL(route.request().url()).hostname;

const fulfillJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function discoverSingleDevice(page: Page) {
  await page.route("**/api/v1/device/info", (route) => {
    if (requestHost(route) === "192.168.42.1") {
      return fulfillJson(route, deviceInfo);
    }
    return route.abort("connectionrefused");
  });
  await page.goto("./");
  await page.getByRole("button", { name: "搜索设备" }).click();
  await expect(
    page.getByRole("radio", { name: /OVIS Camera OVIS-1842-00123456/ }),
  ).toBeVisible();
}

test("shows the initial discovery workspace", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "设备连接" })).toBeVisible();
  await expect(page.getByRole("button", { name: "搜索设备" })).toBeVisible();
  await expect(page.getByText("等待搜索")).toBeVisible();
  await expect(page.getByText("参数配置")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/ovis-idle-desktop.png", fullPage: true });
});

test("renders and rotates the optimized product model", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("./");
  const model = page.getByRole("img", { name: "OVIS 相机模组 3D 展示" });
  await expect(model).toHaveAttribute("data-model-status", "ready", {
    timeout: 15_000,
  });
  const canvas = model.locator("canvas");
  await expect(canvas).toBeVisible();

  await page.waitForTimeout(250);
  const firstFrame = await readCanvasSignal(page);
  expect(firstFrame.width).toBeGreaterThan(400);
  expect(firstFrame.height).toBeGreaterThan(400);
  expect(firstFrame.visiblePixels).toBeGreaterThan(
    firstFrame.width * firstFrame.height * 0.02,
  );

  await page.waitForTimeout(900);
  const rotatedFrame = await readCanvasSignal(page);
  expect(rotatedFrame.hash).not.toBe(firstFrame.hash);
  expect(rotatedFrame.minY).toBeGreaterThan(rotatedFrame.height * 0.03);
  expect(rotatedFrame.maxY).toBeLessThan(rotatedFrame.height * 0.97);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.44, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await page.waitForTimeout(250);
  const draggedFrame = await readCanvasSignal(page);
  expect(draggedFrame.hash).not.toBe(rotatedFrame.hash);
  expect(draggedFrame.minY).toBeGreaterThan(draggedFrame.height * 0.03);
  expect(draggedFrame.maxY).toBeLessThan(draggedFrame.height * 0.97);
  await page.screenshot({ path: "/tmp/ovis-model-desktop.png", fullPage: true });
});

test("scans with at most four requests and deduplicates device ids", async ({
  page,
}) => {
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const requestedHosts = new Set<string>();

  await page.route("**/api/v1/device/info", async (route) => {
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    const host = requestHost(route);
    requestedHosts.add(host);
    await new Promise((resolve) => setTimeout(resolve, 45));
    activeRequests -= 1;

    if (host === "192.168.42.1" || host === "192.168.43.1") {
      return fulfillJson(route, deviceInfo);
    }
    if (host === "192.168.44.1") {
      return fulfillJson(route, secondDeviceInfo);
    }
    return route.abort("connectionrefused");
  });

  await page.goto("./");
  await page.getByRole("button", { name: "搜索设备" }).click();
  await expect(page.getByText("发现 2 台 OVIS 设备")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(2);
  expect(requestedHosts.size).toBe(16);
  expect(maximumActiveRequests).toBeGreaterThan(1);
  expect(maximumActiveRequests).toBeLessThanOrEqual(4);
  await page.screenshot({ path: "/tmp/ovis-results-desktop.png", fullPage: true });
});

test("selects, confirms, connects, and disconnects locally", async ({ page }) => {
  await discoverSingleDevice(page);

  const result = page.getByRole("radio", {
    name: /OVIS Camera OVIS-1842-00123456/,
  });
  const connectButton = page.getByRole("button", { name: "连接", exact: true });
  await expect(connectButton).toBeDisabled();
  await result.click();
  await expect(connectButton).toBeEnabled();
  await connectButton.click();

  await expect(page.getByText("设备在线")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OVIS Camera" })).toBeVisible();
  await expect(page.getByText("OVIS-1842-00123456").first()).toBeVisible();
  await expect(page.getByText("Manager 版本")).toBeVisible();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();
  await expect(page.getByText("192.168.42.1:8080/api/v1")).toBeVisible();
  await page.screenshot({ path: "/tmp/ovis-connected-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "断开连接" }).click();
  await expect(page.getByText("发现 1 台 OVIS 设备")).toBeVisible();
  await expect(page.getByText("搜索完成")).toBeVisible();
});

test("supports cancelling a scan and rescanning after an empty result", async ({
  page,
}) => {
  let returnDevice = false;
  let delayRequests = true;
  await page.route("**/api/v1/device/info", async (route) => {
    if (delayRequests) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (returnDevice && requestHost(route) === "192.168.42.1") {
      return fulfillJson(route, deviceInfo);
    }
    return route.abort("connectionrefused");
  });

  await page.goto("./");
  await page.getByRole("button", { name: "搜索设备" }).click();
  await expect(page.getByText("正在搜索 OVIS 设备")).toBeVisible();
  await page.getByRole("button", { name: "取消搜索" }).click();
  await expect(page.getByRole("button", { name: "搜索设备" })).toBeVisible();

  delayRequests = false;
  await page.getByRole("button", { name: "搜索设备" }).click();
  await expect(page.getByText("未发现 OVIS 设备")).toBeVisible();
  returnDevice = true;
  await page.getByRole("button", { name: "重新搜索" }).click();
  await expect(page.getByText("发现 1 台 OVIS 设备")).toBeVisible();
});

test("rejects a device whose identity changes before connection", async ({
  page,
}) => {
  let selectedHostRequests = 0;
  await page.route("**/api/v1/device/info", (route) => {
    if (requestHost(route) !== "192.168.42.1") {
      return route.abort("connectionrefused");
    }
    selectedHostRequests += 1;
    return fulfillJson(
      route,
      selectedHostRequests === 1 ? deviceInfo : secondDeviceInfo,
    );
  });

  await page.goto("./");
  await page.getByRole("button", { name: "搜索设备" }).click();
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();

  await expect(page.getByText("设备身份已变化")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新连接" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新搜索" })).toBeVisible();
});

test("ignores incompatible responses during discovery", async ({ page }) => {
  await page.route("**/api/v1/device/info", (route) => {
    if (requestHost(route) === "192.168.42.1") {
      return fulfillJson(route, { ...deviceInfo, api_version: 2 });
    }
    return route.abort("connectionrefused");
  });
  await page.goto("./");
  await page.getByRole("button", { name: "搜索设备" }).click();

  await expect(page.getByText("未发现 OVIS 设备")).toBeVisible();
  await expect(page.getByText("API 版本不兼容")).toHaveCount(0);
});

test("heartbeats only the selected device and stops after two failures", async ({
  page,
}) => {
  const requestsByHost = new Map<string, number>();
  await page.route("**/api/v1/device/info", (route) => {
    const host = requestHost(route);
    const count = (requestsByHost.get(host) ?? 0) + 1;
    requestsByHost.set(host, count);

    if (host === "192.168.42.1" && count <= 2) {
      return fulfillJson(route, deviceInfo);
    }
    return route.abort("connectionrefused");
  });

  await page.goto("./");
  await page.getByRole("button", { name: "搜索设备" }).click();
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();

  await expect(page.getByText("设备在线")).toBeVisible();
  await expect(page.getByText("设备连接已中断")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("操作异常")).toBeVisible();
  expect(requestsByHost.get("192.168.42.1")).toBe(4);
  expect(requestsByHost.get("192.168.43.1")).toBe(1);
});

test("keeps idle and result workspaces within a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/device/info", (route) => {
    const host = requestHost(route);
    if (host === "192.168.42.1") return fulfillJson(route, deviceInfo);
    if (host === "192.168.43.1") return fulfillJson(route, secondDeviceInfo);
    return route.abort("connectionrefused");
  });
  await page.goto("./");

  await expect(page.getByRole("button", { name: "搜索设备" })).toBeVisible();
  const model = page.getByRole("img", { name: "OVIS 相机模组 3D 展示" });
  await expect(model).toHaveAttribute("data-model-status", "ready", {
    timeout: 15_000,
  });
  const canvasSignal = await readCanvasSignal(page);
  expect(canvasSignal.visiblePixels).toBeGreaterThan(
    canvasSignal.width * canvasSignal.height * 0.02,
  );

  await page.getByRole("button", { name: "搜索设备" }).click();
  await expect(page.getByText("发现 2 台 OVIS 设备")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth).toBe(dimensions.viewportWidth);
  await page.screenshot({ path: "/tmp/ovis-results-mobile.png", fullPage: true });
});
