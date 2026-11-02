// Peer-to-peer presence and chat with Trystero (WebRTC, Nostr relays for signalling).
// No server of our own. If the library or relays fail, the world runs solo.

const APP_ID = "careerquest-world-pace-v1";

export async function connect(roomName, handlers) {
  let lib;
  try {
    lib = await import("https://cdn.jsdelivr.net/npm/trystero@0.20.0/+esm");
  } catch (err) {
    console.warn("multiplayer unavailable", err);
    return null;
  }
  const room = lib.joinRoom({ appId: APP_ID }, roomName);
  const [sendState, onState] = room.makeAction("state");
  const [sendChat, onChat] = room.makeAction("chat");
  const [sendChoice, onChoice] = room.makeAction("choice");

  onState((data, peer) => handlers.state(peer, data));
  onChat((data, peer) => handlers.chat(peer, data));
  onChoice((data, peer) => handlers.choice(peer, data));
  room.onPeerJoin((peer) => handlers.join(peer));
  room.onPeerLeave((peer) => handlers.leave(peer));

  return {
    selfId: lib.selfId,
    sendState: (d, peer) => sendState(d, peer),
    sendChat: (d) => sendChat(d),
    sendChoice: (d) => sendChoice(d),
    leave: () => room.leave()
  };
}
