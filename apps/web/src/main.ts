/// <reference types="vite/client" />
import "./style.css";
import * as THREE from "three";

const app = document.getElementById("app");

if (!app) {
  throw new Error("#app not found");
}

const loginLinkedinButton = document.getElementById(
  "login-linkedin"
) as HTMLButtonElement | null;
const loginGoogleButton = document.getElementById(
  "login-google"
) as HTMLButtonElement | null;
const loginAppleButton = document.getElementById(
  "login-apple"
) as HTMLButtonElement | null;
const logoutButton = document.getElementById(
  "logout-button"
) as HTMLButtonElement | null;
const userAvatar = document.getElementById(
  "user-avatar"
) as HTMLImageElement | null;
const chatLog = document.getElementById("chat-log") as HTMLDivElement | null;
const chatStatus = document.getElementById("chat-status") as HTMLSpanElement | null;
const chatForm = document.getElementById("chat-form") as HTMLFormElement | null;
const chatInput = document.getElementById("chat-input") as HTMLInputElement | null;
const chatSendButton = document.getElementById("chat-send") as HTMLButtonElement | null;
const apiBase = import.meta.env.VITE_API_BASE_URL;
const wsBase = import.meta.env.VITE_WS_URL;

const PLAYER_RADIUS = 0.35;
const PLAYER_SPEED = 3;
const NETWORK_SEND_INTERVAL_MS = 100;

type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

type PlayerState = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  inventory: string[];
  updatedAt: string;
};

type PlayerPayload = {
  clientId: string;
  userId: string | null;
  name: string | null;
  state: PlayerState;
};

type RemotePlayer = {
  mesh: any;
  targetPosition: any;
  targetRotationY: number;
};

let currentUser: CurrentUser | null = null;
let chatSocket: WebSocket | null = null;
let chatReconnectTimer: number | null = null;
let selfClientId: string | null = null;
let lastSentAt = 0;
let lastSentPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
let lastSentRotationY = Infinity;

const remotePlayers = new Map<string, RemotePlayer>();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0b0f1a, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 6, 7);

const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(5, 10, 7.5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({
    color: 0x172033,
    roughness: 0.95,
    metalness: 0
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);
scene.add(new THREE.GridHelper(50, 50, 0x32557f, 0x1b2d45));

const localPlayer = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_RADIUS, 24, 24),
  new THREE.MeshStandardMaterial({
    color: 0x2ce1ff,
    roughness: 0.25,
    metalness: 0.15
  })
);
localPlayer.position.set(0, PLAYER_RADIUS, 0);
scene.add(localPlayer);

const targetPosition = localPlayer.position.clone();

function apiUrl(path: string) {
  const base = apiBase && apiBase.length > 0 ? apiBase : window.location.origin;
  return new URL(path, base).toString();
}

function displayName(user: CurrentUser) {
  return user.name ?? user.email ?? "User";
}

function updateAuthButtons() {
  if (currentUser) {
    if (logoutButton) {
      logoutButton.textContent = `Log out ${displayName(currentUser)}`;
      logoutButton.style.display = "inline-flex";
    }
    if (loginLinkedinButton) loginLinkedinButton.style.display = "none";
    if (loginGoogleButton) loginGoogleButton.style.display = "none";
    if (loginAppleButton) loginAppleButton.style.display = "none";
    if (userAvatar) {
      userAvatar.src = currentUser.avatarUrl ?? "";
      userAvatar.alt = currentUser.avatarUrl
        ? `${displayName(currentUser)} avatar`
        : "";
      userAvatar.style.display = currentUser.avatarUrl ? "block" : "none";
    }
  } else {
    if (logoutButton) logoutButton.style.display = "none";
    if (loginLinkedinButton) loginLinkedinButton.style.display = "inline-flex";
    if (loginGoogleButton) loginGoogleButton.style.display = "inline-flex";
    if (loginAppleButton) loginAppleButton.style.display = "inline-flex";
    if (userAvatar) {
      userAvatar.removeAttribute("src");
      userAvatar.alt = "";
      userAvatar.style.display = "none";
    }
  }
}

function updateChatComposerState() {
  const canPost = Boolean(currentUser);

  if (chatInput) {
    chatInput.disabled = !canPost;
    chatInput.placeholder = canPost ? "Type a message" : "Sign in to chat";
  }
  if (chatSendButton) {
    chatSendButton.disabled = !canPost;
  }
}

function setChatStatus(text: string) {
  if (chatStatus) {
    chatStatus.textContent = text;
  }
}

function appendChatMessage(message: ChatMessage) {
  if (!chatLog) return;

  const row = document.createElement("div");
  row.className = "chat-row";
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  row.textContent = `[${timestamp}] ${message.user.name}: ${message.text}`;
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;

  while (chatLog.childElementCount > 150) {
    chatLog.removeChild(chatLog.firstElementChild as Node);
  }
}

function resolveWsUrl() {
  if (wsBase && wsBase.length > 0) return wsBase;

  if (apiBase && apiBase.length > 0) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/v1/ws";
    url.search = "";
    return url.toString();
  }

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/v1/ws";
  url.search = "";
  return url.toString();
}

function colorFromId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return new THREE.Color(`hsl(${hue}, 80%, 58%)`);
}

function ensureRemotePlayer(clientId: string) {
  const existing = remotePlayers.get(clientId);
  if (existing) return existing;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLAYER_RADIUS, 20, 20),
    new THREE.MeshStandardMaterial({
      color: colorFromId(clientId),
      roughness: 0.35,
      metalness: 0.05
    })
  );
  mesh.position.set(0, PLAYER_RADIUS, 0);
  scene.add(mesh);

  const player: RemotePlayer = {
    mesh,
    targetPosition: mesh.position.clone(),
    targetRotationY: 0
  };
  remotePlayers.set(clientId, player);
  return player;
}

function removeRemotePlayer(clientId: string) {
  const player = remotePlayers.get(clientId);
  if (!player) return;

  scene.remove(player.mesh);
  player.mesh.geometry.dispose();
  const material = player.mesh.material;
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
  } else {
    material.dispose();
  }

  remotePlayers.delete(clientId);
}

function applyRemotePlayerState(payload: PlayerPayload) {
  if (selfClientId && payload.clientId === selfClientId) return;

  const remote = ensureRemotePlayer(payload.clientId);
  remote.targetPosition.set(
    payload.state.position.x,
    PLAYER_RADIUS,
    payload.state.position.z
  );
  remote.targetRotationY = payload.state.rotation.y;
}

function updateRemotePlayers(deltaSeconds: number) {
  const blend = Math.min(1, deltaSeconds * 8);
  for (const remote of remotePlayers.values()) {
    remote.mesh.position.lerp(remote.targetPosition, blend);
    remote.mesh.rotation.y +=
      (remote.targetRotationY - remote.mesh.rotation.y) * blend;
  }
}

function sendLocalPlayerState(force = false) {
  if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;

  const now = performance.now();
  const movedEnough =
    localPlayer.position.distanceToSquared(lastSentPosition) > 0.0004;
  const rotatedEnough = Math.abs(localPlayer.rotation.y - lastSentRotationY) > 0.015;
  const canSendByTime = now - lastSentAt >= NETWORK_SEND_INTERVAL_MS;

  if (!force && (!canSendByTime || (!movedEnough && !rotatedEnough))) {
    return;
  }

  const state: PlayerState = {
    position: {
      x: localPlayer.position.x,
      y: localPlayer.position.y,
      z: localPlayer.position.z
    },
    rotation: {
      x: localPlayer.rotation.x,
      y: localPlayer.rotation.y,
      z: localPlayer.rotation.z
    },
    inventory: [],
    updatedAt: new Date().toISOString()
  };

  chatSocket.send(
    JSON.stringify({
      type: "player:update",
      state
    })
  );

  lastSentAt = now;
  lastSentPosition.copy(localPlayer.position);
  lastSentRotationY = localPlayer.rotation.y;
}

function moveLocalPlayer(deltaSeconds: number) {
  const toTarget = new THREE.Vector3(
    targetPosition.x - localPlayer.position.x,
    0,
    targetPosition.z - localPlayer.position.z
  );
  const distance = toTarget.length();
  if (distance <= 0.0001) return;

  const step = Math.min(distance, PLAYER_SPEED * deltaSeconds);
  toTarget.normalize();
  localPlayer.position.addScaledVector(toTarget, step);
  localPlayer.position.y = PLAYER_RADIUS;
  localPlayer.rotation.y = Math.atan2(toTarget.x, toTarget.z);

  sendLocalPlayerState();
}

function handleWorldClick(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(floor, false);
  if (intersections.length === 0) return;

  const hitPoint = intersections[0]?.point;
  if (!hitPoint) return;

  targetPosition.set(hitPoint.x, PLAYER_RADIUS, hitPoint.z);
}

function connectChatSocket() {
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) return;
  if (chatSocket && chatSocket.readyState === WebSocket.CONNECTING) return;

  setChatStatus("Connecting...");
  const socket = new WebSocket(resolveWsUrl());
  chatSocket = socket;

  socket.addEventListener("open", () => {
    setChatStatus("Connected");
  });

  socket.addEventListener("message", (event) => {
    let payload: unknown;
    try {
      payload = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (!payload || typeof payload !== "object") return;

    const data = payload as {
      type?: string;
      code?: string;
      clientId?: string;
      message?: ChatMessage;
      messages?: ChatMessage[];
      player?: PlayerPayload;
      players?: PlayerPayload[];
    };

    if (data.type === "session:info") {
      selfClientId = data.clientId ?? null;
      sendLocalPlayerState(true);
      return;
    }

    if (data.type === "chat:history" && Array.isArray(data.messages)) {
      if (chatLog) chatLog.innerHTML = "";
      for (const message of data.messages) {
        appendChatMessage(message);
      }
      return;
    }

    if (data.type === "chat:new" && data.message) {
      appendChatMessage(data.message);
      return;
    }

    if (data.type === "player:snapshot" && Array.isArray(data.players)) {
      const activeIds = new Set<string>();
      for (const player of data.players) {
        activeIds.add(player.clientId);
        applyRemotePlayerState(player);
      }
      for (const clientId of remotePlayers.keys()) {
        if (!activeIds.has(clientId)) {
          removeRemotePlayer(clientId);
        }
      }
      return;
    }

    if (data.type === "player:update" && data.player) {
      applyRemotePlayerState(data.player);
      return;
    }

    if (data.type === "player:leave" && data.clientId) {
      removeRemotePlayer(data.clientId);
      return;
    }

    if (data.type === "error" && data.code === "AUTH_REQUIRED") {
      setChatStatus("Sign in to send messages");
    }
  });

  socket.addEventListener("close", () => {
    setChatStatus("Disconnected");
    selfClientId = null;

    if (chatReconnectTimer !== null) {
      window.clearTimeout(chatReconnectTimer);
    }
    chatReconnectTimer = window.setTimeout(() => {
      connectChatSocket();
    }, 1500);
  });

  socket.addEventListener("error", () => {
    setChatStatus("Connection error");
  });
}

async function loadCurrentUser() {
  try {
    const response = await fetch(apiUrl("/api/v1/auth/me"), {
      credentials: "include"
    });
    if (!response.ok) {
      currentUser = null;
      updateAuthButtons();
      return;
    }
    const data = (await response.json()) as { user: CurrentUser | null };
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  updateAuthButtons();
  updateChatComposerState();
}

if (loginLinkedinButton) {
  loginLinkedinButton.addEventListener("click", () => {
    window.location.href = apiUrl("/api/v1/auth/linkedin");
  });
}

if (loginGoogleButton) {
  loginGoogleButton.addEventListener("click", () => {
    window.location.href = apiUrl("/api/v1/auth/google");
  });
}

if (loginAppleButton) {
  loginAppleButton.addEventListener("click", () => {
    window.location.href = apiUrl("/api/v1/auth/apple");
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await fetch(apiUrl("/api/v1/auth/logout"), {
        method: "POST",
        credentials: "include"
      });
    } finally {
      currentUser = null;
      updateAuthButtons();
      updateChatComposerState();
    }
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!chatInput || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const text = chatInput.value.trim();
    if (!text || !currentUser) return;

    chatSocket.send(
      JSON.stringify({
        type: "chat:send",
        text
      })
    );
    chatInput.value = "";
  });
}

void loadCurrentUser();
connectChatSocket();

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", onResize);
renderer.domElement.addEventListener("pointerdown", handleWorldClick);

function animate() {
  const deltaSeconds = clock.getDelta();

  moveLocalPlayer(deltaSeconds);
  updateRemotePlayers(deltaSeconds);

  camera.position.x = localPlayer.position.x;
  camera.position.z = localPlayer.position.z + 7;
  camera.lookAt(localPlayer.position.x, 0, localPlayer.position.z);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
