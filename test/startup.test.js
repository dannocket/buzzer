import os from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLanAddresses, logRoleUrls } from "../server.js";

const interfaces = {
  lo0: [
    { family: "IPv4", internal: true, address: "127.0.0.1" },
    { family: "IPv6", internal: true, address: "::1" },
  ],
  en0: [
    { family: "IPv6", internal: false, address: "fe80::1" },
    { family: "IPv4", internal: false, address: "192.168.1.20" },
  ],
  en1: [{ family: "IPv4", internal: false, address: "10.0.0.5" }],
};

describe("startup output", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists external IPv4 addresses only", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue(interfaces);
    expect(getLanAddresses()).toEqual(["192.168.1.20", "10.0.0.5"]);
  });

  it("prints each role URL per host, labelling only the first", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue(interfaces);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logRoleUrls(3000);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "User:   http://localhost:3000/",
      "        http://192.168.1.20:3000/",
      "        http://10.0.0.5:3000/",
      "Main:   http://localhost:3000/main",
      "        http://192.168.1.20:3000/main",
      "        http://10.0.0.5:3000/main",
      "Admin:  http://localhost:3000/admin",
      "        http://192.168.1.20:3000/admin",
      "        http://10.0.0.5:3000/admin",
    ]);
  });
});
