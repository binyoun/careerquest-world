# CareerQuest World

A shared browser world for the CareerQuest 140 project, linked to PACE. No headsets, no install:
it runs on any laptop or phone, and has an accessible view for keyboard and screen-reader users
or devices that can't show 3D.

Students walk into three rooms, each mapped to one PACE capability:

- Client Room / Connected: "The client call"
- Studio / Adaptive: "The brief moved"
- Crit Room / Critically Engaged: "The shortcut"

Each room has two decisions with no right answer (outcome + what it shows), then two PACE reflection
questions. Answering both saves a deepened trace to the passport in the centre. The passport exports
JSON in the same point shape as the PACE tool (binyoun.github.io/pace-tool).

## Live

- https://binyoun.github.io/careerquest-world/ , connected to the CareerQuest server on Cloudflare
  (`wss://careerquest-world.alt-lab-atelier.workers.dev`, set in `config.js`). If that server can't be
  reached, it falls back to peer-to-peer.

## Hosting on Cloudflare (live)

`cloudflare/` runs the same server as a Cloudflare Worker with one Durable Object per room. It speaks the
same messages as `server/server.js`, so the browser code works with either. It is built for Cloudflare's
free plan (100,000 requests a day): moves go out to each room in batches every 100 ms, quiet sockets
hibernate, and through the server the browser sends its position every 2 s when alone and twice a second
with company. Anonymous choice counts are kept in one shared object; `GET /tallies.json` returns them.

```
cd cloudflare && npm install
npx wrangler dev --port 8790      # local; open the site with ?server=ws://127.0.0.1:8790
npx wrangler deploy               # live
```

Note: Cloudflare's free allowance is per account, so this server shares it with any other Workers on
the same account.

## How multiplayer works

`net.js` tries the CareerQuest server first (WebSocket at `/ws`). If none is reachable, it falls back
to peer-to-peer (Trystero over WebRTC with public Nostr relays). If both fail, the world runs solo.

The server (`server/server.js`) is one small Node process with one dependency (`ws`). It:

- serves the site and relays presence, chat and choices per room (`?room=code`)
- keeps **anonymous** choice counts per mission step in `DATA_DIR/tallies.json`, so students can see
  how everyone so far has chosen, and the team gets research data with no personal information
- stores no accounts, names or chat. Passports stay in each student's browser.
- limits rooms (`ROOM_CAP`, default 60), message size and rate; drops dead connections

`GET /health` returns rooms and people online. `GET /tallies.json` returns the anonymous counts.

## Run the server

```
cd server && npm install && cd ..
node server/server.js          # http://localhost:8080
```

Environment: `PORT` (8080), `DATA_DIR` (server/data), `ROOM_CAP` (60).

Or with Docker:

```
cd server && npm install && cd ..   # creates package-lock.json
docker build -t careerquest-world .
docker run -p 8080:8080 -v cqw-data:/data careerquest-world
```

It runs on a university VM, a Raspberry Pi in a studio, or any container host. To keep the
GitHub Pages copy but use a server elsewhere, set `SERVER_URL` in `config.js`
(e.g. `wss://careerquest.example.edu`).

## Files

`index.html` (UI), `main.js` (three.js world + accessible view), `missions.js` (scenario content,
edit this to change missions), `net.js` (server / peer-to-peer), `config.js`, `server/`,
`vendor/three.module.min.js` (three.js r160, MIT, served locally so the site doesn't depend on a CDN).
