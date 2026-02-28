/// <reference types="vite/client" />
import "./style.css";

import { createGameScene } from "./game/scene";
import {
  buildWorldUrl,
  createApiUrlResolver,
  PENDING_WORLD_JOIN_STORAGE_KEY,
  parseWorldIdFromUrl,
  resolveWsUrl
} from "./lib/urls";
import type {
  ChatMessage,
  CurrentUser,
  PartyState,
  PlayerAvatarSelection,
  PlayerPayload,
  WorldAsset,
  WorldAssetGenerationTask,
  WorldPortal,
  WorldPhotoWall,
  WorldPost,
  WorldPostComment,
  WorldPlacement,
  WorldState
} from "./lib/types";
import { createRealtimeClient } from "./network/realtime";
import { createWebRtcController } from "./network/webrtc";
import { createAuthController } from "./ui/auth";
import { createChatController } from "./ui/chat";
import { createMediaController } from "./ui/media";
import { createPartyController } from "./ui/party";
import { createWorldMapController } from "./ui/world-map";

const app = document.getElementById("app");

if (!app) {
  throw new Error("#app not found");
}

const dockPanel = document.getElementById("dock-panel") as HTMLElement | null;
const worldMapScreen = document.getElementById("world-map-screen") as HTMLElement | null;
const worldMapCanvas = document.getElementById("world-map-canvas") as HTMLElement | null;
const worldMapStatus = document.getElementById("world-map-status") as HTMLDivElement | null;
const worldMapSavePinButton = document.getElementById(
  "world-map-save-pin"
) as HTMLButtonElement | null;
const worldMapZoomInButton = document.getElementById(
  "world-map-zoom-in"
) as HTMLButtonElement | null;
const worldMapZoomOutButton = document.getElementById(
  "world-map-zoom-out"
) as HTMLButtonElement | null;
const worldMapWorldCard = document.getElementById(
  "world-map-world-card"
) as HTMLElement | null;
const worldMapWorldName = document.getElementById(
  "world-map-world-name"
) as HTMLElement | null;
const worldMapWorldOwner = document.getElementById(
  "world-map-world-owner"
) as HTMLElement | null;
const worldMapWorldDesc = document.getElementById(
  "world-map-world-desc"
) as HTMLElement | null;
const worldMapJoinWorldButton = document.getElementById(
  "world-map-join-world"
) as HTMLButtonElement | null;
const homeMapButton = document.getElementById("home-map-button") as HTMLButtonElement | null;
const dockMinimizeButton = document.getElementById("dock-minimize") as HTMLButtonElement | null;
const dockHeightToggleButton = document.getElementById(
  "dock-height-toggle"
) as HTMLButtonElement | null;
const chatTabButton = document.getElementById("tab-chat") as HTMLButtonElement | null;
const partyTabButton = document.getElementById("tab-party") as HTMLButtonElement | null;
const mediaTabButton = document.getElementById("tab-media") as HTMLButtonElement | null;
const controlsTabButton = document.getElementById("tab-controls") as HTMLButtonElement | null;
const chatPane = document.getElementById("pane-chat") as HTMLElement | null;
const partyPane = document.getElementById("pane-party") as HTMLElement | null;
const mediaPane = document.getElementById("pane-media") as HTMLElement | null;
const controlsPane = document.getElementById("pane-controls") as HTMLElement | null;
const partyWorldSubtabButton = document.getElementById(
  "party-subtab-world"
) as HTMLButtonElement | null;
const partyObjectsSubtabButton = document.getElementById(
  "party-subtab-objects"
) as HTMLButtonElement | null;
const partyPostsSubtabButton = document.getElementById(
  "party-subtab-posts"
) as HTMLButtonElement | null;
const partyWallsSubtabButton = document.getElementById(
  "party-subtab-walls"
) as HTMLButtonElement | null;
const partyWorldSubpane = document.getElementById("party-subpane-world") as HTMLElement | null;
const partyObjectsSubpane = document.getElementById(
  "party-subpane-objects"
) as HTMLElement | null;
const partyPostsSubpane = document.getElementById(
  "party-subpane-posts"
) as HTMLElement | null;
const partyWallsSubpane = document.getElementById(
  "party-subpane-walls"
) as HTMLElement | null;

const cameraZoomSlider = document.getElementById(
  "camera-zoom-slider"
) as HTMLInputElement | null;
const cameraZoomInput = document.getElementById("camera-zoom-input") as HTMLInputElement | null;
const cameraRotateYSlider = document.getElementById(
  "camera-rotate-y-slider"
) as HTMLInputElement | null;
const cameraRotateYInput = document.getElementById(
  "camera-rotate-y-input"
) as HTMLInputElement | null;
const cameraRotateZSlider = document.getElementById(
  "camera-rotate-z-slider"
) as HTMLInputElement | null;
const cameraRotateZInput = document.getElementById(
  "camera-rotate-z-input"
) as HTMLInputElement | null;
const avatarStationarySelect = document.getElementById(
  "avatar-stationary-select"
) as HTMLSelectElement | null;
const avatarMoveSelect = document.getElementById(
  "avatar-move-select"
) as HTMLSelectElement | null;
const avatarSpecialSelect = document.getElementById(
  "avatar-special-select"
) as HTMLSelectElement | null;

const apiBase = import.meta.env.VITE_API_BASE_URL;
const wsBase = import.meta.env.VITE_WS_URL;

const apiUrl = createApiUrlResolver(apiBase);

function readInitialLinkedWorldId() {
  try {
    const worldIdFromUrl = parseWorldIdFromUrl(new URL(window.location.href));
    if (worldIdFromUrl) {
      window.sessionStorage.setItem(PENDING_WORLD_JOIN_STORAGE_KEY, worldIdFromUrl);
      return worldIdFromUrl;
    }

    const storedWorldId =
      window.sessionStorage.getItem(PENDING_WORLD_JOIN_STORAGE_KEY)?.trim() ?? "";
    return storedWorldId || null;
  } catch {
    return null;
  }
}

type DockHeightState = "quarter" | "half" | "full";
type PartySubtabKey = "world" | "objects" | "posts" | "walls";
type MainTabKey = "chat" | "party" | "media" | "controls";
let setActiveMainTab: ((tab: MainTabKey) => void) | null = null;
let setActivePartySubtab: ((tab: PartySubtabKey) => void) | null = null;

function setDockHeightState(
  panel: HTMLElement | null,
  button: HTMLButtonElement | null,
  state: DockHeightState
) {
  if (!panel || !button) return;

  panel.classList.remove("height-quarter", "height-half", "height-full");
  panel.classList.add(
    state === "quarter"
      ? "height-quarter"
      : state === "half"
        ? "height-half"
        : "height-full"
  );

  if (state === "quarter") {
    button.textContent = "1/4";
    button.setAttribute("aria-label", "Set panel height to half");
    return;
  }
  if (state === "half") {
    button.textContent = "1/2";
    button.setAttribute("aria-label", "Set panel height to full");
    return;
  }

  button.textContent = "Full";
  button.setAttribute("aria-label", "Set panel height to quarter");
}

function setupDockHeightToggle(
  panel: HTMLElement | null,
  button: HTMLButtonElement | null
) {
  if (!panel || !button) return;

  const states: DockHeightState[] = ["quarter", "half", "full"];
  let index = 0;
  setDockHeightState(panel, button, states[index]!);

  button.addEventListener("click", () => {
    index = (index + 1) % states.length;
    setDockHeightState(panel, button, states[index]!);
  });
}

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
    !controlsTabButton ||
    !chatPane ||
    !partyPane ||
    !mediaPane ||
    !controlsPane
  ) {
    return;
  }

  const tabs = [chatTabButton, partyTabButton, mediaTabButton, controlsTabButton];
  const panes = [chatPane, partyPane, mediaPane, controlsPane];

  const setActive = (tab: "chat" | "party" | "media" | "controls") => {
    const activeIndex =
      tab === "chat" ? 0 : tab === "party" ? 1 : tab === "media" ? 2 : 3;
    for (let i = 0; i < tabs.length; i += 1) {
      tabs[i]!.classList.toggle("active", i === activeIndex);
      tabs[i]!.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
      panes[i]!.classList.toggle("active", i === activeIndex);
    }
  };
  setActiveMainTab = setActive;

  chatTabButton.addEventListener("click", () => setActive("chat"));
  partyTabButton.addEventListener("click", () => setActive("party"));
  mediaTabButton.addEventListener("click", () => setActive("media"));
  controlsTabButton.addEventListener("click", () => setActive("controls"));
}

function setupPartySubtabs() {
  if (
    !partyWorldSubtabButton ||
    !partyObjectsSubtabButton ||
    !partyPostsSubtabButton ||
    !partyWallsSubtabButton ||
    !partyWorldSubpane ||
    !partyObjectsSubpane ||
    !partyPostsSubpane ||
    !partyWallsSubpane
  ) {
    return;
  }

  const tabs = [
    partyWorldSubtabButton,
    partyObjectsSubtabButton,
    partyPostsSubtabButton,
    partyWallsSubtabButton
  ];
  const panes = [
    partyWorldSubpane,
    partyObjectsSubpane,
    partyPostsSubpane,
    partyWallsSubpane
  ];

  const setActive = (tab: PartySubtabKey) => {
    const activeIndex =
      tab === "world" ? 0 : tab === "objects" ? 1 : tab === "posts" ? 2 : 3;
    for (let i = 0; i < tabs.length; i += 1) {
      const active = i === activeIndex;
      tabs[i]!.classList.toggle("active", active);
      tabs[i]!.setAttribute("aria-selected", active ? "true" : "false");
      panes[i]!.classList.toggle("active", active);
      panes[i]!.hidden = !active;
    }
  };
  setActivePartySubtab = setActive;

  partyWorldSubtabButton.addEventListener("click", () => setActive("world"));
  partyObjectsSubtabButton.addEventListener("click", () => setActive("objects"));
  partyPostsSubtabButton.addEventListener("click", () => setActive("posts"));
  partyWallsSubtabButton.addEventListener("click", () => setActive("walls"));
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

function setupChatChannelToggles() {
  chatToggleGlobalButton?.addEventListener("click", () => {
    chatGlobalEnabled = !chatGlobalEnabled;
    syncChatToggleButtons();
    syncChatCanPost();
    renderCombinedChat();
  });

  chatToggleWorldButton?.addEventListener("click", () => {
    chatWorldEnabled = !chatWorldEnabled;
    syncChatToggleButtons();
    syncChatCanPost();
    renderCombinedChat();
  });

  syncChatToggleButtons();
}

const chat = createChatController({
  chatLog: document.getElementById("chat-log") as HTMLDivElement | null,
  chatStatus: document.getElementById("chat-status") as HTMLSpanElement | null,
  chatInput: document.getElementById("chat-input") as HTMLInputElement | null,
  chatSendButton: document.getElementById("chat-send") as HTMLButtonElement | null,
  chatForm: document.getElementById("chat-form") as HTMLFormElement | null
});
const chatToggleGlobalButton = document.getElementById(
  "chat-toggle-global"
) as HTMLButtonElement | null;
const chatToggleWorldButton = document.getElementById(
  "chat-toggle-world"
) as HTMLButtonElement | null;
const shareWorldLinkButton = document.getElementById(
  "share-world-link-button"
) as HTMLButtonElement | null;
const profileMenu = document.getElementById("profile-menu") as HTMLDivElement | null;
const profileToggleButton = document.getElementById(
  "profile-toggle"
) as HTMLButtonElement | null;
const profileSettingsForm = document.getElementById(
  "profile-settings-form"
) as HTMLFormElement | null;
const profileNameInput = document.getElementById(
  "profile-name-input"
) as HTMLInputElement | null;
const profileAvatarUrlInput = document.getElementById(
  "profile-avatar-url-input"
) as HTMLInputElement | null;
const profileWorldNameInput = document.getElementById(
  "profile-world-name-input"
) as HTMLInputElement | null;
const profileWorldDescriptionInput = document.getElementById(
  "profile-world-description-input"
) as HTMLInputElement | null;
const profileWorldPublicToggle = document.getElementById(
  "profile-world-public-toggle"
) as HTMLInputElement | null;
const profileSettingsSaveButton = document.getElementById(
  "profile-settings-save"
) as HTMLButtonElement | null;

let selfClientId: string | null = null;
let partyState: PartyState = {
  party: null,
  pendingInvites: []
};
let globalChatMessages: ChatMessage[] = [];
let worldChatMessages: ChatMessage[] = [];
let chatGlobalEnabled = true;
let chatWorldEnabled = true;
let worldState: WorldState | null = null;
let worldGenerationTasks: WorldAssetGenerationTask[] = [];
let worldGenerationPollTimer: number | null = null;
let selectedPlacementAssetId: string | null = null;
let selectedWorldPlacementId: string | null = null;
let pendingSelectedWorldPlacementId: string | null = null;
let isPlacingModel = false;
let selectedWorldPhotoWallId: string | null = null;
let pendingSelectedWorldPhotoWallId: string | null = null;
let isPlacingPhotoWall = false;
let isSubmittingPhotoWallPlacement = false;
let pendingPhotoWallDraft: { imageUrl: string | null; imageFile: File | null } | null = null;
let selectedWorldPostId: string | null = null;
let pendingSelectedWorldPostId: string | null = null;
let isPlacingPost = false;
let isSubmittingWorldPostPlacement = false;
let pendingWorldPostDraft:
  | { imageUrl: string | null; imageFile: File | null; message: string }
  | null = null;
let editingWorldPostId: string | null = null;
let worldPostComments: WorldPostComment[] = [];
let worldPostCommentsForPostId: string | null = null;
let worldPostCommentsLoading = false;
const placementPersistTimers = new Map<string, number>();
const photoWallPersistTimers = new Map<string, number>();
let pendingAutoJoinWorldId = readInitialLinkedWorldId();
let autoJoinWorldIdSent: string | null = null;
let worldViewActive = Boolean(pendingAutoJoinWorldId);
let knownWorldPortals: WorldPortal[] = [];
const PLAYER_AVATAR_SELECTION_STORAGE_KEY = "augmego_player_avatar_selection_v1";
let playerAvatarSelection: PlayerAvatarSelection = {
  stationaryModelUrl: null,
  moveModelUrl: null,
  specialModelUrl: null
};

const worldStatus = document.getElementById("world-status") as HTMLDivElement | null;
const worldUploadForm = document.getElementById("world-upload-form") as HTMLFormElement | null;
const worldModelNameInput = document.getElementById("world-model-name") as HTMLInputElement | null;
const worldModelVisibilityInput = document.getElementById(
  "world-model-visibility"
) as HTMLSelectElement | null;
const worldModelFileInput = document.getElementById("world-model-file") as HTMLInputElement | null;
const worldUploadButton = document.getElementById("world-upload-button") as HTMLButtonElement | null;
const worldGenerateForm = document.getElementById("world-generate-form") as HTMLFormElement | null;
const worldGenerateImageForm = document.getElementById(
  "world-generate-image-form"
) as HTMLFormElement | null;
const worldGeneratePromptInput = document.getElementById(
  "world-generate-prompt"
) as HTMLInputElement | null;
const worldGenerateImageFileInput = document.getElementById(
  "world-generate-image-file"
) as HTMLInputElement | null;
const worldGenerateNameInput = document.getElementById("world-generate-name") as HTMLInputElement | null;
const worldGenerateVisibilityInput = document.getElementById(
  "world-generate-visibility"
) as HTMLSelectElement | null;
const worldGenerateTypeInput = document.getElementById(
  "world-generate-type"
) as HTMLSelectElement | null;
const worldGenerateEnhancedGraphicsInput = document.getElementById(
  "world-generate-enhanced-graphics"
) as HTMLInputElement | null;
const worldGenerateButton = document.getElementById(
  "world-generate-button"
) as HTMLButtonElement | null;
const worldGenerateImageButton = document.getElementById(
  "world-generate-image-button"
) as HTMLButtonElement | null;
const worldAssetsContainer = document.getElementById("world-assets") as HTMLDivElement | null;
const worldPlacementsContainer = document.getElementById("world-placements") as HTMLDivElement | null;
const worldPlacementEditor = document.getElementById(
  "world-placement-editor"
) as HTMLDivElement | null;
const worldPhotoWallForm = document.getElementById(
  "world-photo-wall-form"
) as HTMLFormElement | null;
const worldPhotoWallImageUrlInput = document.getElementById(
  "world-photo-wall-image-url"
) as HTMLInputElement | null;
const worldPhotoWallImageFileInput = document.getElementById(
  "world-photo-wall-image-file"
) as HTMLInputElement | null;
const worldPhotoWallButton = document.getElementById(
  "world-photo-wall-button"
) as HTMLButtonElement | null;
const worldPhotoWallsContainer = document.getElementById(
  "world-photo-walls"
) as HTMLDivElement | null;
const worldPhotoWallEditor = document.getElementById(
  "world-photo-wall-editor"
) as HTMLDivElement | null;
const worldPostForm = document.getElementById("world-post-form") as HTMLFormElement | null;
const worldPostImageUrlInput = document.getElementById(
  "world-post-image-url"
) as HTMLInputElement | null;
const worldPostImageFileInput = document.getElementById(
  "world-post-image-file"
) as HTMLInputElement | null;
const worldPostMessageInput = document.getElementById(
  "world-post-message"
) as HTMLInputElement | null;
const worldPostButton = document.getElementById("world-post-button") as HTMLButtonElement | null;
const worldPostEditButton = document.getElementById(
  "world-post-edit-button"
) as HTMLButtonElement | null;
const worldPostSaveEditButton = document.getElementById(
  "world-post-save-edit-button"
) as HTMLButtonElement | null;
const worldPostCancelEditButton = document.getElementById(
  "world-post-cancel-edit-button"
) as HTMLButtonElement | null;
const worldPostsContainer = document.getElementById("world-posts") as HTMLDivElement | null;
const worldPostCommentsStatus = document.getElementById(
  "world-post-comments-status"
) as HTMLDivElement | null;
const worldPostCommentsContainer = document.getElementById(
  "world-post-comments"
) as HTMLDivElement | null;
const worldPostCommentForm = document.getElementById(
  "world-post-comment-form"
) as HTMLFormElement | null;
const worldPostCommentInput = document.getElementById(
  "world-post-comment-input"
) as HTMLInputElement | null;
const worldPostCommentSendButton = document.getElementById(
  "world-post-comment-send"
) as HTMLButtonElement | null;
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

function setProfileMenuExpanded(expanded: boolean) {
  if (!profileMenu || !profileToggleButton) return;
  profileMenu.classList.toggle("expanded", expanded);
  profileToggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function syncProfileSettingsForm() {
  const user = auth.getCurrentUser();
  const canEditWorld = Boolean(worldState?.canManageVisibility);

  if (profileNameInput) {
    profileNameInput.value = user?.name ?? "";
    profileNameInput.disabled = !user;
  }
  if (profileAvatarUrlInput) {
    profileAvatarUrlInput.value = user?.avatarUrl ?? "";
    profileAvatarUrlInput.disabled = !user;
  }
  if (profileWorldNameInput) {
    profileWorldNameInput.value = canEditWorld ? worldState?.worldName ?? "" : "";
    profileWorldNameInput.disabled = !canEditWorld;
  }
  if (profileWorldDescriptionInput) {
    profileWorldDescriptionInput.value = canEditWorld
      ? worldState?.worldDescription ?? ""
      : "";
    profileWorldDescriptionInput.disabled = !canEditWorld;
  }
  if (profileWorldPublicToggle) {
    profileWorldPublicToggle.checked = true;
    profileWorldPublicToggle.disabled = true;
  }
  if (profileSettingsSaveButton) {
    profileSettingsSaveButton.disabled = !user;
  }
}

function setupProfileMenu() {
  profileToggleButton?.addEventListener("click", () => {
    if (!profileMenu) return;
    const expanded = profileMenu.classList.contains("expanded");
    setProfileMenuExpanded(!expanded);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!profileMenu?.classList.contains("expanded")) return;
    if (!profileMenu.contains(target)) {
      setProfileMenuExpanded(false);
    }
  });
}

function buildShareWorldLink(worldId: string) {
  return buildWorldUrl(worldId);
}

function syncShareWorldLinkButton() {
  if (!shareWorldLinkButton) return;
  const canShare = Boolean(auth.getCurrentUser() && worldState?.worldId);
  shareWorldLinkButton.hidden = !canShare;
  shareWorldLinkButton.disabled = !canShare;
  shareWorldLinkButton.title = canShare
    ? "Copy world link"
    : "Sign in and load a world to share";
}

async function copyCurrentWorldLink() {
  if (!worldState?.worldId) {
    setWorldNotice("Load a world before sharing");
    return;
  }

  const shareUrl = buildShareWorldLink(worldState.worldId);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      textArea.setAttribute("readonly", "true");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      if (!copied) throw new Error("copy failed");
    }

    setWorldNotice("World link copied");
  } catch {
    setWorldNotice(`Copy failed. Share this link: ${shareUrl}`);
  }
}

function getGenerationStatusLabel(task: WorldAssetGenerationTask) {
  const modeLabel = task.generationType === "HUMANOID" ? "Humanoid" : "Object";
  const sourceLabel = task.generationSource === "IMAGE" ? "Image" : "Text";
  if (task.status === "COMPLETED") return "Completed";
  if (task.status === "FAILED") return "Failed";
  if (task.meshyStatus) {
    return `${modeLabel} • ${sourceLabel} • ${task.meshyStatus.replace(/_/g, " ")}`;
  }
  return task.status === "IN_PROGRESS"
    ? `${modeLabel} • ${sourceLabel} • In progress`
    : `${modeLabel} • ${sourceLabel} • Queued`;
}

function renderCombinedChat() {
  const entries = [
    ...(chatGlobalEnabled
      ? globalChatMessages.map((message) => ({ channel: "global" as const, message }))
      : []),
    ...(chatWorldEnabled
      ? worldChatMessages.map((message) => ({ channel: "world" as const, message }))
      : [])
  ].sort(
    (a, b) =>
      new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime()
  );

  chat.replaceCombinedHistory(entries);
}

function syncChatToggleButtons() {
  if (chatToggleGlobalButton) {
    chatToggleGlobalButton.classList.toggle("active", chatGlobalEnabled);
    chatToggleGlobalButton.setAttribute(
      "aria-pressed",
      chatGlobalEnabled ? "true" : "false"
    );
  }
  if (chatToggleWorldButton) {
    chatToggleWorldButton.classList.toggle("active", chatWorldEnabled);
    chatToggleWorldButton.setAttribute(
      "aria-pressed",
      chatWorldEnabled ? "true" : "false"
    );
  }
}

function syncChatCanPost() {
  const user = auth.getCurrentUser();
  if (!user) {
    chat.setCanPost(false, "Sign in to chat");
    return;
  }

  const canSendGlobal = chatGlobalEnabled;
  const canSendWorld = chatWorldEnabled && Boolean(partyState.party);
  const canPost = canSendGlobal || canSendWorld;

  if (canPost) {
    chat.setCanPost(true);
    return;
  }

  if (!chatGlobalEnabled && !chatWorldEnabled) {
    chat.setCanPost(false, "Enable Global or World");
    return;
  }

  chat.setCanPost(false, "Join a world to send world chat");
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
    renderWorldPlacements();
    renderWorldPosts();
    renderWorldPlacementEditor();
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
        ? `Generation failed: ${latestFailedTask.failureReason}`
        : "Generation failed"
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
    if (worldGenerateImageFileInput) worldGenerateImageFileInput.disabled = true;
    if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
    if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
    if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
    if (worldGenerateTypeInput) worldGenerateTypeInput.disabled = true;
    if (worldGenerateEnhancedGraphicsInput) {
      worldGenerateEnhancedGraphicsInput.disabled = true;
    }
    if (worldGenerateButton) worldGenerateButton.disabled = true;
    if (worldGenerateImageButton) worldGenerateImageButton.disabled = true;
    if (worldPhotoWallButton) worldPhotoWallButton.disabled = true;
    if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.disabled = true;
    if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.disabled = true;
    if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = true;
    if (worldPostImageFileInput) worldPostImageFileInput.disabled = true;
    if (worldPostMessageInput) worldPostMessageInput.disabled = true;
    if (worldPostButton) worldPostButton.disabled = true;
    if (worldPostCommentInput) worldPostCommentInput.disabled = true;
    if (worldPostCommentSendButton) worldPostCommentSendButton.disabled = true;
    if (worldPostEditButton) worldPostEditButton.disabled = true;
    if (worldPostSaveEditButton) worldPostSaveEditButton.disabled = true;
    if (worldPostCancelEditButton) worldPostCancelEditButton.disabled = true;
    syncProfileSettingsForm();
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
  if (worldGenerateImageFileInput) {
    worldGenerateImageFileInput.disabled = !worldState.canManage;
  }
  if (worldGenerateNameInput) worldGenerateNameInput.disabled = !worldState.canManage;
  if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = !worldState.canManage;
  if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = !worldState.canManage;
  if (worldGenerateTypeInput) worldGenerateTypeInput.disabled = !worldState.canManage;
  if (worldGenerateEnhancedGraphicsInput) {
    worldGenerateEnhancedGraphicsInput.disabled = !worldState.canManage;
  }
  if (worldGenerateButton) worldGenerateButton.disabled = !worldState.canManage;
  if (worldGenerateImageButton) {
    worldGenerateImageButton.disabled = !worldState.canManage;
  }
  if (worldPhotoWallButton) worldPhotoWallButton.disabled = !worldState.canManage;
  if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.disabled = !worldState.canManage;
  if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.disabled = !worldState.canManage;
  if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = !worldState.canManage;
  if (worldPostImageFileInput) worldPostImageFileInput.disabled = !worldState.canManage;
  if (worldPostMessageInput) worldPostMessageInput.disabled = !worldState.canManage;
  if (worldPostButton) worldPostButton.disabled = !worldState.canManage;
  syncWorldPostFormMode();
  syncProfileSettingsForm();
}

function getWorldAssetLabel(asset: WorldAsset) {
  const currentVersion = asset.currentVersion?.version ?? 0;
  return `${asset.name} (v${currentVersion})`;
}

function getPlacementById(placementId: string | null) {
  if (!placementId || !worldState) return null;
  return worldState.placements.find((placement) => placement.id === placementId) ?? null;
}

function getPhotoWallById(photoWallId: string | null) {
  if (!photoWallId || !worldState) return null;
  return worldState.photoWalls.find((wall) => wall.id === photoWallId) ?? null;
}

function getWorldPostById(postId: string | null) {
  if (!postId || !worldState) return null;
  return worldState.posts.find((post) => post.id === postId) ?? null;
}

function resetWorldPostForm() {
  if (worldPostImageUrlInput) worldPostImageUrlInput.value = "";
  if (worldPostImageFileInput) worldPostImageFileInput.value = "";
  if (worldPostMessageInput) worldPostMessageInput.value = "";
}

function syncWorldPostFormMode() {
  const editing = Boolean(editingWorldPostId);
  if (worldPostButton) worldPostButton.textContent = editing ? "Place New Post" : "Place Post";
  if (worldPostSaveEditButton) worldPostSaveEditButton.disabled = !editing || !worldState?.canManage;
  if (worldPostCancelEditButton) worldPostCancelEditButton.disabled = !editing;
  if (worldPostEditButton) {
    worldPostEditButton.disabled = !worldState?.canManage || !selectedWorldPostId;
  }
}

function beginEditSelectedWorldPost() {
  const post = getWorldPostById(selectedWorldPostId);
  if (!post || !worldState?.canManage) return;
  cancelPostPlacementMode();
  editingWorldPostId = post.id;
  if (worldPostImageUrlInput) worldPostImageUrlInput.value = post.imageUrl;
  if (worldPostImageFileInput) worldPostImageFileInput.value = "";
  if (worldPostMessageInput) worldPostMessageInput.value = post.message;
  syncWorldPostFormMode();
  setWorldNotice("Editing selected post. Save Edit to apply changes.");
}

function cancelWorldPostEdit() {
  editingWorldPostId = null;
  resetWorldPostForm();
  syncWorldPostFormMode();
}

function setWorldPostCommentsStatus(message: string) {
  if (worldPostCommentsStatus) worldPostCommentsStatus.textContent = message;
}

function renderWorldPostComments() {
  if (!worldPostCommentsContainer) return;
  worldPostCommentsContainer.innerHTML = "";

  const selectedPost = getWorldPostById(selectedWorldPostId);
  if (!selectedPost) {
    setWorldPostCommentsStatus("Select a post to view comments");
    if (worldPostCommentInput) worldPostCommentInput.disabled = true;
    if (worldPostCommentSendButton) worldPostCommentSendButton.disabled = true;
    return;
  }

  if (worldPostCommentsLoading) {
    setWorldPostCommentsStatus(`Loading comments for ${selectedPost.author.name}...`);
  } else {
    setWorldPostCommentsStatus(
      `${selectedPost.author.name} • ${selectedPost.commentCount} comment${
        selectedPost.commentCount === 1 ? "" : "s"
      }`
    );
  }

  const canComment = Boolean(auth.getCurrentUser());
  if (worldPostCommentInput) worldPostCommentInput.disabled = !canComment || worldPostCommentsLoading;
  if (worldPostCommentSendButton) {
    worldPostCommentSendButton.disabled = !canComment || worldPostCommentsLoading;
  }

  if (worldPostCommentsForPostId !== selectedPost.id && !worldPostCommentsLoading) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Comments not loaded";
    worldPostCommentsContainer.appendChild(empty);
    return;
  }

  if (worldPostCommentsLoading && worldPostComments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Loading comments...";
    worldPostCommentsContainer.appendChild(empty);
    return;
  }

  if (worldPostComments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No comments yet";
    worldPostCommentsContainer.appendChild(empty);
    return;
  }

  for (const comment of worldPostComments) {
    const row = document.createElement("div");
    row.className = "world-comment-row";

    const label = document.createElement("div");
    label.className = "party-result-label";
    const timestamp = new Date(comment.createdAt).toLocaleString();
    label.textContent = `${comment.author.name} • ${timestamp}`;
    label.title = timestamp;

    const body = document.createElement("div");
    body.className = "world-comment-body";
    body.textContent = comment.message;

    row.appendChild(label);
    row.appendChild(body);
    worldPostCommentsContainer.appendChild(row);
  }
}

async function loadCommentsForSelectedPost(force = false) {
  const post = getWorldPostById(selectedWorldPostId);
  if (!post || !auth.getCurrentUser()) {
    worldPostComments = [];
    worldPostCommentsForPostId = null;
    worldPostCommentsLoading = false;
    renderWorldPostComments();
    return;
  }
  if (!force && worldPostCommentsForPostId === post.id) {
    renderWorldPostComments();
    return;
  }

  worldPostCommentsLoading = true;
  worldPostComments = [];
  worldPostCommentsForPostId = post.id;
  renderWorldPostComments();

  const response = await fetch(
    apiUrl(`/api/v1/world/posts/${encodeURIComponent(post.id)}/comments`),
    { credentials: "include" }
  );
  if (!response.ok) {
    worldPostCommentsLoading = false;
    worldPostComments = [];
    renderWorldPostComments();
    setWorldNotice("Failed to load post comments");
    return;
  }

  const payload = (await response.json()) as { comments: WorldPostComment[] };
  if (worldPostCommentsForPostId !== post.id) return;
  worldPostComments = payload.comments;
  worldPostCommentsLoading = false;
  renderWorldPostComments();
}

function cancelPhotoWallPlacementMode() {
  if (!isPlacingPhotoWall && !pendingPhotoWallDraft) return;
  isPlacingPhotoWall = false;
  pendingPhotoWallDraft = null;
  renderWorldPhotoWalls();
}

function cancelPostPlacementMode() {
  if (!isPlacingPost && !pendingWorldPostDraft) return;
  isPlacingPost = false;
  pendingWorldPostDraft = null;
  game.setPendingWorldPostPlacement(null);
  renderWorldPosts();
}

function cancelPlacementMode() {
  if (!isPlacingModel && !selectedPlacementAssetId) return;
  isPlacingModel = false;
  selectedPlacementAssetId = null;
  renderWorldAssets();
}

function setSelectedWorldPost(postId: string | null) {
  if (!worldState) {
    selectedWorldPostId = null;
  } else {
    selectedWorldPostId = worldState.posts.some((post) => post.id === postId) ? postId : null;
  }
  if (selectedWorldPostId) {
    cancelPlacementMode();
    cancelPostPlacementMode();
    cancelPhotoWallPlacementMode();
    selectedWorldPlacementId = null;
    selectedWorldPhotoWallId = null;
  }
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
  renderWorldPosts();
  syncWorldPostFormMode();
  void loadCommentsForSelectedPost();
}

function setSelectedWorldPlacement(placementId: string | null) {
  if (!worldState) {
    selectedWorldPlacementId = null;
  } else {
    selectedWorldPlacementId = worldState.placements.some(
      (placement) => placement.id === placementId
    )
      ? placementId
      : null;
  }
  if (selectedWorldPlacementId) {
    cancelPlacementMode();
    cancelPostPlacementMode();
    cancelPhotoWallPlacementMode();
    selectedWorldPostId = null;
    selectedWorldPhotoWallId = null;
  }
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
  renderWorldPosts();
  syncWorldPostFormMode();
}

function setSelectedWorldPhotoWall(photoWallId: string | null) {
  if (!worldState) {
    selectedWorldPhotoWallId = null;
  } else {
    selectedWorldPhotoWallId = worldState.photoWalls.some((wall) => wall.id === photoWallId)
      ? photoWallId
      : null;
  }
  if (selectedWorldPhotoWallId) {
    cancelPlacementMode();
    cancelPostPlacementMode();
    cancelPhotoWallPlacementMode();
    selectedWorldPlacementId = null;
    selectedWorldPostId = null;
  }
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPosts();
  renderWorldPhotoWalls();
  renderWorldPhotoWallEditor();
  renderWorldPostComments();
}

function applyPlacementLocally(
  placementId: string,
  nextPlacement: WorldPlacement,
  renderUi = true
) {
  if (!worldState) return;
  worldState = {
    ...worldState,
    placements: worldState.placements.map((placement) =>
      placement.id === placementId ? nextPlacement : placement
    )
  };
  game.setWorldData(worldState);
  if (renderUi) {
    renderWorldPlacements();
    renderWorldPlacementEditor();
  }
}

async function persistPlacementTransform(placement: WorldPlacement) {
  const response = await fetch(
    apiUrl(`/api/v1/world/placements/${encodeURIComponent(placement.id)}`),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        position: placement.position,
        rotation: placement.rotation,
        scale: placement.scale
      })
    }
  );
  if (!response.ok) {
    setWorldNotice("Instance transform update failed");
    await loadWorldState();
  }
}

function schedulePlacementTransformPersist(placement: WorldPlacement, delayMs = 120) {
  const existing = placementPersistTimers.get(placement.id);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }
  const timeoutId = window.setTimeout(() => {
    placementPersistTimers.delete(placement.id);
    void persistPlacementTransform(placement);
  }, delayMs);
  placementPersistTimers.set(placement.id, timeoutId);
}

async function persistWorldPostPatch(
  postId: string,
  patch: Partial<{
    position: { x: number; y: number; z: number };
    isMinimized: boolean;
    imageUrl: string;
    message: string;
  }>
) {
  const response = await fetch(apiUrl(`/api/v1/world/posts/${encodeURIComponent(postId)}`), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    setWorldNotice("Post update failed");
    await loadWorldState();
    return false;
  }
  return true;
}

async function replaceWorldPostImage(postId: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch(apiUrl(`/api/v1/world/posts/${encodeURIComponent(postId)}/image`), {
    method: "POST",
    credentials: "include",
    body: formData
  });
  if (!response.ok) {
    setWorldNotice("Post image upload failed");
    return false;
  }
  return true;
}

async function saveWorldPostEdit() {
  const post = getWorldPostById(editingWorldPostId);
  if (!post || !worldState?.canManage) return;

  const message = worldPostMessageInput?.value.trim() ?? "";
  const imageUrlInput = worldPostImageUrlInput?.value.trim() ?? "";
  const imageFile = worldPostImageFileInput?.files?.[0] ?? null;
  if (!message) {
    setWorldNotice("Post message is required");
    return;
  }

  if (imageFile) {
    const uploaded = await replaceWorldPostImage(post.id, imageFile);
    if (!uploaded) return;
  } else if (imageUrlInput !== post.imageUrl) {
    const ok = await persistWorldPostPatch(post.id, { imageUrl: imageUrlInput });
    if (!ok) return;
  }

  if (message !== post.message) {
    const ok = await persistWorldPostPatch(post.id, { message });
    if (!ok) return;
  }

  editingWorldPostId = null;
  if (worldPostImageFileInput) worldPostImageFileInput.value = "";
  await loadWorldState();
  setWorldNotice("Post updated");
  syncWorldPostFormMode();
}

async function toggleSelectedWorldPostMinimized() {
  const post = getWorldPostById(selectedWorldPostId);
  if (!post || !worldState?.canManage) return;
  const ok = await persistWorldPostPatch(post.id, { isMinimized: !post.isMinimized });
  if (!ok) return;
  await loadWorldState();
}

async function deleteSelectedWorldPost() {
  const post = getWorldPostById(selectedWorldPostId);
  if (!post || !worldState?.canManage) return;
  const response = await fetch(apiUrl(`/api/v1/world/posts/${encodeURIComponent(post.id)}`), {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    setWorldNotice("Post delete failed");
    return;
  }
  selectedWorldPostId = null;
  await loadWorldState();
  setWorldNotice("Post deleted");
}

async function moveSelectedWorldPostTo(position: { x: number; y: number; z: number }) {
  const post = getWorldPostById(selectedWorldPostId);
  if (!post || !worldState?.canManage) return false;
  const ok = await persistWorldPostPatch(post.id, { position });
  if (!ok) return false;
  await loadWorldState();
  setWorldNotice("Post moved");
  return true;
}

function commitPlacementTransform(
  placementId: string,
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  },
  options: {
    persistMode?: "immediate" | "debounced";
    renderUi?: boolean;
  } = {}
) {
  const current = getPlacementById(placementId);
  if (!current) return null;

  const nextPlacement: WorldPlacement = {
    ...current,
    position: transform.position,
    rotation: transform.rotation,
    scale: transform.scale
  };
  applyPlacementLocally(placementId, nextPlacement, options.renderUi ?? true);
  if (options.persistMode === "debounced") {
    schedulePlacementTransformPersist(nextPlacement);
  } else {
    const existing = placementPersistTimers.get(nextPlacement.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      placementPersistTimers.delete(nextPlacement.id);
    }
    void persistPlacementTransform(nextPlacement);
  }
  return nextPlacement;
}

async function copySelectedPlacement() {
  const placement = getPlacementById(selectedWorldPlacementId);
  if (!placement || !worldState?.canManage) return;

  const response = await fetch(apiUrl("/api/v1/world/placements"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      assetId: placement.assetId,
      position: {
        x: placement.position.x + 0.5,
        y: placement.position.y,
        z: placement.position.z + 0.5
      },
      rotation: placement.rotation,
      scale: placement.scale
    })
  });

  if (!response.ok) {
    setWorldNotice("Instance copy failed");
    return;
  }

  const payload = (await response.json().catch(() => null)) as
    | { placementId?: string }
    | null;
  pendingSelectedWorldPlacementId = payload?.placementId ?? null;
  await loadWorldState();
  setWorldNotice("Instance copied");
}

async function deleteSelectedPlacement() {
  const placement = getPlacementById(selectedWorldPlacementId);
  if (!placement || !worldState?.canManage) return;

  const response = await fetch(
    apiUrl(`/api/v1/world/placements/${encodeURIComponent(placement.id)}`),
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  if (!response.ok) {
    setWorldNotice("Instance delete failed");
    return;
  }

  selectedWorldPlacementId = null;
  await loadWorldState();
  setWorldNotice("Instance deleted");
}

function applyPhotoWallLocally(photoWallId: string, nextWall: WorldPhotoWall, renderUi = true) {
  if (!worldState) return;
  worldState = {
    ...worldState,
    photoWalls: worldState.photoWalls.map((wall) => (wall.id === photoWallId ? nextWall : wall))
  };
  game.setWorldData(worldState);
  if (renderUi) {
    renderWorldPhotoWalls();
    renderWorldPhotoWallEditor();
  }
}

async function persistPhotoWallTransform(photoWall: WorldPhotoWall) {
  const response = await fetch(
    apiUrl(`/api/v1/world/photo-walls/${encodeURIComponent(photoWall.id)}`),
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position: photoWall.position,
        rotation: photoWall.rotation,
        scale: photoWall.scale
      })
    }
  );
  if (!response.ok) {
    setWorldNotice("Photo wall transform update failed");
    await loadWorldState();
  }
}

function schedulePhotoWallTransformPersist(photoWall: WorldPhotoWall, delayMs = 120) {
  const existing = photoWallPersistTimers.get(photoWall.id);
  if (existing !== undefined) window.clearTimeout(existing);
  const timeoutId = window.setTimeout(() => {
    photoWallPersistTimers.delete(photoWall.id);
    void persistPhotoWallTransform(photoWall);
  }, delayMs);
  photoWallPersistTimers.set(photoWall.id, timeoutId);
}

function commitPhotoWallTransform(
  photoWallId: string,
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  },
  options: { persistMode?: "immediate" | "debounced"; renderUi?: boolean } = {}
) {
  const current = getPhotoWallById(photoWallId);
  if (!current) return null;
  const nextWall: WorldPhotoWall = { ...current, ...transform };
  applyPhotoWallLocally(photoWallId, nextWall, options.renderUi ?? true);
  if (options.persistMode === "debounced") {
    schedulePhotoWallTransformPersist(nextWall);
  } else {
    const existing = photoWallPersistTimers.get(nextWall.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      photoWallPersistTimers.delete(nextWall.id);
    }
    void persistPhotoWallTransform(nextWall);
  }
  return nextWall;
}

async function deleteSelectedPhotoWall() {
  const wall = getPhotoWallById(selectedWorldPhotoWallId);
  if (!wall || !worldState?.canManage) return;
  const response = await fetch(
    apiUrl(`/api/v1/world/photo-walls/${encodeURIComponent(wall.id)}`),
    { method: "DELETE", credentials: "include" }
  );
  if (!response.ok) {
    setWorldNotice("Photo wall delete failed");
    return;
  }
  selectedWorldPhotoWallId = null;
  await loadWorldState();
  setWorldNotice("Photo wall deleted");
}

function renderWorldPhotoWalls() {
  if (!worldPhotoWallsContainer) return;
  worldPhotoWallsContainer.innerHTML = "";
  const walls = worldState?.photoWalls ?? [];
  if (walls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No photo walls placed";
    worldPhotoWallsContainer.appendChild(empty);
    return;
  }
  for (const wall of walls) {
    const row = document.createElement("div");
    row.className = "world-placement-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-placement-select";
    if (wall.id === selectedWorldPhotoWallId) button.classList.add("active");
    button.textContent = `Photo Wall • ${wall.id.slice(0, 8)}`;
    button.title = `Position: ${wall.position.x.toFixed(2)}, ${wall.position.y.toFixed(2)}, ${wall.position.z.toFixed(2)}`;
    button.addEventListener("click", () => setSelectedWorldPhotoWall(wall.id));
    row.appendChild(button);
    worldPhotoWallsContainer.appendChild(row);
  }
}

function renderWorldPhotoWallEditor() {
  if (!worldPhotoWallEditor) return;
  worldPhotoWallEditor.innerHTML = "";
  if (!worldState) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Sign in to edit photo walls";
    worldPhotoWallEditor.appendChild(empty);
    return;
  }
  const selectedWall = getPhotoWallById(selectedWorldPhotoWallId);
  if (!selectedWall) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Select a photo wall from the list or world";
    worldPhotoWallEditor.appendChild(empty);
    return;
  }

  const canEdit = worldState.canManage;
  const radToDeg = (value: number) => (value * 180) / Math.PI;
  const degToRad = (value: number) => (value * Math.PI) / 180;

  const heading = document.createElement("div");
  heading.className = "party-result-label";
  heading.textContent = `Photo Wall • ${selectedWall.id.slice(0, 8)}`;
  worldPhotoWallEditor.appendChild(heading);

  const actions = document.createElement("div");
  actions.className = "world-placement-editor-actions";
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "party-secondary-button";
  deleteButton.textContent = "Delete";
  deleteButton.disabled = !canEdit;
  deleteButton.addEventListener("click", () => void deleteSelectedPhotoWall());
  actions.appendChild(deleteButton);
  worldPhotoWallEditor.appendChild(actions);

  const buildAxisRow = (opts: {
    group: "position" | "rotation" | "scale";
    axis: "x" | "y" | "z";
    value: number;
    inputStep: string;
    sliderMin: number;
    sliderMax: number;
    sliderStep: number;
    sliderMode: "absolute" | "delta";
  }) => {
    const row = document.createElement("div");
    row.className = "world-placement-axis-row";
    const label = document.createElement("span");
    label.className = "world-placement-axis-label";
    label.textContent = opts.axis.toUpperCase();
    const input = document.createElement("input");
    input.type = "number";
    input.className = "world-placement-axis-input";
    input.step = opts.inputStep;
    input.disabled = !canEdit;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "world-placement-axis-slider";
    slider.min = String(opts.sliderMin);
    slider.max = String(opts.sliderMax);
    slider.step = String(opts.sliderStep);
    slider.disabled = !canEdit;
    if (opts.group === "rotation") {
      input.value = radToDeg(opts.value).toFixed(1);
      slider.value = String(Math.max(opts.sliderMin, Math.min(opts.sliderMax, radToDeg(opts.value))));
    } else {
      input.value = opts.value.toFixed(2);
      slider.value = opts.sliderMode === "delta" ? "0" : String(opts.value);
    }
    let lastSliderValue = Number(slider.value);

    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getPhotoWallById(selectedWorldPhotoWallId);
      if (!latest) return;
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };
      if (opts.group === "position") position[opts.axis] = parsed;
      if (opts.group === "rotation") rotation[opts.axis] = degToRad(parsed);
      if (opts.group === "scale") scale[opts.axis] = Math.max(0.01, parsed);
      commitPhotoWallTransform(latest.id, { position, rotation, scale }, { persistMode: "immediate", renderUi: true });
    });

    slider.addEventListener("input", () => {
      const parsed = Number(slider.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getPhotoWallById(selectedWorldPhotoWallId);
      if (!latest) return;
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };
      if (opts.sliderMode === "absolute") {
        if (opts.group === "rotation") rotation[opts.axis] = degToRad(parsed);
        else if (opts.group === "position") position[opts.axis] = parsed;
        else scale[opts.axis] = Math.max(0.01, parsed);
      } else {
        const delta = parsed - lastSliderValue;
        if (Math.abs(delta) <= 0.00001) return;
        if (opts.group === "position") position[opts.axis] += delta;
        else scale[opts.axis] = Math.max(0.01, scale[opts.axis] + delta);
      }
      const updated = commitPhotoWallTransform(
        latest.id,
        { position, rotation, scale },
        { persistMode: "debounced", renderUi: false }
      );
      if (!updated) return;
      if (opts.group === "rotation") input.value = radToDeg(updated.rotation[opts.axis]).toFixed(1);
      else if (opts.group === "position") input.value = updated.position[opts.axis].toFixed(2);
      else input.value = updated.scale[opts.axis].toFixed(2);
      lastSliderValue = parsed;
    });

    slider.addEventListener("change", () => {
      const parsed = Number(slider.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getPhotoWallById(selectedWorldPhotoWallId);
      if (!latest) return;
      if (opts.sliderMode === "delta") {
        commitPhotoWallTransform(
          latest.id,
          {
            position: { ...latest.position },
            rotation: { ...latest.rotation },
            scale: { ...latest.scale }
          },
          { persistMode: "immediate", renderUi: true }
        );
        slider.value = "0";
        lastSliderValue = 0;
        return;
      }
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };
      if (opts.group === "rotation") rotation[opts.axis] = degToRad(parsed);
      else if (opts.group === "position") position[opts.axis] = parsed;
      else scale[opts.axis] = Math.max(0.01, parsed);
      commitPhotoWallTransform(latest.id, { position, rotation, scale }, { persistMode: "immediate", renderUi: true });
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(slider);
    return row;
  };

  const buildGroup = (titleText: string) => {
    const group = document.createElement("div");
    group.className = "world-placement-group";
    const title = document.createElement("div");
    title.className = "world-placement-group-title";
    title.textContent = titleText;
    group.appendChild(title);
    return group;
  };

  const positionGroup = buildGroup("Position");
  const rotationGroup = buildGroup("Rotation (Degrees)");
  const scaleGroup = buildGroup("Scale");
  (["x", "y", "z"] as const).forEach((axis) => {
    positionGroup.appendChild(buildAxisRow({
      group: "position", axis, value: selectedWall.position[axis], inputStep: "0.01",
      sliderMin: -1.5, sliderMax: 1.5, sliderStep: 0.05, sliderMode: "delta"
    }));
    rotationGroup.appendChild(buildAxisRow({
      group: "rotation", axis, value: selectedWall.rotation[axis], inputStep: "1",
      sliderMin: -180, sliderMax: 180, sliderStep: 1, sliderMode: "absolute"
    }));
    scaleGroup.appendChild(buildAxisRow({
      group: "scale", axis, value: selectedWall.scale[axis], inputStep: "0.01",
      sliderMin: -0.5, sliderMax: 0.5, sliderStep: 0.02, sliderMode: "delta"
    }));
  });
  worldPhotoWallEditor.appendChild(positionGroup);
  worldPhotoWallEditor.appendChild(rotationGroup);
  worldPhotoWallEditor.appendChild(scaleGroup);
}

function renderWorldPlacements() {
  if (!worldPlacementsContainer) return;
  worldPlacementsContainer.innerHTML = "";

  const placements = worldState?.placements ?? [];
  if (placements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No instances placed";
    worldPlacementsContainer.appendChild(empty);
    return;
  }

  for (const placement of placements) {
    const row = document.createElement("div");
    row.className = "world-placement-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-placement-select";
    if (placement.id === selectedWorldPlacementId) {
      button.classList.add("active");
    }
    button.textContent = `${placement.assetName} • ${placement.id.slice(0, 8)}`;
    button.title = `Position: ${placement.position.x.toFixed(2)}, ${placement.position.y.toFixed(
      2
    )}, ${placement.position.z.toFixed(2)}`;
    button.addEventListener("click", () => {
      setSelectedWorldPlacement(placement.id);
    });

    row.appendChild(button);
    worldPlacementsContainer.appendChild(row);
  }
}

function renderWorldPosts() {
  if (!worldPostsContainer) return;
  worldPostsContainer.innerHTML = "";

  const posts = worldState?.posts ?? [];
  if (posts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No posts placed";
    worldPostsContainer.appendChild(empty);
    return;
  }

  for (const post of posts) {
    const row = document.createElement("div");
    row.className = "world-placement-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-placement-select";
    if (post.id === selectedWorldPostId) {
      button.classList.add("active");
    }
    const stateLabel = post.isMinimized ? "Min" : "Open";
    button.textContent = `Post • ${stateLabel} • ${post.author.name} • ${post.commentCount}c`;
    button.title = `${post.message}\nPosition: ${post.position.x.toFixed(2)}, ${post.position.y.toFixed(
      2
    )}, ${post.position.z.toFixed(2)}`;
    button.addEventListener("click", () => {
      setSelectedWorldPost(post.id);
    });
    row.appendChild(button);

    if (worldState?.canManage) {
      const actions = document.createElement("div");
      actions.className = "world-asset-options-actions";

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "party-secondary-button";
      toggleButton.textContent = post.isMinimized ? "Expand" : "Minimize";
      toggleButton.addEventListener("click", () => {
        setSelectedWorldPost(post.id);
        void toggleSelectedWorldPostMinimized();
      });

      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.className = "party-secondary-button";
      moveButton.textContent = isPlacingPost && selectedWorldPostId === post.id ? "Moving..." : "Move";
      moveButton.addEventListener("click", () => {
        setSelectedWorldPost(post.id);
        cancelPlacementMode();
        isPlacingPost = true;
        pendingWorldPostDraft = null;
        setWorldNotice("Post move mode: click the floor to reposition.");
        renderWorldPosts();
      });

      const deleteButton = document.createElement("button");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "party-secondary-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        setSelectedWorldPost(post.id);
        beginEditSelectedWorldPost();
      });

      deleteButton.type = "button";
      deleteButton.className = "party-secondary-button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
        setSelectedWorldPost(post.id);
        void deleteSelectedWorldPost();
      });

      actions.appendChild(toggleButton);
      actions.appendChild(moveButton);
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      row.appendChild(actions);
    }

    worldPostsContainer.appendChild(row);
  }
}

function renderWorldPlacementEditor() {
  if (!worldPlacementEditor) return;
  worldPlacementEditor.innerHTML = "";

  if (!worldState) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Sign in to edit instances";
    worldPlacementEditor.appendChild(empty);
    return;
  }

  const selectedPlacement = getPlacementById(selectedWorldPlacementId);
  if (!selectedPlacement) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Select an instance from the list or world";
    worldPlacementEditor.appendChild(empty);
    return;
  }

  const canEdit = worldState.canManage;
  const radToDeg = (value: number) => (value * 180) / Math.PI;
  const degToRad = (value: number) => (value * Math.PI) / 180;

  const heading = document.createElement("div");
  heading.className = "party-result-label";
  heading.textContent = `${selectedPlacement.assetName} • ${selectedPlacement.id.slice(0, 8)}`;
  worldPlacementEditor.appendChild(heading);

  const actions = document.createElement("div");
  actions.className = "world-placement-editor-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "party-secondary-button";
  copyButton.textContent = "Copy";
  copyButton.disabled = !canEdit;
  copyButton.addEventListener("click", () => {
    void copySelectedPlacement();
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "party-secondary-button";
  deleteButton.textContent = "Delete";
  deleteButton.disabled = !canEdit;
  deleteButton.addEventListener("click", () => {
    void deleteSelectedPlacement();
  });

  actions.appendChild(copyButton);
  actions.appendChild(deleteButton);
  worldPlacementEditor.appendChild(actions);

  const buildAxisRow = (opts: {
    group: "position" | "rotation" | "scale";
    axis: "x" | "y" | "z";
    value: number;
    inputStep: string;
    sliderMin: number;
    sliderMax: number;
    sliderStep: number;
    sliderMode: "absolute" | "delta";
  }) => {
    const row = document.createElement("div");
    row.className = "world-placement-axis-row";

    const label = document.createElement("span");
    label.className = "world-placement-axis-label";
    label.textContent = opts.axis.toUpperCase();

    const input = document.createElement("input");
    input.type = "number";
    input.className = "world-placement-axis-input";
    input.step = opts.inputStep;
    input.disabled = !canEdit;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "world-placement-axis-slider";
    slider.min = String(opts.sliderMin);
    slider.max = String(opts.sliderMax);
    slider.step = String(opts.sliderStep);
    slider.disabled = !canEdit;

    if (opts.group === "rotation") {
      input.value = radToDeg(opts.value).toFixed(1);
      slider.value = String(Math.max(opts.sliderMin, Math.min(opts.sliderMax, radToDeg(opts.value))));
    } else {
      input.value = opts.value.toFixed(2);
      slider.value = opts.sliderMode === "delta" ? "0" : String(opts.value);
    }
    let lastSliderValue = Number(slider.value);

    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getPlacementById(selectedWorldPlacementId);
      if (!latest) return;
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };

      if (opts.group === "position") position[opts.axis] = parsed;
      if (opts.group === "rotation") rotation[opts.axis] = degToRad(parsed);
      if (opts.group === "scale") scale[opts.axis] = Math.max(0.01, parsed);

      commitPlacementTransform(
        latest.id,
        { position, rotation, scale },
        { persistMode: "immediate", renderUi: true }
      );
    });

    slider.addEventListener("input", () => {
      const parsed = Number(slider.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getPlacementById(selectedWorldPlacementId);
      if (!latest) return;
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };

      if (opts.sliderMode === "absolute") {
        if (opts.group === "rotation") {
          rotation[opts.axis] = degToRad(parsed);
        } else if (opts.group === "position") {
          position[opts.axis] = parsed;
        } else {
          scale[opts.axis] = Math.max(0.01, parsed);
        }
      } else {
        const delta = parsed - lastSliderValue;
        if (Math.abs(delta) <= 0.00001) return;
        if (opts.group === "position") {
          position[opts.axis] += delta;
        } else {
          scale[opts.axis] = Math.max(0.01, scale[opts.axis] + delta);
        }
      }

      const updated = commitPlacementTransform(
        latest.id,
        { position, rotation, scale },
        { persistMode: "debounced", renderUi: false }
      );
      if (!updated) return;

      if (opts.group === "rotation") {
        input.value = radToDeg(updated.rotation[opts.axis]).toFixed(1);
      } else if (opts.group === "position") {
        input.value = updated.position[opts.axis].toFixed(2);
      } else {
        input.value = updated.scale[opts.axis].toFixed(2);
      }
      lastSliderValue = parsed;
    });

    slider.addEventListener("change", () => {
      const parsed = Number(slider.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getPlacementById(selectedWorldPlacementId);
      if (!latest) return;

      if (opts.sliderMode === "delta") {
        commitPlacementTransform(
          latest.id,
          {
            position: { ...latest.position },
            rotation: { ...latest.rotation },
            scale: { ...latest.scale }
          },
          { persistMode: "immediate", renderUi: true }
        );
        slider.value = "0";
        lastSliderValue = 0;
        return;
      }

      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };

      if (opts.group === "rotation") {
        rotation[opts.axis] = degToRad(parsed);
      } else if (opts.group === "position") {
        position[opts.axis] = parsed;
      } else {
        scale[opts.axis] = Math.max(0.01, parsed);
      }

      commitPlacementTransform(
        latest.id,
        { position, rotation, scale },
        { persistMode: "immediate", renderUi: true }
      );
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(slider);
    return row;
  };

  const buildGroup = (titleText: string) => {
    const group = document.createElement("div");
    group.className = "world-placement-group";
    const title = document.createElement("div");
    title.className = "world-placement-group-title";
    title.textContent = titleText;
    group.appendChild(title);
    return group;
  };

  const positionGroup = buildGroup("Position");
  positionGroup.appendChild(
    buildAxisRow({
      group: "position",
      axis: "x",
      value: selectedPlacement.position.x,
      inputStep: "0.01",
      sliderMin: -1.5,
      sliderMax: 1.5,
      sliderStep: 0.05,
      sliderMode: "delta"
    })
  );
  positionGroup.appendChild(
    buildAxisRow({
      group: "position",
      axis: "y",
      value: selectedPlacement.position.y,
      inputStep: "0.01",
      sliderMin: -1.5,
      sliderMax: 1.5,
      sliderStep: 0.05,
      sliderMode: "delta"
    })
  );
  positionGroup.appendChild(
    buildAxisRow({
      group: "position",
      axis: "z",
      value: selectedPlacement.position.z,
      inputStep: "0.01",
      sliderMin: -1.5,
      sliderMax: 1.5,
      sliderStep: 0.05,
      sliderMode: "delta"
    })
  );

  const rotationGroup = buildGroup("Rotation (Degrees)");
  rotationGroup.appendChild(
    buildAxisRow({
      group: "rotation",
      axis: "x",
      value: selectedPlacement.rotation.x,
      inputStep: "1",
      sliderMin: -180,
      sliderMax: 180,
      sliderStep: 1,
      sliderMode: "absolute"
    })
  );
  rotationGroup.appendChild(
    buildAxisRow({
      group: "rotation",
      axis: "y",
      value: selectedPlacement.rotation.y,
      inputStep: "1",
      sliderMin: -180,
      sliderMax: 180,
      sliderStep: 1,
      sliderMode: "absolute"
    })
  );
  rotationGroup.appendChild(
    buildAxisRow({
      group: "rotation",
      axis: "z",
      value: selectedPlacement.rotation.z,
      inputStep: "1",
      sliderMin: -180,
      sliderMax: 180,
      sliderStep: 1,
      sliderMode: "absolute"
    })
  );

  const scaleGroup = buildGroup("Scale");
  scaleGroup.appendChild(
    buildAxisRow({
      group: "scale",
      axis: "x",
      value: selectedPlacement.scale.x,
      inputStep: "0.01",
      sliderMin: -0.5,
      sliderMax: 0.5,
      sliderStep: 0.02,
      sliderMode: "delta"
    })
  );
  scaleGroup.appendChild(
    buildAxisRow({
      group: "scale",
      axis: "y",
      value: selectedPlacement.scale.y,
      inputStep: "0.01",
      sliderMin: -0.5,
      sliderMax: 0.5,
      sliderStep: 0.02,
      sliderMode: "delta"
    })
  );
  scaleGroup.appendChild(
    buildAxisRow({
      group: "scale",
      axis: "z",
      value: selectedPlacement.scale.z,
      inputStep: "0.01",
      sliderMin: -0.5,
      sliderMax: 0.5,
      sliderStep: 0.02,
      sliderMode: "delta"
    })
  );

  worldPlacementEditor.appendChild(positionGroup);
  worldPlacementEditor.appendChild(rotationGroup);
  worldPlacementEditor.appendChild(scaleGroup);
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
  if (!worldViewActive) {
    stopWorldGenerationPolling();
    game.setWorldData(null);
    game.setPendingWorldPostPlacement(null);
    syncShareWorldLinkButton();
    return;
  }

  if (!auth.getCurrentUser()) {
    worldState = null;
    worldGenerationTasks = [];
    selectedWorldPlacementId = null;
    selectedWorldPhotoWallId = null;
    selectedWorldPostId = null;
    pendingSelectedWorldPlacementId = null;
    pendingSelectedWorldPhotoWallId = null;
    pendingSelectedWorldPostId = null;
    editingWorldPostId = null;
    worldPostComments = [];
    worldPostCommentsForPostId = null;
    worldPostCommentsLoading = false;
    isPlacingPost = false;
    isPlacingPhotoWall = false;
    isSubmittingPhotoWallPlacement = false;
    isSubmittingWorldPostPlacement = false;
    pendingWorldPostDraft = null;
    pendingPhotoWallDraft = null;
    stopWorldGenerationPolling();
    game.setWorldData(null);
    game.setPendingWorldPostPlacement(null);
    setWorldNotice("Sign in to load world");
    if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
    if (worldPlacementsContainer) worldPlacementsContainer.innerHTML = "";
    if (worldPlacementEditor) worldPlacementEditor.innerHTML = "";
    if (worldPhotoWallsContainer) worldPhotoWallsContainer.innerHTML = "";
    if (worldPhotoWallEditor) worldPhotoWallEditor.innerHTML = "";
    if (worldPostsContainer) worldPostsContainer.innerHTML = "";
    if (worldPostCommentsContainer) worldPostCommentsContainer.innerHTML = "";
    setWorldPostCommentsStatus("Select a post to view comments");
    if (worldUploadButton) worldUploadButton.disabled = true;
    if (worldModelFileInput) worldModelFileInput.disabled = true;
    if (worldModelNameInput) worldModelNameInput.disabled = true;
    if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
    if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
    if (worldGenerateImageFileInput) worldGenerateImageFileInput.disabled = true;
    if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
    if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
    if (worldGenerateEnhancedGraphicsInput) {
      worldGenerateEnhancedGraphicsInput.disabled = true;
    }
    if (worldGenerateButton) worldGenerateButton.disabled = true;
    if (worldGenerateImageButton) worldGenerateImageButton.disabled = true;
    if (worldPhotoWallButton) worldPhotoWallButton.disabled = true;
    if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.disabled = true;
    if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.disabled = true;
    if (worldPostButton) worldPostButton.disabled = true;
    if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = true;
    if (worldPostImageFileInput) worldPostImageFileInput.disabled = true;
    if (worldPostMessageInput) worldPostMessageInput.disabled = true;
    if (worldPostCommentInput) worldPostCommentInput.disabled = true;
    if (worldPostCommentSendButton) worldPostCommentSendButton.disabled = true;
    syncWorldPostFormMode();
    syncWorldVisibilityControls();
    renderWorldPostComments();
    renderWorldPhotoWalls();
    renderWorldPhotoWallEditor();
    syncShareWorldLinkButton();
    syncAvatarSelectOptions();
    return;
  }

  const response = await fetch(apiUrl("/api/v1/world"), {
    credentials: "include"
  });

  if (!response.ok) {
    game.setPendingWorldPostPlacement(null);
    setWorldNotice("Failed to load world");
    syncShareWorldLinkButton();
    return;
  }

  const payload = (await response.json()) as WorldState;
  worldState = payload;
  syncShareWorldLinkButton();
  syncAvatarSelectOptions();
  const requestedPlacementId = pendingSelectedWorldPlacementId ?? selectedWorldPlacementId;
  const requestedPhotoWallId = pendingSelectedWorldPhotoWallId ?? selectedWorldPhotoWallId;
  const requestedPostId = pendingSelectedWorldPostId ?? selectedWorldPostId;
  pendingSelectedWorldPlacementId = null;
  pendingSelectedWorldPhotoWallId = null;
  pendingSelectedWorldPostId = null;
  selectedWorldPlacementId =
    requestedPlacementId &&
    payload.placements.some((placement) => placement.id === requestedPlacementId)
      ? requestedPlacementId
      : null;
  selectedWorldPostId =
    requestedPostId && payload.posts.some((post) => post.id === requestedPostId)
      ? requestedPostId
      : null;
  selectedWorldPhotoWallId =
    requestedPhotoWallId && payload.photoWalls.some((wall) => wall.id === requestedPhotoWallId)
      ? requestedPhotoWallId
      : null;
  if (editingWorldPostId && !payload.posts.some((post) => post.id === editingWorldPostId)) {
    editingWorldPostId = null;
  }
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
  game.setPendingWorldPostPlacement(null);
  if (worldUploadButton) worldUploadButton.disabled = !payload.canManage;
  if (worldModelFileInput) worldModelFileInput.disabled = !payload.canManage;
  if (worldModelNameInput) worldModelNameInput.disabled = !payload.canManage;
  if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = !payload.canManage;
  if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = !payload.canManage;
  if (worldGenerateImageFileInput) {
    worldGenerateImageFileInput.disabled = !payload.canManage;
  }
  if (worldGenerateNameInput) worldGenerateNameInput.disabled = !payload.canManage;
  if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = !payload.canManage;
  if (worldGenerateEnhancedGraphicsInput) {
    worldGenerateEnhancedGraphicsInput.disabled = !payload.canManage;
  }
  if (worldGenerateTypeInput) worldGenerateTypeInput.disabled = !payload.canManage;
  if (worldGenerateButton) worldGenerateButton.disabled = !payload.canManage;
  if (worldGenerateImageButton) {
    worldGenerateImageButton.disabled = !payload.canManage;
  }
  if (worldPhotoWallButton) worldPhotoWallButton.disabled = !payload.canManage;
  if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.disabled = !payload.canManage;
  if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.disabled = !payload.canManage;
  if (worldPostButton) worldPostButton.disabled = !payload.canManage;
  if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = !payload.canManage;
  if (worldPostImageFileInput) worldPostImageFileInput.disabled = !payload.canManage;
  if (worldPostMessageInput) worldPostMessageInput.disabled = !payload.canManage;

  const worldOwnerLabel =
    payload.worldOwnerId === auth.getCurrentUser()?.id ? "Your world" : "Visited world";
  setWorldNotice(
    `${payload.worldName} • ${worldOwnerLabel} • ${payload.isPublic ? "Public" : "Private"} • ${
      payload.assets.length
    } models • ${payload.placements.length} placements • ${payload.photoWalls.length} walls • ${payload.posts.length} posts`
  );

  syncWorldVisibilityControls();
  startWorldGenerationPolling();
  void loadWorldGenerationTasks();
  renderWorldAssets();
  renderWorldPlacements();
  renderWorldPhotoWalls();
  renderWorldPosts();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
  syncWorldPostFormMode();
  void loadCommentsForSelectedPost(true);
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

    const startPlacement = () => {
      if (!worldState?.canManage) return;
      cancelPhotoWallPlacementMode();
      selectedWorldPhotoWallId = null;
      cancelPostPlacementMode();
      selectedWorldPostId = null;
      selectedPlacementAssetId = asset.id;
      isPlacingModel = true;
      setWorldNotice(`Placement mode: ${asset.name}. Click the floor to place.`);
      renderWorldAssets();
      renderWorldPosts();
    };

    const label = document.createElement("button");
    label.type = "button";
    label.className = "party-result-label world-asset-name world-asset-name-button";
    if (selectedPlacementAssetId === asset.id && isPlacingModel) {
      label.classList.add("active");
    }
    label.textContent = getWorldAssetLabel(asset);
    label.title = `${asset.name} (${asset.versions.length} versions)`;
    label.disabled = !worldState?.canManage;
    label.addEventListener("click", startPlacement);

    const options = document.createElement("details");
    options.className = "world-asset-options";

    const optionsSummary = document.createElement("summary");
    optionsSummary.className = "party-secondary-button world-asset-options-toggle";
    optionsSummary.textContent = "Options";

    const optionsMenu = document.createElement("div");
    optionsMenu.className = "world-asset-options-menu";

    const placeButton = document.createElement("button");
    placeButton.className = "party-secondary-button";
    placeButton.type = "button";
    placeButton.textContent = selectedPlacementAssetId === asset.id ? "Placing..." : "Place";
    placeButton.disabled = !worldState?.canManage;
    placeButton.addEventListener("click", () => {
      options.open = false;
      startPlacement();
    });

    const replaceButton = document.createElement("button");
    replaceButton.className = "party-secondary-button";
    replaceButton.type = "button";
    replaceButton.textContent = "Replace";
    replaceButton.disabled = !worldState?.canManage;
    replaceButton.addEventListener("click", () => {
      options.open = false;
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

    const visibilityLabel = document.createElement("label");
    visibilityLabel.className = "world-asset-options-field";
    visibilityLabel.textContent = "Visibility";

    const visibilitySelect = document.createElement("select");
    visibilitySelect.className = "party-search-input world-asset-visibility";
    visibilitySelect.innerHTML = `
      <option value="public">Public</option>
      <option value="private">Private</option>
    `;
    visibilitySelect.value = asset.visibility;
    visibilitySelect.disabled = !asset.canManageVisibility || !asset.canChangeVisibility;
    visibilitySelect.title = asset.canChangeVisibility
      ? "Mesh visibility"
      : "Cannot change visibility after instances exist";
    visibilitySelect.addEventListener("change", () => {
      const visibility = visibilitySelect.value;
      void (async () => {
        const response = await fetch(
          apiUrl(`/api/v1/world/assets/${encodeURIComponent(asset.id)}/visibility`),
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ visibility })
          }
        );
        if (!response.ok) {
          visibilitySelect.value = asset.visibility;
          setWorldNotice(
            response.status === 409
              ? "Visibility cannot change after instances exist"
              : "Visibility update failed"
          );
          await loadWorldState();
          return;
        }
        options.open = false;
        await loadWorldState();
      })();
    });

    const actionRow = document.createElement("div");
    actionRow.className = "world-asset-options-actions";
    actionRow.appendChild(placeButton);
    actionRow.appendChild(replaceButton);
    actionRow.appendChild(downloadButton);

    optionsMenu.appendChild(visibilityLabel);
    optionsMenu.appendChild(visibilitySelect);
    optionsMenu.appendChild(actionRow);
    options.appendChild(optionsSummary);
    options.appendChild(optionsMenu);

    row.appendChild(label);
    row.appendChild(options);
    worldAssetsContainer.appendChild(row);
  }
}

const game = createGameScene({
  mount: app,
  onLocalStateChange(state, _force, avatarSelection, avatarMode) {
    realtime.sendPlayerUpdate(state, avatarSelection, avatarMode);
  },
  onRemoteInviteClick(clientId) {
    inviteClient(clientId);
  },
  canShowRemoteInvite(clientId) {
    return canInviteClient(clientId);
  },
  onWorldPlacementSelect(placementId) {
    setSelectedWorldPlacement(placementId);
  },
  onWorldPhotoWallSelect(photoWallId) {
    setSelectedWorldPhotoWall(photoWallId);
    if (worldPhotoWallEditor && !dockPanel?.classList.contains("minimized")) {
      worldPhotoWallEditor.scrollIntoView({ block: "nearest" });
    }
  },
  onWorldPostSelect(postId) {
    setSelectedWorldPost(postId);
  },
  onWorldPostToggleMinimize(postId) {
    setSelectedWorldPost(postId);
    void toggleSelectedWorldPostMinimized();
  },
  onWorldPostOpenComments(postId) {
    setPanelMinimized(dockPanel, dockMinimizeButton, "panel", false);
    setActiveMainTab?.("party");
    setActivePartySubtab?.("posts");
    setSelectedWorldPost(postId);
    if (worldPostCommentsContainer) {
      worldPostCommentsContainer.scrollIntoView({ block: "nearest" });
    }
  },
  onWorldPhotoWallPlacementRequest(position) {
    if (!worldState?.canManage || !isPlacingPhotoWall || isSubmittingPhotoWallPlacement) {
      return false;
    }
    if (!pendingPhotoWallDraft) return false;

    const draft = pendingPhotoWallDraft;
    const targetPosition = {
      x: position.x,
      y: Math.max(0.8, position.y + 1.2),
      z: position.z
    };
    isPlacingPhotoWall = false;
    isSubmittingPhotoWallPlacement = true;
    pendingPhotoWallDraft = null;
    renderWorldPhotoWalls();

    void (async () => {
      try {
        const response = draft.imageFile
          ? await (async () => {
              const imageFile = draft.imageFile;
              if (!imageFile) throw new Error("Missing image file");
              const formData = new FormData();
              formData.set("file", imageFile);
              formData.set("positionX", String(targetPosition.x));
              formData.set("positionY", String(targetPosition.y));
              formData.set("positionZ", String(targetPosition.z));
              formData.set("rotationX", "0");
              formData.set("rotationY", "0");
              formData.set("rotationZ", "0");
              formData.set("scaleX", "1.6");
              formData.set("scaleY", "1.2");
              formData.set("scaleZ", "0.05");
              return fetch(apiUrl("/api/v1/world/photo-walls"), {
                method: "POST",
                credentials: "include",
                body: formData
              });
            })()
          : await fetch(apiUrl("/api/v1/world/photo-walls"), {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageUrl: draft.imageUrl,
                position: targetPosition,
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1.6, y: 1.2, z: 0.05 }
              })
            });

        if (!response.ok) {
          setWorldNotice("Photo wall placement failed");
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { photoWallId?: string }
          | null;
        pendingSelectedWorldPhotoWallId = payload?.photoWallId ?? null;
        if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.value = "";
        if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.value = "";
        await loadWorldState();
        setWorldNotice("Photo wall placed");
      } catch {
        setWorldNotice("Photo wall placement failed");
      } finally {
        isSubmittingPhotoWallPlacement = false;
      }
    })();

    return true;
  },
  onWorldPostPlacementRequest(position) {
    if (!worldState?.canManage || !isPlacingPost || isSubmittingWorldPostPlacement) {
      return false;
    }

    if (pendingWorldPostDraft) {
      const draft = pendingWorldPostDraft;
      const targetPosition = {
        x: position.x,
        y: Math.max(0.9, position.y + 1.6),
        z: position.z
      };
      isPlacingPost = false;
      isSubmittingWorldPostPlacement = true;
      pendingWorldPostDraft = null;
      game.setPendingWorldPostPlacement(targetPosition);
      renderWorldPosts();

      void (async () => {
        try {
          const response = draft.imageFile
            ? await (async () => {
                const imageFile = draft.imageFile;
                if (!imageFile) {
                  throw new Error("Missing post image file");
                }
                const formData = new FormData();
                formData.set("file", imageFile);
                formData.set("message", draft.message);
                formData.set("positionX", String(targetPosition.x));
                formData.set("positionY", String(targetPosition.y));
                formData.set("positionZ", String(targetPosition.z));
                return fetch(apiUrl("/api/v1/world/posts"), {
                  method: "POST",
                  credentials: "include",
                  body: formData
                });
              })()
            : await fetch(apiUrl("/api/v1/world/posts"), {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  imageUrl: draft.imageUrl,
                  message: draft.message,
                  position: targetPosition
                })
              });

          if (!response.ok) {
            setWorldNotice("Post placement failed");
            return;
          }

          const payload = (await response.json().catch(() => null)) as
            | { postId?: string }
            | null;
          pendingSelectedWorldPostId = payload?.postId ?? null;
          resetWorldPostForm();
          await loadWorldState();
          setWorldNotice("Post placed");
        } catch {
          setWorldNotice("Post placement failed");
        } finally {
          isSubmittingWorldPostPlacement = false;
          game.setPendingWorldPostPlacement(null);
        }
      })();
      return true;
    }

    if (selectedWorldPostId) {
      isPlacingPost = false;
      renderWorldPosts();
      void moveSelectedWorldPostTo({
        x: position.x,
        y: Math.max(0.9, position.y + 1.6),
        z: position.z
      }).then((moved) => {
        if (moved) {
          renderWorldPosts();
        }
      });
      return true;
    }

    return false;
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

function setWorldViewMode(active: boolean) {
  worldViewActive = active;
  dockPanel?.toggleAttribute("hidden", !active);
  if (active) {
    worldMap.activateWorldView();
    return;
  }
  worldMap.showMapView();
}

function setWorldRoute(worldId: string, replace = false) {
  const pathname = `/world/${encodeURIComponent(worldId)}`;
  if (window.location.pathname === pathname) return;
  if (replace) {
    window.history.replaceState(null, "", pathname);
    return;
  }
  window.history.pushState(null, "", pathname);
}

function setMapRoute(replace = false) {
  if (window.location.pathname === "/") return;
  if (replace) {
    window.history.replaceState(null, "", "/");
    return;
  }
  window.history.pushState(null, "", "/");
}

function activateWorldViewForWorld(worldId: string) {
  pendingAutoJoinWorldId = worldId;
  autoJoinWorldIdSent = null;
  setWorldRoute(worldId);
  setWorldViewMode(true);
  try {
    window.sessionStorage.setItem(PENDING_WORLD_JOIN_STORAGE_KEY, worldId);
  } catch {
    // Ignore storage failures.
  }
  if (realtime.isOpen() && realtime.sendWorldJoin(worldId)) {
    autoJoinWorldIdSent = worldId;
  } else {
    tryAutoJoinLinkedWorld();
  }
  if (auth.getCurrentUser()) {
    void loadWorldState();
  }
}

async function loadWorldPortalPins() {
  const response = await fetch(apiUrl("/api/v1/worlds/portals"), {
    credentials: "include"
  });
  if (!response.ok) {
    worldMap.setStatus("Failed to load world portals");
    return;
  }

  const payload = (await response.json()) as { portals: WorldPortal[] };
  knownWorldPortals = payload.portals;
  worldMap.setPortals(payload.portals);
  if (pendingAutoJoinWorldId) {
    worldMap.selectPortal(pendingAutoJoinWorldId);
  }
}

async function loadHomePortal() {
  const user = auth.getCurrentUser();
  worldMap.setCurrentUser(user);
  if (!user) {
    worldMap.setHomePortal(null);
    return;
  }

  const response = await fetch(apiUrl("/api/v1/world/home-portal"), {
    credentials: "include"
  });
  if (!response.ok) {
    return;
  }
  const payload = (await response.json()) as {
    worldId: string;
    portal: { lat: number; lng: number };
  };
  worldMap.setHomePortal(payload.portal);
  if (!worldViewActive) {
    worldMap.focusDefault();
  }
}

const worldMap = createWorldMapController({
  mapCanvas: worldMapCanvas,
  mapScreen: worldMapScreen,
  statusEl: worldMapStatus,
  worldCard: worldMapWorldCard,
  worldNameEl: worldMapWorldName,
  worldOwnerEl: worldMapWorldOwner,
  worldDescEl: worldMapWorldDesc,
  joinButton: worldMapJoinWorldButton,
  savePinButton: worldMapSavePinButton,
  zoomInButton: worldMapZoomInButton,
  zoomOutButton: worldMapZoomOutButton,
  onStatus(message) {
    if (!worldViewActive) {
      setWorldNotice(message);
    }
  },
  onJoinWorld(worldId) {
    if (!auth.getCurrentUser()) {
      worldMap.setStatus("Sign in to join worlds");
      return;
    }
    const selectedPortal = knownWorldPortals.find((portal) => portal.worldId === worldId);
    if (selectedPortal && !selectedPortal.canJoin) {
      worldMap.setStatus("This world is private");
      return;
    }
    activateWorldViewForWorld(worldId);
  },
  async onSavePortal(position) {
    if (!auth.getCurrentUser()) {
      worldMap.setStatus("Sign in to set your portal");
      return false;
    }
    const response = await fetch(apiUrl("/api/v1/world/home-portal"), {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        lat: position.lat,
        lng: position.lng
      })
    });
    if (!response.ok) {
      worldMap.setStatus("Failed to save home portal");
      return false;
    }
    await Promise.all([loadHomePortal(), loadWorldPortalPins()]);
    return true;
  }
});

function setupCameraControlsTab() {
  if (
    !cameraZoomSlider ||
    !cameraZoomInput ||
    !cameraRotateYSlider ||
    !cameraRotateYInput ||
    !cameraRotateZSlider ||
    !cameraRotateZInput
  ) {
    return;
  }

  type CameraControlKey = "zoom" | "rotateY" | "rotateZ";
  type CameraControlBinding = {
    key: CameraControlKey;
    slider: HTMLInputElement;
    input: HTMLInputElement;
    digits: number;
  };

  const bindings: CameraControlBinding[] = [
    { key: "zoom", slider: cameraZoomSlider, input: cameraZoomInput, digits: 2 },
    { key: "rotateY", slider: cameraRotateYSlider, input: cameraRotateYInput, digits: 0 },
    { key: "rotateZ", slider: cameraRotateZSlider, input: cameraRotateZInput, digits: 0 }
  ];

  const syncUi = (state = game.getCameraControls()) => {
    for (const binding of bindings) {
      const value = state[binding.key];
      binding.slider.value = String(value);
      binding.input.value = value.toFixed(binding.digits);
    }
  };

  const applyValue = (key: CameraControlKey, rawValue: number) => {
    if (!Number.isFinite(rawValue)) {
      syncUi();
      return;
    }

    syncUi(game.setCameraControls({ [key]: rawValue }));
  };

  for (const binding of bindings) {
    binding.slider.addEventListener("input", () => {
      applyValue(binding.key, Number(binding.slider.value));
    });

    binding.input.addEventListener("input", () => {
      applyValue(binding.key, Number(binding.input.value));
    });

    binding.input.addEventListener("blur", () => {
      syncUi();
    });
  }

  syncUi();
}

function readStoredPlayerAvatarSelection(): PlayerAvatarSelection {
  try {
    const raw = window.localStorage.getItem(PLAYER_AVATAR_SELECTION_STORAGE_KEY);
    if (!raw) {
      return {
        stationaryModelUrl: null,
        moveModelUrl: null,
        specialModelUrl: null
      };
    }
    const parsed = JSON.parse(raw) as {
      stationaryModelUrl?: unknown;
      moveModelUrl?: unknown;
      specialModelUrl?: unknown;
    };
    const readUrl = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    return {
      stationaryModelUrl: readUrl(parsed.stationaryModelUrl),
      moveModelUrl: readUrl(parsed.moveModelUrl),
      specialModelUrl: readUrl(parsed.specialModelUrl)
    };
  } catch {
    return {
      stationaryModelUrl: null,
      moveModelUrl: null,
      specialModelUrl: null
    };
  }
}

function persistPlayerAvatarSelection() {
  try {
    window.localStorage.setItem(
      PLAYER_AVATAR_SELECTION_STORAGE_KEY,
      JSON.stringify(playerAvatarSelection)
    );
  } catch {
    // Ignore storage failures.
  }
}

function collectAvatarOptions() {
  const assets = worldState?.assets ?? [];
  return assets
    .filter((asset) => Boolean(asset.currentVersion?.fileUrl))
    .map((asset) => ({
      label: asset.name,
      value: asset.currentVersion!.fileUrl
    }));
}

function syncAvatarSelectOptions() {
  const selects = [avatarStationarySelect, avatarMoveSelect, avatarSpecialSelect].filter(
    (select): select is HTMLSelectElement => Boolean(select)
  );
  if (selects.length === 0) return;

  const options = collectAvatarOptions();
  for (const select of selects) {
    const previousValue = select.value;
    select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default sphere";
    select.appendChild(defaultOption);
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.appendChild(node);
    }
    const hasValue = options.some((option) => option.value === previousValue);
    if (hasValue) {
      select.value = previousValue;
    }
    select.disabled = !auth.getCurrentUser();
  }
}

function syncAvatarControls() {
  syncAvatarSelectOptions();
  if (avatarStationarySelect) {
    avatarStationarySelect.value = playerAvatarSelection.stationaryModelUrl ?? "";
  }
  if (avatarMoveSelect) {
    avatarMoveSelect.value = playerAvatarSelection.moveModelUrl ?? "";
  }
  if (avatarSpecialSelect) {
    avatarSpecialSelect.value = playerAvatarSelection.specialModelUrl ?? "";
  }
  game.setLocalAvatarSelection(playerAvatarSelection);
}

function applyAvatarSelectionFromCurrentUser(user: CurrentUser | null) {
  const stored = readStoredPlayerAvatarSelection();
  if (!user) {
    playerAvatarSelection = stored;
    syncAvatarControls();
    return;
  }

  const nextSelection: PlayerAvatarSelection = {
    stationaryModelUrl: user.avatarSelection?.stationaryModelUrl ?? stored.stationaryModelUrl,
    moveModelUrl: user.avatarSelection?.moveModelUrl ?? stored.moveModelUrl,
    specialModelUrl: user.avatarSelection?.specialModelUrl ?? stored.specialModelUrl
  };
  playerAvatarSelection = nextSelection;
  persistPlayerAvatarSelection();
  syncAvatarControls();
}

async function savePlayerAvatarSelectionToServer() {
  if (!auth.getCurrentUser()) return;
  await fetch(apiUrl("/api/v1/auth/player-avatar"), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(playerAvatarSelection)
  }).catch(() => null);
}

function setupAvatarControls() {
  const updateFromInputs = () => {
    playerAvatarSelection = {
      stationaryModelUrl: avatarStationarySelect?.value || null,
      moveModelUrl: avatarMoveSelect?.value || null,
      specialModelUrl: avatarSpecialSelect?.value || null
    };
    persistPlayerAvatarSelection();
    syncAvatarControls();
    game.forceSyncLocalState();
    void savePlayerAvatarSelectionToServer();
  };

  avatarStationarySelect?.addEventListener("change", updateFromInputs);
  avatarMoveSelect?.addEventListener("change", updateFromInputs);
  avatarSpecialSelect?.addEventListener("change", updateFromInputs);

  window.setInterval(() => {
    if (!auth.getCurrentUser()) return;
    if (!playerAvatarSelection.specialModelUrl) return;
    game.triggerLocalSpecialAvatar();
  }, 10000);

  playerAvatarSelection = readStoredPlayerAvatarSelection();
  syncAvatarControls();
}

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
    profileMenu,
    userAvatar: document.getElementById("user-avatar") as HTMLImageElement | null
  },
  apiUrl,
  onUserChange(user: CurrentUser | null) {
    game.setLocalIdentity(user?.name ?? "Guest", user?.avatarUrl ?? null);
    party.setCurrentUser(user);
    syncChatCanPost();
    worldMap.setCurrentUser(user);
    syncProfileSettingsForm();
    applyAvatarSelectionFromCurrentUser(user);

    if (!user) {
      worldState = null;
      worldGenerationTasks = [];
      stopWorldGenerationPolling();
      isPlacingModel = false;
      isPlacingPhotoWall = false;
      isSubmittingPhotoWallPlacement = false;
      isPlacingPost = false;
      isSubmittingWorldPostPlacement = false;
      selectedPlacementAssetId = null;
      pendingPhotoWallDraft = null;
      pendingWorldPostDraft = null;
      editingWorldPostId = null;
      selectedWorldPlacementId = null;
      selectedWorldPhotoWallId = null;
      selectedWorldPostId = null;
      pendingSelectedWorldPlacementId = null;
      pendingSelectedWorldPhotoWallId = null;
      pendingSelectedWorldPostId = null;
      worldPostComments = [];
      worldPostCommentsForPostId = null;
      worldPostCommentsLoading = false;
      game.setWorldData(null);
      game.setPendingWorldPostPlacement(null);
      setWorldNotice("Sign in to load world");
      if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
      if (worldPlacementsContainer) worldPlacementsContainer.innerHTML = "";
      if (worldPhotoWallsContainer) worldPhotoWallsContainer.innerHTML = "";
      if (worldPostsContainer) worldPostsContainer.innerHTML = "";
      if (worldPostCommentsContainer) worldPostCommentsContainer.innerHTML = "";
      if (worldPlacementEditor) worldPlacementEditor.innerHTML = "";
      if (worldPhotoWallEditor) worldPhotoWallEditor.innerHTML = "";
      if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
      if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
      if (worldPhotoWallButton) worldPhotoWallButton.disabled = true;
      if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.disabled = true;
      if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.disabled = true;
      if (worldPostButton) worldPostButton.disabled = true;
      if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = true;
      if (worldPostImageFileInput) worldPostImageFileInput.disabled = true;
      if (worldPostMessageInput) worldPostMessageInput.disabled = true;
      if (worldPostCommentInput) worldPostCommentInput.disabled = true;
      if (worldPostCommentSendButton) worldPostCommentSendButton.disabled = true;
      syncWorldPostFormMode();
      renderWorldPostComments();
      renderWorldPhotoWalls();
      renderWorldPhotoWallEditor();
      syncWorldVisibilityControls();
      syncShareWorldLinkButton();
      void loadWorldPortalPins();
      return;
    }

    void loadHomePortal();
    void loadWorldPortalPins();
    if (worldViewActive) {
      void loadWorldState();
    }
    tryAutoJoinLinkedWorld();
    syncShareWorldLinkButton();
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
    activateWorldViewForWorld(worldId);
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
    if (status === "Connected" && auth.getCurrentUser() && worldViewActive) {
      void loadWorldState();
    }
    if (status === "Connected") {
      tryAutoJoinLinkedWorld();
      void loadWorldPortalPins();
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
    globalChatMessages = messages;
    renderCombinedChat();
  },
  onChatMessage(message) {
    globalChatMessages = [...globalChatMessages.filter((item) => item.id !== message.id), message];
    renderCombinedChat();
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
    syncChatCanPost();

    if (pendingAutoJoinWorldId && state.party?.id === pendingAutoJoinWorldId) {
      pendingAutoJoinWorldId = null;
      autoJoinWorldIdSent = null;
      try {
        window.sessionStorage.removeItem(PENDING_WORLD_JOIN_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }

    syncMediaPeersAndVolumes();
    if (worldViewActive && state.party?.id) {
      setWorldRoute(state.party.id, true);
    }
    if (worldViewActive) {
      void loadWorldState();
    }
  },
  onPartyInvite(invite) {
    party.addIncomingInvite(invite);
  },
  onPartyChatHistory(messages) {
    worldChatMessages = messages;
    renderCombinedChat();
  },
  onPartyChatMessage(message) {
    worldChatMessages = [...worldChatMessages.filter((item) => item.id !== message.id), message];
    renderCombinedChat();
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

function tryAutoJoinLinkedWorld() {
  if (!worldViewActive) return;
  if (!pendingAutoJoinWorldId) return;
  if (autoJoinWorldIdSent === pendingAutoJoinWorldId) return;
  if (!auth.getCurrentUser()) return;
  if (!realtime.isOpen()) return;
  if (partyState.party?.id === pendingAutoJoinWorldId) {
    pendingAutoJoinWorldId = null;
    autoJoinWorldIdSent = null;
    try {
      window.sessionStorage.removeItem(PENDING_WORLD_JOIN_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    return;
  }

  if (realtime.sendWorldJoin(pendingAutoJoinWorldId)) {
    autoJoinWorldIdSent = pendingAutoJoinWorldId;
  }
}

chat.onSubmit((text) => {
  if (!auth.getCurrentUser()) return;
  let sent = false;
  if (chatGlobalEnabled) {
    sent = realtime.sendChat(text) || sent;
  }
  if (chatWorldEnabled && partyState.party) {
    sent = realtime.sendPartyChat(text) || sent;
  }
  if (!sent) {
    chat.setStatus("Enable Global or join a world for World chat");
  }
});

setupPanelToggle(dockPanel, dockMinimizeButton, "panel");
setupDockHeightToggle(dockPanel, dockHeightToggleButton);
setupTabs();
setupPartySubtabs();
setupCameraControlsTab();
setupAvatarControls();
setupChatChannelToggles();
setupProfileMenu();
shareWorldLinkButton?.addEventListener("click", () => {
  void copyCurrentWorldLink();
});
homeMapButton?.addEventListener("click", () => {
  pendingAutoJoinWorldId = null;
  autoJoinWorldIdSent = null;
  setWorldViewMode(false);
  setMapRoute();
  worldMap.focusDefault();
  worldMap.selectPortal(null);
  try {
    window.sessionStorage.removeItem(PENDING_WORLD_JOIN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
});
window.addEventListener("popstate", () => {
  const worldId = parseWorldIdFromUrl(new URL(window.location.href));
  if (worldId) {
    pendingAutoJoinWorldId = worldId;
    autoJoinWorldIdSent = null;
    setWorldViewMode(true);
    tryAutoJoinLinkedWorld();
    if (auth.getCurrentUser()) {
      void loadWorldState();
    }
    return;
  }
  setWorldViewMode(false);
  pendingAutoJoinWorldId = null;
  autoJoinWorldIdSent = null;
  setMapRoute(true);
});

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
    const generationType =
      worldGenerateTypeInput?.value === "humanoid" ? "humanoid" : "object";
    setWorldNotice(
      generationType === "humanoid"
        ? "Queueing humanoid generation (model, rigging, animations)..."
        : "Queueing text-to-3D generation..."
    );
    const response = await fetch(apiUrl("/api/v1/world/assets/generate"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        generationType,
        enhancedGraphics: worldGenerateEnhancedGraphicsInput?.checked !== false,
        name: worldGenerateNameInput?.value?.trim() ?? "",
        visibility: worldGenerateVisibilityInput?.value === "private" ? "private" : "public"
      })
    });

    if (!response.ok) {
      setWorldNotice(
        generationType === "humanoid"
          ? "Failed to queue humanoid generation job"
          : "Failed to queue text-to-3D job"
      );
      return;
    }

    if (worldGeneratePromptInput) {
      worldGeneratePromptInput.value = "";
    }
    if (worldGenerateNameInput) {
      worldGenerateNameInput.value = "";
    }
    if (worldGenerateVisibilityInput) {
      worldGenerateVisibilityInput.value = "public";
    }
    if (worldGenerateTypeInput) {
      worldGenerateTypeInput.value = "object";
    }
    if (worldGenerateEnhancedGraphicsInput) {
      worldGenerateEnhancedGraphicsInput.checked = true;
    }

    setWorldNotice(
      generationType === "humanoid"
        ? "Humanoid job queued. It will create split GLBs for Idle_02, Run_02, and FunnyDancing_01."
        : "Text-to-3D job queued. It will continue if you go offline."
    );
    await loadWorldGenerationTasks();
  })();
});

worldGenerateImageForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!worldState?.canManage) {
    setWorldNotice("Only world owners/managers can modify this world");
    return;
  }

  const file = worldGenerateImageFileInput?.files?.[0];
  if (!file) {
    setWorldNotice("Select an image first");
    return;
  }

  void (async () => {
    const generationType =
      worldGenerateTypeInput?.value === "humanoid" ? "humanoid" : "object";
    setWorldNotice(
      generationType === "humanoid"
        ? "Queueing humanoid image-to-3D generation..."
        : "Queueing image-to-3D generation..."
    );

    const formData = new FormData();
    formData.set("file", file);
    formData.set("generationType", generationType);
    formData.set(
      "enhancedGraphics",
      worldGenerateEnhancedGraphicsInput?.checked === false ? "false" : "true"
    );
    formData.set("name", worldGenerateNameInput?.value?.trim() ?? "");
    formData.set(
      "visibility",
      worldGenerateVisibilityInput?.value === "private" ? "private" : "public"
    );

    const prompt = worldGeneratePromptInput?.value?.trim() ?? "";
    if (prompt) {
      formData.set("prompt", prompt);
    }

    const response = await fetch(apiUrl("/api/v1/world/assets/generate/image"), {
      method: "POST",
      credentials: "include",
      body: formData
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;
      if (payload?.error === "PUBLIC_WORLD_STORAGE_REQUIRED") {
        setWorldNotice(
          payload.detail ??
            "Image-to-3D requires public world storage/CDN configuration"
        );
      } else {
        setWorldNotice(
          generationType === "humanoid"
            ? "Failed to queue humanoid image-to-3D job"
            : "Failed to queue image-to-3D job"
        );
      }
      return;
    }

    if (worldGenerateImageFileInput) {
      worldGenerateImageFileInput.value = "";
    }
    if (worldGeneratePromptInput) {
      worldGeneratePromptInput.value = "";
    }
    if (worldGenerateNameInput) {
      worldGenerateNameInput.value = "";
    }
    if (worldGenerateVisibilityInput) {
      worldGenerateVisibilityInput.value = "public";
    }
    if (worldGenerateTypeInput) {
      worldGenerateTypeInput.value = "object";
    }
    if (worldGenerateEnhancedGraphicsInput) {
      worldGenerateEnhancedGraphicsInput.checked = true;
    }

    setWorldNotice(
      generationType === "humanoid"
        ? "Humanoid image-to-3D job queued. It will generate Idle_02, Run_02, and FunnyDancing_01."
        : "Image-to-3D job queued. It will continue if you go offline."
    );
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
    formData.set(
      "visibility",
      worldModelVisibilityInput?.value === "private" ? "private" : "public"
    );

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
    if (worldModelVisibilityInput) {
      worldModelVisibilityInput.value = "public";
    }

    await loadWorldState();
  })();
});

worldPhotoWallForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!worldState?.canManage) {
    setWorldNotice("Only world owners/managers can modify this world");
    return;
  }
  const imageUrl = worldPhotoWallImageUrlInput?.value.trim() ?? "";
  const imageFile = worldPhotoWallImageFileInput?.files?.[0] ?? null;
  if (!imageUrl && !imageFile) {
    setWorldNotice("Enter an image URL or choose an image file");
    return;
  }
  cancelPlacementMode();
  cancelPostPlacementMode();
  selectedWorldPlacementId = null;
  selectedWorldPostId = null;
  selectedWorldPhotoWallId = null;
  pendingPhotoWallDraft = { imageUrl: imageUrl || null, imageFile };
  isPlacingPhotoWall = true;
  setWorldNotice("Photo wall placement mode: click the floor to place.");
  renderWorldPlacements();
  renderWorldPosts();
  renderWorldPhotoWalls();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
});

worldPostForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!worldState?.canManage) {
    setWorldNotice("Only world owners/managers can modify this world");
    return;
  }

  if (editingWorldPostId) {
    void saveWorldPostEdit();
    return;
  }

  const imageUrl = worldPostImageUrlInput?.value.trim() ?? "";
  const imageFile = worldPostImageFileInput?.files?.[0] ?? null;
  const message = worldPostMessageInput?.value.trim() ?? "";
  if (!message) {
    setWorldNotice("Enter a post message first");
    return;
  }

  cancelPlacementMode();
  cancelWorldPostEdit();
  selectedWorldPlacementId = null;
  selectedWorldPostId = null;
  pendingWorldPostDraft = { imageUrl: imageUrl || null, imageFile, message };
  isPlacingPost = true;
  setWorldNotice("Post placement mode: click the floor to place the billboard.");
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPosts();
});

worldPostEditButton?.addEventListener("click", () => {
  beginEditSelectedWorldPost();
});

worldPostSaveEditButton?.addEventListener("click", () => {
  void saveWorldPostEdit();
});

worldPostCancelEditButton?.addEventListener("click", () => {
  cancelWorldPostEdit();
  syncWorldPostFormMode();
});

worldPostCommentForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const post = getWorldPostById(selectedWorldPostId);
  const message = worldPostCommentInput?.value.trim() ?? "";
  if (!post) {
    setWorldNotice("Select a post first");
    return;
  }
  if (!message) {
    setWorldNotice("Enter a comment first");
    return;
  }

  void (async () => {
    const response = await fetch(
      apiUrl(`/api/v1/world/posts/${encodeURIComponent(post.id)}/comments`),
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      }
    );
    if (!response.ok) {
      setWorldNotice("Failed to add comment");
      return;
    }
    if (worldPostCommentInput) worldPostCommentInput.value = "";
    await loadWorldState();
    await loadCommentsForSelectedPost(true);
    setWorldNotice("Comment added");
  })();
});

async function updateWorldSettings(
  name: string,
  description: string,
  isPublic: boolean
) {
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
    return false;
  }

  await loadWorldState();
  return true;
}

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
    const description = worldDescriptionInput.value.trim();
    const saved = await updateWorldSettings(name, description, worldPublicToggle.checked);
    if (!saved) return;
    party.setNotice("World settings saved");
    syncProfileSettingsForm();
  })();
});

profileSettingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const user = auth.getCurrentUser();
  if (!user || !profileNameInput || !profileAvatarUrlInput) {
    return;
  }

  void (async () => {
    const name = profileNameInput.value.trim();
    const avatarUrl = profileAvatarUrlInput.value.trim();
    const shouldSaveWorld = Boolean(
      worldState?.canManageVisibility && profileWorldNameInput && profileWorldDescriptionInput
    );
    const profileResponse = await fetch(apiUrl("/api/v1/auth/profile"), {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        avatarUrl
      })
    });

    if (!profileResponse.ok) {
      setWorldNotice("Profile update failed");
      return;
    }

    if (shouldSaveWorld && profileWorldNameInput && profileWorldDescriptionInput) {
      const worldName = profileWorldNameInput.value.trim();
      if (!worldName) {
        setWorldNotice("World name is required");
        return;
      }
      const worldDescription = profileWorldDescriptionInput.value.trim();
      const saved = await updateWorldSettings(worldName, worldDescription, true);
      if (!saved) return;
    }

    await auth.loadCurrentUser();
    syncProfileSettingsForm();
    setProfileMenuExpanded(false);
    party.setNotice(shouldSaveWorld ? "Profile and world settings saved" : "Profile settings saved");
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
syncChatCanPost();
renderCombinedChat();
setWorldViewMode(worldViewActive);
if (worldViewActive) {
  setWorldNotice("Sign in to load world");
} else {
  setWorldNotice("Explore world portals on the map");
  worldMap.focusDefault();
}
if (worldUploadButton) worldUploadButton.disabled = true;
if (worldModelFileInput) worldModelFileInput.disabled = true;
if (worldModelNameInput) worldModelNameInput.disabled = true;
if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
if (worldGenerateImageFileInput) worldGenerateImageFileInput.disabled = true;
if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
if (worldGenerateEnhancedGraphicsInput) worldGenerateEnhancedGraphicsInput.disabled = true;
if (worldGenerateButton) worldGenerateButton.disabled = true;
if (worldGenerateImageButton) worldGenerateImageButton.disabled = true;
if (worldPhotoWallButton) worldPhotoWallButton.disabled = true;
if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.disabled = true;
if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.disabled = true;
if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = true;
if (worldPostImageFileInput) worldPostImageFileInput.disabled = true;
if (worldPostMessageInput) worldPostMessageInput.disabled = true;
if (worldPostButton) worldPostButton.disabled = true;
if (worldPostEditButton) worldPostEditButton.disabled = true;
if (worldPostSaveEditButton) worldPostSaveEditButton.disabled = true;
if (worldPostCancelEditButton) worldPostCancelEditButton.disabled = true;
if (worldPostCommentInput) worldPostCommentInput.disabled = true;
if (worldPostCommentSendButton) worldPostCommentSendButton.disabled = true;
syncWorldVisibilityControls();
syncWorldPostFormMode();
renderWorldPlacements();
renderWorldPhotoWalls();
renderWorldPosts();
renderWorldPostComments();
renderWorldPlacementEditor();
renderWorldPhotoWallEditor();
syncShareWorldLinkButton();
void loadWorldPortalPins();
void auth.loadCurrentUser();
realtime.connect();
void webrtc.refreshDevices();
game.start();
