import net from "node:net";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  KIMI_PROXY_TARGETS,
  authorizeKimiProxyTarget,
  startKimiEgressProxy
} from "./kimi-egress-proxy";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe("Kimi egress proxy", () => {
  it("allows only fixed HTTPS targets with exclusively public DNS answers", async () => {
    expect(KIMI_PROXY_TARGETS).toEqual(new Set(["api.kimi.com:443", "auth.kimi.com:443"]));
    await expect(authorizeKimiProxyTarget("api.kimi.com:443", async () => ["8.8.8.8"]))
      .resolves.toMatchObject({ hostname: "api.kimi.com", port: 443, addresses: ["8.8.8.8"] });
    await expect(authorizeKimiProxyTarget("evil.example:443", async () => ["8.8.8.8"]))
      .rejects.toMatchObject({ code: "PROXY_TARGET_DENIED" });
    await expect(authorizeKimiProxyTarget("api.kimi.com:443", async () => ["127.0.0.1"]))
      .rejects.toMatchObject({ code: "PROXY_ADDRESS_DENIED" });
    await expect(authorizeKimiProxyTarget("api.kimi.com:443", async () => ["8.8.8.8", "10.0.0.1"]))
      .rejects.toMatchObject({ code: "PROXY_ADDRESS_DENIED" });
  });

  it("binds loopback and rejects a disallowed CONNECT target without upstream traffic", async () => {
    const proxy = await startKimiEgressProxy({
      resolve: async () => ["8.8.8.8"],
      connect: async () => { throw new Error("must not connect"); }
    });
    closers.push(proxy.close);
    expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(proxy.port, "127.0.0.1", () => {
        socket.write("CONNECT evil.example:443 HTTP/1.1\r\n");
        setImmediate(() => socket.end("Proxy-Authorization: secret\r\n\r\n"));
      });
      let data = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => { data += chunk; });
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
    });
    expect(response).toContain("403");
    expect(response).not.toContain("secret");
  });

  it("rejects an upstream peer outside the vetted address set", async () => {
    const proxy = await startKimiEgressProxy({
      resolve: async () => ["8.8.8.8"],
      connect: async () => Object.assign(new PassThrough(), { remoteAddress: "1.1.1.1" })
    });
    closers.push(proxy.close);

    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(proxy.port, "127.0.0.1", () => {
        socket.end("CONNECT api.kimi.com:443 HTTP/1.1\r\n\r\n");
      });
      let data = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => { data += chunk; });
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
    });
    expect(response).toContain("502");
  });
});
