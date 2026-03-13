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
  WorldCamera,
  WorldHomeCity,
  WorldHomePortal,
  TimelineFrame,
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

const appRoot = app;

const dockPanel = document.getElementById("dock-panel") as HTMLElement | null;
const homeListingScreen = document.getElementById("home-listing-screen") as HTMLElement | null;
const homeOpenMapButton = document.getElementById("home-open-map-button") as HTMLButtonElement | null;
const homeSearchInput = document.getElementById("home-search-input") as HTMLInputElement | null;
const homeCityFilter = document.getElementById("home-city-filter") as HTMLSelectElement | null;
const homeSearchClearButton = document.getElementById(
  "home-search-clear"
) as HTMLButtonElement | null;
const homeResultsSummary = document.getElementById("home-results-summary") as HTMLDivElement | null;
const homeResultsList = document.getElementById("home-results-list") as HTMLDivElement | null;
const homeListingWorldCount = document.getElementById(
  "home-listing-world-count"
) as HTMLSpanElement | null;
const homeListingCityCount = document.getElementById(
  "home-listing-city-count"
) as HTMLSpanElement | null;
const homeListingOnlineCount = document.getElementById(
  "home-listing-online-count"
) as HTMLSpanElement | null;
const worldMapScreen = document.getElementById("world-map-screen") as HTMLElement | null;
const worldMapCanvas = document.getElementById("world-map-canvas") as HTMLElement | null;
const worldMapControls = document.getElementById("world-map-controls") as HTMLDivElement | null;
const worldMapControlsToggle = document.getElementById(
  "world-map-controls-toggle"
) as HTMLButtonElement | null;
const worldMapStatus = document.getElementById("world-map-status") as HTMLDivElement | null;
const worldMapWorldNameInput = document.getElementById(
  "world-map-world-name-input"
) as HTMLInputElement | null;
const worldMapWorldDescriptionInput = document.getElementById(
  "world-map-world-description-input"
) as HTMLTextAreaElement | null;
const worldMapSavePinButton = document.getElementById(
  "world-map-save-pin"
) as HTMLButtonElement | null;
const worldMapSaveSettingsButton = document.getElementById(
  "world-map-save-settings"
) as HTMLButtonElement | null;
const worldMapJoinMineButton = document.getElementById(
  "world-map-join-mine"
) as HTMLButtonElement | null;
const worldMapZoomInButton = document.getElementById(
  "world-map-zoom-in"
) as HTMLButtonElement | null;
const worldMapZoomOutButton = document.getElementById(
  "world-map-zoom-out"
) as HTMLButtonElement | null;
const mapGlobalChat = document.getElementById("map-global-chat") as HTMLElement | null;
const mapGlobalChatToggle = document.getElementById(
  "map-global-chat-toggle"
) as HTMLButtonElement | null;
const mapGlobalChatLog = document.getElementById(
  "map-global-chat-log"
) as HTMLDivElement | null;
const mapGlobalChatForm = document.getElementById(
  "map-global-chat-form"
) as HTMLFormElement | null;
const mapGlobalChatInput = document.getElementById(
  "map-global-chat-input"
) as HTMLInputElement | null;
const mapGlobalChatSend = document.getElementById(
  "map-global-chat-send"
) as HTMLButtonElement | null;
const worldMapCitySelect = document.getElementById(
  "world-map-city-select"
) as HTMLSelectElement | null;
const worldMapHomeAddress = document.getElementById(
  "world-map-home-address"
) as HTMLDivElement | null;
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
const worldMapWorldAddress = document.getElementById(
  "world-map-world-address"
) as HTMLElement | null;
const worldMapWorldCardCloseButton = document.getElementById(
  "world-map-world-card-close"
) as HTMLButtonElement | null;
const worldMapJoinWorldButton = document.getElementById(
  "world-map-join-world"
) as HTMLButtonElement | null;
const transformToolbar = document.getElementById("transform-toolbar") as HTMLElement | null;
const transformTranslateButton = document.getElementById(
  "transform-mode-translate"
) as HTMLButtonElement | null;
const transformRotateButton = document.getElementById(
  "transform-mode-rotate"
) as HTMLButtonElement | null;
const transformScaleButton = document.getElementById(
  "transform-mode-scale"
) as HTMLButtonElement | null;
const transformCollapseButton = document.getElementById(
  "transform-toolbar-collapse"
) as HTMLButtonElement | null;
const createToolbarToggleButton = document.getElementById(
  "create-toolbar-toggle"
) as HTMLButtonElement | null;
const createToolbarPanel = document.getElementById("create-toolbar-panel") as HTMLDivElement | null;
const createToolbarGenerateSlot = document.getElementById(
  "create-toolbar-generate-slot"
) as HTMLDivElement | null;
const placeToolbarToggleButton = document.getElementById(
  "place-toolbar-toggle"
) as HTMLButtonElement | null;
const placeToolbarPanel = document.getElementById("place-toolbar-panel") as HTMLDivElement | null;
const placeToolbarSlot = document.getElementById("place-toolbar-slot") as HTMLDivElement | null;
const editToolbarPanel = document.getElementById("edit-toolbar-panel") as HTMLDivElement | null;
const editToolbarSlot = document.getElementById("edit-toolbar-slot") as HTMLDivElement | null;
const transformSliderPanel = document.getElementById(
  "transform-slider-panel"
) as HTMLDivElement | null;
const homeMapButton = document.getElementById("home-map-button") as HTMLButtonElement | null;
const dockMinimizeButton = document.getElementById("dock-minimize") as HTMLButtonElement | null;
const dockHeightToggleButton = document.getElementById(
  "dock-height-toggle"
) as HTMLButtonElement | null;
const chatTabButton = document.getElementById("tab-chat") as HTMLButtonElement | null;
const worldTabButton = document.getElementById("tab-world") as HTMLButtonElement | null;
const timelineTabButton = document.getElementById("tab-timeline") as HTMLButtonElement | null;
const mediaTabButton = document.getElementById("tab-media") as HTMLButtonElement | null;
const controlsTabButton = document.getElementById("tab-controls") as HTMLButtonElement | null;
const chatPane = document.getElementById("pane-chat") as HTMLElement | null;
const partyPane = document.getElementById("pane-party") as HTMLElement | null;
const timelinePane = document.getElementById("pane-timeline") as HTMLElement | null;
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
const MAP_ROUTE_PATH = "/map";

const apiUrl = createApiUrlResolver(apiBase);

type RouteMode = "home" | "map" | "world";

function getRouteMode(url: URL): RouteMode {
  if (parseWorldIdFromUrl(url)) return "world";
  return url.pathname === MAP_ROUTE_PATH ? "map" : "home";
}

function readInitialLinkedWorldId() {
  try {
    const url = new URL(window.location.href);
    const worldIdFromUrl = parseWorldIdFromUrl(url);
    if (worldIdFromUrl) {
      window.sessionStorage.setItem(PENDING_WORLD_JOIN_STORAGE_KEY, worldIdFromUrl);
      return worldIdFromUrl;
    }

    if (url.pathname !== MAP_ROUTE_PATH) {
      return null;
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
type MainTabKey =
  | "chat"
  | "world"
  | "objects"
  | "walls"
  | "party"
  | "timeline"
  | "media"
  | "controls";
type TransformMode = "translate" | "rotate" | "scale";
let setActiveMainTab: ((tab: MainTabKey) => void) | null = null;
let setActivePartySubtab: ((tab: PartySubtabKey) => void) | null = null;
let activeTransformMode: TransformMode = "translate";
let transformToolbarCollapsed = true;
let createToolbarCollapsed = true;
let placeToolbarCollapsed = true;

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
    !worldTabButton ||
    !timelineTabButton ||
    !mediaTabButton ||
    !controlsTabButton ||
    !chatPane ||
    !partyPane ||
    !timelinePane ||
    !mediaPane ||
    !controlsPane
  ) {
    return;
  }

  const tabs = [
    chatTabButton,
    worldTabButton,
    timelineTabButton,
    mediaTabButton,
    controlsTabButton
  ];

  const setActive = (tab: MainTabKey) => {
    const normalizedTab = tab === "party" ? "world" : tab;
    const activeIndex =
      normalizedTab === "chat"
        ? 0
        : normalizedTab === "world"
          ? 1
          : normalizedTab === "timeline"
            ? 2
            : normalizedTab === "media"
              ? 3
              : 4;

    for (let i = 0; i < tabs.length; i += 1) {
      const active = i === activeIndex;
      tabs[i]!.classList.toggle("active", active);
      tabs[i]!.setAttribute("aria-selected", active ? "true" : "false");
    }

    chatPane.classList.toggle("active", normalizedTab === "chat");
    partyPane.classList.toggle(
      "active",
      normalizedTab === "world" || normalizedTab === "objects" || normalizedTab === "walls"
    );
    timelinePane.classList.toggle("active", normalizedTab === "timeline");
    mediaPane.classList.toggle("active", normalizedTab === "media");
    controlsPane.classList.toggle("active", normalizedTab === "controls");

    if (normalizedTab === "world" || normalizedTab === "objects" || normalizedTab === "walls") {
      setActivePartySubtab?.(normalizedTab);
    }
    syncTimelinePreviewWindow();
  };
  setActiveMainTab = setActive;

  chatTabButton.addEventListener("click", () => setActive("chat"));
  worldTabButton.addEventListener("click", () => setActive("world"));
  timelineTabButton.addEventListener("click", () => setActive("timeline"));
  mediaTabButton.addEventListener("click", () => setActive("media"));
  controlsTabButton.addEventListener("click", () => setActive("controls"));
}

function setupPartySubtabs() {
  const entries = [
    { key: "world" as const, button: partyWorldSubtabButton, pane: partyWorldSubpane },
    { key: "objects" as const, button: partyObjectsSubtabButton, pane: partyObjectsSubpane },
    { key: "posts" as const, button: partyPostsSubtabButton, pane: partyPostsSubpane },
    { key: "walls" as const, button: partyWallsSubtabButton, pane: partyWallsSubpane }
  ].filter(
    (entry): entry is {
      key: PartySubtabKey;
      button: HTMLButtonElement | null;
      pane: HTMLElement;
    } => Boolean(entry.pane)
  );

  if (entries.length === 0) return;

  const availableKeys = new Set(entries.map((entry) => entry.key));
  const defaultKey = availableKeys.has("world") ? "world" : entries[0]!.key;
  const resolveKey = (requested: PartySubtabKey) =>
    availableKeys.has(requested) ? requested : defaultKey;

  const setActive = (tab: PartySubtabKey) => {
    const activeKey = resolveKey(tab);
    entries.forEach(({ key, button, pane }) => {
      const active = key === activeKey;
      button?.classList.toggle("active", active);
      button?.setAttribute("aria-selected", active ? "true" : "false");
      pane.classList.toggle("active", active);
      pane.hidden = !active;
    });
  };
  setActivePartySubtab = setActive;

  entries.forEach(({ key, button }) => {
    button?.addEventListener("click", () => setActive(key));
  });
  setActive(defaultKey);
}

function setupTimelineControls() {
  timelinePlayToggleButton?.addEventListener("click", () => {
    if (timelinePlaying) {
      stopTimelinePlayback();
      renderTimelineEditor();
      return;
    }
    startTimelinePlayback();
    renderTimelineEditor();
  });

  timelineKeyframeButton?.addEventListener("click", () => {
    if (!worldState?.canManage) return;
    if (!upsertSelectedTrackKeyframe()) return;
    renderTimelineEditor();
    syncTimelinePreviewWindow();
    void persistTimelineFrames(`Saved keyframe at ${formatTimelineTime(timelineScrubSeconds)}`);
  });

  timelineDeleteFrameButton?.addEventListener("click", () => {
    if (!worldState?.canManage) return;
    if (!deleteSelectedTrackKeyframe()) return;
    renderTimelineEditor();
    syncTimelinePreviewWindow();
    void persistTimelineFrames("Deleted keyframe");
  });

  timelineScrubInput?.addEventListener("input", () => {
    if (timelinePlaying) {
      stopTimelinePlayback();
    }
    const next = Number(timelineScrubInput.value);
    if (!Number.isFinite(next)) return;
    timelineScrubSeconds = Math.max(0, next);
    if (timelineTimeInput) {
      timelineTimeInput.value = timelineScrubSeconds.toFixed(1);
    }
    applyTimelineAtTime(timelineScrubSeconds);
    renderTimelineEditor();
    syncTimelinePreviewWindow();
  });

  timelineTimeInput?.addEventListener("change", () => {
    if (timelinePlaying) {
      stopTimelinePlayback();
    }
    const next = Number(timelineTimeInput.value);
    if (!Number.isFinite(next)) return;
    timelineScrubSeconds = Math.max(0, next);
    if (timelineScrubInput) {
      timelineScrubInput.value = String(timelineScrubSeconds);
    }
    applyTimelineAtTime(timelineScrubSeconds);
    renderTimelineEditor();
    syncTimelinePreviewWindow();
  });

  timelineJsonScopeInput?.addEventListener("change", () => {
    timelineJsonScope = timelineJsonScopeInput.value === "track" ? "track" : "frame";
    syncSelectedTimelineFrameJson();
  });

  timelineFrameJsonInput?.addEventListener("change", () => {
    if (!parseSelectedFrameJson()) return;
    applyTimelineAtTime(timelineScrubSeconds);
    renderTimelineEditor();
    syncTimelinePreviewWindow();
    void persistTimelineFrames(
      getTimelineJsonScopeValue() === "track" ? "Saved track JSON" : "Saved frame JSON"
    );
  });
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

function renderTransformToolbarSliders() {
  if (!transformSliderPanel) return;
  transformSliderPanel.innerHTML = "";
  const canEditPlacements = worldViewActive && worldState?.canManage === true;
  const selectedTarget = getSelectedTransformTarget();
  if (!canEditPlacements || !selectedTarget) return;

  const radToDeg = (value: number) => (value * 180) / Math.PI;
  const degToRad = (value: number) => (value * Math.PI) / 180;
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  const group =
    activeTransformMode === "translate"
      ? "position"
      : activeTransformMode === "rotate"
        ? "rotation"
        : "scale";
  const sliderMode = group === "rotation" ? "absolute" : "delta";
  const sliderMin = group === "rotation" ? -180 : group === "position" ? -1.5 : -0.5;
  const sliderMax = group === "rotation" ? 180 : group === "position" ? 1.5 : 0.5;
  const sliderStep = group === "rotation" ? 1 : group === "position" ? 0.05 : 0.02;

  for (const axis of axes) {
    const row = document.createElement("label");
    row.className = "transform-slider-row";

    const label = document.createElement("span");
    label.className = "transform-slider-label";
    label.textContent = axis.toUpperCase();

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "world-placement-axis-slider";
    slider.min = String(sliderMin);
    slider.max = String(sliderMax);
    slider.step = String(sliderStep);
    slider.disabled = !canEditPlacements;

    const input = document.createElement("input");
    input.type = "number";
    input.className = "transform-slider-input";
    input.step = group === "rotation" ? "1" : "0.01";
    input.disabled = !canEditPlacements;

    if (group === "rotation") {
      const start = radToDeg(selectedTarget.rotation[axis]);
      slider.value = String(Math.max(sliderMin, Math.min(sliderMax, start)));
      input.value = start.toFixed(1);
    } else if (group === "position") {
      slider.value = "0";
      input.value = selectedTarget.position[axis].toFixed(2);
    } else {
      slider.value = "0";
      input.value = selectedTarget.scale[axis].toFixed(2);
    }

    let lastSliderValue = Number(slider.value);
    slider.addEventListener("input", () => {
      const parsed = Number(slider.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getSelectedTransformTarget();
      if (!latest) return;
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };

      if (sliderMode === "absolute") {
        rotation[axis] = degToRad(parsed);
      } else {
        const delta = parsed - lastSliderValue;
        if (Math.abs(delta) <= 0.00001) return;
        if (group === "position") position[axis] += delta;
        else scale[axis] = Math.max(0.01, scale[axis] + delta);
      }

      const updated = commitSelectedTransform(
        { position, rotation, scale },
        { persistMode: "debounced", renderUi: false }
      );
      if (!updated) return;
      if (group === "rotation") {
        const degrees = radToDeg(updated.rotation[axis]);
        input.value = degrees.toFixed(1);
      } else if (group === "position") {
        input.value = updated.position[axis].toFixed(2);
      } else {
        input.value = updated.scale[axis].toFixed(2);
      }
      lastSliderValue = parsed;
    });

    slider.addEventListener("change", () => {
      const parsed = Number(slider.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getSelectedTransformTarget();
      if (!latest) return;
      if (sliderMode === "delta") {
        commitSelectedTransform(
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
      rotation[axis] = degToRad(parsed);
      commitSelectedTransform(
        { position, rotation, scale },
        { persistMode: "immediate", renderUi: true }
      );
    });

    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) return;
      const latest = getSelectedTransformTarget();
      if (!latest) return;
      const position = { ...latest.position };
      const rotation = { ...latest.rotation };
      const scale = { ...latest.scale };

      if (group === "rotation") {
        rotation[axis] = degToRad(parsed);
      } else if (group === "position") {
        position[axis] = parsed;
      } else {
        scale[axis] = Math.max(0.01, parsed);
      }

      const updated = commitSelectedTransform(
        { position, rotation, scale },
        { persistMode: "immediate", renderUi: true }
      );
      if (!updated) return;
      if (group === "rotation") {
        const degrees = radToDeg(updated.rotation[axis]);
        slider.value = String(Math.max(sliderMin, Math.min(sliderMax, degrees)));
        input.value = degrees.toFixed(1);
      } else if (group === "position") {
        slider.value = "0";
        lastSliderValue = 0;
        input.value = updated.position[axis].toFixed(2);
      } else {
        slider.value = "0";
        lastSliderValue = 0;
        input.value = updated.scale[axis].toFixed(2);
      }
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(input);
    transformSliderPanel.appendChild(row);
  }
}

function syncTransformToolbar() {
  const buttons = [
    transformTranslateButton,
    transformRotateButton,
    transformScaleButton
  ] as const;
  const inWorldRoute = Boolean(parseWorldIdFromUrl(new URL(window.location.href)));
  const canEditPlacements =
    inWorldRoute && worldViewActive && worldState?.canManage === true;
  const transformToolsEnabled = canEditPlacements && !transformToolbarCollapsed;
  const editPanelOpen = canEditPlacements && !transformToolbarCollapsed;
  const createPanelOpen = canEditPlacements && !createToolbarCollapsed;
  const placePanelOpen = canEditPlacements && !placeToolbarCollapsed;
  transformToolbar?.toggleAttribute("hidden", !canEditPlacements);
  transformToolbar?.classList.toggle("collapsed", transformToolbarCollapsed);
  transformToolbar?.classList.toggle("create-open", createPanelOpen);
  transformToolbar?.classList.toggle("place-open", placePanelOpen);
  if (createToolbarPanel) {
    createToolbarPanel.hidden = !createPanelOpen;
  }
  if (placeToolbarPanel) {
    placeToolbarPanel.hidden = !placePanelOpen;
  }
  if (editToolbarPanel) {
    editToolbarPanel.hidden = !editPanelOpen;
  }
  game.setWorldPlacementTransformEnabled(transformToolsEnabled);
  game.setLocalPlayerMovementEnabled(!(editPanelOpen || createPanelOpen || placePanelOpen));
  const hasSelection = Boolean(getSelectedTransformTarget());
  buttons.forEach((button) => {
    if (!button) return;
    button.disabled = !hasSelection;
  });
  if (transformCollapseButton) {
    transformCollapseButton.hidden = createPanelOpen || placePanelOpen;
    transformCollapseButton.disabled = !canEditPlacements;
    transformCollapseButton.textContent = transformToolbarCollapsed ? "Edit" : "x";
    transformCollapseButton.setAttribute(
      "aria-label",
      transformToolbarCollapsed
        ? "Open transform editor"
        : "Close transform editor"
    );
    transformCollapseButton.setAttribute(
      "title",
      transformToolbarCollapsed ? "Edit transform" : "Close transform editor"
    );
    transformCollapseButton.setAttribute(
      "aria-expanded",
      transformToolbarCollapsed ? "false" : "true"
    );
  }
  if (createToolbarToggleButton) {
    createToolbarToggleButton.hidden = editPanelOpen || placePanelOpen;
    createToolbarToggleButton.disabled = !canEditPlacements;
    createToolbarToggleButton.textContent = createToolbarCollapsed ? "Create" : "x";
    createToolbarToggleButton.setAttribute(
      "aria-label",
      createToolbarCollapsed ? "Open model creation" : "Close model creation"
    );
    createToolbarToggleButton.setAttribute(
      "title",
      createToolbarCollapsed ? "Create model" : "Close model creation"
    );
    createToolbarToggleButton.setAttribute(
      "aria-expanded",
      createToolbarCollapsed ? "false" : "true"
    );
  }
  if (placeToolbarToggleButton) {
    placeToolbarToggleButton.hidden = editPanelOpen || createPanelOpen;
    placeToolbarToggleButton.disabled = !canEditPlacements;
    placeToolbarToggleButton.textContent = placeToolbarCollapsed ? "Place" : "x";
    placeToolbarToggleButton.setAttribute(
      "aria-label",
      placeToolbarCollapsed ? "Open placement panel" : "Close placement panel"
    );
    placeToolbarToggleButton.setAttribute(
      "title",
      placeToolbarCollapsed ? "Place assets" : "Close placement panel"
    );
    placeToolbarToggleButton.setAttribute(
      "aria-expanded",
      placeToolbarCollapsed ? "false" : "true"
    );
  }
  transformTranslateButton?.classList.toggle("active", activeTransformMode === "translate");
  transformRotateButton?.classList.toggle("active", activeTransformMode === "rotate");
  transformScaleButton?.classList.toggle("active", activeTransformMode === "scale");
  renderTransformToolbarSliders();
}

function setupTransformToolbar() {
  if (!transformToolbar) return;
  if (
    createToolbarGenerateSlot &&
    worldGenerateSection &&
    worldGenerateSection.parentElement !== createToolbarGenerateSlot
  ) {
    createToolbarGenerateSlot.appendChild(worldGenerateSection);
  }
  if (placeToolbarSlot) {
    if (
      worldPlaceModelsSection &&
      worldPlaceModelsSection.parentElement !== placeToolbarSlot
    ) {
      placeToolbarSlot.appendChild(worldPlaceModelsSection);
    }
    if (
      worldPlaceCubesSection &&
      worldPlaceCubesSection.parentElement !== placeToolbarSlot
    ) {
      placeToolbarSlot.appendChild(worldPlaceCubesSection);
    }
  }
  if (
    editToolbarSlot &&
    worldPlaceInstancesSection &&
    worldPlaceInstancesSection.parentElement !== editToolbarSlot
  ) {
    editToolbarSlot.appendChild(worldPlaceInstancesSection);
  }
  const applyMode = (mode: TransformMode) => {
    activeTransformMode = mode;
    game.setWorldPlacementTransformMode(mode);
    syncTransformToolbar();
  };
  transformTranslateButton?.addEventListener("click", () => applyMode("translate"));
  transformRotateButton?.addEventListener("click", () => applyMode("rotate"));
  transformScaleButton?.addEventListener("click", () => applyMode("scale"));
  transformCollapseButton?.addEventListener("click", () => {
    const nextOpen = transformToolbarCollapsed;
    transformToolbarCollapsed = !transformToolbarCollapsed;
    if (nextOpen) {
      createToolbarCollapsed = true;
      placeToolbarCollapsed = true;
    }
    syncTransformToolbar();
  });
  createToolbarToggleButton?.addEventListener("click", () => {
    const nextOpen = createToolbarCollapsed;
    createToolbarCollapsed = !createToolbarCollapsed;
    if (nextOpen) {
      transformToolbarCollapsed = true;
      placeToolbarCollapsed = true;
    }
    syncTransformToolbar();
  });
  placeToolbarToggleButton?.addEventListener("click", () => {
    const nextOpen = placeToolbarCollapsed;
    placeToolbarCollapsed = !placeToolbarCollapsed;
    if (nextOpen) {
      transformToolbarCollapsed = true;
      createToolbarCollapsed = true;
    }
    syncTransformToolbar();
  });
  syncTransformToolbar();
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
let selectedWorldCameraId: string | null = null;
let pendingSelectedWorldCameraId: string | null = null;
let selectedWorldCameraHandle: "position" | "lookAt" = "position";
let isPlacingPhotoWall = false;
let isSubmittingPhotoWallPlacement = false;
let pendingPhotoWallDraft: { imageUrl: string | null; imageFile: File | null } | null = null;
let selectedPhotoWallLibraryImageUrl: string | null = null;
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
const worldCameraPersistTimers = new Map<string, number>();
const TRANSFORM_PERSIST_IDLE_MS = 2000;
let currentRouteMode = getRouteMode(new URL(window.location.href));
let pendingAutoJoinWorldId = readInitialLinkedWorldId();
let autoJoinWorldIdSent: string | null = null;
let worldViewActive = currentRouteMode === "world";
let knownWorldPortals: WorldPortal[] = [];
let worldHomeCities: WorldHomeCity[] = [];
let myOwnedWorldId: string | null = null;
let loadedWorldMapName = "";
let loadedWorldMapDescription = "";
let loadedWorldMapCityKey: string | null = null;
let pendingWorldMapCityKey: string | null = null;
let homeListingLoaded = false;
let homeListingLoadFailed = false;
const PLAYER_AVATAR_SELECTION_STORAGE_KEY = "augmego_player_avatar_selection_v1";
let playerAvatarSelection: PlayerAvatarSelection = {
  stationaryModelUrl: null,
  moveModelUrl: null,
  specialModelUrl: null
};
let timelineFrames: TimelineFrame[] = [];
let selectedTimelineFrameIndex = -1;
let selectedTimelineTrackKey: string | null = null;
let timelineJsonScope: TimelineJsonScope = "frame";
let timelineScrubSeconds = 0;
let timelinePreviewActive = false;
let timelinePlaying = false;
let timelinePlaybackLastTimeMs = 0;
let timelinePlaybackRafId: number | null = null;
let timelineAppliedPlacementState = new Map<
  string,
  {
    visible: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  }
>();

const worldStatus = document.getElementById("world-status") as HTMLDivElement | null;
const worldGenerationStatusList = document.getElementById(
  "world-generation-status-list"
) as HTMLDivElement | null;
const worldGenerateSection = document.getElementById("world-generate-section") as HTMLDivElement | null;
const worldPlaceModelsSection = document.getElementById(
  "world-place-models-section"
) as HTMLDivElement | null;
const worldPlaceInstancesSection = document.getElementById(
  "world-place-instances-section"
) as HTMLDivElement | null;
const worldPlaceCubesSection = document.getElementById(
  "world-place-cubes-section"
) as HTMLDivElement | null;
const worldUploadForm = document.getElementById("world-upload-form") as HTMLFormElement | null;
const worldModelNameInput = document.getElementById("world-model-name") as HTMLInputElement | null;
const worldModelVisibilityInput = document.getElementById(
  "world-model-visibility"
) as HTMLSelectElement | null;
const worldModelFileInput = document.getElementById("world-model-file") as HTMLInputElement | null;
const worldModelFileName = document.getElementById("world-model-file-name") as HTMLSpanElement | null;
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
const worldGenerateImageFileName = document.getElementById(
  "world-generate-image-file-name"
) as HTMLSpanElement | null;
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
const worldPhotoWallImageFileName = document.getElementById(
  "world-photo-wall-image-file-name"
) as HTMLSpanElement | null;
const worldPhotoWallButton = document.getElementById(
  "world-photo-wall-button"
) as HTMLButtonElement | null;
const worldPhotoWallsContainer = document.getElementById(
  "world-photo-walls"
) as HTMLDivElement | null;
const worldPhotoWallLibraryContainer = document.getElementById(
  "world-photo-wall-library"
) as HTMLDivElement | null;
const worldPhotoWallEditor = document.getElementById(
  "world-photo-wall-editor"
) as HTMLDivElement | null;
const worldCameraCreateCurrentButton = document.getElementById(
  "world-camera-create-current"
) as HTMLButtonElement | null;
const worldCamerasContainer = document.getElementById("world-cameras") as HTMLDivElement | null;
const worldCameraEditor = document.getElementById("world-camera-editor") as HTMLDivElement | null;
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
) as HTMLTextAreaElement | null;
const worldSettingsSaveButton = document.getElementById(
  "world-settings-save"
) as HTMLButtonElement | null;
const timelineKeyframeButton = document.getElementById(
  "timeline-keyframe"
) as HTMLButtonElement | null;
const timelinePlayToggleButton = document.getElementById(
  "timeline-play-toggle"
) as HTMLButtonElement | null;
const timelineDeleteFrameButton = document.getElementById(
  "timeline-delete-frame"
) as HTMLButtonElement | null;
const timelineStatus = document.getElementById("timeline-status") as HTMLDivElement | null;
const timelineRuler = document.getElementById("timeline-ruler") as HTMLDivElement | null;
const timelineTracks = document.getElementById("timeline-tracks") as HTMLDivElement | null;
const timelineScrubInput = document.getElementById("timeline-scrub") as HTMLInputElement | null;
const timelineTimeInput = document.getElementById("timeline-time-input") as HTMLInputElement | null;
const timelineFrameJsonLabel = document.getElementById(
  "timeline-frame-json-label"
) as HTMLLabelElement | null;
const timelineJsonScopeInput = document.getElementById(
  "timeline-json-scope"
) as HTMLSelectElement | null;
const timelineFrameJsonInput = document.getElementById(
  "timeline-frame-json"
) as HTMLTextAreaElement | null;
const timelineCameraPreviewWindow = document.getElementById(
  "timeline-camera-preview-window"
) as HTMLDivElement | null;
const timelineCameraPreviewTitle = document.getElementById(
  "timeline-camera-preview-title"
) as HTMLDivElement | null;
const timelineCameraPreviewViewport = document.getElementById(
  "timeline-camera-preview-viewport"
) as HTMLDivElement | null;

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

function syncWorldGenerateImageFileName() {
  if (!worldGenerateImageFileName) return;
  const selectedFile = worldGenerateImageFileInput?.files?.[0];
  worldGenerateImageFileName.textContent = selectedFile?.name || "No image chosen";
}

function syncWorldModelFileName() {
  if (!worldModelFileName) return;
  const selectedFile = worldModelFileInput?.files?.[0];
  worldModelFileName.textContent = selectedFile?.name || "No file chosen";
}

function syncWorldPhotoWallFileName() {
  if (!worldPhotoWallImageFileName) return;
  const selectedFile = worldPhotoWallImageFileInput?.files?.[0];
  worldPhotoWallImageFileName.textContent = selectedFile?.name || "No image chosen";
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

function formatPortalAddress(portal: WorldPortal) {
  const address = portal.fictionalAddress?.trim();
  const city = portal.homeCityName?.trim();
  const country = portal.homeCountryName?.trim();

  return {
    line1: address || "Address pending assignment",
    line2:
      city && country
        ? `${city}, ${country}`
        : city || country || "Choose a city to place this world on the map"
  };
}

function syncHomeListingCityOptions() {
  if (!homeCityFilter) return;

  const previousValue = homeCityFilter.value;
  const cityOptions = Array.from(
    new Set(
      knownWorldPortals
        .map((portal) => portal.homeCityName?.trim() ?? "")
        .filter((city) => city.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));

  homeCityFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All cities";
  homeCityFilter.appendChild(allOption);

  cityOptions.forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    homeCityFilter.appendChild(option);
  });

  homeCityFilter.value = cityOptions.includes(previousValue) ? previousValue : "";
}

function renderHomeListing() {
  if (!homeResultsList || !homeResultsSummary) return;

  syncHomeListingCityOptions();

  const searchTerm = homeSearchInput?.value.trim().toLowerCase() ?? "";
  const selectedCity = homeCityFilter?.value.trim() ?? "";
  const searchablePortals = [...knownWorldPortals].sort((left, right) => {
    const leftAddress = formatPortalAddress(left).line1;
    const rightAddress = formatPortalAddress(right).line1;
    return leftAddress.localeCompare(rightAddress) || left.worldName.localeCompare(right.worldName);
  });

  const filteredPortals = searchablePortals.filter((portal) => {
    if (selectedCity && (portal.homeCityName?.trim() ?? "") !== selectedCity) {
      return false;
    }

    if (!searchTerm) return true;
    const haystack = [
      portal.worldName,
      portal.worldDescription ?? "",
      portal.owner.name,
      portal.fictionalAddress ?? "",
      portal.homeCityName ?? "",
      portal.homeCountryName ?? ""
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchTerm);
  });

  if (homeListingWorldCount) {
    homeListingWorldCount.textContent = String(knownWorldPortals.length);
  }
  if (homeListingCityCount) {
    const cityCount = new Set(
      knownWorldPortals
        .map((portal) => portal.homeCityName?.trim() ?? "")
        .filter((city) => city.length > 0)
    ).size;
    homeListingCityCount.textContent = String(cityCount);
  }
  if (homeListingOnlineCount) {
    const onlineCount = knownWorldPortals.reduce(
      (total, portal) => total + (portal.onlineVisitorCount ?? 0),
      0
    );
    homeListingOnlineCount.textContent = String(onlineCount);
  }

  if (!homeListingLoaded && knownWorldPortals.length === 0) {
    homeResultsSummary.textContent = "Loading available worlds...";
    homeResultsList.innerHTML = '<div class="home-result-empty">Loading listings...</div>';
    return;
  }

  if (homeListingLoadFailed) {
    homeResultsSummary.textContent = "We could not load listings right now.";
    homeResultsList.innerHTML =
      '<div class="home-result-empty">World listings are temporarily unavailable. Try opening the map or refreshing again in a moment.</div>';
    return;
  }

  const cityLabel = selectedCity ? ` in ${selectedCity}` : "";
  homeResultsSummary.textContent = `${filteredPortals.length} world${filteredPortals.length === 1 ? "" : "s"} found${cityLabel}.`;
  homeResultsList.innerHTML = "";

  if (filteredPortals.length === 0) {
    homeResultsList.innerHTML =
      '<div class="home-result-empty">No worlds matched that search. Try a different address, owner, or city.</div>';
    return;
  }

  filteredPortals.forEach((portal) => {
    const address = formatPortalAddress(portal);
    const card = document.createElement("article");
    card.className = "home-result-card";

    const summary = document.createElement("div");
    const addressBlock = document.createElement("div");
    addressBlock.className = "home-result-address";
    const addressLine = document.createElement("div");
    addressLine.className = "home-result-address-line";
    addressLine.textContent = address.line1;
    const addressMeta = document.createElement("div");
    addressMeta.className = "home-result-address-meta";
    addressMeta.textContent = address.line2;
    addressBlock.appendChild(addressLine);
    addressBlock.appendChild(addressMeta);

    const title = document.createElement("div");
    title.className = "home-result-title";
    title.textContent = portal.worldName;

    const description = document.createElement("div");
    description.className = "home-result-description";
    description.textContent = portal.worldDescription ?? "No description yet.";

    summary.appendChild(addressBlock);
    summary.appendChild(title);
    summary.appendChild(description);

    const meta = document.createElement("div");
    meta.className = "home-result-meta";
    const badgeRow = document.createElement("div");
    badgeRow.className = "home-result-badge-row";
    const portalBadge = document.createElement("span");
    portalBadge.className = "home-result-badge";
    portalBadge.textContent = portal.portalIsPublic ? "Public portal" : "Private portal";
    const onlineBadge = document.createElement("span");
    onlineBadge.className = "home-result-badge";
    onlineBadge.textContent = `${portal.onlineVisitorCount ?? 0} online`;
    badgeRow.appendChild(portalBadge);
    badgeRow.appendChild(onlineBadge);

    const ownerLine = document.createElement("div");
    ownerLine.className = "home-result-meta-line";
    ownerLine.textContent = `Owner: ${portal.owner.name}`;

    const updatedLine = document.createElement("div");
    updatedLine.className = "home-result-meta-line";
    updatedLine.textContent = `Updated: ${new Date(portal.updatedAt).toLocaleDateString()}`;

    meta.appendChild(badgeRow);
    meta.appendChild(ownerLine);
    meta.appendChild(updatedLine);

    const actions = document.createElement("div");
    actions.className = "home-result-actions";
    const viewOnMapButton = document.createElement("button");
    viewOnMapButton.className = "home-secondary-button";
    viewOnMapButton.type = "button";
    viewOnMapButton.textContent = "View on Map";
    viewOnMapButton.addEventListener("click", () => {
      setMapRoute();
      currentRouteMode = "map";
      setHomeViewMode(false);
      setWorldViewMode(false);
      worldMap.selectPortal(portal.worldId);
    });

    const enterWorldButton = document.createElement("button");
    enterWorldButton.className = "home-primary-button";
    enterWorldButton.type = "button";
    const canEnter = Boolean(auth.getCurrentUser()) && portal.canJoin;
    enterWorldButton.disabled = !canEnter;
    enterWorldButton.textContent = !auth.getCurrentUser()
      ? "Sign in to Enter"
      : portal.canJoin
        ? "Enter World"
        : "World Not Joinable";
    enterWorldButton.addEventListener("click", () => {
      if (!canEnter) return;
      activateWorldViewForWorld(portal.worldId);
    });

    actions.appendChild(viewOnMapButton);
    actions.appendChild(enterWorldButton);
    card.appendChild(summary);
    card.appendChild(meta);
    card.appendChild(actions);
    homeResultsList.appendChild(card);
  });
}

function buildShareWorldLink(worldId: string) {
  return buildWorldUrl(worldId);
}

function syncShareWorldLinkButton() {
  if (!shareWorldLinkButton) return;
  const canShare = Boolean(auth.getCurrentUser() && worldState?.worldId && currentRouteMode === "world");
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
  renderMapGlobalChat();
}

function syncMapGlobalChatState() {
  const user = auth.getCurrentUser();
  const visible = Boolean(user);
  if (mapGlobalChat) {
    mapGlobalChat.hidden = !visible;
  }
  if (!visible) return;
  if (mapGlobalChatInput) {
    mapGlobalChatInput.disabled = false;
    mapGlobalChatInput.placeholder = "Type a global message";
  }
  if (mapGlobalChatSend) {
    mapGlobalChatSend.disabled = false;
  }
}

function renderMapGlobalChat() {
  if (!mapGlobalChatLog) return;
  if (!auth.getCurrentUser()) {
    mapGlobalChatLog.innerHTML = "";
    return;
  }

  mapGlobalChatLog.innerHTML = "";
  const recent = [...globalChatMessages]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-100);
  for (const message of recent) {
    const row = document.createElement("div");
    row.className = "map-global-chat-row";
    const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    row.textContent = `[${timestamp}] ${message.user.name}: ${message.text}`;
    mapGlobalChatLog.appendChild(row);
  }
  mapGlobalChatLog.scrollTop = mapGlobalChatLog.scrollHeight;
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
    renderWorldGenerationStatus();
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
  renderWorldGenerationStatus();
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
  if (!worldSettingsSaveButton || !worldNameInput || !worldDescriptionInput) {
    return;
  }
  if (!worldState) {
    worldNameInput.value = "";
    worldDescriptionInput.value = "";
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
    if (worldCameraCreateCurrentButton) worldCameraCreateCurrentButton.disabled = true;
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

function getWorldCameraById(cameraId: string | null) {
  if (!cameraId || !worldState) return null;
  return worldState.cameras.find((camera) => camera.id === cameraId) ?? null;
}

function syncSceneTransformSelection() {
  game.setSelectedPlacementId(selectedWorldPlacementId);
  game.setSelectedPhotoWallId(selectedWorldPhotoWallId);
  game.setSelectedWorldCamera(selectedWorldCameraId, selectedWorldCameraHandle);
}

function getSelectedTransformTarget() {
  if (selectedWorldPlacementId) {
    const placement = getPlacementById(selectedWorldPlacementId);
    if (placement) {
      return {
        kind: "placement" as const,
        id: placement.id,
        position: placement.position,
        rotation: placement.rotation,
        scale: placement.scale
      };
    }
  }
  if (selectedWorldPhotoWallId) {
    const wall = getPhotoWallById(selectedWorldPhotoWallId);
    if (wall) {
      return {
        kind: "photoWall" as const,
        id: wall.id,
        position: wall.position,
        rotation: wall.rotation,
        scale: wall.scale
      };
    }
  }
  return null;
}

function commitSelectedTransform(
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  },
  options: { persistMode?: "immediate" | "debounced"; renderUi?: boolean } = {}
) {
  const target = getSelectedTransformTarget();
  if (!target) return null;
  if (target.kind === "placement") {
    return commitPlacementTransform(target.id, transform, options);
  }
  return commitPhotoWallTransform(target.id, transform, options);
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
  selectedPhotoWallLibraryImageUrl = null;
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
    selectedWorldCameraId = null;
  }
  syncSceneTransformSelection();
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
  renderWorldCameraEditor();
  renderWorldCameras();
  renderWorldPosts();
  syncWorldPostFormMode();
  syncTransformToolbar();
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
    selectedWorldCameraId = null;
    selectedTimelineTrackKey = getTimelineTrackKey("model", selectedWorldPlacementId);
  } else if (!selectedWorldCameraId) {
    selectedTimelineTrackKey = null;
  }
  syncSceneTransformSelection();
  syncTimelineInteractionMode();
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
  renderWorldCameraEditor();
  renderWorldCameras();
  renderWorldPosts();
  syncWorldPostFormMode();
  syncTransformToolbar();
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
    selectedWorldCameraId = null;
  }
  selectedTimelineTrackKey = null;
  syncSceneTransformSelection();
  syncTimelineInteractionMode();
  renderWorldPlacements();
  renderWorldPlacementEditor();
  renderWorldPosts();
  renderWorldPhotoWalls();
  renderWorldPhotoWallEditor();
  renderWorldCameraEditor();
  renderWorldCameras();
  renderWorldPostComments();
  syncTransformToolbar();
}

function setSelectedWorldCamera(
  cameraId: string | null,
  handle: "position" | "lookAt" = "position"
) {
  if (!worldState) {
    selectedWorldCameraId = null;
  } else {
    selectedWorldCameraId = worldState.cameras.some((camera) => camera.id === cameraId)
      ? cameraId
      : null;
  }
  selectedWorldCameraHandle = handle;
  if (selectedWorldCameraId) {
    cancelPlacementMode();
    cancelPostPlacementMode();
    cancelPhotoWallPlacementMode();
    selectedWorldPlacementId = null;
    selectedWorldPhotoWallId = null;
    selectedWorldPostId = null;
    selectedTimelineTrackKey = getTimelineTrackKey("camera", selectedWorldCameraId);
  } else if (!selectedWorldPlacementId) {
    selectedTimelineTrackKey = null;
  }
  syncSceneTransformSelection();
  syncTimelineInteractionMode();
  renderWorldPlacements();
  renderWorldPhotoWalls();
  renderWorldPosts();
  renderWorldPhotoWallEditor();
  renderWorldCameraEditor();
  renderWorldCameras();
  syncTransformToolbar();
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
  const applied = game.applyPlacementTransform(placementId, {
    position: nextPlacement.position,
    rotation: nextPlacement.rotation,
    scale: nextPlacement.scale
  });
  if (!applied) {
    game.setWorldData(worldState);
  }
  if (renderUi) {
    renderWorldPlacements();
    renderWorldPlacementEditor();
    syncTransformToolbar();
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

function schedulePlacementTransformPersist(
  placement: WorldPlacement,
  delayMs = TRANSFORM_PERSIST_IDLE_MS
) {
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
  syncSceneTransformSelection();
  await loadWorldState();
  setWorldNotice("Instance deleted");
}

function applyPhotoWallLocally(photoWallId: string, nextWall: WorldPhotoWall, renderUi = true) {
  if (!worldState) return;
  worldState = {
    ...worldState,
    photoWalls: worldState.photoWalls.map((wall) => (wall.id === photoWallId ? nextWall : wall))
  };
  const applied = game.applyPhotoWallTransform(photoWallId, {
    position: nextWall.position,
    rotation: nextWall.rotation,
    scale: nextWall.scale
  });
  if (!applied) {
    game.setWorldData(worldState);
  }
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
    setWorldNotice("Photo cube transform update failed");
    await loadWorldState();
  }
}

function schedulePhotoWallTransformPersist(
  photoWall: WorldPhotoWall,
  delayMs = TRANSFORM_PERSIST_IDLE_MS
) {
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
    setWorldNotice("Photo cube delete failed");
    return;
  }
  selectedWorldPhotoWallId = null;
  await loadWorldState();
  setWorldNotice("Photo cube deleted");
}

function applyWorldCameraLocally(cameraId: string, nextCamera: WorldCamera, renderUi = true) {
  if (!worldState) return;
  worldState = {
    ...worldState,
    cameras: worldState.cameras.map((camera) => (camera.id === cameraId ? nextCamera : camera))
  };
  const applied = game.applyWorldCameraTransform(cameraId, {
    position: nextCamera.position,
    lookAt: nextCamera.lookAt
  });
  if (!applied) {
    game.setWorldData(worldState);
  }
  if (renderUi) {
    renderWorldCameras();
    renderWorldCameraEditor();
  }
}

async function persistWorldCamera(camera: WorldCamera) {
  const response = await fetch(apiUrl(`/api/v1/world/cameras/${encodeURIComponent(camera.id)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: camera.name,
      position: camera.position,
      lookAt: camera.lookAt
    })
  });
  if (!response.ok) {
    setWorldNotice("Camera update failed");
    await loadWorldState();
  }
}

function scheduleWorldCameraPersist(camera: WorldCamera, delayMs = TRANSFORM_PERSIST_IDLE_MS) {
  const existing = worldCameraPersistTimers.get(camera.id);
  if (existing !== undefined) window.clearTimeout(existing);
  const timeoutId = window.setTimeout(() => {
    worldCameraPersistTimers.delete(camera.id);
    void persistWorldCamera(camera);
  }, delayMs);
  worldCameraPersistTimers.set(camera.id, timeoutId);
}

function commitWorldCameraTransform(
  cameraId: string,
  transform: {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number };
  },
  options: { persistMode?: "immediate" | "debounced"; renderUi?: boolean } = {}
) {
  const current = getWorldCameraById(cameraId);
  if (!current) return null;
  const nextCamera: WorldCamera = {
    ...current,
    position: transform.position,
    lookAt: transform.lookAt
  };
  applyWorldCameraLocally(cameraId, nextCamera, options.renderUi ?? true);
  if (options.persistMode === "debounced") {
    scheduleWorldCameraPersist(nextCamera);
  } else {
    const existing = worldCameraPersistTimers.get(nextCamera.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      worldCameraPersistTimers.delete(nextCamera.id);
    }
    void persistWorldCamera(nextCamera);
  }
  return nextCamera;
}

async function deleteSelectedWorldCamera() {
  const worldCamera = getWorldCameraById(selectedWorldCameraId);
  if (!worldCamera || !worldState?.canManage) return;
  const response = await fetch(apiUrl(`/api/v1/world/cameras/${encodeURIComponent(worldCamera.id)}`), {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    setWorldNotice("Camera delete failed");
    return;
  }
  selectedWorldCameraId = null;
  await loadWorldState();
  setWorldNotice("Camera deleted");
}

function renderWorldPhotoWalls() {
  if (!worldPhotoWallsContainer) return;
  worldPhotoWallsContainer.innerHTML = "";
  const walls = worldState?.photoWalls ?? [];
  if (walls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No photo cubes placed";
    worldPhotoWallsContainer.appendChild(empty);
    renderWorldPhotoWallLibrary();
    return;
  }
  for (const wall of walls) {
    const row = document.createElement("div");
    row.className = "world-placement-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-placement-select";
    if (wall.id === selectedWorldPhotoWallId) button.classList.add("active");
    button.textContent = `Photo Cube • ${wall.id.slice(0, 8)}`;
    button.title = `Position: ${wall.position.x.toFixed(2)}, ${wall.position.y.toFixed(2)}, ${wall.position.z.toFixed(2)}`;
    button.addEventListener("click", () => setSelectedWorldPhotoWall(wall.id));
    row.appendChild(button);
    worldPhotoWallsContainer.appendChild(row);
  }
  renderWorldPhotoWallLibrary();
}

function renderWorldPhotoWallLibrary() {
  if (!worldPhotoWallLibraryContainer) return;
  worldPhotoWallLibraryContainer.innerHTML = "";
  if (!worldState) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Sign in to place cubes";
    worldPhotoWallLibraryContainer.appendChild(empty);
    return;
  }

  const urls = Array.from(
    new Set(
      (worldState.photoWalls ?? [])
        .map((wall) => wall.imageUrl.trim())
        .filter((url) => url.length > 0)
    )
  );
  if (urls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No saved cube images yet";
    worldPhotoWallLibraryContainer.appendChild(empty);
    return;
  }

  for (const [index, imageUrl] of urls.entries()) {
    const row = document.createElement("div");
    row.className = "photo-library-row";

    const preview = document.createElement("img");
    preview.className = "photo-library-thumb";
    preview.src = imageUrl;
    preview.alt = `Cube image ${index + 1}`;
    preview.loading = "lazy";

    const label = document.createElement("div");
    label.className = "photo-library-label";
    label.textContent = `Cube Image ${index + 1}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "party-secondary-button";
    button.textContent =
      isPlacingPhotoWall && selectedPhotoWallLibraryImageUrl === imageUrl ? "Placing..." : "Place";
    button.disabled = !worldState.canManage;
    button.addEventListener("click", () => {
      if (!worldState?.canManage || isSubmittingPhotoWallPlacement) return;
      cancelPlacementMode();
      cancelPostPlacementMode();
      selectedWorldPlacementId = null;
      selectedWorldPostId = null;
      selectedWorldPhotoWallId = null;
      selectedWorldCameraId = null;
      syncSceneTransformSelection();
      pendingPhotoWallDraft = { imageUrl, imageFile: null };
      selectedPhotoWallLibraryImageUrl = imageUrl;
      isPlacingPhotoWall = true;
      setWorldNotice("Photo cube placement mode: click the floor to place.");
      renderWorldPlacements();
      renderWorldPosts();
      renderWorldPhotoWalls();
    });

    row.appendChild(preview);
    row.appendChild(label);
    row.appendChild(button);
    worldPhotoWallLibraryContainer.appendChild(row);
  }
}

function renderWorldPhotoWallEditor() {
  if (!worldPhotoWallEditor) return;
  worldPhotoWallEditor.innerHTML = "";
  if (!worldState) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Sign in to edit photo cubes";
    worldPhotoWallEditor.appendChild(empty);
    return;
  }
  const selectedWall = getPhotoWallById(selectedWorldPhotoWallId);
  if (!selectedWall) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Select a photo cube from the list or world";
    worldPhotoWallEditor.appendChild(empty);
    return;
  }

  const canEdit = worldState.canManage;
  const radToDeg = (value: number) => (value * 180) / Math.PI;
  const degToRad = (value: number) => (value * Math.PI) / 180;

  const heading = document.createElement("div");
  heading.className = "party-result-label";
  heading.textContent = `Photo Cube • ${selectedWall.id.slice(0, 8)}`;
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

function renderWorldCameras() {
  if (!worldCamerasContainer) return;
  worldCamerasContainer.innerHTML = "";
  const cameras = worldState?.cameras ?? [];
  if (cameras.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No cameras placed";
    worldCamerasContainer.appendChild(empty);
    return;
  }
  for (const worldCamera of cameras) {
    const row = document.createElement("div");
    row.className = "world-placement-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-placement-select";
    if (worldCamera.id === selectedWorldCameraId) button.classList.add("active");
    const labelName = worldCamera.name?.trim() || "Camera";
    button.textContent = `${labelName} • ${worldCamera.id.slice(0, 8)}`;
    button.title = `Pos: ${worldCamera.position.x.toFixed(2)}, ${worldCamera.position.y.toFixed(
      2
    )}, ${worldCamera.position.z.toFixed(2)}`;
    button.addEventListener("click", () => setSelectedWorldCamera(worldCamera.id, "position"));
    row.appendChild(button);
    worldCamerasContainer.appendChild(row);
  }
}

function renderWorldCameraEditor() {
  if (!worldCameraEditor) return;
  worldCameraEditor.innerHTML = "";
  if (!worldState) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Sign in to edit cameras";
    worldCameraEditor.appendChild(empty);
    return;
  }
  const worldCamera = getWorldCameraById(selectedWorldCameraId);
  if (!worldCamera) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Select a camera from the list or world";
    worldCameraEditor.appendChild(empty);
    return;
  }
  const canEdit = worldState.canManage;
  const heading = document.createElement("div");
  heading.className = "party-result-label";
  heading.textContent = `${worldCamera.name?.trim() || "Camera"} • ${worldCamera.id.slice(0, 8)}`;
  worldCameraEditor.appendChild(heading);

  const nameRow = document.createElement("div");
  nameRow.className = "world-placement-axis-row";
  const nameLabel = document.createElement("span");
  nameLabel.className = "world-placement-axis-label";
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "world-placement-axis-input";
  nameInput.value = worldCamera.name ?? "";
  nameInput.maxLength = 80;
  nameInput.disabled = !canEdit;
  nameInput.addEventListener("change", () => {
    const latest = getWorldCameraById(worldCamera.id);
    if (!latest) return;
    const nextCamera: WorldCamera = { ...latest, name: nameInput.value.trim() || null };
    applyWorldCameraLocally(latest.id, nextCamera, true);
    void persistWorldCamera(nextCamera);
  });
  nameRow.appendChild(nameLabel);
  nameRow.appendChild(nameInput);
  worldCameraEditor.appendChild(nameRow);

  const handleRow = document.createElement("div");
  handleRow.className = "world-asset-options-actions";
  const movePos = document.createElement("button");
  movePos.type = "button";
  movePos.className = "party-secondary-button";
  movePos.textContent = selectedWorldCameraHandle === "position" ? "Editing Position" : "Edit Position";
  movePos.disabled = !canEdit;
  movePos.addEventListener("click", () => setSelectedWorldCamera(worldCamera.id, "position"));
  const moveLookAt = document.createElement("button");
  moveLookAt.type = "button";
  moveLookAt.className = "party-secondary-button";
  moveLookAt.textContent = selectedWorldCameraHandle === "lookAt" ? "Editing LookAt" : "Edit LookAt";
  moveLookAt.disabled = !canEdit;
  moveLookAt.addEventListener("click", () => setSelectedWorldCamera(worldCamera.id, "lookAt"));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "party-secondary-button";
  deleteButton.textContent = "Delete";
  deleteButton.disabled = !canEdit;
  deleteButton.addEventListener("click", () => void deleteSelectedWorldCamera());
  handleRow.appendChild(movePos);
  handleRow.appendChild(moveLookAt);
  handleRow.appendChild(deleteButton);
  worldCameraEditor.appendChild(handleRow);

  const buildAxisRow = (
    labelText: string,
    axis: "x" | "y" | "z",
    value: number,
    onCommit: (next: number) => void
  ) => {
    const row = document.createElement("div");
    row.className = "world-placement-axis-row";
    const label = document.createElement("span");
    label.className = "world-placement-axis-label";
    label.textContent = `${labelText}.${axis.toUpperCase()}`;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "world-placement-axis-input";
    input.step = "0.01";
    input.value = value.toFixed(2);
    input.disabled = !canEdit;
    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) return;
      onCommit(parsed);
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
  };

  const positionGroup = document.createElement("div");
  positionGroup.className = "world-placement-group";
  const positionTitle = document.createElement("div");
  positionTitle.className = "world-placement-group-title";
  positionTitle.textContent = "Position";
  positionGroup.appendChild(positionTitle);

  const lookAtGroup = document.createElement("div");
  lookAtGroup.className = "world-placement-group";
  const lookAtTitle = document.createElement("div");
  lookAtTitle.className = "world-placement-group-title";
  lookAtTitle.textContent = "Look At";
  lookAtGroup.appendChild(lookAtTitle);

  (["x", "y", "z"] as const).forEach((axis) => {
    positionGroup.appendChild(
      buildAxisRow("Pos", axis, worldCamera.position[axis], (next) => {
        const latest = getWorldCameraById(worldCamera.id);
        if (!latest) return;
        commitWorldCameraTransform(
          latest.id,
          { position: { ...latest.position, [axis]: next }, lookAt: { ...latest.lookAt } },
          { persistMode: "immediate", renderUi: true }
        );
      })
    );
    lookAtGroup.appendChild(
      buildAxisRow("Look", axis, worldCamera.lookAt[axis], (next) => {
        const latest = getWorldCameraById(worldCamera.id);
        if (!latest) return;
        commitWorldCameraTransform(
          latest.id,
          { position: { ...latest.position }, lookAt: { ...latest.lookAt, [axis]: next } },
          { persistMode: "immediate", renderUi: true }
        );
      })
    );
  });
  worldCameraEditor.appendChild(positionGroup);
  worldCameraEditor.appendChild(lookAtGroup);
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

type TimelineCameraState = {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  active: boolean;
};

type TimelineTrack = {
  key: string;
  objectId: string;
  kind: "model" | "camera";
  label: string;
  frameIndexes: number[];
};

type TimelineJsonScope = "frame" | "track";

function formatTimelineTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0.0s";
  return `${seconds.toFixed(1)}s`;
}

function nearlyEqual(a: number, b: number, epsilon = 0.0001) {
  return Math.abs(a - b) <= epsilon;
}

function vec3Equal(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number }
) {
  return (
    nearlyEqual(left.x, right.x) &&
    nearlyEqual(left.y, right.y) &&
    nearlyEqual(left.z, right.z)
  );
}

function getTimelineTrackKey(kind: TimelineTrack["kind"], objectId: string) {
  return `${kind}:${objectId}`;
}

function getTimelinePlacementLabel(placementId: string) {
  const placement = worldState?.placements.find((item) => item.id === placementId) ?? null;
  return placement?.assetName?.trim() || `Model ${placementId.slice(0, 8)}`;
}

function getTimelineCameraLabel(cameraId: string) {
  const camera = worldState?.cameras.find((item) => item.id === cameraId) ?? null;
  return camera?.name?.trim() || `Camera ${cameraId.slice(0, 8)}`;
}

function getTimelineTrackDiffSummary(track: TimelineTrack, frame: TimelineFrame) {
  if (track.kind === "model") {
    const diff = frame.models?.[track.objectId];
    if (!diff) return "";
    const parts: string[] = [];
    if (typeof diff.visible === "boolean") parts.push(diff.visible ? "show" : "hide");
    if (diff.position) parts.push("position");
    if (diff.rotation) parts.push("rotation");
    if (diff.scale) parts.push("scale");
    return parts.join(" • ");
  }

  const diff = frame.cameras?.[track.objectId];
  if (!diff) return "";
  const parts: string[] = [];
  if (typeof diff.active === "boolean") parts.push(diff.active ? "active" : "inactive");
  if (diff.position) parts.push("position");
  if (diff.lookAt) parts.push("look at");
  return parts.join(" • ");
}

function getTimelineTracks() {
  const tracks = new Map<string, TimelineTrack>();
  const upsertTrack = (kind: TimelineTrack["kind"], objectId: string, frameIndex: number | null) => {
    const key = getTimelineTrackKey(kind, objectId);
    const existing = tracks.get(key);
    if (existing) {
      if (frameIndex !== null) existing.frameIndexes.push(frameIndex);
      return;
    }
    tracks.set(key, {
      key,
      objectId,
      kind,
      label: kind === "model" ? getTimelinePlacementLabel(objectId) : getTimelineCameraLabel(objectId),
      frameIndexes: frameIndex === null ? [] : [frameIndex]
    });
  };

  for (const placement of worldState?.placements ?? []) {
    upsertTrack("model", placement.id, null);
  }
  for (const worldCamera of worldState?.cameras ?? []) {
    upsertTrack("camera", worldCamera.id, null);
  }

  timelineFrames.forEach((frame, frameIndex) => {
    for (const placementId of Object.keys(frame.models ?? {})) {
      upsertTrack("model", placementId, frameIndex);
    }
    for (const cameraId of Object.keys(frame.cameras ?? {})) {
      upsertTrack("camera", cameraId, frameIndex);
    }
  });

  return [...tracks.values()]
    .filter((track) => track.frameIndexes.length > 0)
    .sort((left, right) => {
      if (right.frameIndexes.length !== left.frameIndexes.length) {
        return right.frameIndexes.length - left.frameIndexes.length;
      }
      if (left.kind !== right.kind) {
        return left.kind === "model" ? -1 : 1;
      }
      return left.label.localeCompare(right.label) || left.objectId.localeCompare(right.objectId);
    });
}

function getSelectedTimelineTrack() {
  if (!selectedTimelineTrackKey) return null;
  const [kind, objectId] = selectedTimelineTrackKey.split(":");
  if (!objectId || (kind !== "model" && kind !== "camera")) return null;
  return {
    key: selectedTimelineTrackKey,
    kind,
    objectId,
    label:
      kind === "model" ? getTimelinePlacementLabel(objectId) : getTimelineCameraLabel(objectId)
  } as const;
}

function getTimelineJsonScopeValue() {
  const selectedTrack = getSelectedTimelineTrack();
  if (timelineJsonScope === "track" && selectedTrack) return "track";
  return "frame";
}

function getTimelineScrubTimeFromClientX(element: HTMLElement, clientX: number) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) return timelineScrubSeconds;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const duration = Math.max(getTimelineDuration(), timelineScrubSeconds, 1);
  return Number((duration * ratio).toFixed(3));
}

function scrubTimelineTo(seconds: number) {
  if (timelinePlaying) {
    stopTimelinePlayback();
  }
  timelineScrubSeconds = Math.max(0, seconds);
  if (timelineScrubInput) {
    timelineScrubInput.value = String(timelineScrubSeconds);
  }
  if (timelineTimeInput) {
    timelineTimeInput.value = timelineScrubSeconds.toFixed(1);
  }
  applyTimelineAtTime(timelineScrubSeconds);
  renderTimelineEditor();
  syncTimelinePreviewWindow();
}

function getSelectedSceneFocusTarget() {
  const placement = getPlacementById(selectedWorldPlacementId);
  if (placement) {
    return { position: { ...placement.position } };
  }
  const camera = getWorldCameraById(selectedWorldCameraId);
  if (camera) {
    return {
      position:
        selectedWorldCameraHandle === "lookAt" ? { ...camera.lookAt } : { ...camera.position }
    };
  }
  return null;
}

function syncTimelineInteractionMode() {
  const timelineActive =
    timelinePane?.classList.contains("active") === true && worldViewActive && Boolean(worldState);
  game.setLocalPlayerMovementEnabled(!timelineActive);
  game.setEditorFocusTarget(timelineActive ? getSelectedSceneFocusTarget() : null);
}

function revealTimelineSelection(track: { kind: "model" | "camera"; objectId: string; key: string }) {
  selectedTimelineTrackKey = track.key;
  timelineJsonScope = "track";
  setActiveMainTab?.("objects");
  setActivePartySubtab?.("objects");
  if (track.kind === "model") {
    setSelectedWorldPlacement(track.objectId);
    if (worldPlacementEditor && !dockPanel?.classList.contains("minimized")) {
      worldPlacementEditor.scrollIntoView({ block: "nearest" });
    }
  } else {
    setSelectedWorldCamera(track.objectId, "position");
    if (worldCameraEditor && !dockPanel?.classList.contains("minimized")) {
      worldCameraEditor.scrollIntoView({ block: "nearest" });
    }
  }
}

function getTrackDiffFromFrame(
  frame: TimelineFrame | null | undefined,
  track: { kind: "model" | "camera"; objectId: string } | null
) {
  if (!frame || !track) return null;
  return track.kind === "model"
    ? frame.models?.[track.objectId] ?? null
    : frame.cameras?.[track.objectId] ?? null;
}

function findTimelineFrameIndexByTime(time: number) {
  return timelineFrames.findIndex((frame) => nearlyEqual(frame.time, time));
}

function hasPriorTrackFrame(
  track: { kind: "model" | "camera"; objectId: string },
  beforeIndex: number,
  frames = timelineFrames
) {
  for (let i = 0; i < beforeIndex; i += 1) {
    const frame = frames[i];
    if (!frame) continue;
    if (track.kind === "model" && frame.models?.[track.objectId]) return true;
    if (track.kind === "camera" && frame.cameras?.[track.objectId]) return true;
  }
  return false;
}

function findTrackKeyframeIndexAtTime(
  track: { kind: "model" | "camera"; objectId: string } | null,
  time: number
) {
  if (!track) return -1;
  const frameIndex = findTimelineFrameIndexByTime(time);
  if (frameIndex < 0) return -1;
  return getTrackDiffFromFrame(timelineFrames[frameIndex], track) ? frameIndex : -1;
}

function normalizeTimelineFramesLocal(frames: unknown): TimelineFrame[] {
  if (!Array.isArray(frames)) return [];
  const normalized: TimelineFrame[] = [];
  for (const item of frames) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const time = Number(source.time);
    if (!Number.isFinite(time) || time < 0) continue;
    const frame: TimelineFrame = { time };
    if (source.models && typeof source.models === "object" && !Array.isArray(source.models)) {
      frame.models = source.models as TimelineFrame["models"];
    }
    if (source.cameras && typeof source.cameras === "object" && !Array.isArray(source.cameras)) {
      frame.cameras = source.cameras as TimelineFrame["cameras"];
    }
    normalized.push(frame);
  }
  normalized.sort((a, b) => a.time - b.time);
  return normalized;
}

function getTimelineDuration() {
  const last = timelineFrames[timelineFrames.length - 1];
  return Math.max(last?.time ?? 0, 10);
}

function getTimelineStartTime() {
  return timelineFrames[0]?.time ?? 0;
}

function getTimelineEndTime() {
  return timelineFrames[timelineFrames.length - 1]?.time ?? 0;
}

function stopTimelinePlayback() {
  timelinePlaying = false;
  timelinePlaybackLastTimeMs = 0;
  if (timelinePlaybackRafId !== null) {
    window.cancelAnimationFrame(timelinePlaybackRafId);
    timelinePlaybackRafId = null;
  }
  if (timelinePlayToggleButton) {
    timelinePlayToggleButton.textContent = "Play";
  }
}

function stepTimelinePlayback(nowMs: number) {
  if (!timelinePlaying) return;
  if (!worldState || timelineFrames.length === 0) {
    stopTimelinePlayback();
    return;
  }

  const startTime = getTimelineStartTime();
  const endTime = getTimelineEndTime();
  if (endTime <= startTime) {
    timelineScrubSeconds = startTime;
    applyTimelineAtTime(timelineScrubSeconds);
    stopTimelinePlayback();
    renderTimelineEditor();
    return;
  }

  if (!timelinePlaybackLastTimeMs) {
    timelinePlaybackLastTimeMs = nowMs;
  }
  const deltaSeconds = Math.max(0, (nowMs - timelinePlaybackLastTimeMs) / 1000);
  timelinePlaybackLastTimeMs = nowMs;
  timelineScrubSeconds += deltaSeconds;

  const span = endTime - startTime;
  if (timelineScrubSeconds > endTime) {
    timelineScrubSeconds = startTime + ((timelineScrubSeconds - startTime) % span);
  }

  applyTimelineAtTime(timelineScrubSeconds);
  renderTimelineEditor();
  timelinePlaybackRafId = window.requestAnimationFrame(stepTimelinePlayback);
}

function startTimelinePlayback() {
  if (!worldState || timelineFrames.length === 0) return;
  if (timelinePlaying) return;

  const startTime = getTimelineStartTime();
  const endTime = getTimelineEndTime();
  if (timelineScrubSeconds < startTime || timelineScrubSeconds > endTime) {
    timelineScrubSeconds = startTime;
  }

  timelinePlaying = true;
  timelinePlaybackLastTimeMs = 0;
  if (timelinePlayToggleButton) {
    timelinePlayToggleButton.textContent = "Pause";
  }
  timelinePlaybackRafId = window.requestAnimationFrame(stepTimelinePlayback);
}

function getLastFrameIndexBefore(time: number, frames = timelineFrames) {
  let index = -1;
  for (let i = 0; i < frames.length; i += 1) {
    if ((frames[i]?.time ?? Infinity) < time) index = i;
  }
  return index;
}

function cloneTimelineCameraState(state: TimelineCameraState): TimelineCameraState {
  return {
    position: { ...state.position },
    lookAt: { ...state.lookAt },
    active: state.active
  };
}

function getCameraStateFromWorld(cameraId: string): TimelineCameraState | null {
  const worldCamera = getWorldCameraById(cameraId);
  if (!worldCamera) return null;
  return {
    position: { ...worldCamera.position },
    lookAt: { ...worldCamera.lookAt },
    active: false
  };
}

function setTimelineStatus(text: string) {
  if (timelineStatus) timelineStatus.textContent = text;
}

async function persistTimelineFrames(successMessage = "Timeline saved") {
  const response = await fetch(apiUrl("/api/v1/world/timeline"), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ frames: compactTimelineFrames(timelineFrames) })
  });
  if (!response.ok) {
    setTimelineStatus("Timeline save failed");
    return false;
  }
  setTimelineStatus(successMessage);
  await loadWorldState();
  return true;
}

function buildSelectedTrackFrameDiff(
  time: number,
  track: { kind: "model" | "camera"; objectId: string }
): TimelineFrame | null {
  const frameIndexAtTime = findTimelineFrameIndexByTime(time);
  const prevIndex = getLastFrameIndexBefore(time);
  const baseline = buildFrameState(prevIndex);
  const isFirstTrackFrame =
    frameIndexAtTime >= 0
      ? !hasPriorTrackFrame(track, frameIndexAtTime)
      : !timelineFrames.some(
          (frame) =>
            frame.time < time &&
            ((track.kind === "model" && Boolean(frame.models?.[track.objectId])) ||
              (track.kind === "camera" && Boolean(frame.cameras?.[track.objectId])))
        );

  if (track.kind === "model") {
    const placement = worldState?.placements.find((item) => item.id === track.objectId);
    if (!placement) return null;
    const applied = timelineAppliedPlacementState.get(placement.id);
    const prior = baseline.models.get(placement.id) ?? {
      visible: true,
      position: placement.position,
      rotation: placement.rotation,
      scale: placement.scale
    };
    const diff: NonNullable<TimelineFrame["models"]>[string] = {};
    const visible = applied?.visible ?? true;
    if (isFirstTrackFrame || visible !== prior.visible) {
      diff.visible = visible;
    }
    if (isFirstTrackFrame || !vec3Equal(placement.position, prior.position)) {
      diff.position = [placement.position.x, placement.position.y, placement.position.z];
    }
    if (isFirstTrackFrame || !vec3Equal(placement.rotation, prior.rotation)) {
      diff.rotation = [placement.rotation.x, placement.rotation.y, placement.rotation.z];
    }
    if (isFirstTrackFrame || !vec3Equal(placement.scale, prior.scale)) {
      diff.scale = [placement.scale.x, placement.scale.y, placement.scale.z];
    }
    return Object.keys(diff).length > 0
      ? {
          time: Math.max(0, Number(time.toFixed(3))),
          models: { [placement.id]: diff }
        }
      : {
          time: Math.max(0, Number(time.toFixed(3))),
          models: {}
        };
  }

  const sourceCamera = getWorldCameraById(track.objectId);
  if (!sourceCamera) return null;
  const priorCamera =
    baseline.cameras.get(track.objectId) ?? {
      position: sourceCamera.position,
      lookAt: sourceCamera.lookAt,
      active: false
    };
  const activeCameraId =
    selectedWorldCameraId ??
    baseline.activeCameraId ??
    worldState?.cameras[0]?.id ??
    null;
  const cameraDiff: NonNullable<TimelineFrame["cameras"]>[string] = {};
  if (isFirstTrackFrame || !vec3Equal(sourceCamera.position, priorCamera.position)) {
    cameraDiff.position = [
      sourceCamera.position.x,
      sourceCamera.position.y,
      sourceCamera.position.z
    ];
  }
  if (isFirstTrackFrame || !vec3Equal(sourceCamera.lookAt, priorCamera.lookAt)) {
    cameraDiff.lookAt = [sourceCamera.lookAt.x, sourceCamera.lookAt.y, sourceCamera.lookAt.z];
  }
  const priorIsActive = baseline.activeCameraId === track.objectId;
  const nextIsActive = activeCameraId === track.objectId;
  if (isFirstTrackFrame || priorIsActive !== nextIsActive) {
    cameraDiff.active = nextIsActive;
  }
  return Object.keys(cameraDiff).length > 0
    ? {
        time: Math.max(0, Number(time.toFixed(3))),
        cameras: { [track.objectId]: cameraDiff }
      }
    : {
        time: Math.max(0, Number(time.toFixed(3))),
        cameras: {}
      };
}

function upsertSelectedTrackKeyframe() {
  const track = getSelectedTimelineTrack();
  if (!track) {
    setTimelineStatus("Select a model or camera track first");
    return false;
  }
  const captured = buildSelectedTrackFrameDiff(timelineScrubSeconds, track);
  if (!captured) {
    setTimelineStatus("Unable to capture selected track");
    return false;
  }
  const frameTime = captured.time;
  const existingIndex = findTimelineFrameIndexByTime(frameTime);
  if (existingIndex >= 0) {
    const next = { ...timelineFrames[existingIndex]! };
    if (track.kind === "model") {
      const models = { ...(next.models ?? {}) };
      const capturedDiff = captured.models?.[track.objectId];
      if (capturedDiff && Object.keys(capturedDiff).length > 0) {
        models[track.objectId] = capturedDiff;
      } else {
        delete models[track.objectId];
      }
      next.models = Object.keys(models).length > 0 ? models : undefined;
    } else {
      const cameras = { ...(next.cameras ?? {}) };
      const capturedDiff = captured.cameras?.[track.objectId];
      if (capturedDiff && Object.keys(capturedDiff).length > 0) {
        cameras[track.objectId] = capturedDiff;
      } else {
        delete cameras[track.objectId];
      }
      next.cameras = Object.keys(cameras).length > 0 ? cameras : undefined;
    }
    timelineFrames[existingIndex] = next;
    selectedTimelineFrameIndex = existingIndex;
  } else {
    timelineFrames.push(captured);
    timelineFrames.sort((a, b) => a.time - b.time);
    selectedTimelineFrameIndex = findTimelineFrameIndexByTime(frameTime);
  }
  selectedTimelineTrackKey = track.key;
  timelineJsonScope = "track";
  timelineFrames = compactTimelineFrames(timelineFrames);
  selectedTimelineFrameIndex = findTimelineFrameIndexByTime(frameTime);
  return true;
}

function deleteSelectedTrackKeyframe() {
  const track = getSelectedTimelineTrack();
  const frameIndex = findTrackKeyframeIndexAtTime(track, timelineScrubSeconds);
  if (!track || frameIndex < 0 || frameIndex >= timelineFrames.length) {
    return false;
  }
  const frame = { ...timelineFrames[frameIndex]! };
  if (track.kind === "model") {
    const models = { ...(frame.models ?? {}) };
    delete models[track.objectId];
    frame.models = Object.keys(models).length > 0 ? models : undefined;
  } else {
    const cameras = { ...(frame.cameras ?? {}) };
    delete cameras[track.objectId];
    frame.cameras = Object.keys(cameras).length > 0 ? cameras : undefined;
  }
  if (!frame.models && !frame.cameras) {
    timelineFrames.splice(frameIndex, 1);
    selectedTimelineFrameIndex = Math.min(frameIndex, timelineFrames.length - 1);
  } else {
    timelineFrames[frameIndex] = frame;
    selectedTimelineFrameIndex = frameIndex;
  }
  if (timelineFrames.length === 0) {
    stopTimelinePlayback();
    timelineScrubSeconds = 0;
  }
  return true;
}

function captureTimelineFrameAtTime(time: number): TimelineFrame {
  const prevIndex = getLastFrameIndexBefore(time);
  const isFirstFrame = prevIndex < 0;
  const baseline = buildFrameState(prevIndex);
  const frame: TimelineFrame = {
    time: Math.max(0, Number(time.toFixed(3))),
    models: {},
    cameras: {}
  };
  const placements = worldState?.placements ?? [];
  for (const placement of placements) {
    const applied = timelineAppliedPlacementState.get(placement.id);
    // Use the live world placement transform as source-of-truth for capture.
    // Timeline-applied cache can be stale after gizmo edits.
    const position = placement.position;
    const rotation = placement.rotation;
    const scale = placement.scale;
    const visible = applied?.visible ?? true;
    const prior = baseline.models.get(placement.id) ?? {
      visible: true,
      position: placement.position,
      rotation: placement.rotation,
      scale: placement.scale
    };
    const modelDiff: NonNullable<TimelineFrame["models"]>[string] = {};
    if (isFirstFrame || visible !== prior.visible) {
      modelDiff.visible = visible;
    }
    if (isFirstFrame || !vec3Equal(position, prior.position)) {
      modelDiff.position = [position.x, position.y, position.z];
    }
    if (isFirstFrame || !vec3Equal(rotation, prior.rotation)) {
      modelDiff.rotation = [rotation.x, rotation.y, rotation.z];
    }
    if (isFirstFrame || !vec3Equal(scale, prior.scale)) {
      modelDiff.scale = [scale.x, scale.y, scale.z];
    }
    if (Object.keys(modelDiff).length > 0) {
      frame.models![placement.id] = modelDiff;
    }
  }

  const activeCameraId =
    selectedWorldCameraId ??
    baseline.activeCameraId ??
    worldState?.cameras[0]?.id ??
    null;
  const cameraIds = new Set<string>([
    ...(worldState?.cameras.map((camera) => camera.id) ?? []),
    ...(Array.from(baseline.cameras.keys()) ?? []),
    ...(activeCameraId ? [activeCameraId] : [])
  ]);
  for (const cameraId of cameraIds) {
    const sourceCamera = getWorldCameraById(cameraId);
    if (!sourceCamera) continue;
    const priorCamera =
      baseline.cameras.get(cameraId) ?? {
        position: sourceCamera.position,
        lookAt: sourceCamera.lookAt,
        active: false
      };
    const cameraDiff: NonNullable<TimelineFrame["cameras"]>[string] = {};
    if (isFirstFrame || !vec3Equal(sourceCamera.position, priorCamera.position)) {
      cameraDiff.position = [
        sourceCamera.position.x,
        sourceCamera.position.y,
        sourceCamera.position.z
      ];
    }
    if (isFirstFrame || !vec3Equal(sourceCamera.lookAt, priorCamera.lookAt)) {
      cameraDiff.lookAt = [sourceCamera.lookAt.x, sourceCamera.lookAt.y, sourceCamera.lookAt.z];
    }
    const priorIsActive = baseline.activeCameraId === cameraId;
    const nextIsActive = activeCameraId === cameraId;
    if (isFirstFrame || priorIsActive !== nextIsActive) {
      cameraDiff.active = nextIsActive;
    }
    if (Object.keys(cameraDiff).length > 0) {
      frame.cameras![cameraId] = cameraDiff;
    }
  }

  if (Object.keys(frame.models!).length === 0) {
    delete frame.models;
  }
  if (Object.keys(frame.cameras!).length === 0) {
    delete frame.cameras;
  }
  return frame;
}

function parseSelectedFrameJson() {
  if (selectedTimelineFrameIndex < 0 || !timelineFrameJsonInput) return false;
  const raw = timelineFrameJsonInput.value.trim();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid JSON shape");
    }
    const next = { ...timelineFrames[selectedTimelineFrameIndex]! };
    const scope = getTimelineJsonScopeValue();
    if (scope === "track") {
      const selectedTrack = getSelectedTimelineTrack();
      if (!selectedTrack) {
        setTimelineStatus("Select a track to edit track JSON");
        return false;
      }
      if (selectedTrack.kind === "model") {
        const models = { ...(next.models ?? {}) };
        if (Object.keys(parsed).length > 0) {
          models[selectedTrack.objectId] = parsed as NonNullable<TimelineFrame["models"]>[string];
        } else {
          delete models[selectedTrack.objectId];
        }
        next.models = Object.keys(models).length > 0 ? models : undefined;
      } else {
        const cameras = { ...(next.cameras ?? {}) };
        if (Object.keys(parsed).length > 0) {
          cameras[selectedTrack.objectId] = parsed as NonNullable<TimelineFrame["cameras"]>[string];
        } else {
          delete cameras[selectedTrack.objectId];
        }
        next.cameras = Object.keys(cameras).length > 0 ? cameras : undefined;
      }
    } else {
      next.models =
        parsed.models && typeof parsed.models === "object" && !Array.isArray(parsed.models)
          ? (parsed.models as TimelineFrame["models"])
          : {};
      next.cameras =
        parsed.cameras && typeof parsed.cameras === "object" && !Array.isArray(parsed.cameras)
          ? (parsed.cameras as TimelineFrame["cameras"])
          : {};
    }
    timelineFrames[selectedTimelineFrameIndex] = next;
    const selectedTime = next.time;
    timelineFrames = compactTimelineFrames(timelineFrames);
    selectedTimelineFrameIndex = timelineFrames.findIndex((frame) =>
      nearlyEqual(frame.time, selectedTime)
    );
    setTimelineStatus(scope === "track" ? "Track JSON updated" : "Frame JSON updated");
    return true;
  } catch {
    setTimelineStatus("Invalid frame JSON");
    return false;
  }
}

function findActiveCamera(frame: TimelineFrame | null | undefined) {
  if (!frame?.cameras) return null;
  const entries = Object.entries(frame.cameras);
  if (entries.length === 0) return null;
  const active =
    entries.find(([, camera]) => camera?.active === true)?.[1] ??
    entries[0]?.[1] ??
    null;
  if (!active) return null;
  const position = active.position ?? [0, 6, 7];
  const lookAt = active.lookAt ?? [0, 0, 0];
  return {
    position: { x: position[0] ?? 0, y: position[1] ?? 0, z: position[2] ?? 0 },
    lookAt: { x: lookAt[0] ?? 0, y: lookAt[1] ?? 0, z: lookAt[2] ?? 0 }
  };
}

function compactTimelineFrames(frames: TimelineFrame[]) {
  if (!worldState) return normalizeTimelineFramesLocal(frames);
  const source = normalizeTimelineFramesLocal(frames);
  const compacted: TimelineFrame[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const frame = source[i]!;
    const isFirstFrame = i === 0;
    timelineFrames = compacted;
    const prevIndex = getLastFrameIndexBefore(frame.time, compacted);
    const baseline = buildFrameState(prevIndex);
    const nextFrame: TimelineFrame = { time: frame.time };

    if (frame.models) {
      const models: NonNullable<TimelineFrame["models"]> = {};
      for (const [placementId, diff] of Object.entries(frame.models)) {
        const isFirstTrackFrame = !hasPriorTrackFrame(
          { kind: "model", objectId: placementId },
          compacted.length,
          compacted
        );
        const placement = worldState.placements.find((item) => item.id === placementId);
        const prior = baseline.models.get(placementId) ?? {
          visible: true,
          position: placement?.position ?? { x: 0, y: 0, z: 0 },
          rotation: placement?.rotation ?? { x: 0, y: 0, z: 0 },
          scale: placement?.scale ?? { x: 1, y: 1, z: 1 }
        };
        const current = {
          visible: typeof diff.visible === "boolean" ? diff.visible : prior.visible,
          position: Array.isArray(diff.position)
            ? { x: diff.position[0] ?? 0, y: diff.position[1] ?? 0, z: diff.position[2] ?? 0 }
            : prior.position,
          rotation: Array.isArray(diff.rotation)
            ? { x: diff.rotation[0] ?? 0, y: diff.rotation[1] ?? 0, z: diff.rotation[2] ?? 0 }
            : prior.rotation,
          scale: Array.isArray(diff.scale)
            ? { x: diff.scale[0] ?? 1, y: diff.scale[1] ?? 1, z: diff.scale[2] ?? 1 }
            : prior.scale
        };
        const entry: NonNullable<TimelineFrame["models"]>[string] = {};
        if (isFirstFrame || isFirstTrackFrame || current.visible !== prior.visible) {
          entry.visible = current.visible;
        }
        if (isFirstFrame || isFirstTrackFrame || !vec3Equal(current.position, prior.position)) {
          entry.position = [current.position.x, current.position.y, current.position.z];
        }
        if (isFirstFrame || isFirstTrackFrame || !vec3Equal(current.rotation, prior.rotation)) {
          entry.rotation = [current.rotation.x, current.rotation.y, current.rotation.z];
        }
        if (isFirstFrame || isFirstTrackFrame || !vec3Equal(current.scale, prior.scale)) {
          entry.scale = [current.scale.x, current.scale.y, current.scale.z];
        }
        if (Object.keys(entry).length > 0) {
          models[placementId] = entry;
        }
      }
      if (Object.keys(models).length > 0) nextFrame.models = models;
    }

    const nextCameraStates = new Map<string, TimelineCameraState>();
    for (const [cameraId, state] of baseline.cameras.entries()) {
      nextCameraStates.set(cameraId, cloneTimelineCameraState(state));
    }
    let nextActiveCameraId = baseline.activeCameraId;
    for (const worldCamera of worldState.cameras) {
      if (!nextCameraStates.has(worldCamera.id)) {
        nextCameraStates.set(worldCamera.id, {
          position: { ...worldCamera.position },
          lookAt: { ...worldCamera.lookAt },
          active: false
        });
      }
    }
    if (frame.cameras) {
      for (const [cameraId, diff] of Object.entries(frame.cameras)) {
        const fallbackCamera = getCameraStateFromWorld(cameraId);
        if (!nextCameraStates.has(cameraId) && !fallbackCamera) continue;
        const next = cloneTimelineCameraState(
          nextCameraStates.get(cameraId) ?? (fallbackCamera as TimelineCameraState)
        );
        if (Array.isArray(diff.position) && diff.position.length === 3) {
          next.position = {
            x: Number(diff.position[0] ?? next.position.x),
            y: Number(diff.position[1] ?? next.position.y),
            z: Number(diff.position[2] ?? next.position.z)
          };
        }
        if (Array.isArray(diff.lookAt) && diff.lookAt.length === 3) {
          next.lookAt = {
            x: Number(diff.lookAt[0] ?? next.lookAt.x),
            y: Number(diff.lookAt[1] ?? next.lookAt.y),
            z: Number(diff.lookAt[2] ?? next.lookAt.z)
          };
        }
        if (typeof diff.active === "boolean") {
          if (diff.active) nextActiveCameraId = cameraId;
          else if (nextActiveCameraId === cameraId) nextActiveCameraId = null;
        }
        nextCameraStates.set(cameraId, next);
      }
    }
    if (!nextActiveCameraId) {
      nextActiveCameraId = baseline.activeCameraId ?? worldState.cameras[0]?.id ?? null;
    }
    if (nextActiveCameraId && !nextCameraStates.has(nextActiveCameraId)) {
      nextActiveCameraId = worldState.cameras[0]?.id ?? null;
    }

    const cameraDiffs: NonNullable<TimelineFrame["cameras"]> = {};
    for (const [cameraId, nextCamera] of nextCameraStates.entries()) {
      const isFirstTrackFrame = !hasPriorTrackFrame(
        { kind: "camera", objectId: cameraId },
        compacted.length,
        compacted
      );
      const priorCamera =
        baseline.cameras.get(cameraId) ?? nextCamera;
      const cameraDiff: NonNullable<TimelineFrame["cameras"]>[string] = {};
      if (isFirstFrame || isFirstTrackFrame || !vec3Equal(nextCamera.position, priorCamera.position)) {
        cameraDiff.position = [nextCamera.position.x, nextCamera.position.y, nextCamera.position.z];
      }
      if (isFirstFrame || isFirstTrackFrame || !vec3Equal(nextCamera.lookAt, priorCamera.lookAt)) {
        cameraDiff.lookAt = [nextCamera.lookAt.x, nextCamera.lookAt.y, nextCamera.lookAt.z];
      }
      const priorActive = baseline.activeCameraId === cameraId;
      const nextActive = nextActiveCameraId === cameraId;
      if (isFirstFrame || isFirstTrackFrame || priorActive !== nextActive) {
        cameraDiff.active = nextActive;
      }
      if (Object.keys(cameraDiff).length > 0) {
        cameraDiffs[cameraId] = cameraDiff;
      }
    }
    if (Object.keys(cameraDiffs).length > 0) {
      nextFrame.cameras = cameraDiffs;
    }

    compacted.push(nextFrame);
  }
  timelineFrames = source;
  return compacted;
}

function interpolateValue(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function buildFrameState(frameIndex: number) {
  const placements = worldState?.placements ?? [];
  const state = new Map<
    string,
    {
      visible: boolean;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
    }
  >();
  for (const placement of placements) {
    state.set(placement.id, {
      visible: true,
      position: { ...placement.position },
      rotation: { ...placement.rotation },
      scale: { ...placement.scale }
    });
  }
  const cameraStates = new Map<string, TimelineCameraState>();
  for (const worldCamera of worldState?.cameras ?? []) {
    cameraStates.set(worldCamera.id, {
      position: { ...worldCamera.position },
      lookAt: { ...worldCamera.lookAt },
      active: false
    });
  }
  let activeCameraId: string | null = worldState?.cameras[0]?.id ?? null;

  for (let i = 0; i <= frameIndex; i += 1) {
    const frame = timelineFrames[i];
    if (frame?.models) {
      for (const [placementId, diff] of Object.entries(frame.models)) {
        const current = state.get(placementId);
        if (!current) continue;
        if (typeof diff.visible === "boolean") current.visible = diff.visible;
        if (Array.isArray(diff.position) && diff.position.length === 3) {
          current.position = {
            x: Number(diff.position[0] ?? current.position.x),
            y: Number(diff.position[1] ?? current.position.y),
            z: Number(diff.position[2] ?? current.position.z)
          };
        }
        if (Array.isArray(diff.rotation) && diff.rotation.length === 3) {
          current.rotation = {
            x: Number(diff.rotation[0] ?? current.rotation.x),
            y: Number(diff.rotation[1] ?? current.rotation.y),
            z: Number(diff.rotation[2] ?? current.rotation.z)
          };
        }
        if (Array.isArray(diff.scale) && diff.scale.length === 3) {
          current.scale = {
            x: Number(diff.scale[0] ?? current.scale.x),
            y: Number(diff.scale[1] ?? current.scale.y),
            z: Number(diff.scale[2] ?? current.scale.z)
          };
        }
      }
    }
    if (frame?.cameras) {
      for (const [cameraId, diff] of Object.entries(frame.cameras)) {
        const currentCamera = cameraStates.get(cameraId);
        if (!currentCamera) continue;
        const next = cloneTimelineCameraState(currentCamera);
        if (Array.isArray(diff.position) && diff.position.length === 3) {
          next.position = {
            x: Number(diff.position[0] ?? next.position.x),
            y: Number(diff.position[1] ?? next.position.y),
            z: Number(diff.position[2] ?? next.position.z)
          };
        }
        if (Array.isArray(diff.lookAt) && diff.lookAt.length === 3) {
          next.lookAt = {
            x: Number(diff.lookAt[0] ?? next.lookAt.x),
            y: Number(diff.lookAt[1] ?? next.lookAt.y),
            z: Number(diff.lookAt[2] ?? next.lookAt.z)
          };
        }
        if (typeof diff.active === "boolean") {
          if (diff.active) {
            activeCameraId = cameraId;
          } else if (activeCameraId === cameraId) {
            activeCameraId = null;
          }
        }
        cameraStates.set(cameraId, next);
      }
    }
  }
  if (activeCameraId && !cameraStates.has(activeCameraId)) {
    activeCameraId = null;
  }
  if (!activeCameraId) {
    activeCameraId = worldState?.cameras[0]?.id ?? null;
  }
  for (const [cameraId, cameraState] of cameraStates.entries()) {
    cameraState.active = cameraId === activeCameraId;
  }

  return {
    models: state,
    cameras: cameraStates,
    activeCameraId,
    camera: activeCameraId ? cameraStates.get(activeCameraId) ?? null : null
  };
}

function applyTimelineAtTime(seconds: number) {
  if (!worldState || timelineFrames.length === 0) {
    timelineAppliedPlacementState = new Map();
    game.setTimelineCameraOverride(null);
    return;
  }
  const targetTime = Math.max(0, seconds);
  let prevIndex = -1;
  let nextIndex = -1;
  for (let i = 0; i < timelineFrames.length; i += 1) {
    const frameTime = timelineFrames[i]!.time;
    if (frameTime <= targetTime) prevIndex = i;
    if (frameTime >= targetTime) {
      nextIndex = i;
      break;
    }
  }
  if (nextIndex < 0) nextIndex = prevIndex;
  if (prevIndex < 0) prevIndex = nextIndex;

  const prevState = buildFrameState(prevIndex);
  const nextState = buildFrameState(nextIndex);
  const prevTime = timelineFrames[prevIndex]?.time ?? 0;
  const nextTime = timelineFrames[nextIndex]?.time ?? prevTime;
  const denominator = Math.max(0.0001, nextTime - prevTime);
  const alpha =
    prevIndex === nextIndex ? 0 : Math.min(1, Math.max(0, (targetTime - prevTime) / denominator));

  const interpolated = new Map<
    string,
    {
      visible: boolean;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
    }
  >();

  for (const [placementId, prevModel] of prevState.models.entries()) {
    const nextModel = nextState.models.get(placementId) ?? prevModel;
    const blended = {
      visible: alpha < 1 ? prevModel.visible : nextModel.visible,
      position: {
        x: interpolateValue(prevModel.position.x, nextModel.position.x, alpha),
        y: interpolateValue(prevModel.position.y, nextModel.position.y, alpha),
        z: interpolateValue(prevModel.position.z, nextModel.position.z, alpha)
      },
      rotation: {
        x: interpolateValue(prevModel.rotation.x, nextModel.rotation.x, alpha),
        y: interpolateValue(prevModel.rotation.y, nextModel.rotation.y, alpha),
        z: interpolateValue(prevModel.rotation.z, nextModel.rotation.z, alpha)
      },
      scale: {
        x: interpolateValue(prevModel.scale.x, nextModel.scale.x, alpha),
        y: interpolateValue(prevModel.scale.y, nextModel.scale.y, alpha),
        z: interpolateValue(prevModel.scale.z, nextModel.scale.z, alpha)
      }
    };
    interpolated.set(placementId, blended);
    game.applyPlacementTransform(placementId, {
      position: blended.position,
      rotation: blended.rotation,
      scale: blended.scale
    });
    game.setPlacementVisibility(placementId, blended.visible);
  }
  timelineAppliedPlacementState = interpolated;

  const prevCamera = prevState.camera;
  const nextCamera = nextState.camera ?? prevCamera;
  const activeCameraId = nextState.activeCameraId ?? prevState.activeCameraId ?? null;
  const activeCameraLabel = activeCameraId
    ? worldState?.cameras.find((camera) => camera.id === activeCameraId)?.name?.trim() ||
      `Camera ${activeCameraId.slice(0, 8)}`
    : "No Timeline Camera";
  if (timelineCameraPreviewTitle) {
    timelineCameraPreviewTitle.textContent = `Active Camera: ${activeCameraLabel}`;
  }
  if (prevCamera && nextCamera) {
    game.setTimelineCameraOverride({
      position: {
        x: interpolateValue(prevCamera.position.x, nextCamera.position.x, alpha),
        y: interpolateValue(prevCamera.position.y, nextCamera.position.y, alpha),
        z: interpolateValue(prevCamera.position.z, nextCamera.position.z, alpha)
      },
      lookAt: {
        x: interpolateValue(prevCamera.lookAt.x, nextCamera.lookAt.x, alpha),
        y: interpolateValue(prevCamera.lookAt.y, nextCamera.lookAt.y, alpha),
        z: interpolateValue(prevCamera.lookAt.z, nextCamera.lookAt.z, alpha)
      }
    });
  } else {
    game.setTimelineCameraOverride(null);
  }
}

function resetTimelinePreview() {
  if (!worldState) {
    game.setTimelineCameraOverride(null);
    timelineAppliedPlacementState = new Map();
    return;
  }
  for (const placement of worldState.placements) {
    game.applyPlacementTransform(placement.id, {
      position: placement.position,
      rotation: placement.rotation,
      scale: placement.scale
    });
    game.setPlacementVisibility(placement.id, true);
  }
  timelineAppliedPlacementState = new Map();
  game.setTimelineCameraOverride(null);
}

function syncTimelinePreviewWindow() {
  const shouldShow =
    timelinePane?.classList.contains("active") === true &&
    worldViewActive &&
    Boolean(worldState) &&
    (worldState?.cameras.length ?? 0) > 0 &&
    timelineFrames.length > 0;
  if (timelineCameraPreviewWindow) {
    timelineCameraPreviewWindow.hidden = !shouldShow;
  }
  game.setTimelinePreviewElement(shouldShow ? timelineCameraPreviewViewport : null);
  timelinePreviewActive = shouldShow;
  syncTimelineInteractionMode();
  if (shouldShow) {
    applyTimelineAtTime(timelineScrubSeconds);
  } else {
    if (timelinePlaying) {
      stopTimelinePlayback();
    }
    if (timelineCameraPreviewTitle) {
      timelineCameraPreviewTitle.textContent = "Active Camera";
    }
    resetTimelinePreview();
  }
}

function syncSelectedTimelineFrameJson() {
  if (!timelineFrameJsonInput) return;
  const scope = getTimelineJsonScopeValue();
  const selectedTrack = scope === "track" ? getSelectedTimelineTrack() : null;
  timelineFrameJsonInput.rows = scope === "track" ? 2 : 4;
  if (timelineJsonScopeInput) {
    timelineJsonScopeInput.value = scope;
    timelineJsonScopeInput.disabled = selectedTimelineFrameIndex < 0;
  }
  if (timelineFrameJsonLabel) {
    timelineFrameJsonLabel.textContent =
      scope === "track" && selectedTrack
        ? `${selectedTrack.label} JSON`
        : "Selected Frame JSON";
  }
  if (selectedTimelineFrameIndex >= 0) {
    const selectedFrame = timelineFrames[selectedTimelineFrameIndex];
    timelineFrameJsonInput.disabled = false;
    if (scope === "track" && selectedTrack) {
      const value =
        selectedTrack.kind === "model"
          ? selectedFrame?.models?.[selectedTrack.objectId] ?? {}
          : selectedFrame?.cameras?.[selectedTrack.objectId] ?? {};
      timelineFrameJsonInput.placeholder = "{}";
      timelineFrameJsonInput.value = JSON.stringify(value);
    } else {
      timelineFrameJsonInput.placeholder = '{"models":{},"cameras":{}}';
      timelineFrameJsonInput.value = JSON.stringify({
        models: selectedFrame?.models ?? {},
        cameras: selectedFrame?.cameras ?? {}
      });
    }
  } else {
    if (timelineJsonScopeInput) {
      timelineJsonScopeInput.value = timelineJsonScope;
      timelineJsonScopeInput.disabled = true;
    }
    timelineFrameJsonInput.disabled = true;
    timelineFrameJsonInput.placeholder =
      scope === "track" ? "{}" : '{"models":{},"cameras":{}}';
    timelineFrameJsonInput.value = "";
  }
}

function selectTimelineFrame(index: number, trackKey: string | null = null) {
  const frame = timelineFrames[index];
  if (!frame) return;
  selectedTimelineFrameIndex = index;
  if (trackKey) {
    selectedTimelineTrackKey = trackKey;
    timelineJsonScope = "track";
  }
  timelineScrubSeconds = frame.time;
  syncSelectedTimelineFrameJson();
  applyTimelineAtTime(timelineScrubSeconds);
  renderTimelineEditor();
  syncTimelinePreviewWindow();
}

function renderTimelineEditor() {
  if (!timelineRuler || !timelineTracks) return;
  const canEdit = worldState?.canManage === true;
  const canPlay = Boolean(worldState) && timelineFrames.length > 0;
  const timelineTrackList = getTimelineTracks();
  const selectedTrack = getSelectedTimelineTrack();
  const selectedTrackFrameIndex = findTrackKeyframeIndexAtTime(selectedTrack, timelineScrubSeconds);
  const selectedTrackDiff =
    selectedTrackFrameIndex >= 0 && selectedTrack
      ? getTrackDiffFromFrame(timelineFrames[selectedTrackFrameIndex], selectedTrack)
      : null;
  if (timelinePlayToggleButton) {
    timelinePlayToggleButton.disabled = !canPlay;
    timelinePlayToggleButton.textContent = timelinePlaying ? "Pause" : "Play";
  }
  if (timelineKeyframeButton) {
    timelineKeyframeButton.disabled = !canEdit || !selectedTrack;
    timelineKeyframeButton.textContent = selectedTrackDiff ? "Update Selected Keyframe" : "Keyframe Selected";
  }
  if (timelineDeleteFrameButton) {
    timelineDeleteFrameButton.disabled = !canEdit || !selectedTrackDiff;
    timelineDeleteFrameButton.hidden = !selectedTrackDiff;
  }
  if (timelineScrubInput) timelineScrubInput.disabled = !canEdit;
  if (timelineTimeInput) timelineTimeInput.disabled = !canEdit;
  timelineRuler.innerHTML = "";
  timelineTracks.innerHTML = "";
  const duration = Math.max(getTimelineDuration(), timelineScrubSeconds, 1);
  if (timelineScrubInput) timelineScrubInput.max = String(duration);
  if (timelineTimeInput) timelineTimeInput.max = String(duration);
  if (timelineScrubInput) timelineScrubInput.value = String(timelineScrubSeconds);
  if (timelineTimeInput) timelineTimeInput.value = timelineScrubSeconds.toFixed(1);

  const scrubber = document.createElement("div");
  scrubber.className = "timeline-frame-scrubber";
  scrubber.style.left = `${(timelineScrubSeconds / duration) * 100}%`;
  timelineRuler.appendChild(scrubber);
  timelineRuler.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".timeline-frame-marker")) return;
    scrubTimelineTo(getTimelineScrubTimeFromClientX(timelineRuler, event.clientX));
  });

  timelineFrames.forEach((frame, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "timeline-frame-marker timeline-frame-marker-overview";
    if (index === selectedTimelineFrameIndex) marker.classList.add("active");
    marker.style.left = `${(frame.time / duration) * 100}%`;
    marker.textContent = `F${index + 1}`;
    marker.title = `Frame ${index + 1} • ${formatTimelineTime(frame.time)}`;
    marker.addEventListener("click", () => selectTimelineFrame(index));
    timelineRuler.appendChild(marker);
  });

  for (const track of timelineTrackList) {
    const row = document.createElement("div");
    row.className = "timeline-track-row";
    const selectedByWorld =
      (track.kind === "model" && selectedWorldPlacementId === track.objectId) ||
      (track.kind === "camera" && selectedWorldCameraId === track.objectId);
    const selectedByTimeline = selectedTimelineTrackKey === track.key;
    if (selectedByWorld || selectedByTimeline) {
      row.classList.add("active");
    }

    const labelButton = document.createElement("button");
    labelButton.type = "button";
    labelButton.className = "timeline-track-label";
    labelButton.title = track.label;
    labelButton.addEventListener("click", () => {
      revealTimelineSelection(track);
      renderTimelineEditor();
    });

    const kindBadge = document.createElement("span");
    kindBadge.className = "timeline-track-kind";
    kindBadge.textContent = track.kind === "model" ? "Model" : "Camera";
    labelButton.appendChild(kindBadge);

    const name = document.createElement("span");
    name.className = "timeline-track-name";
    name.textContent = track.label;
    labelButton.appendChild(name);

    const lane = document.createElement("div");
    lane.className = "timeline-track-lane";
    lane.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".timeline-frame-marker")) return;
      selectedTimelineTrackKey = track.key;
      timelineJsonScope = "track";
      scrubTimelineTo(getTimelineScrubTimeFromClientX(lane, event.clientX));
    });

    const laneScrubber = document.createElement("div");
    laneScrubber.className = "timeline-frame-scrubber timeline-frame-scrubber-track";
    laneScrubber.style.left = `${(timelineScrubSeconds / duration) * 100}%`;
    lane.appendChild(laneScrubber);

    for (const frameIndex of track.frameIndexes) {
      const frame = timelineFrames[frameIndex];
      if (!frame) continue;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "timeline-frame-marker timeline-frame-marker-track";
      if (frameIndex === selectedTimelineFrameIndex) marker.classList.add("active");
      marker.style.left = `${(frame.time / duration) * 100}%`;
      marker.textContent = formatTimelineTime(frame.time);
      const diffSummary = getTimelineTrackDiffSummary(track, frame);
      marker.title = `${track.label} • ${formatTimelineTime(frame.time)}${
        diffSummary ? ` • ${diffSummary}` : ""
      }`;
      marker.addEventListener("click", () => selectTimelineFrame(frameIndex, track.key));
      lane.appendChild(marker);
    }

    row.appendChild(labelButton);
    row.appendChild(lane);
    timelineTracks.appendChild(row);
  }

  if (timelineTrackList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "timeline-track-empty";
    empty.textContent = timelineFrames.length === 0 ? "No object tracks yet" : "No object changes yet";
    timelineTracks.appendChild(empty);
  }

  syncSelectedTimelineFrameJson();

  if (!worldState) {
    setTimelineStatus("Join a world to edit timeline");
  } else if (timelineFrames.length === 0) {
    setTimelineStatus("No frames yet");
  } else {
    setTimelineStatus(
      `Frames: ${timelineFrames.length} • Tracks: ${timelineTrackList.length} • Scrub: ${formatTimelineTime(timelineScrubSeconds)}`
    );
  }
}

async function loadWorldState() {
  if (!worldViewActive) {
    stopWorldGenerationPolling();
    stopTimelinePlayback();
    selectedWorldCameraId = null;
    pendingSelectedWorldCameraId = null;
    timelineFrames = [];
    selectedTimelineFrameIndex = -1;
    selectedTimelineTrackKey = null;
    timelineScrubSeconds = 0;
    timelineAppliedPlacementState = new Map();
    renderTimelineEditor();
    syncTimelinePreviewWindow();
    game.setWorldData(null);
    game.setWorldPlacementTransformEnabled(false);
    game.setPendingWorldPostPlacement(null);
    syncTransformToolbar();
    syncShareWorldLinkButton();
    return;
  }

  if (!auth.getCurrentUser()) {
    stopTimelinePlayback();
    worldState = null;
    worldGenerationTasks = [];
    selectedWorldPlacementId = null;
    selectedWorldPhotoWallId = null;
    selectedWorldCameraId = null;
    selectedWorldPostId = null;
    pendingSelectedWorldPlacementId = null;
    pendingSelectedWorldPhotoWallId = null;
    pendingSelectedWorldCameraId = null;
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
    timelineFrames = [];
    selectedTimelineFrameIndex = -1;
    selectedTimelineTrackKey = null;
    timelineScrubSeconds = 0;
    timelineAppliedPlacementState = new Map();
    stopWorldGenerationPolling();
    game.setWorldData(null);
    game.setWorldPlacementTransformEnabled(false);
    game.setPendingWorldPostPlacement(null);
    syncTransformToolbar();
    setWorldNotice("Sign in to load world");
    if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
    if (worldGenerationStatusList) worldGenerationStatusList.innerHTML = "";
    if (worldPlacementsContainer) worldPlacementsContainer.innerHTML = "";
    if (worldPlacementEditor) worldPlacementEditor.innerHTML = "";
    if (worldPhotoWallsContainer) worldPhotoWallsContainer.innerHTML = "";
    if (worldPhotoWallEditor) worldPhotoWallEditor.innerHTML = "";
    if (worldCamerasContainer) worldCamerasContainer.innerHTML = "";
    if (worldCameraEditor) worldCameraEditor.innerHTML = "";
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
    renderWorldCameras();
    renderWorldCameraEditor();
    renderTimelineEditor();
    syncTimelinePreviewWindow();
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
  timelineFrames = compactTimelineFrames(normalizeTimelineFramesLocal(payload.timelineFrames));
  if (timelineFrames.length === 0) {
    stopTimelinePlayback();
    selectedTimelineFrameIndex = -1;
    selectedTimelineTrackKey = null;
    timelineScrubSeconds = 0;
  } else {
    if (selectedTimelineFrameIndex < 0 || selectedTimelineFrameIndex >= timelineFrames.length) {
      selectedTimelineFrameIndex = 0;
    }
    timelineScrubSeconds = Math.min(timelineScrubSeconds, getTimelineDuration());
  }
  syncShareWorldLinkButton();
  syncAvatarSelectOptions();
  const requestedPlacementId = pendingSelectedWorldPlacementId ?? selectedWorldPlacementId;
  const requestedPhotoWallId = pendingSelectedWorldPhotoWallId ?? selectedWorldPhotoWallId;
  const requestedCameraId = pendingSelectedWorldCameraId ?? selectedWorldCameraId;
  const requestedPostId = pendingSelectedWorldPostId ?? selectedWorldPostId;
  pendingSelectedWorldPlacementId = null;
  pendingSelectedWorldPhotoWallId = null;
  pendingSelectedWorldCameraId = null;
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
  selectedWorldCameraId =
    requestedCameraId && payload.cameras.some((worldCamera) => worldCamera.id === requestedCameraId)
      ? requestedCameraId
      : null;
  syncSceneTransformSelection();
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
  game.setWorldPlacementTransformEnabled(payload.canManage);
  game.setPendingWorldPostPlacement(null);
  syncTransformToolbar();
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
  if (worldCameraCreateCurrentButton) worldCameraCreateCurrentButton.disabled = !payload.canManage;
  if (worldPostImageUrlInput) worldPostImageUrlInput.disabled = !payload.canManage;
  if (worldPostImageFileInput) worldPostImageFileInput.disabled = !payload.canManage;
  if (worldPostMessageInput) worldPostMessageInput.disabled = !payload.canManage;

  const worldOwnerLabel =
    payload.worldOwnerId === auth.getCurrentUser()?.id ? "Your world" : "Visited world";
  setWorldNotice(
    `${payload.worldName} • ${worldOwnerLabel} • ${payload.isPublic ? "Public" : "Private"} • ${
      payload.assets.length
    } models • ${payload.placements.length} placements • ${payload.photoWalls.length} cubes • ${payload.cameras.length} cameras • ${payload.posts.length} posts`
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
  renderWorldCameras();
  renderWorldCameraEditor();
  syncWorldPostFormMode();
  renderTimelineEditor();
  syncTimelinePreviewWindow();
  void loadCommentsForSelectedPost(true);
}

function renderWorldAssets() {
  if (!worldAssetsContainer) return;
  worldAssetsContainer.innerHTML = "";

  const assets = worldState?.assets ?? [];
  if (assets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No models uploaded";
    worldAssetsContainer.appendChild(empty);
    return;
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
      selectedWorldCameraId = null;
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

function renderWorldGenerationStatus() {
  if (!worldGenerationStatusList) return;
  worldGenerationStatusList.innerHTML = "";
  if (!worldState?.canManage) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "Sign in to create models";
    worldGenerationStatusList.appendChild(empty);
    return;
  }
  const tasks = worldGenerationTasks.filter((task) => task.status !== "COMPLETED");
  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-empty";
    empty.textContent = "No active generation jobs";
    worldGenerationStatusList.appendChild(empty);
    return;
  }
  for (const task of tasks) {
    const row = document.createElement("div");
    row.className = "world-asset-row";
    const label = document.createElement("div");
    label.className = "party-result-label";
    label.textContent = `${task.modelName} • ${getGenerationStatusLabel(task)}`;
    label.title = task.prompt;
    row.appendChild(label);
    worldGenerationStatusList.appendChild(row);
  }
}

const game = createGameScene({
  mount: appRoot,
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
  onWorldPlacementTransform(placementId, transform, options) {
    if (!worldState?.canManage) return;
    commitPlacementTransform(placementId, transform, {
      persistMode: options.persistMode,
      renderUi: true
    });
  },
  onWorldPhotoWallTransform(photoWallId, transform, options) {
    if (!worldState?.canManage) return;
    commitPhotoWallTransform(photoWallId, transform, {
      persistMode: options.persistMode,
      renderUi: true
    });
  },
  onWorldCameraTransform(cameraId, transform, options) {
    if (!worldState?.canManage) return;
    commitWorldCameraTransform(cameraId, transform, {
      persistMode: options.persistMode,
      renderUi: true
    });
  },
  onWorldPlacementTransformModeChange(mode) {
    activeTransformMode = mode;
    syncTransformToolbar();
  },
  onWorldPhotoWallSelect(photoWallId) {
    setSelectedWorldPhotoWall(photoWallId);
    if (worldPhotoWallEditor && !dockPanel?.classList.contains("minimized")) {
      worldPhotoWallEditor.scrollIntoView({ block: "nearest" });
    }
  },
  onWorldCameraSelect(cameraId, handle) {
    setSelectedWorldCamera(cameraId, handle);
    if (worldCameraEditor && !dockPanel?.classList.contains("minimized")) {
      worldCameraEditor.scrollIntoView({ block: "nearest" });
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
              formData.set("scaleX", "1");
              formData.set("scaleY", "1");
              formData.set("scaleZ", "1");
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
                scale: { x: 1, y: 1, z: 1 }
              })
            });

        if (!response.ok) {
          setWorldNotice("Photo cube placement failed");
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { photoWallId?: string }
          | null;
        pendingSelectedWorldPhotoWallId = payload?.photoWallId ?? null;
        if (worldPhotoWallImageUrlInput) worldPhotoWallImageUrlInput.value = "";
        if (worldPhotoWallImageFileInput) worldPhotoWallImageFileInput.value = "";
        syncWorldPhotoWallFileName();
        selectedPhotoWallLibraryImageUrl = null;
        await loadWorldState();
        setWorldNotice("Photo cube placed");
      } catch {
        setWorldNotice("Photo cube placement failed");
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
  setHomeViewMode(false);
  worldViewActive = active;
  dockPanel?.toggleAttribute("hidden", !active);
  transformToolbar?.setAttribute("style", active ? "display: flex" : "display: none");
  syncTransformToolbar();
  syncTimelinePreviewWindow();
  syncShareWorldLinkButton();
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

function setHomeRoute(replace = false) {
  if (window.location.pathname === "/") return;
  if (replace) {
    window.history.replaceState(null, "", "/");
    return;
  }
  window.history.pushState(null, "", "/");
}

function setMapRoute(replace = false) {
  if (window.location.pathname === MAP_ROUTE_PATH) return;
  if (replace) {
    window.history.replaceState(null, "", MAP_ROUTE_PATH);
    return;
  }
  window.history.pushState(null, "", MAP_ROUTE_PATH);
}

function setHomeViewMode(active: boolean) {
  homeListingScreen?.toggleAttribute("hidden", !active);
  if (!active) return;

  worldViewActive = false;
  worldMapScreen?.toggleAttribute("hidden", true);
  dockPanel?.toggleAttribute("hidden", true);
  transformToolbar?.setAttribute("style", "display: none");
  appRoot.classList.add("map-hidden");
  syncTransformToolbar();
  syncTimelinePreviewWindow();
  syncShareWorldLinkButton();
}

function activateWorldViewForWorld(worldId: string) {
  pendingAutoJoinWorldId = worldId;
  autoJoinWorldIdSent = null;
  setWorldRoute(worldId);
  currentRouteMode = "world";
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
    homeListingLoaded = true;
    homeListingLoadFailed = true;
    renderHomeListing();
    worldMap.setStatus("Failed to load world portals");
    return;
  }

  const payload = (await response.json()) as { portals: WorldPortal[] };
  homeListingLoaded = true;
  homeListingLoadFailed = false;
  knownWorldPortals = payload.portals;
  if (auth.getCurrentUser()) {
    myOwnedWorldId =
      payload.portals.find((portal) => portal.isOwnedWorld)?.worldId ?? myOwnedWorldId;
  }
  syncWorldMapControlState();
  worldMap.setPortals(payload.portals);
  renderHomeListing();
  if (pendingAutoJoinWorldId) {
    worldMap.selectPortal(pendingAutoJoinWorldId);
  }
}

function syncWorldMapControlState() {
  const canEdit = Boolean(auth.getCurrentUser());
  const cityKey = worldMapCitySelect?.value?.trim() ?? "";
  worldMap.setHomeAssignmentReady(canEdit && Boolean(cityKey));

  if (worldMapWorldNameInput) {
    worldMapWorldNameInput.disabled = !canEdit;
  }
  if (worldMapWorldDescriptionInput) {
    worldMapWorldDescriptionInput.disabled = !canEdit;
  }
  if (worldMapCitySelect) {
    worldMapCitySelect.disabled = !canEdit;
  }

  if (worldMapJoinMineButton) {
    worldMapJoinMineButton.disabled = !canEdit || !myOwnedWorldId;
  }

  if (worldMapSaveSettingsButton) {
    const nextName = worldMapWorldNameInput?.value.trim() ?? "";
    const nextDescription = worldMapWorldDescriptionInput?.value.trim() ?? "";
    const hasWorldNameChange = canEdit && nextName !== loadedWorldMapName;
    const hasWorldDescriptionChange = canEdit && nextDescription !== loadedWorldMapDescription;
    const hasQueuedAddressChange = canEdit && pendingWorldMapCityKey !== null;
    worldMapSaveSettingsButton.disabled =
      !canEdit ||
      (!hasWorldNameChange && !hasWorldDescriptionChange && !hasQueuedAddressChange);
  }
}

function renderWorldHomeCities() {
  if (!worldMapCitySelect) return;
  const currentValue = worldMapCitySelect.value;
  worldMapCitySelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose your world city";
  worldMapCitySelect.appendChild(placeholder);

  for (const city of worldHomeCities) {
    const option = document.createElement("option");
    option.value = city.key;
    option.textContent = `${city.cityName}, ${city.countryName} (${city.timezone})`;
    worldMapCitySelect.appendChild(option);
  }

  worldMapCitySelect.value = worldHomeCities.some((city) => city.key === currentValue)
    ? currentValue
    : "";
}

function setWorldMapHomeAddress(payload: WorldHomePortal | null) {
  if (!worldMapHomeAddress) return;
  const fictionalAddress = payload?.fictionalAddress?.trim();
  const city = payload?.homeCityName?.trim();
  const country = payload?.homeCountryName?.trim();
  if (!fictionalAddress || !city || !country) {
    worldMapHomeAddress.hidden = true;
    worldMapHomeAddress.textContent = "";
    return;
  }
  const timezone = payload?.homeTimezone?.trim();
  worldMapHomeAddress.textContent = timezone
    ? `${fictionalAddress}, ${city}, ${country} (${timezone})`
    : `${fictionalAddress}, ${city}, ${country}`;
  worldMapHomeAddress.hidden = false;
}

async function loadWorldHomeCities() {
  const response = await fetch(apiUrl("/api/v1/world/home-cities"), {
    credentials: "include"
  });
  if (!response.ok) {
    worldMap.setStatus("Failed to load world cities");
    return;
  }
  const payload = (await response.json()) as { cities: WorldHomeCity[] };
  worldHomeCities = payload.cities;
  renderWorldHomeCities();
  syncWorldMapControlState();
}

async function loadHomePortal() {
  const user = auth.getCurrentUser();
  worldMap.setCurrentUser(user);
  if (!user) {
    myOwnedWorldId = null;
    loadedWorldMapName = "";
    loadedWorldMapDescription = "";
    loadedWorldMapCityKey = null;
    pendingWorldMapCityKey = null;
    if (worldMapWorldNameInput) worldMapWorldNameInput.value = "";
    if (worldMapWorldDescriptionInput) worldMapWorldDescriptionInput.value = "";
    if (worldMapCitySelect) worldMapCitySelect.value = "";
    worldMap.setHomePortal(null);
    setWorldMapHomeAddress(null);
    syncWorldMapControlState();
    return;
  }

  const response = await fetch(apiUrl("/api/v1/world/home-portal"), {
    credentials: "include"
  });
  if (!response.ok) {
    return;
  }
  const payload = (await response.json()) as WorldHomePortal;
  myOwnedWorldId = payload.worldId;
  loadedWorldMapName = payload.worldName.trim();
  loadedWorldMapDescription = payload.worldDescription?.trim() ?? "";
  loadedWorldMapCityKey = payload.homeCityKey ?? null;
  pendingWorldMapCityKey = null;
  worldMap.setHomePortal(payload.portal);
  if (worldMapWorldNameInput) {
    worldMapWorldNameInput.value = loadedWorldMapName;
  }
  if (worldMapWorldDescriptionInput) {
    worldMapWorldDescriptionInput.value = loadedWorldMapDescription;
  }
  if (worldMapCitySelect) {
    worldMapCitySelect.value = payload.homeCityKey ?? "";
  }
  setWorldMapHomeAddress(payload);
  syncWorldMapControlState();
  if (!payload.homeCityKey) {
    worldMap.setStatus("Choose your world city, then assign a fictional address");
  }
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
  worldAddressEl: worldMapWorldAddress,
  worldCardCloseButton: worldMapWorldCardCloseButton,
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
  async onAssignHomePortal() {
    if (!auth.getCurrentUser()) {
      worldMap.setStatus("Sign in to assign a fictional address");
      return false;
    }
    const cityKey = worldMapCitySelect?.value?.trim() ?? "";
    if (!cityKey) {
      worldMap.setStatus("Choose a city before assigning a fictional address");
      return false;
    }
    pendingWorldMapCityKey = cityKey;
    worldMap.setStatus("Fictional address reroll queued. Click Save Changes to apply.");
    syncWorldMapControlState();
    return true;
  }
});

worldMapCitySelect?.addEventListener("change", () => {
  syncWorldMapControlState();
});

worldMapWorldNameInput?.addEventListener("input", () => {
  syncWorldMapControlState();
});
worldMapWorldDescriptionInput?.addEventListener("input", () => {
  syncWorldMapControlState();
});

worldMapJoinMineButton?.addEventListener("click", () => {
  if (!auth.getCurrentUser()) {
    worldMap.setStatus("Sign in to join your world");
    return;
  }
  const worldId =
    myOwnedWorldId ??
    knownWorldPortals.find((portal) => portal.isOwnedWorld)?.worldId ??
    null;
  if (!worldId) {
    worldMap.setStatus("Your world is not available yet");
    return;
  }
  activateWorldViewForWorld(worldId);
});

worldMapSaveSettingsButton?.addEventListener("click", () => {
  if (!auth.getCurrentUser()) {
    worldMap.setStatus("Sign in to save world changes");
    return;
  }
  const worldName = worldMapWorldNameInput?.value.trim() ?? "";
  const worldDescription = worldMapWorldDescriptionInput?.value.trim() ?? "";
  if (!worldName) {
    worldMap.setStatus("World name is required");
    return;
  }

  void (async () => {
    if (worldMapSaveSettingsButton) worldMapSaveSettingsButton.disabled = true;

    const worldChanged =
      worldName !== loadedWorldMapName || worldDescription !== loadedWorldMapDescription;
    if (worldChanged) {
      const worldSaved = await updateWorldSettings(worldName, worldDescription, true);
      if (!worldSaved) {
        worldMap.setStatus("Failed to save world details");
        syncWorldMapControlState();
        return;
      }
    }

    if (pendingWorldMapCityKey) {
      const response = await fetch(apiUrl("/api/v1/world/home-portal"), {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cityKey: pendingWorldMapCityKey
        })
      });
      if (!response.ok) {
        worldMap.setStatus("Failed to assign fictional address");
        syncWorldMapControlState();
        return;
      }
    }

    await Promise.all([loadHomePortal(), loadWorldPortalPins()]);
    syncProfileSettingsForm();
    worldMap.setStatus("World changes saved");
  })();
});

worldMapControlsToggle?.addEventListener("click", () => {
  if (!worldMapControls) return;
  const collapsed = worldMapControls.classList.toggle("collapsed");
  worldMapControlsToggle.textContent = collapsed ? "+" : "x";
  worldMapControlsToggle.setAttribute(
    "aria-label",
    collapsed ? "Expand map controls" : "Collapse map controls"
  );
  worldMapControlsToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  worldMapControlsToggle.setAttribute(
    "title",
    collapsed ? "Expand controls" : "Collapse controls"
  );
});

worldMapWorldCardCloseButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  worldMap.selectPortal(null);
});

mapGlobalChatToggle?.addEventListener("click", () => {
  if (!mapGlobalChat) return;
  const collapsed = mapGlobalChat.classList.toggle("collapsed");
  mapGlobalChatToggle.textContent = collapsed ? "+" : "x";
  mapGlobalChatToggle.setAttribute(
    "aria-label",
    collapsed ? "Expand global chat" : "Collapse global chat"
  );
  mapGlobalChatToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  mapGlobalChatToggle.setAttribute("title", collapsed ? "Expand chat" : "Collapse chat");
});

mapGlobalChatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!auth.getCurrentUser() || !mapGlobalChatInput) return;
  const text = mapGlobalChatInput.value.trim();
  if (!text) return;
  const sent = realtime.sendChat(text);
  if (!sent) {
    setWorldNotice("Global chat unavailable");
    return;
  }
  mapGlobalChatInput.value = "";
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
    syncMapGlobalChatState();
    renderMapGlobalChat();
    worldMap.setCurrentUser(user);
    syncProfileSettingsForm();
    renderHomeListing();
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
      game.setWorldPlacementTransformEnabled(false);
      game.setPendingWorldPostPlacement(null);
      syncTransformToolbar();
      setWorldNotice("Sign in to load world");
      if (worldAssetsContainer) worldAssetsContainer.innerHTML = "";
      if (worldGenerationStatusList) worldGenerationStatusList.innerHTML = "";
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
      myOwnedWorldId = null;
      loadedWorldMapName = "";
      loadedWorldMapDescription = "";
      loadedWorldMapCityKey = null;
      pendingWorldMapCityKey = null;
      if (worldMapWorldNameInput) worldMapWorldNameInput.value = "";
      if (worldMapWorldDescriptionInput) worldMapWorldDescriptionInput.value = "";
      if (worldMapCitySelect) worldMapCitySelect.value = "";
      setWorldMapHomeAddress(null);
      syncWorldMapControlState();
      void loadWorldPortalPins();
      return;
    }

    if (worldHomeCities.length === 0) {
      void loadWorldHomeCities();
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
setupTimelineControls();
setupCameraControlsTab();
setupTransformToolbar();
setupAvatarControls();
setupChatChannelToggles();
setupProfileMenu();
shareWorldLinkButton?.addEventListener("click", () => {
  void copyCurrentWorldLink();
});
homeMapButton?.addEventListener("click", () => {
  pendingAutoJoinWorldId = null;
  autoJoinWorldIdSent = null;
  setHomeRoute();
  currentRouteMode = "home";
  setHomeViewMode(true);
  worldMap.focusDefault();
  worldMap.selectPortal(null);
  try {
    window.sessionStorage.removeItem(PENDING_WORLD_JOIN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
});
homeOpenMapButton?.addEventListener("click", () => {
  setMapRoute();
  currentRouteMode = "map";
  setWorldViewMode(false);
  worldMap.focusDefault();
  worldMap.selectPortal(null);
});
homeSearchInput?.addEventListener("input", () => {
  renderHomeListing();
});
homeCityFilter?.addEventListener("change", () => {
  renderHomeListing();
});
homeSearchClearButton?.addEventListener("click", () => {
  if (homeSearchInput) homeSearchInput.value = "";
  if (homeCityFilter) homeCityFilter.value = "";
  renderHomeListing();
});
window.addEventListener("popstate", () => {
  const url = new URL(window.location.href);
  const worldId = parseWorldIdFromUrl(url);
  currentRouteMode = getRouteMode(url);
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
  pendingAutoJoinWorldId = null;
  autoJoinWorldIdSent = null;
  if (currentRouteMode === "map") {
    setWorldViewMode(false);
    worldMap.selectPortal(null);
    return;
  }
  setHomeViewMode(true);
  worldMap.selectPortal(null);
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

worldGenerateImageFileInput?.addEventListener("change", () => {
  syncWorldGenerateImageFileName();
});
worldModelFileInput?.addEventListener("change", () => {
  syncWorldModelFileName();
});
worldPhotoWallImageFileInput?.addEventListener("change", () => {
  syncWorldPhotoWallFileName();
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
    syncWorldGenerateImageFileName();
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
    syncWorldModelFileName();
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
  syncSceneTransformSelection();
  selectedWorldPostId = null;
  selectedWorldPhotoWallId = null;
  selectedWorldCameraId = null;
  pendingPhotoWallDraft = { imageUrl: imageUrl || null, imageFile };
  selectedPhotoWallLibraryImageUrl = imageUrl || null;
  isPlacingPhotoWall = true;
  setWorldNotice("Photo cube placement mode: click the floor to place.");
  renderWorldPlacements();
  renderWorldPosts();
  renderWorldPhotoWalls();
  renderWorldPlacementEditor();
  renderWorldPhotoWallEditor();
});

worldCameraCreateCurrentButton?.addEventListener("click", () => {
  if (!worldState?.canManage) {
    setWorldNotice("Only world owners/managers can modify this world");
    return;
  }
  const pose = game.getCameraPose();
  void (async () => {
    const response = await fetch(apiUrl("/api/v1/world/cameras"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: null,
        position: pose.position,
        lookAt: pose.lookAt
      })
    });
    if (!response.ok) {
      setWorldNotice("Camera create failed");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { cameraId?: string } | null;
    pendingSelectedWorldCameraId = payload?.cameraId ?? null;
    await loadWorldState();
    setWorldNotice("Camera created from current view");
  })();
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
  syncSceneTransformSelection();
  selectedWorldPostId = null;
  selectedWorldCameraId = null;
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
  if (!worldState?.canManageVisibility || !worldNameInput || !worldDescriptionInput) {
    return;
  }

  void (async () => {
    const name = worldNameInput.value.trim();
    if (!name) {
      setWorldNotice("World name is required");
      return;
    }
    const description = worldDescriptionInput.value.trim();
    const saved = await updateWorldSettings(name, description, true);
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
syncMapGlobalChatState();
renderMapGlobalChat();
syncWorldMapControlState();
void loadWorldHomeCities();
syncChatCanPost();
renderCombinedChat();
renderHomeListing();
if (currentRouteMode === "home") {
  setHomeViewMode(true);
  setWorldNotice("Search worlds by address or open the full map");
} else {
  setWorldViewMode(worldViewActive);
}
if (currentRouteMode === "world") {
  setWorldNotice("Sign in to load world");
} else if (currentRouteMode === "map") {
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
if (worldCameraCreateCurrentButton) worldCameraCreateCurrentButton.disabled = true;
if (worldPostEditButton) worldPostEditButton.disabled = true;
if (worldPostSaveEditButton) worldPostSaveEditButton.disabled = true;
if (worldPostCancelEditButton) worldPostCancelEditButton.disabled = true;
if (worldPostCommentInput) worldPostCommentInput.disabled = true;
if (worldPostCommentSendButton) worldPostCommentSendButton.disabled = true;
  syncWorldGenerateImageFileName();
  syncWorldModelFileName();
  syncWorldPhotoWallFileName();
  renderWorldGenerationStatus();
  syncWorldVisibilityControls();
syncWorldPostFormMode();
renderWorldPlacements();
renderWorldPhotoWalls();
renderWorldCameras();
renderWorldPosts();
renderWorldPostComments();
renderWorldPlacementEditor();
renderWorldPhotoWallEditor();
renderWorldCameraEditor();
renderTimelineEditor();
syncTimelinePreviewWindow();
syncShareWorldLinkButton();
void loadWorldPortalPins();
void auth.loadCurrentUser();
realtime.connect();
void webrtc.refreshDevices();
game.start();
