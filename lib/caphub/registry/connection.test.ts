import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseRegistryConnection } from "./connection";

const roots: string[] = [];
const MANAGED_HOSTS = ["registry.example.test", "registry-pooler.example.test"];

function createPrivateHome(): { home: string; socketDir: string } {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-registry-connection-")));
  roots.push(root);
  chmodSync(root, 0o700);
  const home = join(root, "home");
  const socketDir = join(home, "run", "caphub-postgres");
  mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  chmodSync(home, 0o700);
  chmodSync(join(home, "run"), 0o700);
  chmodSync(socketDir, 0o700);
  return { home, socketDir };
}

function localUrl(socketDir: string, user = "caphub_app"): string {
  return `postgresql://${user}@localhost/caphub?host=${encodeURIComponent(socketDir)}&port=54329`;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("parseRegistryConnection", () => {
  it("accepts only the derived private local socket for each fixed Registry role", () => {
    const { home, socketDir } = createPrivateHome();

    expect(parseRegistryConnection({
      databaseUrl: localUrl(socketDir),
      mode: "local_socket",
      role: "application",
      resolvedHome: home
    })).toEqual({
      host: socketDir,
      port: 54_329,
      database: "caphub",
      user: "caphub_app",
      ssl: false
    });

    expect(parseRegistryConnection({
      databaseUrl: localUrl(socketDir, "caphub_migrator"),
      mode: "local_socket",
      role: "migration",
      resolvedHome: home
    })).toEqual({
      host: socketDir,
      port: 54_329,
      database: "caphub",
      user: "caphub_migrator",
      ssl: false
    });
  });

  it.each([
    ["password", (socket: string) => `postgresql://caphub_app:secret@localhost/caphub?host=${encodeURIComponent(socket)}&port=54329`],
    ["TCP host", (socket: string) => `postgresql://caphub_app@db.example.test/caphub?host=${encodeURIComponent(socket)}&port=54329`],
    ["alternate socket", () => "postgresql://caphub_app@localhost/caphub?host=%2Ftmp%2Fother&port=54329"],
    ["migration role", (socket: string) => localUrl(socket, "caphub_migrator")],
    ["database", (socket: string) => `postgresql://caphub_app@localhost/postgres?host=${encodeURIComponent(socket)}&port=54329`],
    ["port", (socket: string) => `postgresql://caphub_app@localhost/caphub?host=${encodeURIComponent(socket)}&port=5432`],
    ["unknown query", (socket: string) => `${localUrl(socket)}&application_name=override`],
    ["TLS override", (socket: string) => `${localUrl(socket)}&sslmode=disable`]
  ])("rejects a local-socket URL with %s", (_label, mutate) => {
    const { home, socketDir } = createPrivateHome();
    expect(() => parseRegistryConnection({
      databaseUrl: mutate(socketDir),
      mode: "local_socket",
      role: "application",
      resolvedHome: home
    })).toThrow();
  });

  it("rejects non-private and symlinked local socket directories", () => {
    const first = createPrivateHome();
    chmodSync(first.socketDir, 0o770);
    expect(() => parseRegistryConnection({
      databaseUrl: localUrl(first.socketDir),
      mode: "local_socket",
      role: "application",
      resolvedHome: first.home
    })).toThrow();

    const second = createPrivateHome();
    const actualSocket = join(second.home, "actual-socket");
    mkdirSync(actualSocket, { mode: 0o700 });
    rmSync(second.socketDir, { recursive: true });
    symlinkSync(actualSocket, second.socketDir);
    expect(() => parseRegistryConnection({
      databaseUrl: localUrl(second.socketDir),
      mode: "local_socket",
      role: "application",
      resolvedHome: second.home
    })).toThrow();
  });

  it("accepts a password-bearing managed URL only with verified TLS", () => {
    const { home } = createPrivateHome();
    expect(parseRegistryConnection({
      databaseUrl: "postgresql://caphub_app:p%40ssword@registry.example.test:6543/caphub",
      mode: "tls_verify_full",
      role: "application",
      resolvedHome: home,
      managedHosts: MANAGED_HOSTS
    })).toEqual({
      host: "registry.example.test",
      port: 6_543,
      database: "caphub",
      user: "caphub_app",
      password: "p@ssword",
      ssl: { rejectUnauthorized: true }
    });
  });

  it("accepts only an explicitly approved managed host and TLS query parameters", () => {
    const { home } = createPrivateHome();
    expect(parseRegistryConnection({
      databaseUrl: "postgresql://caphub_app:secret@registry-pooler.example.test:6543/caphub?sslmode=require&channel_binding=require",
      mode: "tls_verify_full",
      role: "application",
      resolvedHome: home,
      managedHosts: MANAGED_HOSTS
    })).toMatchObject({
      host: "registry-pooler.example.test",
      port: 6543,
      ssl: { rejectUnauthorized: true }
    });

    expect(() => parseRegistryConnection({
      databaseUrl: "postgresql://caphub_app:secret@unapproved.neon.tech/caphub?sslmode=require",
      mode: "tls_verify_full",
      role: "application",
      resolvedHome: home,
      managedHosts: MANAGED_HOSTS
    })).toThrow("approved managed host");
  });

  it.each([
    "postgresql://caphub_app:secret@localhost/caphub",
    "postgresql://caphub_app:secret@127.0.0.1/caphub",
    "postgresql://caphub_app:secret@[::1]/caphub",
    "postgresql://caphub_app:secret@registry.example.test./caphub",
    "postgresql://caphub_app@registry.example.test/caphub",
    "postgresql://other:secret@registry.example.test/caphub",
    "postgresql://caphub_app:secret@registry.example.test/postgres",
    "postgresql://caphub_app:secret@registry.example.test/caphub?sslmode=disable"
  ])("rejects an unsafe managed Registry URL: %s", (databaseUrl) => {
    const { home } = createPrivateHome();
    expect(() => parseRegistryConnection({
      databaseUrl,
      mode: "tls_verify_full",
      role: "application",
      resolvedHome: home,
      managedHosts: MANAGED_HOSTS
    })).toThrow();
  });
});
