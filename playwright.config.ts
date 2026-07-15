import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/ovis-manager-web/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "VITE_DEVICE_API_URL=http://192.168.42.1:8080/api/v1 npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/ovis-manager-web/",
    reuseExistingServer: true,
  },
});
