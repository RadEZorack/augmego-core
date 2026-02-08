import * as THREE from "three";

const app = document.getElementById("app");

if (!app) {
  throw new Error("#app not found");
}

const loginButton = document.getElementById("login-button");
/** @typedef {{ id: string, name: string | null, email: string | null, avatarUrl: string | null }} CurrentUser */

/** @type {CurrentUser | null} */
let currentUser = null;

/** @param {CurrentUser} user */
function displayName(user) {
  return user.name ?? user.email ?? "User";
}

function updateAuthButton() {
  if (!loginButton) return;
  if (currentUser) {
    loginButton.textContent = `Log out ${displayName(currentUser)}`;
  } else {
    loginButton.textContent = "Login with LinkedIn";
  }
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/v1/auth/me", {
      credentials: "include"
    });
    if (!response.ok) {
      currentUser = null;
      updateAuthButton();
      return;
    }
    /** @type {{ user: CurrentUser | null }} */
    const data = await response.json();
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  updateAuthButton();
}

if (loginButton) {
  loginButton.addEventListener("click", async () => {
    if (!currentUser) {
      window.location.href = "/api/v1/auth/linkedin";
      return;
    }

    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } finally {
      currentUser = null;
      updateAuthButton();
    }
  });

  void loadCurrentUser();
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
