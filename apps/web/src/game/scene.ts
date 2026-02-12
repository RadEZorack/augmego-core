import * as THREE from "three";
import type { PlayerPayload, PlayerState } from "../lib/types";

type RemotePlayer = {
  mesh: any;
  targetPosition: any;
  targetRotationY: number;
};

type GameSceneOptions = {
  mount: HTMLElement;
  playerRadius?: number;
  playerSpeed?: number;
  onLocalStateChange?: (state: PlayerState, force: boolean) => void;
};

export function createGameScene(options: GameSceneOptions) {
  const playerRadius = options.playerRadius ?? 0.35;
  const playerSpeed = options.playerSpeed ?? 3;
  const networkSendIntervalMs = 100;

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
  options.mount.appendChild(renderer.domElement);

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
    new THREE.SphereGeometry(playerRadius, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x2ce1ff,
      roughness: 0.25,
      metalness: 0.15
    })
  );
  localPlayer.position.set(0, playerRadius, 0);
  scene.add(localPlayer);

  const targetPosition = localPlayer.position.clone();

  function getLocalState(): PlayerState {
    return {
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
  }

  function maybeSendLocalState(force = false) {
    const now = performance.now();
    const movedEnough =
      localPlayer.position.distanceToSquared(lastSentPosition) > 0.0004;
    const rotatedEnough =
      Math.abs(localPlayer.rotation.y - lastSentRotationY) > 0.015;
    const canSendByTime = now - lastSentAt >= networkSendIntervalMs;

    if (!force && (!canSendByTime || (!movedEnough && !rotatedEnough))) {
      return;
    }

    options.onLocalStateChange?.(getLocalState(), force);
    lastSentAt = now;
    lastSentPosition.copy(localPlayer.position);
    lastSentRotationY = localPlayer.rotation.y;
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
      new THREE.SphereGeometry(playerRadius, 20, 20),
      new THREE.MeshStandardMaterial({
        color: colorFromId(clientId),
        roughness: 0.35,
        metalness: 0.05
      })
    );

    mesh.position.set(0, playerRadius, 0);
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
      playerRadius,
      payload.state.position.z
    );
    remote.targetRotationY = payload.state.rotation.y;
  }

  function applyRemoteSnapshot(players: PlayerPayload[]) {
    const activeIds = new Set<string>();

    for (const player of players) {
      activeIds.add(player.clientId);
      applyRemotePlayerState(player);
    }

    for (const clientId of remotePlayers.keys()) {
      if (!activeIds.has(clientId)) {
        removeRemotePlayer(clientId);
      }
    }
  }

  function updateRemotePlayers(deltaSeconds: number) {
    const blend = Math.min(1, deltaSeconds * 8);
    for (const remote of remotePlayers.values()) {
      remote.mesh.position.lerp(remote.targetPosition, blend);
      remote.mesh.rotation.y +=
        (remote.targetRotationY - remote.mesh.rotation.y) * blend;
    }
  }

  function moveLocalPlayer(deltaSeconds: number) {
    const toTarget = new THREE.Vector3(
      targetPosition.x - localPlayer.position.x,
      0,
      targetPosition.z - localPlayer.position.z
    );
    const distance = toTarget.length();
    if (distance <= 0.0001) return;

    const step = Math.min(distance, playerSpeed * deltaSeconds);
    toTarget.normalize();
    localPlayer.position.addScaledVector(toTarget, step);
    localPlayer.position.y = playerRadius;
    localPlayer.rotation.y = Math.atan2(toTarget.x, toTarget.z);

    maybeSendLocalState();
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

    targetPosition.set(hitPoint.x, playerRadius, hitPoint.z);
  }

  function onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

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

  function start() {
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("pointerdown", handleWorldClick);
    animate();
  }

  function setSelfClientId(clientId: string | null) {
    selfClientId = clientId;
  }

  function forceSyncLocalState() {
    maybeSendLocalState(true);
  }

  return {
    start,
    setSelfClientId,
    forceSyncLocalState,
    applyRemoteSnapshot,
    applyRemoteUpdate: applyRemotePlayerState,
    removeRemotePlayer
  };
}
