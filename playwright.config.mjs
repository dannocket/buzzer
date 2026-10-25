import os from "os";
import path from "path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
// A fresh state file per run, so every run starts with no teams.
const stateFile = path.join(os.tmpdir(), `buzzer-e2e-${Date.now()}.json`);

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server.js",
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      ADMIN_PASSWORD: "e2e-pass",
      STATE_FILE: stateFile,
    },
  },
});
