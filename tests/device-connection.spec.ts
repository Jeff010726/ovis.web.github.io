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

const configCapabilities = {
  schema_version: 1,
  video: {
    main: {
      profiles: [
        {
          id: "1080p",
          width: 1920,
          height: 1080,
          fps_options: [15, 25, 30],
          bitrate_min: 512,
          bitrate_max: 15000,
        },
        {
          id: "720p",
          width: 1280,
          height: 720,
          fps_options: [15, 25, 30],
          bitrate_min: 384,
          bitrate_max: 8000,
        },
      ],
    },
    sub: {
      profiles: [
        {
          id: "768x572",
          width: 768,
          height: 572,
          fps_options: [15, 25, 30],
          bitrate_min: 128,
          bitrate_max: 4000,
        },
      ],
    },
  },
  features: {
    osd: true,
    person_detection: true,
    face_detection: true,
    motion_detection: true,
  },
};

const currentConfig = {
  revision: "a81f36c2",
  values: {
    video: {
      main: { profile: "1080p", fps: 30, bitrate_kbps: 10000 },
      sub: {
        enabled: true,
        profile: "768x572",
        fps: 30,
        bitrate_kbps: 1000,
      },
    },
    overlay: { enabled: true },
    detection: {
      person: { enabled: true, threshold: 0.7 },
      face: { enabled: false, threshold: 0.5 },
      motion: { enabled: false, sensitivity: 50 },
    },
  },
};

const requestHost = (route: Route) => new URL(route.request().url()).hostname;

const fulfillJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function discoverSingleDevice(
  page: Page,
  deviceInfoHandler?: (route: Route) => Promise<unknown>,
) {
  await page.route("**/api/v1/device/info", (route) => {
    if (deviceInfoHandler) return deviceInfoHandler(route);
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

async function mockConfigurationRead(page: Page) {
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config", (route) => {
    if (route.request().method() === "GET") {
      return fulfillJson(route, currentConfig);
    }
    return route.fallback();
  });
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
    timeout: 25_000,
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
  const productImages = page.locator(".device-result__visual img");
  await expect(productImages).toHaveCount(2);
  await expect(productImages.first()).toBeVisible();
  await productImages
    .first()
    .evaluate((image: HTMLImageElement) => image.decode());
  const imageMetrics = await productImages.first().evaluate((image) => ({
    complete: (image as HTMLImageElement).complete,
    naturalWidth: (image as HTMLImageElement).naturalWidth,
    renderedWidth: image.getBoundingClientRect().width,
  }));
  expect(imageMetrics.complete).toBe(true);
  expect(imageMetrics.naturalWidth).toBe(978);
  expect(imageMetrics.renderedWidth).toBeGreaterThan(200);
  const imageBottomGap = await productImages.first().evaluate((image) => {
    const imageBounds = image.getBoundingClientRect();
    const visualBounds = image.parentElement!.getBoundingClientRect();
    return visualBounds.bottom - imageBounds.bottom;
  });
  expect(imageBottomGap).toBeGreaterThanOrEqual(14);
  expect(requestedHosts.size).toBe(16);
  expect(maximumActiveRequests).toBeGreaterThan(1);
  expect(maximumActiveRequests).toBeLessThanOrEqual(4);
  await page.screenshot({ path: "/tmp/ovis-results-desktop.png", fullPage: true });
});

test("selects, confirms, connects, and disconnects locally", async ({ page }) => {
  await mockConfigurationRead(page);
  await discoverSingleDevice(page);

  const result = page.getByRole("radio", {
    name: /OVIS Camera OVIS-1842-00123456/,
  });
  const connectButton = page.getByRole("button", { name: "连接", exact: true });
  await expect(connectButton).toBeDisabled();
  await result.click();
  await expect(connectButton).toBeEnabled();
  await connectButton.click();

  await expect(page.getByText("设备在线").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "设备配置", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OVIS Camera" })).toBeVisible();
  await expect(page.getByAltText("OVIS Camera 产品图")).toBeVisible();
  await expect(page.getByText("OVIS-1842-00123456").first()).toBeVisible();
  await expect(page.getByText("固件版本")).toBeVisible();
  await expect(page.getByText("Manager", { exact: true })).toBeVisible();
  await expect(page.getByText("设备配置", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("region", { name: "主码流" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "启用 OSD" })).toBeChecked();
  await expect(page.getByText("192.168.42.1:8080/api/v1")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "配置分类" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "当前设备仪表盘" }),
  ).toBeVisible();

  const configurationEditor = page.locator(".configuration-editor");
  const videoSectionButton = page.getByRole("button", {
    name: "01 视频码流",
  });
  const detectionSectionButton = page.getByRole("button", {
    name: "02 智能检测",
  });
  const dashboard = page.getByRole("complementary", {
    name: "当前设备仪表盘",
  });
  const dashboardTop = (await dashboard.boundingBox())?.y;
  await expect(videoSectionButton).toHaveAttribute("aria-current", "true");
  await detectionSectionButton.click();
  await expect(detectionSectionButton).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() => configurationEditor.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(200);
  expect((await dashboard.boundingBox())?.y).toBeCloseTo(dashboardTop ?? 0, 0);
  await videoSectionButton.click();
  await expect(videoSectionButton).toHaveAttribute("aria-current", "true");
  await page.screenshot({ path: "/tmp/ovis-connected-desktop.png", fullPage: true });

  await page.getByTitle("断开连接").click();
  await expect(page.getByText("发现 1 台 OVIS 设备")).toBeVisible();
  await expect(page.getByText("搜索完成")).toBeVisible();
});

test("scales the configuration workspace and keeps the dashboard fixed at 2K", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await mockConfigurationRead(page);
  await discoverSingleDevice(page);
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();

  const workspace = page.locator(".workspace-panel--configuration");
  const dashboard = page.getByRole("complementary", {
    name: "当前设备仪表盘",
  });
  const sectionMenu = page.getByRole("navigation", { name: "配置分类" });

  await expect(workspace).toBeVisible();
  await expect(dashboard).toBeVisible();
  await expect(sectionMenu).toBeVisible();

  const workspaceBounds = await workspace.boundingBox();
  const dashboardBounds = await dashboard.boundingBox();
  expect(workspaceBounds?.width).toBeGreaterThan(1700);
  expect(workspaceBounds?.height).toBeGreaterThan(900);
  expect(dashboardBounds?.width).toBeGreaterThanOrEqual(380);

  const menuBounds = await sectionMenu.boundingBox();
  expect(menuBounds?.x).toBeGreaterThan((workspaceBounds?.x ?? 0) + 1000);
  expect(dashboardBounds?.x).toBeGreaterThan(menuBounds?.x ?? 0);
  expect(dashboardBounds?.height).toBeGreaterThan(
    (workspaceBounds?.height ?? 0) - 3,
  );

  await page.screenshot({ path: "/tmp/ovis-config-2k.png", fullPage: true });
});

test("edits, validates, saves, applies, and polls configuration", async ({
  page,
}) => {
  let savedValues = structuredClone(currentConfig.values);
  let activeRevision = currentConfig.revision;
  let validatePayload: Record<string, unknown> | null = null;
  let savePayload: Record<string, unknown> | null = null;
  let applyPayload: Record<string, unknown> | null = null;
  let taskRequests = 0;
  let applyStarted = false;
  let reconnectRequests = 0;

  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config/validate", async (route) => {
    validatePayload = await route.request().postDataJSON();
    return fulfillJson(route, {
      valid: true,
      errors: [],
      warnings: [],
      requires: ["ipcamera_restart"],
    });
  });
  await page.route("**/api/v1/config/apply", async (route) => {
    applyPayload = await route.request().postDataJSON();
    applyStarted = true;
    return fulfillJson(route, { task_id: 12 });
  });
  await page.route("**/api/v1/tasks/12", (route) => {
    taskRequests += 1;
    return fulfillJson(route, {
      id: 12,
      state: "succeeded",
      stage: "completed",
      progress: 100,
      message: "配置应用成功",
    });
  });
  await page.route("**/api/v1/config", async (route) => {
    if (route.request().method() === "PUT") {
      savePayload = await route.request().postDataJSON();
      savedValues = structuredClone(
        (savePayload as { values: typeof currentConfig.values }).values,
      );
      activeRevision = "b929d204";
      return fulfillJson(route, {
        saved: true,
        revision: activeRevision,
        restart_required: true,
      });
    }
    return fulfillJson(route, { revision: activeRevision, values: savedValues });
  });

  await discoverSingleDevice(page, async (route) => {
    if (requestHost(route) !== "192.168.42.1") {
      return route.abort("connectionrefused");
    }
    if (!applyStarted) return fulfillJson(route, deviceInfo);
    reconnectRequests += 1;
    if (reconnectRequests <= 2) return route.abort("connectionrefused");
    return fulfillJson(route, deviceInfo);
  });
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();
  const mainStream = page.getByRole("region", { name: "主码流" });
  await expect(mainStream).toBeVisible();

  await mainStream.getByRole("spinbutton").fill("9000");
  await page.getByRole("switch", { name: "启用 OSD" }).click();
  await expect(page.getByText("有未保存修改")).toBeVisible();
  const saveButton = page.getByRole("button", { name: "保存并应用" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(page.getByText("配置已保存，设备正在重启").first()).toBeVisible();
  await expect(page.getByTitle("重新搜索")).toBeDisabled();
  await expect(page.getByRole("button", { name: "恢复默认" })).toBeDisabled();
  const pendingApplication = await page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem("ovis_pending_config_application") ?? "null",
    ),
  );
  expect(pendingApplication).toMatchObject({
    device_id: deviceInfo.device_id,
    api_base_url: "http://192.168.42.1:8080/api/v1",
    task_id: 12,
    target_revision: "b929d204",
  });
  await expect(page.getByText("正在等待设备恢复连接")).toBeVisible();
  await expect(page.getByText("设备重启中").first()).toBeVisible();
  await expect(page.getByText("等待设备确认")).toBeVisible();
  await page.screenshot({
    path: "/tmp/ovis-config-reconnecting-desktop.png",
    fullPage: true,
  });
  await expect(page.getByText("配置应用成功")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("配置已同步")).toBeVisible();
  expect(taskRequests).toBe(1);
  expect(reconnectRequests).toBe(3);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ovis_pending_config_application"),
    ),
  ).toBeNull();
  expect(validatePayload).toMatchObject({
    revision: "a81f36c2",
    values: { video: { main: { bitrate_kbps: 9000 } }, overlay: { enabled: false } },
  });
  expect(savePayload).toEqual(validatePayload);
  expect(applyPayload).toEqual({ revision: "b929d204" });
});

test("searches the address pool and reconnects only the original device id", async ({
  page,
}) => {
  let applyStarted = false;
  let activeRevision = currentConfig.revision;
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config/validate", (route) =>
    fulfillJson(route, { valid: true, errors: [], warnings: [], requires: [] }),
  );
  await page.route("**/api/v1/config/apply", (route) => {
    applyStarted = true;
    return fulfillJson(route, { task_id: 28 });
  });
  await page.route("**/api/v1/tasks/28", (route) =>
    fulfillJson(route, {
      id: 28,
      state: "succeeded",
      progress: 100,
      message: "配置应用成功",
    }),
  );
  await page.route("**/api/v1/config", (route) => {
    if (route.request().method() === "PUT") {
      activeRevision = "moved-revision";
      return fulfillJson(route, {
        saved: true,
        revision: activeRevision,
        restart_required: true,
      });
    }
    return fulfillJson(route, { revision: activeRevision, values: currentConfig.values });
  });

  await discoverSingleDevice(page, async (route) => {
    const host = requestHost(route);
    if (!applyStarted) {
      return host === "192.168.42.1"
        ? fulfillJson(route, deviceInfo)
        : route.abort("connectionrefused");
    }
    if (host === "192.168.43.1") return fulfillJson(route, secondDeviceInfo);
    if (host === "192.168.44.1") return fulfillJson(route, deviceInfo);
    return route.abort("connectionrefused");
  });
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByRole("region", { name: "主码流" }).getByRole("spinbutton").fill("9000");
  await page.getByRole("button", { name: "保存并应用" }).click();

  await expect(page.getByText("正在等待设备恢复连接")).toBeVisible();
  await expect(page.getByText("配置应用成功")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("192.168.44.1:8080/api/v1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OVIS Camera B" })).toHaveCount(0);
});

test("resumes a pending application after refresh and accepts a missing task", async ({
  page,
}) => {
  await page.addInitScript(
    ({ info }) => {
      sessionStorage.setItem(
        "ovis_pending_config_application",
        JSON.stringify({
          device_id: info.device_id,
          api_base_url: "http://192.168.42.1:8080/api/v1",
          task_id: 31,
          target_revision: "resume-revision",
          started_at: Date.now(),
        }),
      );
    },
    { info: deviceInfo },
  );
  await page.route("**/api/v1/device/info", async (route) => {
    if (requestHost(route) !== "192.168.42.1") {
      return route.abort("connectionrefused");
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    return fulfillJson(route, deviceInfo);
  });
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/tasks/31", (route) => route.fulfill({ status: 404 }));
  await page.route("**/api/v1/config", (route) =>
    fulfillJson(route, {
      revision: "resume-revision",
      values: currentConfig.values,
    }),
  );

  await page.goto("./");
  await expect(page.getByText("正在恢复设备连接")).toBeVisible();
  await expect(page.getByText("配置应用成功")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("heading", { name: "OVIS Camera" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ovis_pending_config_application"),
    ),
  ).toBeNull();
});

test("fails verification when the target revision is not active", async ({
  page,
}) => {
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config/validate", (route) =>
    fulfillJson(route, { valid: true, errors: [], warnings: [], requires: [] }),
  );
  await page.route("**/api/v1/config/apply", (route) =>
    fulfillJson(route, { task_id: 38 }),
  );
  await page.route("**/api/v1/tasks/38", (route) => route.fulfill({ status: 404 }));
  await page.route("**/api/v1/config", (route) => {
    if (route.request().method() === "PUT") {
      return fulfillJson(route, {
        saved: true,
        revision: "target-not-active",
        restart_required: true,
      });
    }
    return fulfillJson(route, currentConfig);
  });

  await discoverSingleDevice(page);
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByRole("region", { name: "主码流" }).getByRole("spinbutton").fill("9000");
  await page.getByRole("button", { name: "保存并应用" }).click();

  await expect(page.getByText("配置未生效或已自动回滚")).toBeVisible({
    timeout: 6_000,
  });
});

test("shows server validation errors without saving", async ({ page }) => {
  let saveRequests = 0;
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config/validate", (route) =>
    fulfillJson(route, {
      valid: false,
      errors: [
        {
          field: "video.main.bitrate_kbps",
          code: "OUT_OF_RANGE",
          message: "主码流码率超出允许范围",
        },
      ],
      warnings: [],
      requires: [],
    }),
  );
  await page.route("**/api/v1/config", (route) => {
    if (route.request().method() === "PUT") saveRequests += 1;
    return fulfillJson(route, currentConfig);
  });

  await discoverSingleDevice(page);
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();
  const mainStream = page.getByRole("region", { name: "主码流" });
  await mainStream.getByRole("spinbutton").fill("12000");
  await page.getByRole("button", { name: "保存并应用" }).click();

  await expect(page.getByText("配置校验未通过")).toBeVisible();
  await expect(page.getByText("主码流码率超出允许范围")).toBeVisible();
  expect(saveRequests).toBe(0);
  await expect(page.getByText("有未保存修改")).toBeVisible();
});

test("reports automatic rollback when apply fails", async ({ page }) => {
  let taskFailed = false;
  let postFailureConfigReads = 0;
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config/validate", (route) =>
    fulfillJson(route, { valid: true, errors: [], warnings: [], requires: [] }),
  );
  await page.route("**/api/v1/config/apply", (route) =>
    fulfillJson(route, { task_id: 18 }),
  );
  await page.route("**/api/v1/tasks/18", (route) => {
    taskFailed = true;
    return fulfillJson(route, {
      id: 18,
      state: "failed",
      rolled_back: true,
      message: "新配置启动失败，已恢复原配置",
    });
  });
  await page.route("**/api/v1/config", (route) => {
    if (route.request().method() === "PUT") {
      return fulfillJson(route, {
        saved: true,
        revision: "failed-revision",
        restart_required: true,
      });
    }
    if (taskFailed) postFailureConfigReads += 1;
    return fulfillJson(route, currentConfig);
  });

  await discoverSingleDevice(page);
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByRole("region", { name: "主码流" }).getByRole("spinbutton").fill("9000");
  await page.getByRole("button", { name: "保存并应用" }).click();

  await expect(page.getByText("新配置启动失败，已恢复原配置")).toBeVisible();
  await expect(page.getByText("自动回滚成功，页面已重新读取设备配置。")).toBeVisible();
  expect(postFailureConfigReads).toBe(1);
});

test("restores defaults and reloads the resulting configuration", async ({
  page,
}) => {
  const resetValues = structuredClone(currentConfig.values);
  resetValues.overlay.enabled = false;
  let resetCompleted = false;
  await page.route("**/api/v1/config/capabilities", (route) =>
    fulfillJson(route, configCapabilities),
  );
  await page.route("**/api/v1/config/reset", (route) => {
    resetCompleted = true;
    return fulfillJson(route, { task_id: 22 });
  });
  await page.route("**/api/v1/tasks/22", (route) =>
    fulfillJson(route, {
      id: 22,
      state: "succeeded",
      progress: 100,
      message: "已恢复默认配置",
    }),
  );
  await page.route("**/api/v1/config", (route) =>
    fulfillJson(
      route,
      resetCompleted
        ? { revision: "defaults-1", values: resetValues }
        : currentConfig,
    ),
  );

  await discoverSingleDevice(page);
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByRole("button", { name: "恢复默认" }).click();
  await expect(page.getByText("恢复设备默认配置？")).toBeVisible();
  await page.getByRole("button", { name: "确认恢复" }).click();

  await expect(page.getByText("已恢复默认配置")).toBeVisible();
  await expect(page.getByRole("switch", { name: "启用 OSD" })).not.toBeChecked();
  await expect(page.getByText("REVISION defaults-1")).toBeVisible();
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
  await mockConfigurationRead(page);
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

  await expect(page.getByText("设备在线").first()).toBeVisible();
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
    timeout: 25_000,
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

test("keeps the configuration workspace usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockConfigurationRead(page);
  await discoverSingleDevice(page);
  await page.getByRole("radio").click();
  await page.getByRole("button", { name: "连接", exact: true }).click();

  await expect(page.getByRole("heading", { name: "设备配置", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "主码流" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "启用人员检测" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth).toBe(dimensions.viewportWidth);
  await page.screenshot({ path: "/tmp/ovis-config-mobile.png", fullPage: true });
});
