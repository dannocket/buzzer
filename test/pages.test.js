import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "./helpers.js";

describe("pages", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.stop();
  });

  it.each([
    ["/", "page-user"],
    ["/main", "page-main"],
    ["/admin", "page-admin"],
  ])("serves %s", async (route, bodyClass) => {
    const res = await ctx.request.get(route);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain(`class="${bodyClass}"`);
  });
});
