// CareerQuest World server: serves the site and relays presence, chat and choices per room.
// One small Node process, one dependency (ws). Runs on a laptop, a Raspberry Pi,
// a university VM or any container host.
//
// Privacy by design: no accounts, no chat logs, no names stored.
// The only thing written to disk is anonymous choice counts per mission step.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "server", "data");
const ROOM_CAP = +process.env.ROOM_CAP || 60;
const MAX_MSG = 1024;
const RATE = 30; // messages per second per connection

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8"
};
const PUBLIC = new Set(["index.html", "main.js", "missions.js", "net.js", "config.js"]);

// ---------- anonymous choice tallies ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
const TALLY_FILE = path.join(DATA_DIR, "tallies.json");
let tallies = {};
try { tallies = JSON.parse(fs.readFileSync(TALLY_FILE, "utf8")); } catch {}
let dirty = false;
function saveTallies() {
  if (!dirty) return;
  dirty = false;
  fs.writeFileSync(TALLY_FILE + ".tmp", JSON.stringify(tallies));
  fs.renameSync(TALLY_FILE + ".tmp", TALLY_FILE);
}
setInterval(saveTallies, 5000).unref();
// hosts stop containers with SIGTERM; save before going
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { saveTallies(); process.exit(0); });

// ---------- http ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") {
    const online = [...rooms.values()].reduce((n, r) => n + r.size, 0);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, online }));
  }
  if (url.pathname === "/tallies.json") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    return res.end(JSON.stringify(tallies));
  }
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const isVendor = rel.startsWith("vendor/") && !rel.includes("..");
  if (!PUBLIC.has(rel) && !isVendor) { res.writeHead(404); return res.end("not found"); }
  fs.readFile(path.join(ROOT, rel), (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "content-type": MIME[path.extname(rel)] || "application/octet-stream",
      "cache-control": isVendor ? "public, max-age=604800, immutable" : "no-cache"
    });
    res.end(buf);
  });
});

// ---------- rooms ----------
const rooms = new Map(); // room -> Map(id -> client)
let nextId = 1;
const cleanRoom = (s) => (String(s || "lobby").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "lobby");
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const [id, c] of rooms.get(room) || []) if (id !== exceptId && c.ws.readyState === 1) c.ws.send(data);
}
const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MSG });
wss.on("connection", (ws, req) => {
  const room = cleanRoom(new URL(req.url, "http://x").searchParams.get("room"));
  if (!rooms.has(room)) rooms.set(room, new Map());
  const members = rooms.get(room);
  if (members.size >= ROOM_CAP) { send(ws, { t: "full" }); return ws.close(); }

  const id = String(nextId++);
  const client = { ws, state: null, alive: true, budget: RATE, last: Date.now() };
  members.set(id, client);
  send(ws, {
    t: "hello", id,
    peers: [...members].filter(([pid, c]) => pid !== id && c.state).map(([pid, c]) => ({ id: pid, ...c.state })),
    tallies
  });

  ws.on("pong", () => (client.alive = true));
  ws.on("message", (raw) => {
    const now = Date.now();
    client.budget = Math.min(RATE, client.budget + ((now - client.last) / 1000) * RATE);
    client.last = now;
    if (client.budget < 1) return;
    client.budget -= 1;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === "state") {
      client.state = {
        n: String(m.n || "guest").slice(0, 20), c: /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : "#1E3765",
        x: num(m.x, 40), z: num(m.z, 40), r: num(m.r, 10), zn: typeof m.zn === "string" ? m.zn.slice(0, 20) : null, m: !!m.m
      };
      broadcast(room, { t: "state", id, ...client.state }, id);
    } else if (m.t === "chat") {
      const text = String(m.text || "").trim().slice(0, 200);
      if (text) broadcast(room, { t: "chat", id, text }, id);
    } else if (m.t === "choice") {
      const key = `${String(m.m).slice(0, 20)}:${num(m.s, 9)}`;
      const k = num(m.k, 9);
      tallies[key] ||= {};
      tallies[key][k] = (tallies[key][k] || 0) + 1;
      dirty = true;
      broadcast(room, { t: "choice", id, m: String(m.m).slice(0, 20), s: num(m.s, 9), k, total: tallies[key] }, null);
    }
  });
  ws.on("close", () => {
    members.delete(id);
    if (!members.size) rooms.delete(room);
    else broadcast(room, { t: "leave", id });
  });
});

// drop connections that stopped answering (closed laptop lids, lost wifi)
setInterval(() => {
  for (const members of rooms.values()) for (const c of members.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    c.ws.ping();
  }
}, 20000).unref();

server.listen(PORT, () => console.log(`CareerQuest World on http://localhost:${PORT}`));
