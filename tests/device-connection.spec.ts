import { expect, test } from "@playwright/test";

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

test("shows the initial connection workspace", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "设备连接" })).toBeVisible();
  await expect(page.getByRole("button", { name: "连接设备" })).toBeVisible();
  await expect(page.getByText("等待连接")).toBeVisible();
  await expect(page.getByText("参数配置")).toHaveCount(0);
});

test("connects, displays device metadata, and disconnects locally", async ({
  page,
}) => {
  await page.route("**/api/v1/device/info", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deviceInfo) }),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "连接设备" }).click();

  await expect(page.getByText("设备在线")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OVIS Camera" })).toBeVisible();
  await expect(page.getByText("OVIS-1842-00123456").first()).toBeVisible();
  await expect(page.getByText("Manager 版本")).toBeVisible();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/ovis-connected-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "断开连接" }).click();
  await expect(page.getByRole("button", { name: "连接设备" })).toBeVisible();
  await expect(page.getByText("等待连接")).toBeVisible();
});

test("reports an incompatible device API", async ({ page }) => {
  await page.route("**/api/v1/device/info", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...deviceInfo, api_version: 2 }),
    }),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "连接设备" }).click();

  await expect(page.getByText("API 版本不兼容")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
});

test("marks the device disconnected after two heartbeat failures", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/v1/device/info", (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(deviceInfo),
      });
    }
    return route.abort("connectionrefused");
  });
  await page.goto("./");
  await page.getByRole("button", { name: "连接设备" }).click();

  await expect(page.getByText("设备在线")).toBeVisible();
  await expect(page.getByText("设备连接已中断")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("连接已断开")).toBeVisible();
  expect(requestCount).toBe(3);
});

test("keeps the mobile workspace within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");

  await expect(page.getByRole("button", { name: "连接设备" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth).toBe(dimensions.viewportWidth);
  await page.screenshot({ path: "/tmp/ovis-idle-mobile.png", fullPage: true });
});
