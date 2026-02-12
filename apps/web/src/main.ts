/// <reference types="vite/client" />
import "./style.css";

import { createGameScene } from "./game/scene";
import { createApiUrlResolver, resolveWsUrl } from "./lib/urls";
import type { CurrentUser } from "./lib/types";
import { createRealtimeClient } from "./network/realtime";
import { createWebRtcController } from "./network/webrtc";
import { createAuthController } from "./ui/auth";
import { createChatController } from "./ui/chat";

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

const webrtc = createWebRtcController({
  sendSignal(toClientId, signal) {
    realtime.sendRtcSignal(toClientId, signal);
  },
  onLocalStream(stream) {
    game.setLocalMediaStream(stream);
  },
  onRemoteStream(clientId, stream) {
    game.setRemoteMediaStream(clientId, stream);
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
  },
  onPlayerUpdate(player) {
    game.applyRemoteUpdate(player);
    webrtc.upsertPeer(player.clientId);
  },
  onPlayerLeave(clientId) {
    game.removeRemotePlayer(clientId);
    webrtc.removePeer(clientId);
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
void auth.loadCurrentUser();
realtime.connect();
void webrtc.startLocalMedia();
game.start();
