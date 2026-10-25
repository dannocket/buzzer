import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTeam, startServer, waitFor } from "./helpers.js";

describe("team registration", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.stop();
  });

  describe("POST /register", () => {
    it("returns an 8-character hex PIN", async () => {
      const res = await ctx.request
        .post("/register")
        .send({ teamName: "Owls", socketId: "abc" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pin).toMatch(/^[0-9a-f]{8}$/);
    });

    it("rejects a duplicate team name", async () => {
      await ctx.request.post("/register").send({ teamName: "Owls" });
      const res = await ctx.request.post("/register").send({ teamName: "Owls" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Team name already registered" });
    });

    it("tolerates a request with no body", async () => {
      const res = await ctx.request.post("/register");
      expect(res.status).toBe(200);
    });

    it("lists the new team as unapproved for admins", async () => {
      await ctx.request.post("/register").send({ teamName: "Owls" });
      const res = await ctx.request
        .get("/admin/users")
        .set("Authorization", ctx.authHeader);
      expect(res.body).toEqual([{ teamName: "Owls", approved: false }]);
    });
  });

  describe("POST /reRegister", () => {
    it("rejects an unapproved team", async () => {
      const pin = await registerTeam(ctx, null, "Owls");
      const res = await ctx.request
        .post("/reRegister")
        .send({ pin, socketId: "new" });
      expect(res.status).toBe(401);
    });

    it("rejects an unknown PIN", async () => {
      const res = await ctx.request
        .post("/reRegister")
        .send({ pin: "deadbeef", socketId: "new" });
      expect(res.status).toBe(401);
    });

    it("restores an approved team and reports whether it has buzzed", async () => {
      const first = await ctx.connect();
      const pin = await registerTeam(ctx, first, "Owls", { approve: true });
      await ctx.request
        .post("/admin/editUser")
        .set("Authorization", ctx.authHeader)
        .send({ oldName: "Owls", newName: "Owls", description: "Night crew" });

      // A new socket takes over the team, so it should be allowed to buzz.
      const second = await ctx.connect();
      const before = await ctx.request
        .post("/reRegister")
        .send({ pin, socketId: second.id });
      expect(before.body).toEqual({
        success: true,
        hasPressed: false,
        teamName: "Owls",
        description: "Night crew",
      });

      const pressed = waitFor(second, "updatePresses");
      second.emit("buzzerPress", { pin });
      await pressed;

      const after = await ctx.request
        .post("/reRegister")
        .send({ pin, socketId: second.id });
      expect(after.body.hasPressed).toBe(true);
    });
  });

  describe("POST /changeTeamName", () => {
    it("rejects a wrong PIN", async () => {
      await registerTeam(ctx, null, "Owls");
      const res = await ctx.request
        .post("/changeTeamName")
        .send({ oldName: "Owls", newName: "Hawks", pin: "deadbeef" });
      expect(res.status).toBe(401);
    });

    it("rejects a PIN that belongs to a different name", async () => {
      const pin = await registerTeam(ctx, null, "Owls");
      const res = await ctx.request
        .post("/changeTeamName")
        .send({ oldName: "Bats", newName: "Hawks", pin });
      expect(res.status).toBe(401);
    });

    it("rejects a name that is already taken", async () => {
      const pin = await registerTeam(ctx, null, "Owls");
      await registerTeam(ctx, null, "Hawks");
      const res = await ctx.request
        .post("/changeTeamName")
        .send({ oldName: "Owls", newName: "Hawks", pin });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "New team name already exists" });
    });

    it("records the request as pending for admins", async () => {
      const pin = await registerTeam(ctx, null, "Owls");
      const res = await ctx.request
        .post("/changeTeamName")
        .send({ oldName: "Owls", newName: "Hawks", pin });
      expect(res.body).toEqual({
        success: true,
        message: "Name change request submitted for approval",
      });

      const users = await ctx.request
        .get("/admin/users")
        .set("Authorization", ctx.authHeader);
      expect(users.body).toEqual([
        { teamName: "Owls", approved: false, pendingNameChange: "Hawks" },
      ]);
    });
  });
});
