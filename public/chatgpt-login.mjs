#!/usr/bin/env node
// Standalone local sign-in helper. Requires Node.js 20+; no packages or API key.
import { createServer } from "node:http";
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const configDir = join(homedir(), ".config", "car-transport-software");
const registrationFile = join(configDir, "chatgpt-registration.json");
const outputFile = resolve("chatgpt-connection.json");
const arg = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };

async function atomicJson(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600, flag: "wx" });
  await rename(temp, file);
  await chmod(file, 0o600);
}

async function main() {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  let config;
  try { config = JSON.parse(await readFile(registrationFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Die lokale ChatGPT-Konfiguration ist beschädigt."); config = { hostId: `urn:uuid:${randomUUID()}`, clients: {} }; }
  await atomicJson(registrationFile, config);
  const selectedClient = process.argv.includes("--new-account") ? undefined : arg("--client-id") || config.lastClientId;
  if (selectedClient && !/^oaiapp_[A-Za-z0-9_-]+$/.test(selectedClient)) throw new Error("Ungültige Client-ID.");
  const selected = selectedClient ? config.clients[selectedClient] : undefined;
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  let complete;
  let fail;
  const result = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  let accepted = false;
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== "/auth/callback") { res.writeHead(404).end(); return; }
    if (accepted || url.searchParams.get("state") !== state) { res.writeHead(400).end("Ungueltige Anmeldeantwort."); return; }
    accepted = true;
    if (url.searchParams.has("error")) { res.writeHead(400).end("Anmeldung abgebrochen."); fail(new Error("ChatGPT-Anmeldung abgebrochen.")); return; }
    const clientId = url.searchParams.get("client_id") || selectedClient;
    const code = url.searchParams.get("code");
    if (!code || !clientId || !/^oaiapp_[A-Za-z0-9_-]+$/.test(clientId) || (selectedClient && selectedClient !== clientId)) {
      res.writeHead(400).end("Ungueltige Registrierung."); fail(new Error("Ungültige ChatGPT-Registrierung.")); return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Anmeldung empfangen. Bitte zum Anmeldeprogramm zurückkehren und warten, bis die Verbindungsdatei erstellt wurde.");
    complete({ code, clientId });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
  const authorize = new URL(`${issuer}/api/accounts/authorize`);
  authorize.search = new URLSearchParams({
    client_id: selectedClient || "dynamic_agent_client", ext_agent_host_id: config.hostId,
    ...(!selectedClient ? { agent_name_hint: "Car Transport Software" } : {}),
    ...(selected?.email ? { login_hint: selected.email } : {}),
    response_type: "code", redirect_uri: redirectUri,
    scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource, state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  const timer = setTimeout(() => fail(new Error("Anmeldung nach 10 Minuten abgelaufen. Bitte erneut starten.")), 600000);
  try {
    console.log("Mit ChatGPT anmelden und die Verwendung deines Abos erlauben:");
    console.log(authorize.href);
    const command = process.platform === "win32" ? "rundll32" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", authorize.href] : [authorize.href];
    const browser = spawn(command, args, { stdio: "ignore", shell: false });
    browser.on("error", () => console.log("Bitte den obigen Link im Browser öffnen."));
    const { code, clientId } = await result;
    // Retain issued registration even if exchange fails; never save dynamic_agent_client.
    config.clients[clientId] ??= {};
    config.lastClientId = clientId;
    await atomicJson(registrationFile, config);
    const response = await fetch(`${issuer}/api/accounts/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri, resource }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Token-Austausch fehlgeschlagen. Bitte das Programm erneut starten.");
    const tokens = await response.json();
    if (tokens.token_type !== "Bearer" || !tokens.access_token || !tokens.refresh_token || !tokens.id_token || !Number.isInteger(tokens.expires_in) || tokens.expires_in <= 0) throw new Error("Unvollständige ChatGPT-Verbindung.");
    const scopes = typeof tokens.scope === "string" ? tokens.scope.split(" ") : [];
    if (!scopes.includes("chatgpt.tokens.use.direct") || !scopes.includes("resource.invoke")) throw new Error("Die Verwendung des ChatGPT-Abos wurde nicht freigegeben. Bitte erneut anmelden und erlauben.");
    const parts = tokens.id_token.split(".");
    if (parts.length !== 3) throw new Error("Ungültiges ID-Token.");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!["RS256", "ES256"].includes(header.alg)) throw new Error("Nicht unterstützte ID-Signatur.");
    const keysResponse = await fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(20000) });
    if (!keysResponse.ok) throw new Error("Identität konnte nicht überprüft werden.");
    const keys = (await keysResponse.json()).keys;
    const jwk = keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg) && (!key.use || key.use === "sig") && key.kty === (header.alg === "RS256" ? "RSA" : "EC"));
    if (!jwk) throw new Error("Identität konnte nicht überprüft werden.");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    if (!verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))) throw new Error("Ungültige ID-Signatur.");
    const identity = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Date.now() / 1000;
    const audience = Array.isArray(identity.aud) ? identity.aud : [identity.aud];
    if (identity.iss !== issuer || !audience.includes(clientId) || typeof identity.exp !== "number" || identity.exp <= now || typeof identity.iat !== "number" || identity.iat > now + 5 || (identity.nbf && identity.nbf > now + 5) || identity.nonce !== nonce || !identity.sub || !identity.email || (selected?.subject && selected.subject !== identity.sub)) throw new Error("Die ChatGPT-Identität konnte nicht bestätigt werden.");
    config.clients[clientId] = { subject: identity.sub, email: identity.email };
    await atomicJson(registrationFile, config);
    await atomicJson(outputFile, { issuer, subject: identity.sub, email: identity.email, client_id: clientId, ext_agent_host_id: config.hostId,
      id_token: tokens.id_token, access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_type: tokens.token_type,
      expires_in: tokens.expires_in, scopes, saved_at: new Date().toISOString(), nonce });
    console.log(`Verbunden als ${identity.email}.`);
    console.log(`Verbindungsdatei: ${outputFile}`);
    console.log("Diese Datei jetzt unter Einstellungen → KI importieren. Danach die Datei löschen; der Server übernimmt die Token-Erneuerung.");
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  }
}
main().catch((error) => { console.error(error.message || "Anmeldung fehlgeschlagen."); process.exitCode = 1; });
