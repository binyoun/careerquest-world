// Multiplayer transport. Prefers our own CareerQuest server (WebSocket); falls back to
// peer-to-peer (Trystero over WebRTC, public Nostr relays) when no server is reachable,
// e.g. on the static GitHub Pages copy. If both fail, the world runs solo.

import { SERVER_URL } from "./config.js";

const APP_ID = "careerquest-world-pace-v1";

function serverUrl(room) {
  // ?server=ws://localhost:8790 points one visit at a test server
  let base = new URLSearchParams(location.search).get("server") || SERVER_URL;
  if (!base) {
    if (location.hostname.endsWith("github.io") || location.protocol === "file:") return null;
    base = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  }
  return `${base.replace(/\/$/, "")}/ws?room=${encodeURIComponent(room)}`;
}

function connectServer(room, handlers) {
  const url = serverUrl(room);
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    let ws, selfId = null, settled = false, retry = 0, closedByUs = false;
    const api = {
      mode: "server",
      get selfId() { return selfId; },
      sendState: (d) => out({ t: "state", ...d }),
      sendChat: (d) => out({ t: "chat", text: d.t }),
      sendChoice: (d) => out({ t: "choice", ...d }),
      leave: () => { closedByUs = true; ws?.close(); }
    };
    const out = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
    const open = () => {
      ws = new WebSocket(url);
      const timer = setTimeout(() => { if (!settled) { settled = true; ws.close(); resolve(null); } }, 4000);
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === "hello") {
          clearTimeout(timer);
          selfId = m.id; retry = 0;
          handlers.reset?.();
          handlers.tallies?.(m.tallies || {});
          m.peers.forEach((p) => handlers.state(p.id, p));
          if (!settled) { settled = true; resolve(api); }
          handlers.status?.("server");
        } else if (m.t === "states") m.list.forEach((s) => handlers.state(s.id, s)); // batched moves (Cloudflare server)
        else if (m.t === "state") handlers.state(m.id, m);
        else if (m.t === "chat") handlers.chat(m.id, { t: m.text });
        else if (m.t === "choice") { if (m.id !== selfId) handlers.choice(m.id, m); handlers.total?.(`${m.m}:${m.s}`, m.total); }
        else if (m.t === "leave") handlers.leave(m.id);
        else if (m.t === "full") handlers.status?.("full");
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) { settled = true; return resolve(null); }
        if (closedByUs) return;
        // keep trying with backoff; peers are re-sent on the next hello
        handlers.status?.("reconnecting");
        setTimeout(open, Math.min(15000, 1000 * 2 ** retry++));
      };
    };
    open();
  });
}

async function connectP2P(room, handlers) {
  let lib;
  try {
    lib = await import("https://cdn.jsdelivr.net/npm/trystero@0.20.0/+esm");
  } catch (err) {
    console.warn("multiplayer unavailable", err);
    return null;
  }
  const r = lib.joinRoom({ appId: APP_ID }, room);
  const [sendState, onState] = r.makeAction("state");
  const [sendChat, onChat] = r.makeAction("chat");
  const [sendChoice, onChoice] = r.makeAction("choice");
  onState((data, peer) => handlers.state(peer, data));
  onChat((data, peer) => handlers.chat(peer, data));
  onChoice((data, peer) => handlers.choice(peer, data));
  r.onPeerJoin((peer) => handlers.join?.(peer));
  r.onPeerLeave((peer) => handlers.leave(peer));
  handlers.status?.("p2p");
  return {
    mode: "p2p",
    selfId: lib.selfId,
    sendState: (d, peer) => sendState(d, peer),
    sendChat: (d) => sendChat(d),
    sendChoice: (d) => sendChoice(d),
    leave: () => r.leave()
  };
}

export async function connect(room, handlers) {
  return (await connectServer(room, handlers)) || (await connectP2P(room, handlers));
}
