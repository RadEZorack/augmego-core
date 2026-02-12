/// <reference types="vite/client" />
import "./style.css";

import { createGameScene } from "./game/scene";
import { createApiUrlResolver, resolveWsUrl } from "./lib/urls";
import type { CurrentUser } from "./lib/types";
import { createRealtimeClient } from "./network/realtime";
import { createWebRtcController } from "./network/webrtc";
import { createAuthController } from "./ui/auth";
import { createChatController } from "./ui/chat";
import { createMediaController } from "./ui/media";

const app = document.getElementById("app");

if (!app) {
  throw new Error("#app not found");
}

const apiBase = import.meta.env.VITE_API_BASE_URL;
const wsBase = import.meta.env.VITE_WS_URL;

const apiUrl = createApiUrlResolver(apiBase);

const auth = createAuthController({
  elements: {
    loginLinkedinButton: document.getElementById(
      "login-linkedin"
    ) as HTMLButtonElement | null,
    loginGoogleButton: document.getElementById(
      "login-google"
    ) as HTMLButtonElement | null,
    loginAppleButton: document.getElementById("login-apple") as HTMLButtonElement | null,
    logoutButton: document.getElementById("logout-button") as HTMLButtonElement | null,
    userAvatar: document.getElementById("user-avatar") as HTMLImageElement | null
  },
  apiUrl,
  onUserChange(user: CurrentUser | null) {
    chat.setCanPost(Boolean(user));
    game.setLocalIdentity(user?.name ?? user?.email ?? "Guest", user?.avatarUrl ?? null);
  }
});

const chat = createChatController({
  chatLog: document.getElementById("chat-log") as HTMLDivElement | null,
  chatStatus: document.getElementById("chat-status") as HTMLSpanElement | null,
  chatInput: document.getElementById("chat-input") as HTMLInputElement | null,
  chatSendButton: document.getElementById("chat-send") as HTMLButtonElement | null,
  chatForm: document.getElementById("chat-form") as HTMLFormElement | null
});

const game = createGameScene({
  mount: app,
  onLocalStateChange(state) {
    realtime.sendPlayerUpdate(state);
  }
});

const knownRemoteVolumeIds = new Set<string>();

const webrtc = createWebRtcController({
  sendSignal(toClientId, signal) {
    realtime.sendRtcSignal(toClientId, signal);
  },
  onLocalStream(stream) {
    game.setLocalMediaStream(stream);
  },
  onRemoteStream(clientId, stream) {
    game.setRemoteMediaStream(clientId, stream);
  },
  onDevicesChanged(state) {
    media.setDeviceLists(state);
  }
});

const media = createMediaController({
  accessCard: document.getElementById("media-access-card") as HTMLDivElement | null,
  accessStatus: document.getElementById("media-access-status") as HTMLDivElement | null,
  enableButton: document.getElementById("media-enable-button") as HTMLButtonElement | null,
  mutedButton: document.getElementById("media-muted-button") as HTMLButtonElement | null,
  micToggle: document.getElementById("mic-toggle") as HTMLButtonElement | null,
  cameraToggle: document.getElementById("camera-toggle") as HTMLButtonElement | null,
  audioInputSelect: document.getElementById("audio-input-select") as HTMLSelectElement | null,
  videoInputSelect: document.getElementById("video-input-select") as HTMLSelectElement | null,
  audioOutputSelect: document.getElementById("audio-output-select") as HTMLSelectElement | null,
  remoteVolumeList: document.getElementById("remote-volume-list") as HTMLDivElement | null,
  async onRequestAccess() {
    const granted = await webrtc.startLocalMedia();
    if (granted) {
      await webrtc.refreshDevices();
      realtime.sendPlayerMedia(webrtc.getMicMuted(), webrtc.getCameraEnabled());
    }
    return granted;
  },
  onMicToggle(muted) {
    webrtc.setMicMuted(muted);
    game.setLocalMediaState(muted, webrtc.getCameraEnabled());
    realtime.sendPlayerMedia(muted, webrtc.getCameraEnabled());
  },
  onCameraToggle(enabled) {
    webrtc.setCameraEnabled(enabled);
    game.setLocalMediaState(webrtc.getMicMuted(), enabled);
    realtime.sendPlayerMedia(webrtc.getMicMuted(), enabled);
  },
  onAudioInputChange(deviceId) {
    void webrtc.setAudioInputDevice(deviceId);
  },
  onVideoInputChange(deviceId) {
    void webrtc.setVideoInputDevice(deviceId);
  },
  onAudioOutputChange(deviceId) {
    void webrtc.setAudioOutputDevice(deviceId);
  },
  onRemoteVolumeChange(clientId, volume) {
    webrtc.setRemoteVolume(clientId, volume);
  }
});

const realtime = createRealtimeClient(resolveWsUrl(apiBase, wsBase), {
  onStatus(status) {
    chat.setStatus(status);
  },
  onSessionInfo(clientId) {
    game.setSelfClientId(clientId);
    webrtc.setSelfClientId(clientId);
    if (clientId) {
      game.forceSyncLocalState();
    }
  },
  onChatHistory(messages) {
    chat.replaceHistory(messages);
  },
  onChatMessage(message) {
    chat.appendMessage(message);
  },
  onPlayerSnapshot(players) {
    game.applyRemoteSnapshot(players);
    webrtc.syncPeers(players.map((player) => player.clientId));
    const activeIds = new Set<string>();
    for (const player of players) {
      activeIds.add(player.clientId);
      knownRemoteVolumeIds.add(player.clientId);
      const label =
        player.name?.trim() ||
        player.userId ||
        `Player ${player.clientId.slice(0, 6)}`;
      media.upsertRemoteVolume(
        player.clientId,
        label,
        webrtc.getRemoteVolume(player.clientId)
      );
    }
    for (const clientId of [...knownRemoteVolumeIds]) {
      if (!activeIds.has(clientId)) {
        knownRemoteVolumeIds.delete(clientId);
        media.removeRemoteVolume(clientId);
      }
    }
  },
  onPlayerUpdate(player) {
    game.applyRemoteUpdate(player);
    webrtc.upsertPeer(player.clientId);
    knownRemoteVolumeIds.add(player.clientId);
    const label =
      player.name?.trim() || player.userId || `Player ${player.clientId.slice(0, 6)}`;
    media.upsertRemoteVolume(
      player.clientId,
      label,
      webrtc.getRemoteVolume(player.clientId)
    );
  },
  onPlayerMedia(player) {
    game.setRemoteMediaState(
      player.clientId,
      player.micMuted,
      player.cameraEnabled
    );
  },
  onPlayerLeave(clientId) {
    game.removeRemotePlayer(clientId);
    webrtc.removePeer(clientId);
    knownRemoteVolumeIds.delete(clientId);
    media.removeRemoteVolume(clientId);
  },
  onRtcSignal(fromClientId, signal) {
    void webrtc.handleSignal(fromClientId, signal);
  },
  onAuthRequired() {
    chat.setStatus("Sign in to send messages");
  }
});

chat.onSubmit((text) => {
  if (!auth.getCurrentUser()) return;
  realtime.sendChat(text);
});

auth.setup();
media.setup();
media.setMicMuted(webrtc.getMicMuted());
media.setCameraEnabled(webrtc.getCameraEnabled());
game.setLocalMediaState(webrtc.getMicMuted(), webrtc.getCameraEnabled());
media.setPermissionState("not_requested");
void auth.loadCurrentUser();
realtime.connect();
void webrtc.refreshDevices();
game.start();
