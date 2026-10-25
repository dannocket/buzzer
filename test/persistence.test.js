import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { registerTeam, startServer, waitFor } from "./helpers.js";

describe("state persistence", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "buzzer-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("restores teams and presses after a restart", async () => {
    const first = await startServer({ stateDir: dir });
    const socket = await first.connect();
    const pin = await registerTeam(first, socket, "Owls", { approve: true });
    const pressed = waitFor(socket, "updatePresses");
    socket.emit("buzzerPress", { pin });
    await pressed;
    await first.server.flushState();
    await first.stop({ keepDir: true });

    expect(fs.existsSync(`${first.stateFilePath}.tmp`)).toBe(false);

    const restarted = await startServer({ stateDir: dir });
    await restarted.server.loadState();
    const history = await restarted.request.get("/history");
    expect(history.body.map((p) => p.teamName)).toEqual(["Owls"]);
    const res = await restarted.request
      .post("/reRegister")
      .send({ pin, socketId: "new" });
    expect(res.body).toMatchObject({ success: true, hasPressed: true });
    await restarted.stop({ keepDir: true });
  });

  it("starts empty when there is no state file", async () => {
    const ctx = await startServer({ stateDir: dir });
    await ctx.server.loadState();
    expect((await ctx.request.get("/history")).body).toEqual([]);
    expect(console.log).toHaveBeenCalledWith(
      "No saved state found or error loading state:",
      expect.any(String)
    );
    await ctx.stop({ keepDir: true });
  });

  it("starts empty when the state file is corrupt", async () => {
    await fs.promises.writeFile(path.join(dir, "appState.json"), "{not json");
    const ctx = await startServer({ stateDir: dir });
    await ctx.server.loadState();
    expect((await ctx.request.get("/history")).body).toEqual([]);
    await ctx.stop({ keepDir: true });
  });

  it("coalesces saves made while a write is in progress", async () => {
    const writeFile = vi.spyOn(fs.promises, "writeFile");
    const server = createServer({
      stateFilePath: path.join(dir, "appState.json"),
    });
    server.saveState();
    server.saveState();
    server.saveState();
    await server.flushState();
    expect(writeFile).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it("logs and survives a failed write", async () => {
    const server = createServer({
      stateFilePath: path.join(dir, "missing-dir", "appState.json"),
    });
    await server.saveState();
    expect(console.error).toHaveBeenCalledWith(
      "Error saving state:",
      expect.any(String)
    );
    await server.close();
  });
});
