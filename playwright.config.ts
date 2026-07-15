import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: remoteBaseUrl ?? "http://127.0.0.1:4173/ovis-manager-web/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: remoteBaseUrl
    ? undefined
    : {
      command:
          "npm run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173/ovis-manager-web/",
        reuseExistingServer: true,
      },
});
