import { spawn, type ChildProcess } from "node:child_process";
import { chmod, copyFile, mkdtemp, rm, stat, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import PDFDocument from "pdfkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let worker: ChildProcess;
let directory: string;
let base: string;
const secret = "fixture-bridge-secret-at-least-32-characters";
const schema = { type: "object", properties: { plate: { type: "string" }, images: { type: "integer" }, paths: { type: "array", items: { type: "string" } } }, required: ["plate", "images", "paths"], additionalProperties: false };
const request = (route: string, body: unknown = {}, auth = secret) => fetch(base + route, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "car-codex-test-"));
  const command = path.join(directory, "fake-codex.mjs");
  await copyFile(path.join(process.cwd(), "tests/fixtures/codex-app-server.mjs"), command);
  await chmod(command, 0o700);
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, ["scripts/codex-bridge.mjs"], {
    cwd: process.cwd(), env: { ...process.env, CODEX_BRIDGE_SECRET: secret, CODEX_BRIDGE_PORT: String(port), CODEX_APP_HOME: path.join(directory, "session"), CODEX_APP_COMMAND: command, AUTH_SECRET: "must-not-be-forwarded", DATABASE_URL: "must-not-be-forwarded" }, stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (worker.exitCode != null) throw new Error("Bridge exited");
    if (await fetch(base + "/health").then((r) => r.ok).catch(() => false)) return;
    await wait(30);
  }
  throw new Error("Bridge did not start");
}, 15000);
afterAll(async () => {
  if (worker?.exitCode == null) {
    const exited = new Promise<void>((resolve) => worker.once("exit", () => resolve()));
    worker.kill("SIGTERM");
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("private Codex bridge protocol", () => {
  it("rejects unauthenticated requests and arbitrary Codex RPCs", async () => {
    expect((await request("/status", {}, "wrong-secret")).status).toBe(401);
    expect((await request("/command/exec")).status).toBe(404);
  });
  it("completes the device flow and lists only image-capable models", async () => {
    expect((await (await request("/status")).json()).connected).toBe(false);
    const login = await (await request("/login/start")).json();
    expect(login).toMatchObject({ status: "pending", verificationUrl: "https://auth.openai.com/codex/device", userCode: "TEST-ONLY" });
    await wait(100);
    const status = await (await request("/status")).json();
    expect(status).toMatchObject({ connected: true, login: { status: "completed" } });
    expect(status.models.map((m: { model: string }) => m.model)).toEqual(["fixture-vision"]);
    expect((await stat(path.join(directory, "session"))).mode & 0o777).toBe(0o700);
  });
  it("uses independent ephemeral threads and accepts only final completed answers", async () => {
    const body = { files: [{ mimeType: "image/jpeg", data: Buffer.from("fixture-image").toString("base64") }], model: "fixture-vision", instruction: "extract", schema };
    const results = await Promise.all([request("/extract", body), request("/extract", body)]);
    for (const response of results) expect(await response.json()).toEqual({ data: { plate: "B AB 123", images: 1, paths: [] } });
    expect((await request("/extract", { ...body, instruction: "fixture_fail" })).status).toBe(502);
    expect((await request("/extract", { ...body, model: "fixture-text" })).status).toBe(502);
  });
  it("interrupts abandoned inference and makes the session available to the next request", async () => {
    const body = { files: [{ mimeType: "image/jpeg", data: Buffer.from("fixture-image").toString("base64") }], model: "fixture-vision", instruction: "fixture_slow", schema };
    const controller = new AbortController();
    const pending = fetch(base + "/extract", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    await wait(80); controller.abort(); await rejected;
    const next = await request("/extract", { ...body, instruction: "extract" });
    expect(next.status).toBe(200);
  });
  it.skipIf(!process.env.CODEX_TEST_PDF)("renders every PDF page and removes temporary images afterward", async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    const pdf = new Promise<Buffer>((resolve) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); });
    doc.text("Page 1"); doc.addPage().text("Page 2"); doc.end();
    const response = await request("/extract", { files: [{ mimeType: "application/pdf", data: (await pdf).toString("base64") }], model: "fixture-vision", instruction: "extract", schema });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.data.images).toBe(2);
    for (const filename of result.data.paths) await expect(access(filename)).rejects.toThrow();
  });
  it("signs out without exposing credentials", async () => {
    expect((await request("/logout")).status).toBe(200);
    const status = await (await request("/status")).json();
    expect(status.connected).toBe(false);
    expect(status.login).toBe(null);
  });
});
