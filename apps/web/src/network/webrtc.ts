export type RtcSignalPayload = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type PeerConnectionState = {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  audioEl: HTMLAudioElement;
};

type WebRtcControllerOptions = {
  sendSignal: (toClientId: string, signal: RtcSignalPayload) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onRemoteStream: (clientId: string, stream: MediaStream | null) => void;
};

export function createWebRtcController(options: WebRtcControllerOptions) {
  let selfClientId: string | null = null;
  let localStream: MediaStream | null = null;

  const peers = new Map<string, PeerConnectionState>();
  const desiredPeers = new Set<string>();

  function shouldInitiate(remoteClientId: string) {
    if (!selfClientId) return false;
    return selfClientId < remoteClientId;
  }

  function attachLocalTracks(peer: PeerConnectionState) {
    if (!localStream) return;

    const existingTrackIds = new Set(
      peer.pc
        .getSenders()
        .map((sender) => sender.track?.id)
        .filter((id): id is string => Boolean(id))
    );

    for (const track of localStream.getTracks()) {
      if (existingTrackIds.has(track.id)) continue;
      peer.pc.addTrack(track, localStream);
    }
  }

  async function sendOffer(remoteClientId: string, peer: PeerConnectionState) {
    if (!shouldInitiate(remoteClientId)) return;

    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    options.sendSignal(remoteClientId, { description: offer });
  }

  function closePeer(remoteClientId: string) {
    const peer = peers.get(remoteClientId);
    if (!peer) return;

    peer.pc.close();
    peer.audioEl.pause();
    peer.audioEl.srcObject = null;
    peers.delete(remoteClientId);
    options.onRemoteStream(remoteClientId, null);
  }

  function ensurePeer(remoteClientId: string) {
    if (!selfClientId || remoteClientId === selfClientId) return null;

    const existing = peers.get(remoteClientId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    const remoteStream = new MediaStream();
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.srcObject = remoteStream;

    const peer: PeerConnectionState = {
      pc,
      remoteStream,
      audioEl
    };

    pc.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? []) {
        const hasTrack = remoteStream.getTracks().some((item) => item.id === track.id);
        if (!hasTrack) {
          remoteStream.addTrack(track);
        }
      }

      options.onRemoteStream(remoteClientId, remoteStream);
      void audioEl.play().catch(() => {
        // autoplay can fail until user interaction
      });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      options.sendSignal(remoteClientId, {
        candidate: event.candidate.toJSON()
      });
    };

    attachLocalTracks(peer);
    peers.set(remoteClientId, peer);

    if (shouldInitiate(remoteClientId)) {
      void sendOffer(remoteClientId, peer).catch(() => {
        closePeer(remoteClientId);
      });
    }

    return peer;
  }

  async function handleSignal(fromClientId: string, signal: RtcSignalPayload) {
    const peer = ensurePeer(fromClientId);
    if (!peer) return;

    if (signal.description) {
      const description = signal.description;
      await peer.pc.setRemoteDescription(description);

      if (description.type === "offer") {
        attachLocalTracks(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        options.sendSignal(fromClientId, { description: answer });
      }
      return;
    }

    if (signal.candidate) {
      await peer.pc.addIceCandidate(signal.candidate);
    }
  }

  function syncPeers(clientIds: string[]) {
    desiredPeers.clear();
    for (const clientId of clientIds) {
      if (!selfClientId || clientId === selfClientId) continue;
      desiredPeers.add(clientId);
      ensurePeer(clientId);
    }

    for (const existingClientId of peers.keys()) {
      if (!desiredPeers.has(existingClientId)) {
        closePeer(existingClientId);
      }
    }
  }

  function upsertPeer(clientId: string) {
    if (!selfClientId || clientId === selfClientId) return;
    desiredPeers.add(clientId);
    ensurePeer(clientId);
  }

  function removePeer(clientId: string) {
    desiredPeers.delete(clientId);
    closePeer(clientId);
  }

  function setSelfClientId(clientId: string | null) {
    if (selfClientId === clientId) return;

    selfClientId = clientId;
    for (const existingClientId of peers.keys()) {
      closePeer(existingClientId);
    }

    if (!selfClientId) return;

    for (const desiredClientId of desiredPeers) {
      ensurePeer(desiredClientId);
    }
  }

  async function startLocalMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
    } catch {
      localStream = null;
    }

    options.onLocalStream(localStream);

    if (!localStream) return;

    for (const [remoteClientId, peer] of peers.entries()) {
      attachLocalTracks(peer);
      if (shouldInitiate(remoteClientId)) {
        void sendOffer(remoteClientId, peer).catch(() => {
          closePeer(remoteClientId);
        });
      }
    }
  }

  return {
    setSelfClientId,
    startLocalMedia,
    handleSignal,
    syncPeers,
    upsertPeer,
    removePeer
  };
}
