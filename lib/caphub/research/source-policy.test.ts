import { describe, expect, it } from "vitest";
import { ExactHttpsSourcePolicy } from "./source-policy";

describe("ExactHttpsSourcePolicy", () => {
  it("authorizes exact HTTPS origins and pins all public answers", async () => {
    const policy = new ExactHttpsSourcePolicy({
      allowedOrigins: ["https://allowed.example"],
      resolve: async () => ["8.8.8.8", "2606:4700:4700::1111"]
    });

    await expect(policy.authorize("https://allowed.example/path?q=1")).resolves.toMatchObject({
      origin: "https://allowed.example",
      hostname: "allowed.example",
      addresses: ["8.8.8.8", "2606:4700:4700::1111"]
    });
  });

  it.each([
    "http://allowed.example/path",
    "https://user:pass@allowed.example/path",
    "https://allowed.example/path#@evil.example",
    "https://evil.example/path",
    "https://127.0.0.1/admin",
    "https://[::1]/admin"
  ])("blocks unsafe URL %s", async (url) => {
    const policy = new ExactHttpsSourcePolicy({
      allowedOrigins: ["https://allowed.example", "https://127.0.0.1", "https://[::1]"],
      resolve: async () => ["8.8.8.8"]
    });
    await expect(policy.authorize(url)).rejects.toMatchObject({ code: "SOURCE_BLOCKED" });
  });

  it.each([
    ["10.0.0.1"],
    ["169.254.169.254"],
    ["224.0.0.1"],
    ["fc00::1"],
    ["fe80::1"],
    ["8.8.8.8", "192.168.1.1"]
  ])("rejects non-public or mixed DNS answers %j", async (...addresses) => {
    const policy = new ExactHttpsSourcePolicy({
      allowedOrigins: ["https://allowed.example"],
      resolve: async () => addresses
    });
    await expect(policy.authorize("https://allowed.example/path"))
      .rejects.toMatchObject({ code: "SOURCE_BLOCKED" });
  });
});
