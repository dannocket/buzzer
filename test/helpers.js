import { promises as fs } from "fs";
import os from "os";
import path from "path";
import supertest from "supertest";
import { io as ioClient } from "socket.io-client";
import { createServer } from "../server.js";

export const ADMIN_PASSWORD = "test-pass";

export function basicAuth(username, password) {
  return (
    "Basic " + Buffer.from(`${username}:${password}`, "latin1").toString("base64")
  );
}

// Starts an isolated server on a random port with its own state file.
export async function startServer({ adminPassword = ADMIN_PASSWORD, stateDir } = {}) {
  const dir = stateDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "buzzer-")));
  const stateFilePath = path.join(dir, "appState.json");
  const server = createServer({ stateFilePath, adminPassword });
  await new Promise((resolve, reject) => {
    server.httpServer.once("error", reject);
    server.httpServer.listen(0, resolve);
  });
  const { port } = server.httpServer.address();
  const clients = [];

  return {
    server,
    dir,
    stateFilePath,
    url: `http://localhost:${port}`,
    request: supertest(server.httpServer),
    authHeader: basicAuth("admin", adminPassword),
    async connect() {
      const socket = ioClient(`http://localhost:${port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      clients.push(socket);
      await waitFor(socket, "connect");
      return socket;
    },
    async stop({ keepDir = false } = {}) {
      clients.forEach((socket) => socket.disconnect());
      await server.close();
      if (!keepDir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  };
}

// Create this promise BEFORE triggering the event: routes emit in the same
// tick as the HTTP response, so a late listener can miss it.
export function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Resolves true if the event arrives within `ms`, false otherwise.
export function receivedWithin(socket, event, ms = 150) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve(false);
    }, ms);
    function onEvent() {
      clearTimeout(timer);
      resolve(true);
    }
    socket.once(event, onEvent);
  });
}

// Registers a team bound to `socket` and optionally approves it.
export async function registerTeam(ctx, socket, teamName, { approve = false } = {}) {
  const res = await ctx.request
    .post("/register")
    .send({ teamName, socketId: socket?.id });
  if (approve) {
    await ctx.request
      .post("/admin/approve")
      .set("Authorization", ctx.authHeader)
      .send({ teamName, approve: true });
  }
  return res.body.pin;
}
