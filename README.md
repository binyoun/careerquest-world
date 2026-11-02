# CareerQuest World

A prototype shared browser world for the CareerQuest 140 project, linked to PACE.

Students walk into three rooms, each mapped to one PACE capability:

- Client Room / Connected: "The client call"
- Studio / Adaptive: "The brief moved"
- Crit Room / Critically Engaged: "The shortcut"

Each room has two decisions with no right answer (outcome + what it shows), then two PACE reflection
questions. Answering both saves a deepened trace to the passport in the centre. The passport exports
JSON in the same point shape as the PACE tool (binyoun.github.io/pace-tool).

Multiplayer is peer-to-peer (Trystero over WebRTC, public Nostr relays for signalling), so there is
no server. Presence, chat, and anonymous choice tallies ("others in this world chose A 1 / B 2") are
shared live. `?room=code` opens a private room. Passport and name stay in the viewer's browser.

Files: `index.html` (UI), `main.js` (three.js world), `missions.js` (scenario content), `net.js`.

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
