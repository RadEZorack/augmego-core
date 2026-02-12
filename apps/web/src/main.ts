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

function apiUrl(path: string) {
  const base = apiBase && apiBase.length > 0 ? apiBase : window.location.origin;
  return new URL(path, base).toString();
}

type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

let currentUser: CurrentUser | null = null;
let chatSocket: WebSocket | null = null;
let chatReconnectTimer: number | null = null;

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

function displayName(user: CurrentUser) {
  return user.name ?? user.email ?? "User";
}

function updateAuthButtons() {
  if (currentUser) {
    if (logoutButton) {
      logoutButton.textContent = `Log out ${displayName(currentUser)}`;
      logoutButton.style.display = "inline-flex";
    }
    if (loginLinkedinButton) {
      loginLinkedinButton.style.display = "none";
    }
    if (loginGoogleButton) {
      loginGoogleButton.style.display = "none";
    }
    if (loginAppleButton) {
      loginAppleButton.style.display = "none";
    }
    if (userAvatar) {
      userAvatar.src = currentUser.avatarUrl ?? "";
      userAvatar.alt = currentUser.avatarUrl
        ? `${displayName(currentUser)} avatar`
        : "";
      userAvatar.style.display = currentUser.avatarUrl ? "block" : "none";
    }
  } else {
    if (logoutButton) {
      logoutButton.style.display = "none";
    }
    if (loginLinkedinButton) {
      loginLinkedinButton.style.display = "inline-flex";
    }
    if (loginGoogleButton) {
      loginGoogleButton.style.display = "inline-flex";
    }
    if (loginAppleButton) {
      loginAppleButton.style.display = "inline-flex";
    }
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
      message?: ChatMessage;
      messages?: ChatMessage[];
      code?: string;
    };

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

    if (data.type === "error" && data.code === "AUTH_REQUIRED") {
      setChatStatus("Sign in to send messages");
    }
  });

  socket.addEventListener("close", () => {
    setChatStatus("Disconnected");
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

void loadCurrentUser();
connectChatSocket();

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
camera.position.set(0, 1.2, 4);

const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(5, 10, 7.5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const geometry = new THREE.IcosahedronGeometry(1, 1);
const material = new THREE.MeshStandardMaterial({
  color: 0x2ce1ff,
  roughness: 0.25,
  metalness: 0.2
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", onResize);

function animate() {
  mesh.rotation.y += 0.004;
  mesh.rotation.x += 0.002;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
