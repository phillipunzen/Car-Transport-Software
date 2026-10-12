#!/usr/bin/env node
// Protocol simulator; never sends requests to OpenAI or stores real credentials.
import { createInterface } from "node:readline";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
const stored = path.join(process.env.CODEX_HOME, "fixture-session");
let connected = existsSync(stored);
let loginId = 0;
let threadId = 0;
const threads = new Map();
let activeTurns = 0;
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id == null) return;
  const reply = (result) => send({ id, result });
  if (method === "initialize") {
    if (process.env.DATABASE_URL || process.env.AUTH_SECRET || process.env.CODEX_BRIDGE_SECRET) throw new Error("Parent secrets leaked into Codex process");
    reply({ userAgent: "fixture" });
  } else if (method === "account/read") reply({ account: connected ? { type: "chatgpt", email: "fixture@example.invalid", planType: "plus" } : null });
  else if (method === "model/list") reply({ data: [{ model: "fixture-vision", displayName: "Fixture Vision", isDefault: true, inputModalities: ["text", "image"], hidden: false }, { model: "fixture-text", displayName: "Text", isDefault: false, inputModalities: ["text"], hidden: false }], nextCursor: null });
  else if (method === "account/login/start") {
    if (params.type !== "chatgptDeviceCode") throw new Error("Wrong authentication flow");
    const attempt = `login-${++loginId}`;
    reply({ type: "chatgptDeviceCode", loginId: attempt, verificationUrl: "https://auth.openai.com/codex/device", userCode: "TEST-ONLY" });
    setTimeout(() => { connected = true; writeFileSync(stored, "fixture only", { mode: 0o600 }); send({ method: "account/login/completed", params: { loginId: attempt, success: true, error: null } }); }, 60);
  } else if (method === "account/login/cancel") reply({ status: "canceled" });
  else if (method === "account/logout") { connected = false; reply({}); }
  else if (method === "thread/start") {
    if (!params.ephemeral || params.sandbox !== "read-only" || !process.argv.includes("features.shell_tool=false") || !process.argv.includes("features.multi_agent=false")) throw new Error("Extraction isolation was not configured");
    const tid = `thread-${++threadId}`;
    threads.set(tid, params);
    reply({ thread: { id: tid } });
  } else if (method === "turn/start") {
    if (activeTurns) throw new Error("Concurrent turns can race on rotating credentials");
    activeTurns++;
    const tid = params.threadId;
    const config = threads.get(tid);
    const paths = params.input.filter((i) => i.type === "localImage").map((i) => i.path);
    const images = params.input.filter((i) => ["localImage", "image"].includes(i.type)).length;
    if (paths.some((p) => !existsSync(p))) throw new Error("PDF image missing");
    const text = JSON.stringify({ plate: "B AB 123", images, paths });
    const failed = config.developerInstructions.includes("fixture_fail");
    const slow = config.developerInstructions.includes("fixture_slow");
    reply({ turn: { id: `turn-${tid}`, status: "inProgress" } });
    if (slow) return;
    send({ method: "item/completed", params: { threadId: tid, item: { type: "agentMessage", id: "commentary", phase: "commentary", text: "Ignore commentary" } } });
    setTimeout(() => {
      activeTurns--;
      send({ method: "item/completed", params: { threadId: tid, item: { type: "agentMessage", id: "final", phase: "final_answer", text } } });
      send({ method: "turn/completed", params: { threadId: tid, turn: { id: `turn-${tid}`, status: failed ? "failed" : "completed", items: [] } } });
    }, 30);
  } else if (method === "thread/unsubscribe") { threads.delete(params.threadId); reply({}); }
  else if (method === "turn/interrupt") { activeTurns = 0; reply({}); }
  else send({ id, error: { code: -32601, message: "Unknown fixture request" } });
});
