import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTeam, startServer, waitFor } from "./helpers.js";

describe("admin routes", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.stop();
  });

  function admin(route, body) {
    return ctx.request
      .post(route)
      .set("Authorization", ctx.authHeader)
      .send(body);
  }

  async function listUsers() {
    const res = await ctx.request
      .get("/admin/users")
      .set("Authorization", ctx.authHeader);
    return res.body;
  }

  describe("GET /admin/users", () => {
    it("never exposes PINs or socket IDs", async () => {
      const socket = await ctx.connect();
      await registerTeam(ctx, socket, "Owls");
      const [user] = await listUsers();
      expect(user).not.toHaveProperty("pin");
      expect(user).not.toHaveProperty("socketId");
      expect(JSON.stringify(user)).not.toContain(socket.id);
    });
  });

  describe("POST /admin/approve", () => {
    it("returns 404 for an unknown team", async () => {
      const res = await admin("/admin/approve", {
        teamName: "Ghosts",
        approve: true,
      });
      expect(res.status).toBe(404);
    });

    it("approves the team and notifies its socket", async () => {
      const socket = await ctx.connect();
      await registerTeam(ctx, socket, "Owls");

      const approved = waitFor(socket, "registrationApproved");
      const res = await admin("/admin/approve", {
        teamName: "Owls",
        approve: true,
      });
      expect(res.body).toEqual({ success: true });
      expect((await approved).teamName).toBe("Owls");
      expect((await listUsers())[0].approved).toBe(true);
    });

    it("approves a team that has no connected socket", async () => {
      await registerTeam(ctx, null, "Owls");
      const res = await admin("/admin/approve", {
        teamName: "Owls",
        approve: true,
      });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /admin/approveNameChange", () => {
    async function requestRename(socket) {
      const pin = await registerTeam(ctx, socket, "Owls", { approve: true });
      await ctx.request
        .post("/changeTeamName")
        .send({ oldName: "Owls", newName: "Hawks", pin });
    }

    it("renames the team when approved", async () => {
      const socket = await ctx.connect();
      await requestRename(socket);

      const renamed = waitFor(socket, "nameChange");
      const res = await admin("/admin/approveNameChange", {
        oldName: "Owls",
        newName: "Hawks",
        approve: true,
      });
      expect(res.status).toBe(200);
      expect(await renamed).toEqual({ oldName: "Owls", newName: "Hawks" });
      expect(await listUsers()).toEqual([
        { teamName: "Hawks", approved: true },
      ]);
    });

    it("only clears the pending request when rejected", async () => {
      await requestRename(null);
      await admin("/admin/approveNameChange", {
        oldName: "Owls",
        newName: "Hawks",
        approve: false,
      });
      expect(await listUsers()).toEqual([{ teamName: "Owls", approved: true }]);
    });

    it("returns 404 when the request doesn't match", async () => {
      await requestRename(null);
      const res = await admin("/admin/approveNameChange", {
        oldName: "Owls",
        newName: "Bats",
        approve: true,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/editUser", () => {
    it("updates name and description and notifies the team", async () => {
      const socket = await ctx.connect();
      const pin = await registerTeam(ctx, socket, "Owls", { approve: true });
      await ctx.request
        .post("/changeTeamName")
        .send({ oldName: "Owls", newName: "Bats", pin });

      const updated = waitFor(socket, "teamUpdated");
      const res = await admin("/admin/editUser", {
        oldName: "Owls",
        newName: "Hawks",
        description: "Table 3",
      });
      expect(res.body).toEqual({ success: true });
      expect(await updated).toMatchObject({
        teamName: "Hawks",
        description: "Table 3",
      });
      // Editing discards any pending name change.
      expect(await listUsers()).toEqual([
        { teamName: "Hawks", approved: true, description: "Table 3" },
      ]);
    });

    it("allows keeping the same name", async () => {
      await registerTeam(ctx, null, "Owls");
      const res = await admin("/admin/editUser", {
        oldName: "Owls",
        newName: "Owls",
        description: "Table 3",
      });
      expect(res.status).toBe(200);
    });

    it("rejects a name another team uses", async () => {
      await registerTeam(ctx, null, "Owls");
      await registerTeam(ctx, null, "Hawks");
      const res = await admin("/admin/editUser", {
        oldName: "Owls",
        newName: "Hawks",
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown team", async () => {
      const res = await admin("/admin/editUser", {
        oldName: "Ghosts",
        newName: "Spirits",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/removeUser", () => {
    it("removes the team and notifies its socket", async () => {
      const socket = await ctx.connect();
      await registerTeam(ctx, socket, "Owls", { approve: true });

      const removed = waitFor(socket, "registrationRemoved");
      const res = await admin("/admin/removeUser", { teamName: "Owls" });
      expect(res.body).toEqual({ success: true });
      expect((await removed).teamName).toBe("Owls");
      expect(await listUsers()).toEqual([]);
    });

    it("removes a team that has no connected socket", async () => {
      await registerTeam(ctx, null, "Owls");
      const res = await admin("/admin/removeUser", { teamName: "Owls" });
      expect(res.status).toBe(200);
      expect(await listUsers()).toEqual([]);
    });

    it("returns 404 for an unknown team", async () => {
      const res = await admin("/admin/removeUser", { teamName: "Ghosts" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/reset", () => {
    it("clears the history and tells every client", async () => {
      const team = await ctx.connect();
      const mainScreen = await ctx.connect();
      const pin = await registerTeam(ctx, team, "Owls", { approve: true });

      const pressed = waitFor(team, "updatePresses");
      team.emit("buzzerPress", { pin });
      await pressed;
      expect((await ctx.request.get("/history")).body).toHaveLength(1);

      const resets = [waitFor(team, "reset"), waitFor(mainScreen, "reset")];
      const res = await admin("/admin/reset");
      expect(res.body).toEqual({ success: true });
      await Promise.all(resets);
      expect((await ctx.request.get("/history")).body).toEqual([]);
    });
  });
});
