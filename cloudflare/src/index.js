// CareerQuest World on Cloudflare: the same rooms, chat, presence and
// anonymous choice counts as server/server.js, run as a Worker with one
// Durable Object per room. It speaks the same messages, so the browser code
// works with either.
//
// Privacy by design: no accounts, no chat logs, no names stored. The only
// thing kept is anonymous choice counts per mission step, in one shared
// object ("tallies") that every room adds to.
//
// Cost: built for Cloudflare's free plan. Moves go out to the room in
// batches every 100 ms, sockets hibernate when quiet, and the browser sends
// its position sparingly (see main.js).

const ORIGINS = [
  'https://binyoun.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:8125',
];
const ROOM_CAP = 60;
const MAX_MSG = 1024;
const RATE = 30; // messages per second per connection
const TICK = 100; // ms between batched moves
const TALLIES = '__tallies';

const cleanRoom = (s) => String(s || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'lobby';
const num = (v, lim) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const json = (body, origin, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': ORIGINS.includes(origin) ? origin : '*' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    if (origin && !ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    const tallies = () => env.ROOM.get(env.ROOM.idFromName(TALLIES));
    if (url.pathname === '/health') return json({ ok: true }, origin);
    if (url.pathname === '/tallies.json') return json(await (await tallies().fetch('https://t/all')).json(), origin);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const room = cleanRoom(url.searchParams.get('room'));
      if (room === TALLIES) return new Response('Not a room', { status: 400 });
      const fwd = new Request(req);
      fwd.headers.set('X-Room', room);
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(fwd);
    }
    return new Response('CareerQuest World server. The site is at https://binyoun.github.io/careerquest-world/', { status: 404 });
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.atts = new Map(); // attachments kept in memory between messages
    this.moves = new Map();
    this.tick = null;
  }

  att(ws) {
    let a = this.atts.get(ws);
    if (!a) {
      a = ws.deserializeAttachment();
      if (a) this.atts.set(ws, a);
    }
    return a;
  }

  keep(ws, a) {
    ws.serializeAttachment(a);
    this.atts.set(ws, a);
  }

  live() {
    return this.state.getWebSockets().filter((ws) => { const a = this.att(ws); return a && !a.gone; });
  }

  broadcast(msg, exceptId) {
    const data = JSON.stringify(msg);
    for (const ws of this.live()) {
      if (this.att(ws).id === exceptId) continue;
      try { ws.send(data); } catch (e) { /* closing */ }
    }
  }

  tallyStub() {
    return this.env.ROOM.get(this.env.ROOM.idFromName(TALLIES));
  }

  async fetch(req) {
    const url = new URL(req.url);
    // the shared tallies object
    if (url.pathname === '/all') return Response.json((await this.state.storage.get('tallies')) || {});
    if (url.pathname === '/add') {
      const { key, k } = await req.json();
      const tallies = (await this.state.storage.get('tallies')) || {};
      tallies[key] ||= {};
      tallies[key][k] = (tallies[key][k] || 0) + 1;
      await this.state.storage.put('tallies', tallies);
      return Response.json(tallies[key]);
    }
    // a room
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    if (this.live().length > ROOM_CAP) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(1000, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const n = ((await this.state.storage.get('next')) || 0) + 1;
    await this.state.storage.put('next', n);
    const a = { id: String(n), st: null, budget: RATE, last: Date.now() };
    this.keep(server, a);
    const peers = this.live().map((ws) => this.att(ws)).filter((p) => p.id !== a.id && p.st).map((p) => ({ id: p.id, ...p.st }));
    let tallies = {};
    try { tallies = await (await this.tallyStub().fetch('https://t/all')).json(); } catch (e) { /* counts are optional */ }
    server.send(JSON.stringify({ t: 'hello', id: a.id, peers, tallies }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    const a = this.att(ws);
    if (!a || a.gone) return;
    const now = Date.now();
    a.budget = Math.min(RATE, a.budget + ((now - a.last) / 1000) * RATE);
    a.last = now;
    if (a.budget < 1) return;
    a.budget -= 1;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'state') {
      a.st = {
        n: String(m.n || 'guest').slice(0, 20), c: /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : '#1E3765',
        x: num(m.x, 40), z: num(m.z, 40), r: num(m.r, 10), zn: typeof m.zn === 'string' ? m.zn.slice(0, 20) : null, m: !!m.m,
      };
      this.keep(ws, a);
      this.queueMove({ t: 'state', id: a.id, ...a.st });
    } else if (m.t === 'chat') {
      const text = String(m.text || '').trim().slice(0, 200);
      if (text) this.broadcast({ t: 'chat', id: a.id, text }, a.id);
    } else if (m.t === 'choice') {
      const mid = String(m.m).slice(0, 20);
      const s = num(m.s, 9);
      const k = num(m.k, 9);
      let total = {};
      try {
        total = await (await this.tallyStub().fetch('https://t/add', { method: 'POST', body: JSON.stringify({ key: `${mid}:${s}`, k }) })).json();
      } catch (e) { /* counts are optional */ }
      this.broadcast({ t: 'choice', id: a.id, m: mid, s, k, total }, null);
    }
  }

  // moves go out together every TICK ms, one message per person per tick
  queueMove(move) {
    this.moves.set(move.id, move);
    if (!this.tick) this.tick = setTimeout(() => this.flush(), TICK);
  }

  flush() {
    this.tick = null;
    if (!this.moves.size) return;
    const list = [...this.moves.values()];
    this.moves.clear();
    const all = JSON.stringify({ t: 'states', list });
    for (const ws of this.live()) {
      const id = this.att(ws).id;
      const data = list.some((s) => s.id === id) ? JSON.stringify({ t: 'states', list: list.filter((s) => s.id !== id) }) : all;
      try { ws.send(data); } catch (e) { /* closing */ }
    }
  }

  webSocketClose(ws) { this.leave(ws); }
  webSocketError(ws) { this.leave(ws); }

  leave(ws) {
    const a = this.att(ws);
    if (!a || a.gone) return;
    a.gone = true;
    this.keep(ws, a);
    this.moves.delete(a.id);
    this.broadcast({ t: 'leave', id: a.id });
  }
}
