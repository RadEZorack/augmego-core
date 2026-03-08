import type { CurrentUser, WorldPortal } from "../lib/types";

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 17;
const DEFAULT_CENTER = { lat: 43.090003, lng: -79.068051 };

type LatLng = { lat: number; lng: number };

type WorldMapControllerOptions = {
  mapCanvas: HTMLElement | null;
  mapScreen: HTMLElement | null;
  statusEl: HTMLElement | null;
  worldCard: HTMLElement | null;
  worldNameEl: HTMLElement | null;
  worldOwnerEl: HTMLElement | null;
  worldDescEl: HTMLElement | null;
  worldAddressEl: HTMLElement | null;
  joinButton: HTMLButtonElement | null;
  savePinButton: HTMLButtonElement | null;
  zoomInButton: HTMLButtonElement | null;
  zoomOutButton: HTMLButtonElement | null;
  onStatus: (message: string) => void;
  onJoinWorld: (worldId: string) => void;
  onAssignHomePortal: () => Promise<boolean>;
};

export function createWorldMapController(options: WorldMapControllerOptions) {
  const {
    mapCanvas,
    mapScreen,
    statusEl,
    worldCard,
    worldNameEl,
    worldOwnerEl,
    worldDescEl,
    worldAddressEl,
    joinButton,
    savePinButton,
    zoomInButton,
    zoomOutButton,
    onStatus,
    onJoinWorld,
    onAssignHomePortal
  } = options;

  let portals: WorldPortal[] = [];
  let selectedPortalId: string | null = null;
  let currentUser: CurrentUser | null = null;
  let homePortalPosition: LatLng | null = null;
  let homeAssignmentReady = false;
  let center = { ...DEFAULT_CENTER };
  let zoom = DEFAULT_ZOOM;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragCenterPixel = latLngToWorldPixel(center, zoom);

  const tileLayer = document.createElement("div");
  tileLayer.className = "world-map-layer";
  const markerLayer = document.createElement("div");
  markerLayer.className = "world-map-markers";
  mapCanvas?.appendChild(tileLayer);
  mapCanvas?.appendChild(markerLayer);

  function setMapVisible(visible: boolean) {
    if (!mapScreen) return;
    mapScreen.hidden = !visible;
  }

  function setWorldViewVisible(visible: boolean) {
    const app = document.getElementById("app");
    if (!app) return;
    app.classList.toggle("map-hidden", !visible);
  }

  function setStatus(message: string) {
    onStatus(message);
    if (statusEl) statusEl.textContent = message;
  }

  function setCurrentUser(user: CurrentUser | null) {
    currentUser = user;
    if (savePinButton) {
      savePinButton.disabled = !currentUser || !homeAssignmentReady;
      savePinButton.title = currentUser
        ? "Assign a fictional home in your selected city"
        : "Sign in to assign your fictional world home";
    }
  }

  function setHomeAssignmentReady(ready: boolean) {
    homeAssignmentReady = ready;
    if (savePinButton) {
      savePinButton.disabled = !currentUser || !homeAssignmentReady;
    }
  }

  function setHomePortal(position: LatLng | null) {
    homePortalPosition = position;
  }

  function setPortals(next: WorldPortal[]) {
    portals = next;
    if (selectedPortalId && !portals.some((item) => item.worldId === selectedPortalId)) {
      selectedPortalId = null;
      hideCard();
    }
    render();
  }

  function updateViewportTo(position: LatLng) {
    center = {
      lat: clamp(position.lat, -85, 85),
      lng: normalizeLng(position.lng)
    };
    dragCenterPixel = latLngToWorldPixel(center, zoom);
    render();
  }

  function focusDefault() {
    updateViewportTo(homePortalPosition ?? DEFAULT_CENTER);
  }

  function activateWorldView() {
    setMapVisible(false);
    setWorldViewVisible(true);
  }

  function showMapView() {
    setMapVisible(true);
    setWorldViewVisible(false);
    render();
  }

  function showCardForPortal(portal: WorldPortal) {
    if (
      !worldCard ||
      !worldNameEl ||
      !worldOwnerEl ||
      !worldDescEl ||
      !worldAddressEl ||
      !joinButton
    ) {
      return;
    }

    worldCard.hidden = false;
    worldNameEl.textContent = portal.worldName;
    worldOwnerEl.textContent = `Owner: ${portal.owner.name}`;
    worldDescEl.textContent = portal.worldDescription ?? "No description";
    const city = portal.homeCityName?.trim();
    const country = portal.homeCountryName?.trim();
    const address = portal.fictionalAddress?.trim();
    if (address && city && country) {
      worldAddressEl.textContent = `Fictional address: ${address}, ${city}, ${country}`;
    } else if (city && country) {
      worldAddressEl.textContent = `Location: ${city}, ${country}`;
    } else {
      worldAddressEl.textContent = "Fictional address available after assignment.";
    }
    joinButton.disabled = !portal.canJoin;
    joinButton.textContent = portal.canJoin ? "Join World" : "World Not Joinable";
  }

  function hideCard() {
    if (!worldCard) return;
    worldCard.hidden = true;
  }

  function selectPortal(worldId: string | null) {
    selectedPortalId = worldId;
    if (!worldId) {
      hideCard();
      renderMarkers();
      return;
    }
    const portal = portals.find((item) => item.worldId === worldId);
    if (!portal) {
      hideCard();
      renderMarkers();
      return;
    }
    showCardForPortal(portal);
    renderMarkers();
  }

  function assignHomePortal() {
    if (!currentUser || !homeAssignmentReady) return;
    if (savePinButton) savePinButton.disabled = true;
    void (async () => {
      const saved = await onAssignHomePortal();
      if (!saved) {
        if (savePinButton) savePinButton.disabled = !currentUser || !homeAssignmentReady;
        return;
      }
      if (savePinButton) savePinButton.disabled = !currentUser || !homeAssignmentReady;
      setStatus("Fictional world home assigned");
      renderMarkers();
    })();
  }

  function renderTileLayer() {
    if (!mapCanvas) return;
    const width = mapCanvas.clientWidth;
    const height = mapCanvas.clientHeight;
    if (!width || !height) return;

    const centerPixel = latLngToWorldPixel(center, zoom);
    const worldTiles = 2 ** zoom;

    const minTileX = Math.floor((centerPixel.x - width / 2) / TILE_SIZE);
    const maxTileX = Math.floor((centerPixel.x + width / 2) / TILE_SIZE);
    const minTileY = Math.floor((centerPixel.y - height / 2) / TILE_SIZE);
    const maxTileY = Math.floor((centerPixel.y + height / 2) / TILE_SIZE);

    tileLayer.innerHTML = "";
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= worldTiles) continue;
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles;
        const img = document.createElement("img");
        img.className = "world-map-tile";
        img.alt = "";
        img.draggable = false;
        img.src = `https://a.basemaps.cartocdn.com/light_nolabels/${zoom}/${wrappedX}/${tileY}.png`;
        img.style.left = `${Math.round(tileX * TILE_SIZE - (centerPixel.x - width / 2))}px`;
        img.style.top = `${Math.round(tileY * TILE_SIZE - (centerPixel.y - height / 2))}px`;
        tileLayer.appendChild(img);
      }
    }
  }

  function createMarkerAt(position: LatLng, className: string, title: string) {
    if (!mapCanvas) return null;
    const width = mapCanvas.clientWidth;
    const height = mapCanvas.clientHeight;
    const centerPixel = latLngToWorldPixel(center, zoom);
    const markerPixel = latLngToWorldPixel(position, zoom);
    const left = markerPixel.x - (centerPixel.x - width / 2);
    const top = markerPixel.y - (centerPixel.y - height / 2);

    if (left < -30 || left > width + 30 || top < -40 || top > height + 30) {
      return null;
    }

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = className;
    marker.style.left = `${Math.round(left)}px`;
    marker.style.top = `${Math.round(top)}px`;
    marker.title = title;
    return marker;
  }

  function renderMarkers() {
    markerLayer.innerHTML = "";

    for (const portal of portals) {
      const marker = createMarkerAt(
        portal.portal,
        [
          "world-map-marker",
          portal.isOwnedWorld ? "owned" : "",
          portal.worldId === selectedPortalId ? "active" : ""
        ]
          .filter(Boolean)
          .join(" "),
        `${portal.worldName} (${portal.owner.name})`
      );
      if (!marker) continue;

      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        selectPortal(portal.worldId);
      });
      marker.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });

      markerLayer.appendChild(marker);
    }

  }

  function render() {
    renderTileLayer();
    renderMarkers();
  }

  function zoomAroundScreenPoint(delta: number, screenX: number, screenY: number) {
    if (!mapCanvas) return;
    const oldZoom = zoom;
    const nextZoom = clamp(oldZoom + delta, MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === oldZoom) return;

    const beforeZoom = latLngToWorldPixel(center, oldZoom);
    const anchorWorldBefore = {
      x: beforeZoom.x - mapCanvas.clientWidth / 2 + screenX,
      y: beforeZoom.y - mapCanvas.clientHeight / 2 + screenY
    };
    const anchorLatLng = worldPixelToLatLng(anchorWorldBefore, oldZoom);

    zoom = nextZoom;
    const anchorWorldAfter = latLngToWorldPixel(anchorLatLng, zoom);
    const nextCenterPixel = {
      x: anchorWorldAfter.x - screenX + mapCanvas.clientWidth / 2,
      y: anchorWorldAfter.y - screenY + mapCanvas.clientHeight / 2
    };
    center = worldPixelToLatLng(nextCenterPixel, zoom);
    render();
  }

  function setupInteractions() {
    if (!mapCanvas) return;

    mapCanvas.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".world-map-marker")) {
        return;
      }
      isDragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragCenterPixel = latLngToWorldPixel(center, zoom);
      mapCanvas.classList.add("is-dragging");
      mapCanvas.setPointerCapture(event.pointerId);
    });

    mapCanvas.addEventListener("pointermove", (event) => {
      if (!isDragging || !mapCanvas) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      const nextPixel = {
        x: dragCenterPixel.x - dx,
        y: dragCenterPixel.y - dy
      };
      center = worldPixelToLatLng(nextPixel, zoom);
      render();
    });

    mapCanvas.addEventListener("pointerup", (event) => {
      if (!isDragging) return;
      isDragging = false;
      mapCanvas.classList.remove("is-dragging");
      mapCanvas.releasePointerCapture(event.pointerId);
    });

    mapCanvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (!mapCanvas) return;
        const rect = mapCanvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        zoomAroundScreenPoint(event.deltaY < 0 ? 1 : -1, mouseX, mouseY);
      },
      { passive: false }
    );

    window.addEventListener("resize", () => {
      render();
    });
  }

  joinButton?.addEventListener("click", () => {
    if (!selectedPortalId) return;
    onJoinWorld(selectedPortalId);
  });

  savePinButton?.addEventListener("click", () => {
    assignHomePortal();
  });
  zoomInButton?.addEventListener("click", () => {
    if (!mapCanvas) return;
    zoomAroundScreenPoint(1, mapCanvas.clientWidth / 2, mapCanvas.clientHeight / 2);
  });
  zoomOutButton?.addEventListener("click", () => {
    if (!mapCanvas) return;
    zoomAroundScreenPoint(-1, mapCanvas.clientWidth / 2, mapCanvas.clientHeight / 2);
  });

  setupInteractions();

  return {
    activateWorldView,
    showMapView,
    setCurrentUser,
    setPortals,
    setHomePortal,
    focusDefault,
    setStatus,
    setHomeAssignmentReady,
    selectPortal,
    render
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLng(value: number) {
  let lng = value;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return lng;
}

function latLngToWorldPixel(latLng: LatLng, zoom: number) {
  const sin = Math.sin((latLng.lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((latLng.lng + 180) / 360) * scale;
  const y =
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPixelToLatLng(pixel: { x: number; y: number }, zoom: number): LatLng {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (pixel.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pixel.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: clamp(lat, -85, 85), lng: normalizeLng(lng) };
}
