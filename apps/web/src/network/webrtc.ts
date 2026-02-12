export type RtcSignalPayload = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type DeviceOption = {
  id: string;
  label: string;
};

type DeviceState = {
  audioInputs: DeviceOption[];
  videoInputs: DeviceOption[];
  audioOutputs: DeviceOption[];
  selectedAudioInputId: string | null;
  selectedVideoInputId: string | null;
  selectedAudioOutputId: string | null;
};

type PeerConnectionState = {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  audioEl: HTMLAudioElement;
  volume: number;
};

type WebRtcControllerOptions = {
  sendSignal: (toClientId: string, signal: RtcSignalPayload) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onRemoteStream: (clientId: string, stream: MediaStream | null) => void;
  onDevicesChanged?: (state: DeviceState) => void;
};

export function createWebRtcController(options: WebRtcControllerOptions) {
  let selfClientId: string | null = null;
  let localStream: MediaStream | null = null;
  let micMuted = true;
  let cameraEnabled = false;

  let selectedAudioInputId: string | null = null;
  let selectedVideoInputId: string | null = null;
  let selectedAudioOutputId: string | null = null;

  const peers = new Map<string, PeerConnectionState>();
  const desiredPeers = new Set<string>();

  function shouldInitiate(remoteClientId: string) {
    if (!selfClientId) return false;
    return selfClientId < remoteClientId;
  }

  function emitDeviceState(devices: MediaDeviceInfo[]) {
    const audioInputs = devices
      .filter((item) => item.kind === "audioinput")
      .map((item) => ({
        id: item.deviceId,
        label: item.label || `Microphone ${item.deviceId.slice(0, 6)}`
      }));

    const videoInputs = devices
      .filter((item) => item.kind === "videoinput")
      .map((item) => ({
        id: item.deviceId,
        label: item.label || `Camera ${item.deviceId.slice(0, 6)}`
      }));

    const audioOutputs = devices
      .filter((item) => item.kind === "audiooutput")
      .map((item) => ({
        id: item.deviceId,
        label: item.label || `Output ${item.deviceId.slice(0, 6)}`
      }));

    options.onDevicesChanged?.({
      audioInputs,
      videoInputs,
      audioOutputs,
      selectedAudioInputId,
      selectedVideoInputId,
      selectedAudioOutputId
    });
  }

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      emitDeviceState(devices);
    } catch {
      options.onDevicesChanged?.({
        audioInputs: [],
        videoInputs: [],
        audioOutputs: [],
        selectedAudioInputId,
        selectedVideoInputId,
        selectedAudioOutputId
      });
    }
  }

  async function applyOutputDevice(audioEl: HTMLAudioElement) {
    if (!selectedAudioOutputId) return;
    if (!("setSinkId" in audioEl)) return;

    try {
      await (audioEl as any).setSinkId(selectedAudioOutputId);
    } catch {
      // ignore unsupported/failing sink assignment
    }
  }

  function applyTrackToggles() {
    if (!localStream) return;

    for (const track of localStream.getAudioTracks()) {
      track.enabled = !micMuted;
    }

    for (const track of localStream.getVideoTracks()) {
      track.enabled = cameraEnabled;
    }
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
    audioEl.volume = 1;

    const peer: PeerConnectionState = {
      pc,
      remoteStream,
      audioEl,
      volume: 1
    };

    void applyOutputDevice(audioEl);

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

  async function replaceLocalMedia() {
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedAudioInputId
          ? { deviceId: { exact: selectedAudioInputId } }
          : true,
        video: selectedVideoInputId
          ? { deviceId: { exact: selectedVideoInputId } }
          : true
      });
    } catch {
      stream = null;
    }

    if (localStream) {
      for (const track of localStream.getTracks()) {
        track.stop();
      }
    }

    localStream = stream;
    applyTrackToggles();
    options.onLocalStream(localStream);

    for (const peer of peers.values()) {
      for (const sender of peer.pc.getSenders()) {
        if (!sender.track) continue;

        if (sender.track.kind === "audio") {
          const nextTrack = localStream?.getAudioTracks()[0] ?? null;
          void sender.replaceTrack(nextTrack);
        }

        if (sender.track.kind === "video") {
          const nextTrack = localStream?.getVideoTracks()[0] ?? null;
          void sender.replaceTrack(nextTrack);
        }
      }

      attachLocalTracks(peer);
    }

    await refreshDevices();
  }

  async function startLocalMedia() {
    await replaceLocalMedia();

    if (!localStream) return false;

    for (const [remoteClientId, peer] of peers.entries()) {
      attachLocalTracks(peer);
      if (shouldInitiate(remoteClientId)) {
        void sendOffer(remoteClientId, peer).catch(() => {
          closePeer(remoteClientId);
        });
      }
    }
    return true;
  }

  async function setAudioInputDevice(deviceId: string) {
    selectedAudioInputId = deviceId || null;
    await replaceLocalMedia();
  }

  async function setVideoInputDevice(deviceId: string) {
    selectedVideoInputId = deviceId || null;
    await replaceLocalMedia();
  }

  async function setAudioOutputDevice(deviceId: string) {
    selectedAudioOutputId = deviceId || null;

    for (const peer of peers.values()) {
      await applyOutputDevice(peer.audioEl);
    }

    await refreshDevices();
  }

  function setMicMuted(muted: boolean) {
    micMuted = muted;
    applyTrackToggles();
  }

  function setCameraEnabled(enabled: boolean) {
    cameraEnabled = enabled;
    applyTrackToggles();
  }

  function setRemoteVolume(clientId: string, volume: number) {
    const peer = peers.get(clientId);
    if (!peer) return;

    peer.volume = Math.max(0, Math.min(1, volume));
    peer.audioEl.volume = peer.volume;
  }

  function getRemoteVolume(clientId: string) {
    return peers.get(clientId)?.volume ?? 1;
  }

  navigator.mediaDevices?.addEventListener?.("devicechange", () => {
    void refreshDevices();
  });

  return {
    setSelfClientId,
    startLocalMedia,
    handleSignal,
    syncPeers,
    upsertPeer,
    removePeer,
    setMicMuted,
    setCameraEnabled,
    setAudioInputDevice,
    setVideoInputDevice,
    setAudioOutputDevice,
    setRemoteVolume,
    getRemoteVolume,
    refreshDevices,
    hasLocalMedia: () => Boolean(localStream),
    getMicMuted: () => micMuted,
    getCameraEnabled: () => cameraEnabled
  };
}
