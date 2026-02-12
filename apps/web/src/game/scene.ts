import * as THREE from "three";
import type { PlayerPayload, PlayerState } from "../lib/types";

type PlayerBadge = {
  sprite: any;
  setIdentity: (name: string | null, avatarUrl: string | null) => void;
  dispose: () => void;
};

type RemotePlayer = {
  mesh: any;
  badge: PlayerBadge;
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

  function getInitials(name: string) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
    return (words[0]!.slice(0, 1) + words[1]!.slice(0, 1)).toUpperCase();
  }

  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createBadgeSprite(fallbackColor: any): PlayerBadge {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create badge canvas context");
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.9, 0.95, 1);
    sprite.position.set(0, playerRadius + 1.1, 0);
    sprite.renderOrder = 10;

    let identityName = "Player";
    let identityAvatarUrl: string | null = null;
    let drawVersion = 0;

    const draw = (avatarImage?: HTMLImageElement) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawRoundedRect(ctx, 12, 24, 232, 80, 20);
      ctx.fillStyle = "rgba(8, 14, 24, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "rgba(100, 186, 232, 0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(52, 64, 24, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarImage) {
        ctx.drawImage(avatarImage, 28, 40, 48, 48);
      } else {
        ctx.fillStyle = `#${fallbackColor.getHexString()}`;
        ctx.fillRect(28, 40, 48, 48);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px Space Grotesk, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(getInitials(identityName), 52, 64);
      }

      ctx.restore();

      ctx.fillStyle = "#e9f5ff";
      ctx.font = "600 22px Space Grotesk, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = identityName.length > 16 ? `${identityName.slice(0, 15)}…` : identityName;
      ctx.fillText(label, 88, 64);

      texture.needsUpdate = true;
    };

    function setIdentity(name: string | null, avatarUrl: string | null) {
      identityName = name?.trim() || "Player";
      identityAvatarUrl = avatarUrl;

      const version = ++drawVersion;
      if (!identityAvatarUrl) {
        draw();
        return;
      }

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (version !== drawVersion) return;
        draw(image);
      };
      image.onerror = () => {
        if (version !== drawVersion) return;
        draw();
      };
      image.src = identityAvatarUrl;

      draw();
    }

    function dispose() {
      texture.dispose();
      material.dispose();
    }

    setIdentity("Player", null);

    return {
      sprite,
      setIdentity,
      dispose
    };
  }

  const localBadge = createBadgeSprite(new THREE.Color(0x2ce1ff));
  localPlayer.add(localBadge.sprite);

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

    const color = colorFromId(clientId);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(playerRadius, 20, 20),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.05
      })
    );

    mesh.position.set(0, playerRadius, 0);
    scene.add(mesh);

    const badge = createBadgeSprite(color);
    mesh.add(badge.sprite);

    const player: RemotePlayer = {
      mesh,
      badge,
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

    player.badge.dispose();
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
    remote.badge.setIdentity(payload.name, payload.avatarUrl);
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

  function setLocalIdentity(name: string | null, avatarUrl: string | null) {
    localBadge.setIdentity(name, avatarUrl);
  }

  function forceSyncLocalState() {
    maybeSendLocalState(true);
  }

  return {
    start,
    setSelfClientId,
    setLocalIdentity,
    forceSyncLocalState,
    applyRemoteSnapshot,
    applyRemoteUpdate: applyRemotePlayerState,
    removeRemotePlayer
  };
}
