import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  basicAuth,
  receivedWithin,
  registerTeam,
  startServer,
  waitFor,
} from "./helpers.js";

describe("socket events", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.stop();
  });

  async function listUsers() {
    const res = await ctx.request
      .get("/admin/users")
      .set("Authorization", ctx.authHeader);
    return res.body;
  }

  describe("adminAuth", () => {
    it("ignores invalid credentials", async () => {
      const socket = await ctx.connect();
      const reply = receivedWithin(socket, "updateUsers");
      socket.emit("adminAuth", basicAuth("admin", "wrong"));
      expect(await reply).toBe(false);

      // Not in the admin room, so registrations aren't broadcast to it.
      const broadcast = receivedWithin(socket, "updateUsers");
      await registerTeam(ctx, null, "Owls");
      expect(await broadcast).toBe(false);
    });

    it("ignores a non-string payload", async () => {
      const socket = await ctx.connect();
      const reply = receivedWithin(socket, "updateUsers");
      socket.emit("adminAuth", { authorization: ctx.authHeader });
      expect(await reply).toBe(false);
    });

    it("joins the admin room and receives the user list", async () => {
      const socket = await ctx.connect();
      const initial = waitFor(socket, "updateUsers");
      socket.emit("adminAuth", ctx.authHeader);
      expect(await initial).toEqual([]);

      const broadcast = waitFor(socket, "updateUsers");
      await registerTeam(ctx, null, "Owls");
      expect(await broadcast).toEqual([{ teamName: "Owls", approved: false }]);
    });
  });

  describe("buzzerPress", () => {
    it("announces the first press and lists every press", async () => {
      const owls = await ctx.connect();
      const hawks = await ctx.connect();
      const mainScreen = await ctx.connect();
      const owlsPin = await registerTeam(ctx, owls, "Owls", { approve: true });
      const hawksPin = await registerTeam(ctx, hawks, "Hawks", {
        approve: true,
      });
      await ctx.request
        .post("/admin/editUser")
        .set("Authorization", ctx.authHeader)
        .send({ oldName: "Owls", newName: "Owls", description: "Table 1" });

      const winner = waitFor(mainScreen, "buzzerPressed");
      const firstList = waitFor(mainScreen, "updatePresses");
      owls.emit("buzzerPress", { pin: owlsPin });
      expect(await winner).toMatchObject({
        teamName: "Owls",
        description: "Table 1",
        timestamp: expect.any(String),
      });
      expect(await firstList).toHaveLength(1);

      const secondWinner = receivedWithin(mainScreen, "buzzerPressed");
      const secondList = waitFor(mainScreen, "updatePresses");
      hawks.emit("buzzerPress", { pin: hawksPin });
      expect((await secondList).map((p) => p.teamName)).toEqual([
        "Owls",
        "Hawks",
      ]);
      expect(await secondWinner).toBe(false);
    });

    it("ignores a second press from the same team", async () => {
      const owls = await ctx.connect();
      const pin = await registerTeam(ctx, owls, "Owls", { approve: true });
      const first = waitFor(owls, "updatePresses");
      owls.emit("buzzerPress", { pin });
      await first;

      const repeat = receivedWithin(owls, "updatePresses");
      owls.emit("buzzerPress", { pin });
      expect(await repeat).toBe(false);
      expect((await ctx.request.get("/history")).body).toHaveLength(1);
    });

    it("ignores an unapproved team", async () => {
      const owls = await ctx.connect();
      const pin = await registerTeam(ctx, owls, "Owls");
      const press = receivedWithin(owls, "updatePresses");
      owls.emit("buzzerPress", { pin });
      expect(await press).toBe(false);
    });

    it("ignores an unknown PIN or missing payload", async () => {
      const socket = await ctx.connect();
      const press = receivedWithin(socket, "updatePresses");
      socket.emit("buzzerPress", { pin: "deadbeef" });
      socket.emit("buzzerPress");
      expect(await press).toBe(false);
    });

    it("ignores a valid PIN sent from another socket", async () => {
      const owls = await ctx.connect();
      const intruder = await ctx.connect();
      const pin = await registerTeam(ctx, owls, "Owls", { approve: true });
      const press = receivedWithin(owls, "updatePresses");
      intruder.emit("buzzerPress", { pin });
      expect(await press).toBe(false);
    });
  });

  describe("disconnect", () => {
    async function connectAdmin() {
      const admin = await ctx.connect();
      const joined = waitFor(admin, "updateUsers");
      admin.emit("adminAuth", ctx.authHeader);
      await joined;
      return admin;
    }

    it("removes an unapproved team", async () => {
      const admin = await connectAdmin();
      const owls = await ctx.connect();
      const registered = waitFor(admin, "updateUsers");
      await registerTeam(ctx, owls, "Owls");
      await registered;

      const update = waitFor(admin, "updateUsers");
      owls.disconnect();
      expect(await update).toEqual([]);
    });

    it("keeps an approved team so it can reconnect", async () => {
      const admin = await connectAdmin();
      const owls = await ctx.connect();
      const pin = await registerTeam(ctx, owls, "Owls", { approve: true });

      const update = waitFor(admin, "updateUsers");
      owls.disconnect();
      expect(await update).toEqual([{ teamName: "Owls", approved: true }]);

      const res = await ctx.request
        .post("/reRegister")
        .send({ pin, socketId: "new-socket" });
      expect(res.body.success).toBe(true);
    });

    it("does nothing when a non-team socket disconnects", async () => {
      const admin = await connectAdmin();
      const mainScreen = await ctx.connect();
      const registered = waitFor(admin, "updateUsers");
      await registerTeam(ctx, null, "Owls");
      await registered;

      const update = receivedWithin(admin, "updateUsers");
      mainScreen.disconnect();
      expect(await update).toBe(false);
      expect(await listUsers()).toHaveLength(1);
    });
  });
});
