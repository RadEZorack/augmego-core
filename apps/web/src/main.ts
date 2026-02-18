/// <reference types="vite/client" />
import "./style.css";

import { createGameScene } from "./game/scene";
import { createApiUrlResolver, resolveWsUrl } from "./lib/urls";
import type {
  CurrentUser,
  PartyState,
  PlayerPayload,
  WorldAsset,
  WorldAssetGenerationTask,
  WorldState
} from "./lib/types";
import { createRealtimeClient } from "./network/realtime";
import { createWebRtcController } from "./network/webrtc";
import { createAuthController } from "./ui/auth";
import { createChatController } from "./ui/chat";
import { createMediaController } from "./ui/media";
import { createPartyController } from "./ui/party";

const app = document.getElementById("app");

if (!app) {
  throw new Error("#app not found");
}

const dockPanel = document.getElementById("dock-panel") as HTMLElement | null;
const dockMinimizeButton = document.getElementById("dock-minimize") as HTMLButtonElement | null;
const chatTabButton = document.getElementById("tab-chat") as HTMLButtonElement | null;
const partyTabButton = document.getElementById("tab-party") as HTMLButtonElement | null;
const mediaTabButton = document.getElementById("tab-media") as HTMLButtonElement | null;
const chatPane = document.getElementById("pane-chat") as HTMLElement | null;
const partyPane = document.getElementById("pane-party") as HTMLElement | null;
const mediaPane = document.getElementById("pane-media") as HTMLElement | null;

const apiBase = import.meta.env.VITE_API_BASE_URL;
const wsBase = import.meta.env.VITE_WS_URL;

const apiUrl = createApiUrlResolver(apiBase);

function setupPanelToggle(
  panel: HTMLElement | null,
  button: HTMLButtonElement | null,
  label: string
) {
  if (!panel || !button) return;

  button.addEventListener("click", () => {
    const minimized = panel.classList.toggle("minimized");
    button.textContent = minimized ? "+" : "x";
    button.setAttribute(
      "aria-label",
      minimized ? `Restore ${label}` : `Minimize ${label}`
    );
  });
}

function setupTabs() {
  if (
    !chatTabButton ||
    !partyTabButton ||
    !mediaTabButton ||
    !chatPane ||
    !partyPane ||
    !mediaPane
  ) {
    return;
  }

  const tabs = [chatTabButton, partyTabButton, mediaTabButton];
  const panes = [chatPane, partyPane, mediaPane];

  const setActive = (tab: "chat" | "party" | "media") => {
    const activeIndex = tab === "chat" ? 0 : tab === "party" ? 1 : 2;
    for (let i = 0; i < tabs.length; i += 1) {
      tabs[i]!.classList.toggle("active", i === activeIndex);
      tabs[i]!.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
      panes[i]!.classList.toggle("active", i === activeIndex);
    }
  };

  chatTabButton.addEventListener("click", () => setActive("chat"));
  partyTabButton.addEventListener("click", () => setActive("party"));
  mediaTabButton.addEventListener("click", () => setActive("media"));
}

function setPanelMinimized(
  panel: HTMLElement | null,
  button: HTMLButtonElement | null,
  label: string,
  minimized: boolean
) {
  if (!panel || !button) return;

  panel.classList.toggle("minimized", minimized);
  button.textContent = minimized ? "+" : "x";
  button.setAttribute(
    "aria-label",
    minimized ? `Restore ${label}` : `Minimize ${label}`
  );
}

const chat = createChatController({
  chatLog: document.getElementById("chat-log") as HTMLDivElement | null,
  chatStatus: document.getElementById("chat-status") as HTMLSpanElement | null,
  chatInput: document.getElementById("chat-input") as HTMLInputElement | null,
  chatSendButton: document.getElementById("chat-send") as HTMLButtonElement | null,
  chatForm: document.getElementById("chat-form") as HTMLFormElement | null
});

const partyChat = createChatController({
  chatLog: document.getElementById("party-chat-log") as HTMLDivElement | null,
  chatStatus: document.getElementById("party-chat-status") as HTMLSpanElement | null,
  chatInput: document.getElementById("party-chat-input") as HTMLInputElement | null,
  chatSendButton: document.getElementById("party-chat-send") as HTMLButtonElement | null,
  chatForm: document.getElementById("party-chat-form") as HTMLFormElement | null
});

let selfClientId: string | null = null;
let partyState: PartyState = {
  party: null,
  pendingInvites: []
};
let worldState: WorldState | null = null;
let worldGenerationTasks: WorldAssetGenerationTask[] = [];
let worldGenerationPollTimer: number | null = null;
let selectedPlacementAssetId: string | null = null;
let isPlacingModel = false;

const worldStatus = document.getElementById("world-status") as HTMLDivElement | null;
const worldUploadForm = document.getElementById("world-upload-form") as HTMLFormElement | null;
const worldModelNameInput = document.getElementById("world-model-name") as HTMLInputElement | null;
const worldModelFileInput = document.getElementById("world-model-file") as HTMLInputElement | null;
const worldUploadButton = document.getElementById("world-upload-button") as HTMLButtonElement | null;
const worldGenerateForm = document.getElementById("world-generate-form") as HTMLFormElement | null;
const worldGeneratePromptInput = document.getElementById(
  "world-generate-prompt"
) as HTMLInputElement | null;
const worldGenerateNameInput = document.getElementById("world-generate-name") as HTMLInputElement | null;
const worldGenerateButton = document.getElementById(
  "world-generate-button"
) as HTMLButtonElement | null;
const worldAssetsContainer = document.getElementById("world-assets") as HTMLDivElement | null;
const worldSettingsForm = document.getElementById("world-settings-form") as HTMLFormElement | null;
const worldNameInput = document.getElementById("world-name-input") as HTMLInputElement | null;
const worldDescriptionInput = document.getElementById(
  "world-description-input"
) as HTMLInputElement | null;
const worldPublicToggle = document.getElementById("world-public-toggle") as HTMLInputElement | null;
const worldSettingsSaveButton = document.getElementById(
  "world-settings-save"
) as HTMLButtonElement | null;

const playersByClientId = new Map<string, PlayerPayload>();
const knownRemoteVolumeIds = new Set<string>();

function canShareMediaWithParty(partyId: string | null | undefined) {
  const ownPartyId = partyState.party?.id ?? null;
  const remotePartyId = partyId ?? null;

  if (!ownPartyId && !remotePartyId) return true;
  return Boolean(ownPartyId && remotePartyId && ownPartyId === remotePartyId);
}

function resolvePlayerLabel(player: PlayerPayload) {
  return player.name?.trim() || player.userId || `Player ${player.clientId.slice(0, 6)}`;
}

function syncMediaPeersAndVolumes() {
  const allowedPeerIds: string[] = [];

  for (const [clientId, player] of playersByClientId.entries()) {
    if (clientId === selfClientId) continue;

    if (canShareMediaWithParty(player.partyId)) {
      allowedPeerIds.push(clientId);
      knownRemoteVolumeIds.add(clientId);
      media.upsertRemoteVolume(
        clientId,
        resolvePlayerLabel(player),
        webrtc.getRemoteVolume(clientId)
      );
    } else {
      knownRemoteVolumeIds.delete(clientId);
      media.removeRemoteVolume(clientId);
    }
  }

  webrtc.syncPeers(allowedPeerIds);

  for (const clientId of [...knownRemoteVolumeIds]) {
    if (!playersByClientId.has(clientId)) {
      knownRemoteVolumeIds.delete(clientId);
      media.removeRemoteVolume(clientId);
    }
  }
}

function canInviteClient(clientId: string) {
  const user = auth.getCurrentUser();
  const player = playersByClientId.get(clientId);
  if (!user || !player?.userId) return false;
  if (clientId === selfClientId) return false;

  if (!party.canInvite()) return false;

  const existingMemberIds = new Set(
    partyState.party?.members.map((member) => member.userId) ?? []
  );

  return !existingMemberIds.has(player.userId);
}

function inviteClient(clientId: string) {
  if (!canInviteClient(clientId)) return;
  realtime.sendPartyInvite({ targetClientId: clientId });
}

function setWorldNotice(message: string) {
  if (!worldStatus) return;
  worldStatus.textContent = message;
}

function getGenerationStatusLabel(task: WorldAssetGenerationTask) {
  if (task.status === "COMPLETED") return "Completed";
  if (task.status === "FAILED") return "Failed";
  if (task.meshyStatus) return task.meshyStatus.replace(/_/g, " ");
  return task.status === "IN_PROGRESS" ? "In progress" : "Queued";
}

function stopWorldGenerationPolling() {
  if (worldGenerationPollTimer !== null) {
    window.clearInterval(worldGenerationPollTimer);
    worldGenerationPollTimer = null;
  }
}

function startWorldGenerationPolling() {
  stopWorldGenerationPolling();
  if (!worldState?.canManage) return;

  worldGenerationPollTimer = window.setInterval(() => {
    void loadWorldGenerationTasks();
  }, 10000);
}

async function loadWorldGenerationTasks() {
  if (!auth.getCurrentUser() || !worldState?.canManage) {
    worldGenerationTasks = [];
    renderWorldAssets();
    stopWorldGenerationPolling();
    return;
  }

  const response = await fetch(apiUrl("/api/v1/world/assets/generations"), {
    credentials: "include"
  });
  if (!response.ok) {
    return;
  }

  const payload = (await response.json()) as {
    tasks: WorldAssetGenerationTask[];
  };
  const previousTaskStatusById = new Map(
    worldGenerationTasks.map((task) => [task.id, task.status])
  );
  worldGenerationTasks = payload.tasks;
  renderWorldAssets();

  const hasNewlyCompletedTask = worldGenerationTasks.some((task) => {
    if (task.status !== "COMPLETED") return false;
    if (!task.generatedAssetId) return false;
    return previousTaskStatusById.get(task.id) !== "COMPLETED";
  });
  if (hasNewlyCompletedTask) {
    await loadWorldState();
    return;
  }

  const latestFailedTask = worldGenerationTasks.find(
    (task) =>
      task.status === "FAILED" && previousTaskStatusById.get(task.id) !== "FAILED"
  );
  if (latestFailedTask) {
    setWorldNotice(
      latestFailedTask.failureReason
        ? `Text-to-3D failed: ${latestFailedTask.failureReason}`
        : "Text-to-3D generation failed"
    );
  }
}

function syncWorldVisibilityControls() {
  if (
    !worldPublicToggle ||
    !worldSettingsSaveButton ||
    !worldNameInput ||
    !worldDescriptionInput
  ) {
    return;
  }
  if (!worldState) {
    worldNameInput.value = "";
    worldDescriptionInput.value = "";
    worldPublicToggle.checked = false;
    worldPublicToggle.disabled = true;
    worldNameInput.disabled = true;
    worldDescriptionInput.disabled = true;
    worldSettingsSaveButton.disabled = true;
    if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
    if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
    if (worldGenerateButton) worldGenerateButton.disabled = true;
    return;
  }

  worldNameInput.value = worldState.worldName;
  worldDescriptionInput.value = worldState.worldDescription ?? "";
  worldPublicToggle.checked = worldState.isPublic;
  worldPublicToggle.disabled = !worldState.canManageVisibility;
  worldNameInput.disabled = !worldState.canManageVisibility;
  worldDescriptionInput.disabled = !worldState.canManageVisibility;
  worldSettingsSaveButton.disabled = !worldState.canManageVisibility;
  if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = !worldState.canManage;
  if (worldGenerateNameInput) worldGenerateNameInput.disabled = !worldState.canManage;
  if (worldGenerateButton) worldGenerateButton.disabled = !worldState.canManage;
}

function getWorldAssetLabel(asset: WorldAsset) {
  const currentVersion = asset.currentVersion?.version ?? 0;
  return `${asset.name} (v${currentVersion})`;
}

function createReplaceInput(onSelect: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".glb";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onSelect(file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

async function loadWorldState() {
  if (!auth.getCurrentUser()) {
    worldState = null;
    worldGenerationTasks = [];
    stopWorldGenerationPolling();
    game.setWorldData(null);
    setWorldNotice("Sign in to load world");
    if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
    if (worldUploadButton) worldUploadButton.disabled = true;
    if (worldModelFileInput) worldModelFileInput.disabled = true;
    if (worldModelNameInput) worldModelNameInput.disabled = true;
    if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
    if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
    if (worldGenerateButton) worldGenerateButton.disabled = true;
    syncWorldVisibilityControls();
    return;
  }

  const response = await fetch(apiUrl("/api/v1/world"), {
    credentials: "include"
  });

  if (!response.ok) {
    setWorldNotice("Failed to load world");
    return;
  }

  const payload = (await response.json()) as WorldState;
  worldState = payload;
  if (partyState.party) {
    partyState = {
      ...partyState,
      party: {
        ...partyState.party,
        name: payload.worldName,
        description: payload.worldDescription,
        isPublic: payload.isPublic
      }
    };
    party.setPartyState(partyState);
  }
  game.setWorldData(payload);
  if (worldUploadButton) worldUploadButton.disabled = !payload.canManage;
  if (worldModelFileInput) worldModelFileInput.disabled = !payload.canManage;
  if (worldModelNameInput) worldModelNameInput.disabled = !payload.canManage;
  if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = !payload.canManage;
  if (worldGenerateNameInput) worldGenerateNameInput.disabled = !payload.canManage;
  if (worldGenerateButton) worldGenerateButton.disabled = !payload.canManage;

  const worldOwnerLabel =
    payload.worldOwnerId === auth.getCurrentUser()?.id ? "Your world" : "Visited world";
  setWorldNotice(
    `${payload.worldName} • ${worldOwnerLabel} • ${payload.isPublic ? "Public" : "Private"} • ${
      payload.assets.length
    } models • ${payload.placements.length} placements`
  );

  syncWorldVisibilityControls();
  startWorldGenerationPolling();
  void loadWorldGenerationTasks();
  renderWorldAssets();
}

function renderWorldAssets() {
  if (!worldAssetsContainer) return;
  worldAssetsContainer.innerHTML = "";

  const assets = worldState?.assets ?? [];
  if (assets.length === 0 && worldGenerationTasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No models uploaded";
    worldAssetsContainer.appendChild(empty);
    return;
  }

  for (const task of worldGenerationTasks) {
    if (task.status === "COMPLETED") continue;

    const row = document.createElement("div");
    row.className = "world-asset-row";

    const label = document.createElement("div");
    label.className = "party-result-label";
    label.textContent = `${task.modelName} • ${getGenerationStatusLabel(task)}`;
    label.title = task.prompt;

    row.appendChild(label);
    worldAssetsContainer.appendChild(row);
  }

  for (const asset of assets) {
    const row = document.createElement("div");
    row.className = "world-asset-row";

    const label = document.createElement("div");
    label.className = "party-result-label";
    label.textContent = getWorldAssetLabel(asset);
    label.title = `${asset.name} (${asset.versions.length} versions)`;

    const placeButton = document.createElement("button");
    placeButton.className = "party-secondary-button";
    placeButton.type = "button";
    placeButton.textContent = selectedPlacementAssetId === asset.id ? "Placing..." : "Place";
    placeButton.disabled = !worldState?.canManage;
    placeButton.addEventListener("click", () => {
      selectedPlacementAssetId = asset.id;
      isPlacingModel = true;
      setWorldNotice(`Placement mode: ${asset.name}. Click the floor to place.`);
      renderWorldAssets();
    });

    const replaceButton = document.createElement("button");
    replaceButton.className = "party-secondary-button";
    replaceButton.type = "button";
    replaceButton.textContent = "Replace";
    replaceButton.disabled = !worldState?.canManage;
    replaceButton.addEventListener("click", () => {
      createReplaceInput(async (file) => {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("name", asset.name);
        const response = await fetch(
          apiUrl(`/api/v1/world/assets/${encodeURIComponent(asset.id)}/versions`),
          {
            method: "POST",
            credentials: "include",
            body: formData
          }
        );
        if (!response.ok) {
          setWorldNotice("Replace failed");
          return;
        }
        await loadWorldState();
      });
    });

    const downloadButton = document.createElement("a");
    downloadButton.className = "party-secondary-button";
    downloadButton.textContent = "Download";
    const fileUrl = asset.currentVersion?.fileUrl
      ? apiUrl(asset.currentVersion.fileUrl)
      : null;
    downloadButton.href = fileUrl ?? "#";
    downloadButton.style.textDecoration = "none";
    downloadButton.style.textAlign = "center";
    downloadButton.target = "_blank";
    downloadButton.rel = "noreferrer";
    if (!fileUrl) {
      downloadButton.style.pointerEvents = "none";
      downloadButton.style.opacity = "0.5";
    }

    row.appendChild(label);
    row.appendChild(placeButton);
    row.appendChild(replaceButton);
    row.appendChild(downloadButton);
    worldAssetsContainer.appendChild(row);
  }
}

const game = createGameScene({
  mount: app,
  onLocalStateChange(state) {
    realtime.sendPlayerUpdate(state);
  },
  onRemoteInviteClick(clientId) {
    inviteClient(clientId);
  },
  canShowRemoteInvite(clientId) {
    return canInviteClient(clientId);
  },
  onWorldPlacementRequest(position) {
    if (!isPlacingModel || !selectedPlacementAssetId || !worldState?.canManage) {
      return false;
    }

    void (async () => {
      const response = await fetch(apiUrl("/api/v1/world/placements"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assetId: selectedPlacementAssetId,
          position,
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        })
      });

      if (!response.ok) {
        setWorldNotice("Placement failed");
        return;
      }

      isPlacingModel = false;
      selectedPlacementAssetId = null;
      await loadWorldState();
    })();

    return true;
  }
});

const auth = createAuthController({
  elements: {
    loginMenu: document.getElementById("login-menu") as HTMLElement | null,
    loginToggleButton: document.getElementById("login-toggle") as HTMLButtonElement | null,
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
    party.setCurrentUser(user);

    const canPartyChat = Boolean(user) && Boolean(partyState.party);
    partyChat.setCanPost(canPartyChat, canPartyChat ? "Type a message" : "Join a world to chat");

    if (!user) {
      worldState = null;
      worldGenerationTasks = [];
      stopWorldGenerationPolling();
      isPlacingModel = false;
      selectedPlacementAssetId = null;
      game.setWorldData(null);
      setWorldNotice("Sign in to load world");
      if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
      syncWorldVisibilityControls();
      return;
    }

    void loadWorldState();
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

const party = createPartyController({
  elements: {
    status: document.getElementById("party-status") as HTMLDivElement | null,
    searchInput: document.getElementById("party-search-input") as HTMLInputElement | null,
    searchButton: document.getElementById("party-search-button") as HTMLButtonElement | null,
    searchResults: document.getElementById("party-search-results") as HTMLDivElement | null,
    memberList: document.getElementById("party-members") as HTMLDivElement | null,
    leaveButton: document.getElementById("party-leave-button") as HTMLButtonElement | null,
    inviteModal: document.getElementById("party-invite-modal") as HTMLDivElement | null,
    inviteModalText: document.getElementById("party-invite-text") as HTMLDivElement | null,
    inviteAcceptButton: document.getElementById("party-invite-accept") as HTMLButtonElement | null,
    inviteDeclineButton: document.getElementById("party-invite-decline") as HTMLButtonElement | null
  },
  async onSearch(query) {
    const response = await fetch(
      apiUrl(`/api/v1/worlds/search?query=${encodeURIComponent(query)}`),
      {
        credentials: "include"
      }
    );

    if (!response.ok) {
      throw new Error("World search failed");
    }

    const payload = (await response.json()) as {
      results: Array<{
        id: string;
        name: string;
        description: string | null;
        owner: {
          id: string;
          name: string;
          avatarUrl: string | null;
        };
        isPublic: boolean;
        memberCount: number;
        onlineVisitorCount: number;
        modelCount: number;
        placementCount: number;
        updatedAt: string;
        isCurrentWorld: boolean;
        canJoin: boolean;
      }>;
    };

    return payload.results;
  },
  onJoinWorld(worldId) {
    realtime.sendWorldJoin(worldId);
  },
  onInviteResponse(inviteId, accept) {
    realtime.sendPartyInviteResponse(inviteId, accept);
  },
  onLeave() {
    realtime.sendPartyLeave();
  },
  onKick(userId) {
    realtime.sendPartyKick(userId);
  },
  onPromote(userId) {
    realtime.sendPartyPromote(userId);
  }
});

const realtime = createRealtimeClient(resolveWsUrl(apiBase, wsBase), {
  onStatus(status) {
    chat.setStatus(status);
    if (status === "Connected" && auth.getCurrentUser()) {
      void loadWorldState();
    }
  },
  onSessionInfo(clientId) {
    selfClientId = clientId;
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
    playersByClientId.clear();
    for (const player of players) {
      playersByClientId.set(player.clientId, player);
    }

    game.applyRemoteSnapshot(players);
    syncMediaPeersAndVolumes();
  },
  onPlayerUpdate(player) {
    playersByClientId.set(player.clientId, player);
    game.applyRemoteUpdate(player);
    syncMediaPeersAndVolumes();
  },
  onPlayerMedia(player) {
    game.setRemoteMediaState(
      player.clientId,
      player.micMuted,
      player.cameraEnabled
    );
  },
  onPlayerLeave(clientId) {
    playersByClientId.delete(clientId);
    game.removeRemotePlayer(clientId);
    webrtc.removePeer(clientId);
    knownRemoteVolumeIds.delete(clientId);
    media.removeRemoteVolume(clientId);
  },
  onPlayerParty(clientId, partyId) {
    const player = playersByClientId.get(clientId);
    if (!player) return;
    player.partyId = partyId;
    playersByClientId.set(clientId, player);
    syncMediaPeersAndVolumes();
  },
  onPartyState(state) {
    partyState = state;
    party.setPartyState(state);

    const canPartyChat = Boolean(auth.getCurrentUser()) && Boolean(state.party);
    partyChat.setCanPost(canPartyChat, canPartyChat ? "Type a message" : "Join a world to chat");
    partyChat.setStatus(state.party ? "Connected" : "Join a world to chat");

    syncMediaPeersAndVolumes();
    void loadWorldState();
  },
  onPartyInvite(invite) {
    party.addIncomingInvite(invite);
  },
  onPartyChatHistory(messages) {
    partyChat.replaceHistory(messages);
  },
  onPartyChatMessage(message) {
    partyChat.appendMessage(message);
  },
  onRtcSignal(fromClientId, signal) {
    void webrtc.handleSignal(fromClientId, signal);
  },
  onAuthRequired() {
    chat.setStatus("Sign in to send messages");
    party.setNotice("Sign in to use worlds");
  },
  onError(code, payload) {
    const partyErrorCodes = new Set([
      "NOT_PARTY_LEADER",
      "NOT_PARTY_MANAGER_OR_LEADER",
      "TARGET_ALREADY_IN_PARTY",
      "TARGET_ALREADY_MANAGER",
      "TARGET_OFFLINE",
      "INVITE_COOLDOWN",
      "NOT_IN_PARTY",
      "INVITE_EXPIRED",
      "PARTY_MEDIA_RESTRICTED",
      "CANNOT_KICK_LEADER",
      "WORLD_NOT_PUBLIC",
      "WORLD_NOT_FOUND",
      "WORLD_OWNER_CANNOT_LEAVE"
    ]);

    if (partyErrorCodes.has(code)) {
      if (code === "INVITE_COOLDOWN") {
        const retryMs = Number(payload.retryAfterMs ?? 0);
        const retrySeconds = Math.max(1, Math.ceil(retryMs / 1000));
        party.setNotice(`Invite cooldown (${retrySeconds}s)`);
      } else {
        party.setNotice(code.split("_").join(" "));
      }
    }
  }
});

chat.onSubmit((text) => {
  if (!auth.getCurrentUser()) return;
  realtime.sendChat(text);
});

partyChat.onSubmit((text) => {
  if (!auth.getCurrentUser() || !partyState.party) return;
  realtime.sendPartyChat(text);
});

setupPanelToggle(dockPanel, dockMinimizeButton, "panel");
setupTabs();

worldGenerateForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!worldState?.canManage) {
    setWorldNotice("Only world owners/managers can modify this world");
    return;
  }

  const prompt = worldGeneratePromptInput?.value?.trim() ?? "";
  if (!prompt) {
    setWorldNotice("Enter a prompt first");
    return;
  }

  void (async () => {
    setWorldNotice("Queueing text-to-3D generation...");
    const response = await fetch(apiUrl("/api/v1/world/assets/generate"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        name: worldGenerateNameInput?.value?.trim() ?? ""
      })
    });

    if (!response.ok) {
      setWorldNotice("Failed to queue text-to-3D job");
      return;
    }

    if (worldGeneratePromptInput) {
      worldGeneratePromptInput.value = "";
    }
    if (worldGenerateNameInput) {
      worldGenerateNameInput.value = "";
    }

    setWorldNotice("Text-to-3D job queued. It will continue if you go offline.");
    await loadWorldGenerationTasks();
  })();
});

worldUploadForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const file = worldModelFileInput?.files?.[0];
  if (!file) {
    setWorldNotice("Select a GLB file first");
    return;
  }
  if (!worldState?.canManage) {
    setWorldNotice("Only world owners/managers can modify this world");
    return;
  }

  void (async () => {
    setWorldNotice("Uploading model...");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("name", worldModelNameInput?.value?.trim() || file.name.replace(/\.glb$/i, ""));

    const response = await fetch(apiUrl("/api/v1/world/assets"), {
      method: "POST",
      credentials: "include",
      body: formData
    });

    if (!response.ok) {
      setWorldNotice("Upload failed");
      return;
    }

    if (worldModelFileInput) {
      worldModelFileInput.value = "";
    }
    if (worldModelNameInput) {
      worldModelNameInput.value = "";
    }

    await loadWorldState();
  })();
});

worldSettingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (
    !worldState?.canManageVisibility ||
    !worldPublicToggle ||
    !worldNameInput ||
    !worldDescriptionInput
  ) {
    return;
  }

  void (async () => {
    const name = worldNameInput.value.trim();
    if (!name) {
      setWorldNotice("World name is required");
      return;
    }
    const isPublic = worldPublicToggle.checked;
    const description = worldDescriptionInput.value.trim();
    const response = await fetch(apiUrl("/api/v1/world/settings"), {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        description,
        isPublic
      })
    });

    if (!response.ok) {
      setWorldNotice("World settings update failed");
      return;
    }

    await loadWorldState();
    party.setNotice("World settings saved");
  })();
});

const shouldMinimizeByDefault = window.matchMedia(
  "(max-width: 700px) and (max-height: 850px)"
).matches;
if (shouldMinimizeByDefault) {
  setPanelMinimized(dockPanel, dockMinimizeButton, "panel", true);
}

auth.setup();
party.setup();
media.setup();
media.setMicMuted(webrtc.getMicMuted());
media.setCameraEnabled(webrtc.getCameraEnabled());
game.setLocalMediaState(webrtc.getMicMuted(), webrtc.getCameraEnabled());
media.setPermissionState("not_requested");
partyChat.setCanPost(false, "Join a world to chat");
setWorldNotice("Sign in to load world");
if (worldUploadButton) worldUploadButton.disabled = true;
if (worldModelFileInput) worldModelFileInput.disabled = true;
if (worldModelNameInput) worldModelNameInput.disabled = true;
if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
if (worldGenerateButton) worldGenerateButton.disabled = true;
syncWorldVisibilityControls();
void auth.loadCurrentUser();
realtime.connect();
void webrtc.refreshDevices();
game.start();
