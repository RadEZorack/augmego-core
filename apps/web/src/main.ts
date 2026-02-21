/// <reference types="vite/client" />
import "./style.css";

import { createGameScene } from "./game/scene";
import { createApiUrlResolver, resolveWsUrl } from "./lib/urls";
import type {
  ChatMessage,
  CurrentUser,
  PartyState,
  PlayerPayload,
  WorldAsset,
  WorldAssetGenerationTask,
  WorldPlacement,
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
const dockHeightToggleButton = document.getElementById(
  "dock-height-toggle"
) as HTMLButtonElement | null;
const chatTabButton = document.getElementById("tab-chat") as HTMLButtonElement | null;
const partyTabButton = document.getElementById("tab-party") as HTMLButtonElement | null;
const mediaTabButton = document.getElementById("tab-media") as HTMLButtonElement | null;
const chatPane = document.getElementById("pane-chat") as HTMLElement | null;
const partyPane = document.getElementById("pane-party") as HTMLElement | null;
const mediaPane = document.getElementById("pane-media") as HTMLElement | null;

const apiBase = import.meta.env.VITE_API_BASE_URL;
const wsBase = import.meta.env.VITE_WS_URL;

const apiUrl = createApiUrlResolver(apiBase);

type DockHeightState = "quarter" | "half" | "full";

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
const placementPersistTimers = new Map<string, number>();

const worldStatus = document.getElementById("world-status") as HTMLDivElement | null;
const worldUploadForm = document.getElementById("world-upload-form") as HTMLFormElement | null;
const worldModelNameInput = document.getElementById("world-model-name") as HTMLInputElement | null;
const worldModelVisibilityInput = document.getElementById(
  "world-model-visibility"
) as HTMLSelectElement | null;
const worldModelFileInput = document.getElementById("world-model-file") as HTMLInputElement | null;
const worldUploadButton = document.getElementById("world-upload-button") as HTMLButtonElement | null;
const worldGenerateForm = document.getElementById("world-generate-form") as HTMLFormElement | null;
const worldGeneratePromptInput = document.getElementById(
  "world-generate-prompt"
) as HTMLInputElement | null;
const worldGenerateNameInput = document.getElementById("world-generate-name") as HTMLInputElement | null;
const worldGenerateVisibilityInput = document.getElementById(
  "world-generate-visibility"
) as HTMLSelectElement | null;
const worldGenerateButton = document.getElementById(
  "world-generate-button"
) as HTMLButtonElement | null;
const worldAssetsContainer = document.getElementById("world-assets") as HTMLDivElement | null;
const worldPlacementsContainer = document.getElementById("world-placements") as HTMLDivElement | null;
const worldPlacementEditor = document.getElementById(
  "world-placement-editor"
) as HTMLDivElement | null;
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
    if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
    if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
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
  if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = !worldState.canManage;
  if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = !worldState.canManage;
  if (worldGenerateButton) worldGenerateButton.disabled = !worldState.canManage;
}

function getWorldAssetLabel(asset: WorldAsset) {
  const currentVersion = asset.currentVersion?.version ?? 0;
  return `${asset.name} (v${currentVersion})`;
}

function getPlacementById(placementId: string | null) {
  if (!placementId || !worldState) return null;
  return worldState.placements.find((placement) => placement.id === placementId) ?? null;
}

function cancelPlacementMode() {
  if (!isPlacingModel && !selectedPlacementAssetId) return;
  isPlacingModel = false;
  selectedPlacementAssetId = null;
  renderWorldAssets();
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
  }
  renderWorldPlacements();
  renderWorldPlacementEditor();
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
  if (!auth.getCurrentUser()) {
    worldState = null;
    worldGenerationTasks = [];
    selectedWorldPlacementId = null;
    pendingSelectedWorldPlacementId = null;
    stopWorldGenerationPolling();
    game.setWorldData(null);
    setWorldNotice("Sign in to load world");
    if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
    if (worldPlacementsContainer) worldPlacementsContainer.innerHTML = "";
    if (worldPlacementEditor) worldPlacementEditor.innerHTML = "";
    if (worldUploadButton) worldUploadButton.disabled = true;
    if (worldModelFileInput) worldModelFileInput.disabled = true;
    if (worldModelNameInput) worldModelNameInput.disabled = true;
    if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
    if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
    if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
    if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
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
  const requestedPlacementId = pendingSelectedWorldPlacementId ?? selectedWorldPlacementId;
  pendingSelectedWorldPlacementId = null;
  selectedWorldPlacementId =
    requestedPlacementId &&
    payload.placements.some((placement) => placement.id === requestedPlacementId)
      ? requestedPlacementId
      : null;
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
  if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = !payload.canManage;
  if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = !payload.canManage;
  if (worldGenerateNameInput) worldGenerateNameInput.disabled = !payload.canManage;
  if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = !payload.canManage;
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
  renderWorldPlacements();
  renderWorldPlacementEditor();
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
    label.className = "party-result-label world-asset-name";
    label.textContent = getWorldAssetLabel(asset);
    label.title = `${asset.name} (${asset.versions.length} versions)`;

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
  onLocalStateChange(state) {
    realtime.sendPlayerUpdate(state);
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
    game.setLocalIdentity(user?.name ?? user?.email ?? "Guest", user?.avatarUrl ?? null);
    party.setCurrentUser(user);
    syncChatCanPost();

    if (!user) {
      worldState = null;
      worldGenerationTasks = [];
      stopWorldGenerationPolling();
      isPlacingModel = false;
      selectedPlacementAssetId = null;
      selectedWorldPlacementId = null;
      pendingSelectedWorldPlacementId = null;
      game.setWorldData(null);
      setWorldNotice("Sign in to load world");
      if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
      if (worldPlacementsContainer) worldPlacementsContainer.innerHTML = "";
      if (worldPlacementEditor) worldPlacementEditor.innerHTML = "";
      if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
      if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
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

    syncMediaPeersAndVolumes();
    void loadWorldState();
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
setupChatChannelToggles();

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
        name: worldGenerateNameInput?.value?.trim() ?? "",
        visibility: worldGenerateVisibilityInput?.value === "private" ? "private" : "public"
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
    if (worldGenerateVisibilityInput) {
      worldGenerateVisibilityInput.value = "public";
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
syncChatCanPost();
renderCombinedChat();
setWorldNotice("Sign in to load world");
if (worldUploadButton) worldUploadButton.disabled = true;
if (worldModelFileInput) worldModelFileInput.disabled = true;
if (worldModelNameInput) worldModelNameInput.disabled = true;
if (worldModelVisibilityInput) worldModelVisibilityInput.disabled = true;
if (worldGeneratePromptInput) worldGeneratePromptInput.disabled = true;
if (worldGenerateNameInput) worldGenerateNameInput.disabled = true;
if (worldGenerateVisibilityInput) worldGenerateVisibilityInput.disabled = true;
if (worldGenerateButton) worldGenerateButton.disabled = true;
syncWorldVisibilityControls();
renderWorldPlacements();
renderWorldPlacementEditor();
void auth.loadCurrentUser();
realtime.connect();
void webrtc.refreshDevices();
game.start();
