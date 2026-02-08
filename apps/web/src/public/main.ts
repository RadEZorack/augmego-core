import * as THREE from "three";
import "./style.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("#app not found");
}

// AUTH LINKEDIN

const loginButton = document.getElementById("login-button");
if (loginButton) {
  loginButton.addEventListener("click", () => {
    window.location.href = "/auth/linkedin";
  });
}

// THREE.JS SCENE SETUP

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
