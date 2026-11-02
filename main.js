import * as THREE from "three";
import { MISSIONS, CAPS, CAP_COLOR, DEEP_TARGET } from "./missions.js";
import { connect } from "./net.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const AVATAR_COLORS = ["#DA291C", "#1E7A73", "#C68A1E", "#1E3765", "#6B4E9E", "#2E7D46"];
const WORLD_R = 26;
const ROOM = (new URLSearchParams(location.search).get("room") || "lobby").slice(0, 40);

// ---------- storage (per viewer, optional) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const passport = store.get("cqw-passport", { started: new Date().toISOString(), points: [], ai_events: [] });
const savePassport = () => store.set("cqw-passport", passport);

// ---------- scene ----------
const canvas = $("world");
// no WebGL (old laptops, some school machines) means the accessible view is the only view
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
} catch (err) { console.warn("WebGL unavailable, using accessible view", err); }
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#DCE6EA");
scene.fog = new THREE.Fog("#DCE6EA", 30, 70);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight("#ffffff", "#c9bfae", 1.6));
const sun = new THREE.DirectionalLight("#fff4e0", 1.4);
sun.position.set(12, 20, 8);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD_R + 14, 64), new THREE.MeshLambertMaterial({ color: "#E9E4D8" }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const plaza = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 64), new THREE.MeshBasicMaterial({ color: "#D3CCBD" }));
plaza.rotation.x = -Math.PI / 2;
plaza.position.y = 0.01;
scene.add(plaza);

function textSprite(lines, { color = "#111", bg = "rgba(255,255,255,.92)", size = 44, scale = 1 } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = (w) => `${w} ${size}px Inter, system-ui, sans-serif`;
  ctx.font = font(700);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.2;
  const h = lines.length * size * 1.3 + size * 0.6;
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, size * 0.5); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.font = font(i === 0 ? 700 : 500);
    ctx.fillStyle = i === 0 ? color : "#5A5A57";
    ctx.fillText(l, c.width / 2, size * 0.3 + size * 1.3 * (i + 0.5));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const k = 0.0062 * scale;
  s.scale.set(c.width * k, c.height * k, 1);
  return s;
}

// ---------- zones: three mission pavilions + the passport archive ----------
const zones = [];
const pulses = [];
const roofs = {};
function pavilion(mission, angle) {
  const x = Math.cos(angle) * 13, z = Math.sin(angle) * 13;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -angle - Math.PI / 2;
  const col = new THREE.Color(mission.color);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.7, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  g.add(ring); pulses.push(ring);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), new THREE.MeshLambertMaterial({ color: col.clone().lerp(new THREE.Color("#ffffff"), 0.82) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.015;
  g.add(floor);
  const pillarMat = new THREE.MeshLambertMaterial({ color: "#F8F6F1" });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 10), pillarMat);
    p.position.set(Math.cos(a) * 3.1, 1.6, Math.sin(a) * 3.1);
    g.add(p);
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.25, 6), new THREE.MeshLambertMaterial({ color: col, transparent: true }));
  roofs[mission.id] = roof.material;
  roof.position.y = 3.3;
  g.add(roof);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 0.7), new THREE.MeshLambertMaterial({ color: "#B9AE98" }));
  table.position.set(0, 0.375, -1.2);
  g.add(table);
  const sign = textSprite([mission.room, mission.cap], { color: mission.color });
  sign.position.set(0, 4.1, 0);
  g.add(sign);
  scene.add(g);
  zones.push({ id: mission.id, kind: "mission", x, z, r: 2.6, label: mission.room });
}
pavilion(MISSIONS.client, -Math.PI / 2);
pavilion(MISSIONS.studio, Math.PI / 6);
pavilion(MISSIONS.crit, (5 * Math.PI) / 6);

{
  const archive = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 32), new THREE.MeshLambertMaterial({ color: "#1E3765" }));
  base.position.y = 0.15;
  archive.add(base);
  CAPS.forEach((cap, i) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.2, 0.34), new THREE.MeshLambertMaterial({ color: CAP_COLOR[cap] }));
    const a = (i / 3) * Math.PI * 2;
    slab.position.set(Math.cos(a) * 0.45, 1.4, Math.sin(a) * 0.45);
    archive.add(slab);
  });
  const sign = textSprite(["PACE passport", "your traces live here"], { color: "#1E3765" });
  sign.position.y = 3.0;
  archive.add(sign);
  scene.add(archive);
  zones.push({ id: "passport", kind: "passport", x: 0, z: 0, r: 1.8, label: "Passport" });
}

// decorative trees in the outer ring (seeded so every visitor sees the same world)
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leaf = new THREE.MeshLambertMaterial({ color: "#8FB59A" });
  const trunk = new THREE.MeshLambertMaterial({ color: "#9A8468" });
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 14;
    const t = new THREE.Group();
    const h = 1.6 + rnd() * 1.6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 6), trunk);
    tr.position.y = 0.4;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7 + rnd() * 0.4, h, 7), leaf);
    cone.position.y = 0.8 + h / 2;
    t.add(tr, cone);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(t);
  }
}

// ---------- avatars ----------
function makeAvatar(color, name) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.6, 6, 14), mat);
  body.position.y = 0.66;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), new THREE.MeshLambertMaterial({ color: "#F3E6D6" }));
  head.position.y = 1.42;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: "#111" }));
  visor.position.set(0, 1.46, 0.24);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.14 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  const bodyGroup = new THREE.Group();
  bodyGroup.add(body, head, visor);
  g.add(bodyGroup, shadow);
  g.userData.body = bodyGroup;
  setLabel(g, name, color);
  scene.add(g);
  return g;
}
function setLabel(avatar, name, color) {
  if (avatar.userData.label) { avatar.remove(avatar.userData.label); avatar.userData.label.material.map.dispose(); }
  const l = textSprite([name || "guest"], { color, size: 40, scale: 0.75 });
  l.position.y = 1.95;
  avatar.add(l);
  avatar.userData.label = l;
}

// ---------- player + input ----------
const me = { name: "", color: AVATAR_COLORS[0], x: 0, z: 6, ry: Math.PI, zone: null, moving: false };
let player = null;
let camYaw = 0;
const keys = new Set();
let moveTarget = null;
let started = false;

const typing = () => ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
addEventListener("keydown", (e) => { if (!typing()) keys.add(e.key.toLowerCase()); });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());

const raycaster = new THREE.Raycaster();
let drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw: camYaw, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 6 || Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
  if (drag.moved) camYaw = drag.yaw - dx * 0.006;
});
canvas.addEventListener("pointerup", (e) => {
  if (drag && !drag.moved && started) {
    const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(p, camera);
    const hit = raycaster.intersectObject(ground)[0];
    if (hit) moveTarget = { x: hit.point.x, z: hit.point.z };
  }
  drag = null;
});

// ---------- network ----------
const peers = new Map();
let net = null;
let lastSent = "";

function peerName(id) { return peers.get(id)?.name || "someone"; }
function upsertPeer(id, d) {
  let p = peers.get(id);
  // panels only re-render when who-is-where changes, not on every step, so keyboard
  // and screen-reader focus is not thrown away while someone walks past
  let changed = false;
  if (!p) {
    p = { avatar: makeAvatar(d.c, d.n), name: d.n, color: d.c, x: d.x, z: d.z, ry: d.r, zone: d.zn || null };
    p.avatar.position.set(d.x, 0, d.z);
    peers.set(id, p);
    sysChat(`${d.n} is here`);
    changed = true;
  } else if (p.name !== d.n || p.color !== d.c) {
    p.name = d.n; p.color = d.c;
    p.avatar.userData.body.children[0].material.color.set(d.c);
    setLabel(p.avatar, d.n, d.c);
    changed = true;
  }
  if ((d.zn || null) !== p.zone) changed = true;
  Object.assign(p, { x: d.x, z: d.z, ry: d.r, zone: d.zn || null, moving: !!d.m });
  if (changed) { if (mission.mid) renderMission(); renderLite(); }
}
function removePeer(id) {
  const p = peers.get(id);
  if (!p) return;
  scene.remove(p.avatar);
  peers.delete(id);
  sysChat(`${p.name} left`);
  updateNet();
  if (mission.mid) renderMission();
  renderLite();
}
function myState() { return { n: me.name, c: me.color, x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.ry.toFixed(2), zn: me.zone, m: me.moving }; }
let netStatus = "connecting";
const NET_LABEL = { server: "CareerQuest server", p2p: "peer-to-peer", reconnecting: "reconnecting", full: "room full" };
function updateNet() {
  const on = !!net && netStatus !== "reconnecting";
  $("netDot").classList.toggle("on", on);
  $("netText").textContent = net
    ? `${peers.size + 1} online / ${NET_LABEL[netStatus] || netStatus}`
    : netStatus === "connecting" ? "connecting" : "solo (no connection)";
}

// live tallies from people in this room, keyed mission:step -> Map(peer -> choiceIndex)
const tallies = new Map();
function tally(key) { if (!tallies.has(key)) tallies.set(key, new Map()); return tallies.get(key); }
// all-time anonymous counts kept by the server, keyed mission:step -> {choiceIndex: count}
let allTime = {};

async function startNet() {
  net = await connect(ROOM, {
    state: (id, d) => { if (d && typeof d.x === "number") upsertPeer(id, { ...d, n: String(d.n || "guest").slice(0, 20) }); updateNet(); },
    chat: (id, d) => addChat(peerName(id), String(d?.t || "").slice(0, 200), peers.get(id)?.color),
    choice: (id, d) => { tally(`${d.m}:${d.s}`).set(id, d.k); if (mission.mid === d.m) renderMission(); },
    join: (id) => { net?.sendState(myState(), id); updateNet(); },
    leave: (id) => removePeer(id),
    // server only: a reconnect resends everyone, so start from a clean slate
    reset: () => { [...peers.keys()].forEach((id) => { scene.remove(peers.get(id).avatar); peers.delete(id); }); lastSent = ""; },
    tallies: (t) => { allTime = t; },
    total: (key, t) => { allTime[key] = t; if (mission.mid) renderMission(); },
    status: (s) => { netStatus = s; updateNet(); if (s === "server" && net) net.sendState(myState()); }
  });
  if (!net) netStatus = "solo";
  updateNet();
  if (net) setInterval(() => {
    const s = JSON.stringify(myState());
    if (s !== lastSent) { net.sendState(myState()); lastSent = s; }
  }, 100);
  // heartbeat so late joiners and lossy links still converge
  if (net) setInterval(() => net.sendState(myState()), 3000);
}

// ---------- chat ----------
function addChat(name, text, color = "#111") {
  if (!text) return;
  const d = document.createElement("div");
  d.innerHTML = `<b style="color:${esc(color)}">${esc(name)}</b> ${esc(text)}`;
  $("chatLog").append(d);
  $("chatLog").scrollTop = 1e9;
}
function sysChat(text) {
  const d = document.createElement("div");
  d.className = "sys"; d.textContent = text;
  $("chatLog").append(d);
  $("chatLog").scrollTop = 1e9;
}
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("chatInput").value.trim();
  if (!t) return;
  addChat(me.name, t, me.color);
  net?.sendChat({ t });
  $("chatInput").value = "";
  $("chatInput").blur();
});

// ---------- missions ----------
const mission = { mid: null, step: 0, picks: [], phase: "step" };
const letter = (i) => "ABC"[i];

function openMission(id) {
  mission.mid = id; mission.step = 0; mission.picks = []; mission.phase = "step";
  $("passport").classList.remove("open");
  $("mission").classList.add("open");
  renderMission();
  $("mission").querySelector("h2")?.focus();
}
function closeMission() {
  if (!mission.mid) return;
  mission.mid = null;
  $("mission").classList.remove("open");
  if (lite) $("lite").querySelector("button")?.focus();
}

function renderMission() {
  const m = MISSIONS[mission.mid];
  if (!m) return;
  const el = $("mission");
  el.style.setProperty("--accent", m.color);
  const here = [...peers.values()].filter((p) => p.zone === m.id).map((p) => esc(p.name));
  const presence = here.length
    ? `<div class="presence">Also in the ${esc(m.room)}: ${here.join(", ")}. Talk it through in chat before you choose.</div>`
    : `<div class="presence" style="color:var(--muted)">You're alone in here. Copy the invite link to bring a classmate.</div>`;
  let body = "";

  if (mission.phase === "step") {
    const st = m.steps[mission.step];
    const pick = mission.picks[mission.step];
    body += `<p class="prompt">${mission.step + 1} / ${m.steps.length}. ${esc(st.prompt)}</p><div class="choices">`;
    st.choices.forEach((c, i) => {
      body += `<button class="choice ${pick === i ? "picked" : ""}" data-i="${i}" ${pick != null ? "disabled" : ""}><b>${letter(i)}.</b> ${esc(c.label)}</button>`;
    });
    body += `</div>`;
    if (pick != null) {
      const c = st.choices[pick];
      body += `<div class="outcome" role="status"><div>${esc(c.outcome)}</div><div class="shows">${esc(c.shows)}</div></div>`;
      const key = `${m.id}:${mission.step}`;
      const t = tally(key);
      if (t.size) {
        const counts = [0, 0, 0];
        t.forEach((k) => { if (counts[k] != null) counts[k]++; });
        body += `<div class="others">Others here right now chose: ${counts.map((n, i) => `${letter(i)} ${n}`).join(" / ")}</div>`;
      }
      const all = allTime[key];
      if (all) {
        const counts = [0, 1, 2].map((i) => all[i] || 0);
        const sum = counts.reduce((a, b) => a + b, 0);
        body += `<div class="others">All students so far (${sum}): ${counts.map((n, i) => `${letter(i)} ${Math.round((n / sum) * 100)}%`).join(" / ")}</div>`;
      }
      const last = mission.step === m.steps.length - 1;
      body += `<div class="actions"><button class="btn" id="mNext">${last ? "Write your trace" : "Next situation"}</button></div>`;
    }
  } else if (mission.phase === "reflect") {
    body += `<p class="prompt">Turn this into a PACE trace</p>
      <div class="setup" style="font-size:13px">Your choices: ${mission.picks.map((k, s) => `${s + 1}${letter(k)}`).join(", ")}. Both reflections are needed for the trace to count as deepened.</div>
      <div class="q">${esc(m.reflect.cap)}</div><textarea id="rCap" aria-label="Capability reflection"></textarea>
      <div class="q">${esc(m.reflect.identity)}</div><textarea id="rId" aria-label="Identity reflection"></textarea>
      <div class="actions"><button class="btn" id="mSave">Save to passport</button></div>
      <div class="msg" id="mMsg"></div>`;
  } else {
    body += `<div class="outcome" style="margin-top:20px"><div class="shows" style="margin-top:0">Saved as a ${esc(m.cap)} trace.</div>
      <div style="margin-top:6px">Walk to the PACE passport in the centre to see your archive, or try another room.</div></div>
      <div class="actions"><button class="btn ghost" id="mAgain">Replay this room</button><button class="btn" id="mDone">Back to the world</button></div>`;
  }

  // keep typed reflections and keyboard focus when the panel re-renders for presence updates
  const draft = { cap: $("rCap")?.value, id: $("rId")?.value };
  const focused = el.contains(document.activeElement) ? (document.activeElement.id || document.activeElement.dataset.i) : null;
  el.innerHTML = `<button class="close" aria-label="Close">&times;</button>
    <span class="pill" style="background:${m.color}">${esc(m.cap)}</span>
    <h2 class="h" tabindex="-1" style="font-size:24px;margin-top:10px">${esc(m.title)}</h2>
    <div class="mono" style="color:var(--muted);margin-top:4px">${esc(m.room)}</div>
    <p class="setup">${esc(m.setup)}</p>${presence}${body}`;
  if (draft.cap != null && $("rCap")) { $("rCap").value = draft.cap; $("rId").value = draft.id; }
  if (focused != null) (el.querySelector(`#${CSS.escape(focused)}`) || el.querySelector(`[data-i="${focused}"]`))?.focus();

  el.querySelector(".close").onclick = closeMission;
  el.querySelectorAll(".choice").forEach((b) => b.onclick = () => {
    const k = +b.dataset.i;
    mission.picks[mission.step] = k;
    net?.sendChoice({ m: m.id, s: mission.step, k });
    renderMission();
    $("mNext")?.focus();
  });
  $("mNext") && ($("mNext").onclick = () => {
    if (mission.step < m.steps.length - 1) mission.step++;
    else mission.phase = "reflect";
    renderMission();
    (el.querySelector(".choice") || $("rCap"))?.focus();
  });
  $("mSave") && ($("mSave").onclick = () => saveTrace(m));
  $("mAgain") && ($("mAgain").onclick = () => openMission(m.id));
  $("mDone") && ($("mDone").onclick = closeMission);
}

function saveTrace(m) {
  const capR = $("rCap").value.trim(), idR = $("rId").value.trim();
  if (!capR && !idR) { $("mMsg").textContent = "Write at least one reflection first."; $("mMsg").style.color = "var(--connected)"; return; }
  const choices = mission.picks.map((k, s) => m.steps[s].choices[k].label);
  // same record shape as the PACE tool, so an export can be read alongside PACE sessions
  passport.points.push({
    cap: m.cap, acc: "in-school", stage: `CareerQuest World: ${m.title}`,
    participation: `${m.room} mission. Choices: ${choices.join(" / ")}`,
    capReflection: capR, identityReflection: idR,
    deepened: capR.length > 2 && idR.length > 2,
    at: new Date().toISOString(), source: "careerquest-world", mission: m.id, room: ROOM,
    peersPresent: [...peers.values()].filter((p) => p.zone === m.id).length
  });
  savePassport();
  renderMeters();
  mission.phase = "done";
  renderMission();
  $("mDone")?.focus();
}

// ---------- passport ----------
const deepCount = (cap) => passport.points.filter((p) => p.cap === cap && p.deepened).length;
function renderMeters() {
  $("hudMeters").innerHTML = CAPS.map((cap) => {
    const n = deepCount(cap);
    return `<span class="meter" title="${cap}: ${n}/${DEEP_TARGET} deepened">${Array.from({ length: DEEP_TARGET }, (_, i) => `<i style="${i < n ? `background:${CAP_COLOR[cap]}` : ""}"></i>`).join("")}</span>`;
  }).join("");
}
function openPassport() {
  closeMission();
  const el = $("passport");
  const rows = CAPS.map((cap) => {
    const n = deepCount(cap);
    return `<div class="capRow"><span><span class="dot" style="background:${CAP_COLOR[cap]}"></span>${cap}</span><span class="mono">${Math.min(n, DEEP_TARGET)} / ${DEEP_TARGET} deep</span></div>`;
  }).join("");
  const traces = passport.points.length
    ? passport.points.slice().reverse().map((p) => `<div class="trace" style="border-left:4px solid ${CAP_COLOR[p.cap]}">
        <div class="meta mono">${esc(p.cap)} / ${p.deepened ? "deepened" : "not yet deepened"} / ${new Date(p.at).toLocaleDateString()}</div>
        <div><b>${esc(p.stage.replace("CareerQuest World: ", ""))}</b></div>
        ${p.capReflection ? `<div style="margin-top:4px">${esc(p.capReflection)}</div>` : ""}
        ${p.identityReflection ? `<div style="margin-top:4px;color:var(--muted)">${esc(p.identityReflection)}</div>` : ""}</div>`).join("")
    : `<p class="empty">No traces yet. Each room ends with two reflection questions; answer both to deepen a trace.</p>`;
  el.innerHTML = `<button class="close" aria-label="Close">&times;</button>
    <span class="pill" style="background:var(--navy)">PACE</span>
    <h2 class="h" style="font-size:24px;margin-top:10px">Your passport</h2>
    <p class="setup">The game is rehearsal. The passport is the evidence: what you chose, and what you noticed about yourself. Deepened traces count toward PACE.</p>
    ${rows}
    <div class="actions"><button class="btn" id="pExport">Export for PACE</button>
      <a class="btn ghost" style="text-decoration:none" href="https://binyoun.github.io/pace-tool/" target="_blank" rel="noopener">Open PACE tool</a></div>
    <h3 class="h" style="font-size:16px;margin-top:22px">Traces</h3>${traces}
    <div class="actions"><button class="btn ghost" id="pReset" style="font-size:13px;padding:6px 12px">Clear passport on this device</button></div>
    <div class="msg" id="pMsg"></div>`;
  el.classList.add("open");
  el.querySelector(".close").onclick = () => el.classList.remove("open");
  $("pExport").onclick = () => {
    const out = { ...passport, exported: new Date().toISOString(), source: "careerquest-world" };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `careerquest-pace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("pReset").onclick = (e) => {
    if (e.currentTarget.dataset.armed) {
      passport.points = []; savePassport(); renderMeters(); openPassport();
    } else {
      e.currentTarget.dataset.armed = "1";
      e.currentTarget.textContent = "Click again to clear every trace";
    }
  };
}
$("passBtn").onclick = openPassport;

// ---------- intro ----------
const saved = store.get("cqw-me", null);
if (saved) { me.name = saved.name || ""; me.color = AVATAR_COLORS.includes(saved.color) ? saved.color : me.color; }
$("nameInput").value = me.name;
$("swatches").innerHTML = AVATAR_COLORS.map((c) => `<button class="swatch" style="background:${c}" data-c="${c}" aria-label="colour ${c}" aria-pressed="${c === me.color}"></button>`).join("");
$("swatches").onclick = (e) => {
  const b = e.target.closest(".swatch");
  if (!b) return;
  me.color = b.dataset.c;
  $("swatches").querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", s === b));
};
function enter() {
  me.name = $("nameInput").value.trim().slice(0, 20) || `guest ${Math.floor(Math.random() * 900 + 100)}`;
  store.set("cqw-me", { name: me.name, color: me.color });
  player = makeAvatar(me.color, me.name);
  player.position.set(me.x, 0, me.z);
  const wantLite = $("liteCheck").checked;
  $("intro").remove();
  ["hud", "passBtn", "chat", "hint"].forEach((id) => ($(id).hidden = false));
  setLite(wantLite);
  $("roomText").textContent = ROOM === "lobby" ? "public lobby" : `room: ${ROOM}`;
  renderMeters();
  updateNet();
  started = true;
  sysChat(`Welcome, ${me.name}. Three rooms, three capabilities. The passport is in the centre.`);
  startNet();
  setTimeout(() => ($("hint").hidden = true), 12000);
}
$("enterBtn").onclick = enter;
$("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") enter(); });
$("invite").onclick = async () => {
  const url = new URL(location.href);
  if (ROOM === "lobby") url.searchParams.set("room", Math.random().toString(36).slice(2, 8));
  else url.searchParams.set("room", ROOM);
  try { await navigator.clipboard.writeText(url.toString()); $("invite").textContent = "Copied"; }
  catch { $("invite").textContent = url.searchParams.get("room"); }
  setTimeout(() => ($("invite").textContent = "Copy invite link"), 2000);
  if (ROOM === "lobby") sysChat("Invite links open a private room. Open the link yourself to join it too.");
};

// ---------- accessible view ----------
// Same world, same rooms, same people, as plain HTML: keyboard, screen readers, no GPU needed.
let lite = !renderer || store.get("cqw-lite", false);
$("liteCheck").checked = lite;
if (!renderer) { $("liteCheck").disabled = true; $("liteNote").textContent = "This device can't show 3D, so the accessible view is on."; }
function setLite(on) {
  lite = on || !renderer;
  store.set("cqw-lite", lite);
  document.body.classList.toggle("lite", lite);
  $("liteBtn").textContent = lite ? "3D view" : "Accessible view";
  $("liteBtn").hidden = !renderer;
  $("lite").hidden = !lite;
  if (lite) $("hint").hidden = true;
  renderLite();
}
$("liteBtn").onclick = () => setLite(!lite);
function goTo(zoneId) {
  const z = zones.find((zn) => zn.id === zoneId);
  moveTarget = null;
  if (z) { me.x = z.x; me.z = z.z + 0.4; } else { me.x = 0; me.z = 6; }
  // re-entering the same room re-opens it
  if (me.zone === zoneId) { me.zone = null; }
}
function renderLite() {
  if (!lite || !started) return;
  const people = (zid) => [...peers.values()].filter((p) => p.zone === zid).map((p) => esc(p.name));
  const rooms = Object.values(MISSIONS).map((m) => {
    const here = people(m.id);
    return `<li><button class="liteRoom" data-z="${m.id}" style="border-left-color:${m.color}">
      <span class="pill" style="background:${m.color}">${esc(m.cap)}</span>
      <b>${esc(m.room)}</b>: ${esc(m.title)}
      <span class="liteWho">${here.length ? `${here.length} here: ${here.join(", ")}` : "nobody here yet"}</span></button></li>`;
  }).join("");
  const plaza = [...peers.values()].filter((p) => !p.zone).map((p) => esc(p.name));
  $("lite").innerHTML = `<h2 class="h" style="font-size:22px">Rooms</h2>
    <p class="setup">You are ${me.zone ? `in the ${esc(MISSIONS[me.zone]?.room || "passport")}` : "in the plaza"}. Choose a room to enter it. Everyone else sees you move there.</p>
    <ul class="liteList">${rooms}
      <li><button class="liteRoom" data-z="passport" style="border-left-color:var(--navy)"><span class="pill" style="background:var(--navy)">PACE</span> <b>Passport</b>: your traces</button></li>
      <li><button class="liteRoom" data-z="" style="border-left-color:var(--line)"><b>Plaza</b>: back to the open space
        <span class="liteWho">${plaza.length ? `${plaza.length} here: ${plaza.join(", ")}` : "nobody here yet"}</span></button></li>
    </ul>`;
  $("lite").querySelectorAll(".liteRoom").forEach((b) => (b.onclick = () => goTo(b.dataset.z || null)));
}
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("mission").classList.contains("open")) closeMission();
  else if ($("passport").classList.contains("open")) { $("passport").classList.remove("open"); $("passBtn").focus(); }
});

// ---------- loop ----------
function resize() {
  renderer?.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
let t = 0;
function tick() {
  const dt = Math.min(Math.max(clock.getDelta(), 0), 0.05);
  t += dt;

  if (player) {
    let fx = 0, fz = 0;
    if (!typing()) {
      if (keys.has("w") || keys.has("arrowup")) fz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) fz += 1;
      if (keys.has("a") || keys.has("arrowleft")) fx -= 1;
      if (keys.has("d") || keys.has("arrowright")) fx += 1;
    }
    let vx = 0, vz = 0;
    if (fx || fz) {
      moveTarget = null;
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      vx = fx * c + fz * s; vz = -fx * s + fz * c;
    } else if (moveTarget) {
      vx = moveTarget.x - me.x; vz = moveTarget.z - me.z;
      if (Math.hypot(vx, vz) < 0.15) { moveTarget = null; vx = vz = 0; }
    }
    const len = Math.hypot(vx, vz);
    me.moving = len > 0;
    if (len) {
      const speed = 5.2;
      me.x += (vx / len) * speed * dt; me.z += (vz / len) * speed * dt;
      const r = Math.hypot(me.x, me.z);
      if (r > WORLD_R) { me.x *= WORLD_R / r; me.z *= WORLD_R / r; }
      const targetRy = Math.atan2(vx, vz);
      let d = targetRy - me.ry;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.ry += d * Math.min(1, dt * 12);
    }
    player.position.set(me.x, 0, me.z);
    player.rotation.y = me.ry;
    player.userData.body.position.y = me.moving && !REDUCED ? Math.abs(Math.sin(t * 10)) * 0.08 : 0;

    // zone enter / leave
    const z = zones.find((zn) => Math.hypot(me.x - zn.x, me.z - zn.z) < zn.r);
    const zid = z ? z.id : null;
    if (zid !== me.zone) {
      me.zone = zid;
      renderLite();
      if (z?.kind === "mission") openMission(z.id);
      else if (z?.kind === "passport") openPassport();
    }

    const dist = 9, height = 5.5;
    camera.position.lerp(new THREE.Vector3(me.x + Math.sin(camYaw) * dist, height, me.z + Math.cos(camYaw) * dist), REDUCED ? 1 : Math.min(1, dt * 6));
    camera.lookAt(me.x, 1.2, me.z);
  } else {
    // slow orbit behind the intro card
    camera.position.set(Math.sin(t * 0.08) * 24, 12, Math.cos(t * 0.08) * 24);
    camera.lookAt(0, 1, 0);
  }

  peers.forEach((p) => {
    const a = p.avatar;
    a.position.x += (p.x - a.position.x) * Math.min(1, dt * 10);
    a.position.z += (p.z - a.position.z) * Math.min(1, dt * 10);
    let d = p.ry - a.rotation.y;
    a.rotation.y += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 10);
    a.userData.body.position.y = p.moving && !REDUCED ? Math.abs(Math.sin(t * 10)) * 0.08 : 0;
  });

  // fade a pavilion roof while you stand under it
  for (const id in roofs) {
    const target = me.zone === id ? 0.18 : 1;
    roofs[id].opacity += (target - roofs[id].opacity) * Math.min(1, dt * 6);
  }
  if (!REDUCED) pulses.forEach((r, i) => { r.material.opacity = 0.55 + Math.sin(t * 2 + i) * 0.3; });

  if (renderer && !lite) renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// test hook for headless checks
window.__cqw = { me, peers, zones, openMission, openPassport, passport, get net() { return net; } };
