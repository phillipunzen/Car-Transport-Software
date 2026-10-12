import http from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { mkdir, mkdtemp, chmod, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodexRpc } from "./codex-rpc.mjs";

const exec = promisify(execFile);
const secret = process.env.CODEX_BRIDGE_SECRET;
if (!secret || secret.length < 32) throw new Error("CODEX_BRIDGE_SECRET muss mindestens 32 Zeichen enthalten.");
const secretHash = createHash("sha256").update(`Bearer ${secret}`).digest();
const home = process.env.CODEX_APP_HOME || "/data/codex";
const cwd = await mkdtemp(path.join(tmpdir(), "car-codex-worker-"));
await mkdir(home, { recursive: true, mode: 0o700 });
await chmod(home, 0o700);
let rpcPromise;
let login = null;
let queue = Promise.resolve();
let queued = 0;

async function rpc() {
  rpcPromise ??= (async () => {
    const client = new CodexRpc({ home, cwd, command: process.env.CODEX_APP_COMMAND || "codex", onNotification: (event) => {
      if (event.method === "account/login/completed" && login?.loginId === event.params.loginId) {
        login.status = event.params.success ? "completed" : "failed";
      }
      if (event.method === "bridge/closed") { rpcPromise = undefined; if (login?.status === "pending") login.status = "failed"; }
    } });
    try { await client.initialize(); return client; }
    catch (error) { client.close(); rpcPromise = undefined; throw error; }
  })();
  return rpcPromise;
}

function serialize(task, signal) {
  if (queued >= 16) throw new Error("Codex ist ausgelastet. Bitte später erneut versuchen.");
  queued++;
  const run = queue.then(() => { if (signal?.aborted) throw new Error("Anfrage abgebrochen."); return task(); });
  queue = run.catch(() => {});
  return run.finally(() => queued--);
}

async function models(client) {
  const result = [];
  let cursor = null;
  do {
    const page = await client.request("model/list", { limit: 100, includeHidden: false, cursor });
    result.push(...page.data.filter((m) => !m.hidden && (!m.inputModalities || m.inputModalities.includes("image"))).map((m) => ({ model: m.model, displayName: m.displayName, isDefault: m.isDefault })));
    cursor = page.nextCursor;
  } while (cursor && result.length < 500);
  return result;
}

async function inputs(files, directory) {
  const input = [];
  if (!Array.isArray(files) || !files.length || files.length > 12) throw new Error("Bitte 1 bis 12 Bilder oder PDFs auswählen.");
  for (const [index, file] of files.entries()) {
    if (typeof file.data !== "string" || file.data.length > 28000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new Error("Ungültige oder zu große Datei.");
    const data = Buffer.from(file.data, "base64");
    if (!data.length) throw new Error("Leere Datei.");
    if (file.mimeType === "application/pdf") {
      const pdf = path.join(directory, `${index}.pdf`);
      await writeFile(pdf, data, { mode: 0o600 });
      const { stdout } = await exec("pdfinfo", [pdf], { timeout: 15000, maxBuffer: 100000 });
      const pages = Number(stdout.match(/^Pages:\s+(\d+)$/m)?.[1]);
      if (!pages || pages > 8) throw new Error("PDFs dürfen für die Codex-Erkennung höchstens 8 Seiten enthalten.");
      const prefix = path.join(directory, `${index}-page`);
      await exec("pdftoppm", ["-png", "-scale-to", "1600", pdf, prefix], { timeout: 30000, maxBuffer: 100000 });
      const rendered = (await readdir(directory)).filter((name) => name.startsWith(`${index}-page-`) && name.endsWith(".png")).sort();
      if (rendered.length !== pages) throw new Error("Die PDF konnte nicht vollständig gelesen werden.");
      input.push(...rendered.map((name) => ({ type: "localImage", path: path.join(directory, name) })));
    } else if (["image/jpeg", "image/png", "image/webp"].includes(file.mimeType)) {
      input.push({ type: "image", url: `data:${file.mimeType};base64,${file.data}` });
    } else throw new Error("Nicht unterstütztes Dateiformat.");
  }
  if (input.length > 12) throw new Error("Pro Erkennung sind höchstens 12 Bilder bzw. PDF-Seiten möglich.");
  return input;
}

async function route(url, body, signal) {
  const client = await rpc();
  if (url === "/status") {
    if (login?.status === "pending" && login.expiresAt < Date.now()) {
      await client.request("account/login/cancel", { loginId: login.loginId }).catch(() => {});
      login.status = "expired";
    }
    const { account } = await client.request("account/read", { refreshToken: false });
    const connected = account?.type === "chatgpt";
    return { connected, email: connected ? account.email : null, planType: connected ? account.planType : null, models: connected ? await models(client) : [], login };
  }
  if (url === "/login/start") {
    if (login?.status === "pending" && login.expiresAt > Date.now()) return login;
    const result = await client.request("account/login/start", { type: "chatgptDeviceCode" });
    if (result.type !== "chatgptDeviceCode" || result.verificationUrl !== "https://auth.openai.com/codex/device" || !result.loginId || !result.userCode) throw new Error("Ungültige Codex-Anmeldeantwort.");
    login = { ...result, status: "pending", expiresAt: Date.now() + 15 * 60000 };
    return login;
  }
  if (url === "/login/cancel") {
    if (body.loginId !== login?.loginId) throw new Error("Anmeldung nicht gefunden.");
    await client.request("account/login/cancel", { loginId: login.loginId });
    login = null;
    return { ok: true };
  }
  if (url === "/logout") {
    if (login?.status === "pending") await client.request("account/login/cancel", { loginId: login.loginId });
    await client.request("account/logout");
    login = null;
    return { ok: true };
  }
  if (url === "/extract") {
    const { account } = await client.request("account/read", { refreshToken: false });
    if (account?.type !== "chatgpt") throw new Error("Bitte den App-Administrator bitten, Codex erneut zu verbinden.");
    if (typeof body.instruction !== "string" || body.instruction.length > 20000 || body.schema?.type !== "object" || !(await models(client)).some((m) => m.model === body.model)) throw new Error("Ungültige Erkennungsanfrage oder nicht verfügbares Bildmodell.");
    const directory = await mkdtemp(path.join(cwd, "document-"));
    try {
      const input = await inputs(body.files, directory);
      input.push({ type: "text", text: "Lies die Daten aus den angehängten Dokumenten aus. Antworte ausschließlich im vorgegebenen JSON-Format." });
      const text = await client.extract({ input, model: body.model, instruction: body.instruction, schema: body.schema, cwd: directory, signal });
      return { data: JSON.parse(text) };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  throw new Error("Unbekannte Anfrage.");
}

const allowed = new Set(["/status", "/login/start", "/login/cancel", "/logout", "/extract"]);
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const respond = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
  if (req.url === "/health" && req.method === "GET") { respond(200, { status: "ok" }); return; }
  const supplied = createHash("sha256").update(req.headers.authorization || "").digest();
  if (!timingSafeEqual(supplied, secretHash)) { respond(401, { error: "Nicht autorisiert." }); return; }
  if (req.method !== "POST" || !allowed.has(req.url)) { respond(404, { error: "Nicht gefunden." }); return; }
  try {
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 35000000) { respond(413, { error: "Dateien sind zu groß." }); return; }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const result = await serialize(() => route(req.url, body, controller.signal), controller.signal);
    respond(200, result);
  } catch { respond(502, { error: "Codex-Anfrage fehlgeschlagen. Bitte Anmeldung, Dateiformat und Kontingent prüfen. PDFs: maximal 8 Seiten; insgesamt maximal 12 Bilder/Seiten." }); }
});
server.requestTimeout = 180000;
server.listen(Number(process.env.CODEX_BRIDGE_PORT || 3100), "0.0.0.0");
async function shutdown() {
  server.close();
  if (rpcPromise) (await rpcPromise.catch(() => null))?.close();
  await rm(cwd, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
