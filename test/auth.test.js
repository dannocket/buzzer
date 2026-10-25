import { afterEach, describe, expect, it } from "vitest";
import { basicAuth, startServer } from "./helpers.js";

describe("admin authentication", () => {
  let ctx;

  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  it("rejects requests without credentials", async () => {
    ctx = await startServer();
    const res = await ctx.request.post("/admin/login");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "No credentials sent!" });
  });

  it.each([
    ["wrong username", basicAuth("root", "test-pass")],
    ["wrong password", basicAuth("admin", "nope")],
    ["no colon separator", "Basic " + Buffer.from("admintest-pass").toString("base64")],
    ["missing encoded part", "Basic"],
    ["garbage base64", "Basic !!!not-base64!!!"],
  ])("rejects %s", async (_label, header) => {
    ctx = await startServer();
    const res = await ctx.request
      .post("/admin/login")
      .set("Authorization", header);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });

  it("accepts the correct password", async () => {
    ctx = await startServer();
    const res = await ctx.request
      .post("/admin/login")
      .set("Authorization", ctx.authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("accepts passwords containing colons and Latin-1 characters", async () => {
    const adminPassword = "a:b:cé";
    ctx = await startServer({ adminPassword });
    const res = await ctx.request
      .post("/admin/login")
      .set("Authorization", basicAuth("admin", adminPassword));
    expect(res.status).toBe(200);
  });

  it.each([
    ["get", "/admin/users"],
    ["post", "/admin/approve"],
    ["post", "/admin/approveNameChange"],
    ["post", "/admin/editUser"],
    ["post", "/admin/removeUser"],
    ["post", "/admin/reset"],
  ])("guards %s %s", async (method, route) => {
    ctx = await startServer();
    const res = await ctx.request[method](route).set(
      "Authorization",
      basicAuth("admin", "wrong")
    );
    expect(res.status).toBe(401);
  });
});
