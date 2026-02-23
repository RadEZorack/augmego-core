import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  PlayerPayload,
  PlayerState,
  WorldPhotoWall,
  WorldPost,
  WorldState
} from "../lib/types";

type PlayerBadge = {
  sprite: any;
  setIdentity: (name: string | null, avatarUrl: string | null) => void;
  setMediaState: (micMuted: boolean, cameraEnabled: boolean) => void;
  setMediaStream: (stream: MediaStream | null, muted: boolean) => void;
  renderFrame: () => void;
  dispose: () => void;
};

type RemotePlayer = {
  mesh: any;
  badge: PlayerBadge;
  inviteButton: any;
  targetPosition: any;
  targetRotationY: number;
};

type GameSceneOptions = {
  mount: HTMLElement;
  playerRadius?: number;
  playerSpeed?: number;
  onLocalStateChange?: (state: PlayerState, force: boolean) => void;
  onRemoteInviteClick?: (clientId: string) => void;
  canShowRemoteInvite?: (clientId: string) => boolean;
  onWorldPlacementSelect?: (placementId: string) => void;
  onWorldPhotoWallSelect?: (photoWallId: string) => void;
  onWorldPostSelect?: (postId: string) => void;
  onWorldPostToggleMinimize?: (postId: string) => void;
  onWorldPostOpenComments?: (postId: string) => void;
  onWorldPlacementRequest?: (
    position: { x: number; y: number; z: number }
  ) => boolean;
  onWorldPhotoWallPlacementRequest?: (
    position: { x: number; y: number; z: number }
  ) => boolean;
  onWorldPostPlacementRequest?: (
    position: { x: number; y: number; z: number }
  ) => boolean;
};

type CameraControlState = {
  zoom: number;
  rotateY: number;
  rotateZ: number;
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
  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const worldRoot = new THREE.Group();
  const transientRoot = new THREE.Group();
  const cameraOffsetBase = new THREE.Vector3(0, 6, 7);
  const cameraOffset = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const modelTemplateCache = new Map<string, Promise<any>>();
  const imageTextureCache = new Map<string, Promise<any>>();
  const loadingSpinners = new Set<any>();
  let worldState: WorldState | null = null;
  let worldRenderEpoch = 0;
  let pendingWorldPostSpinner: any | null = null;
  let cameraControls: CameraControlState = {
    zoom: 1,
    rotateY: 0,
    rotateZ: 0
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0b0f1a, 1);
  options.mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(worldRoot);
  scene.add(transientRoot);

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

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function setCameraControls(next: Partial<CameraControlState>) {
    cameraControls = {
      zoom: clamp(next.zoom ?? cameraControls.zoom, 0.5, 3),
      rotateY: clamp(next.rotateY ?? cameraControls.rotateY, -180, 180),
      rotateZ: clamp(next.rotateZ ?? cameraControls.rotateZ, -75, 75)
    };
    return { ...cameraControls };
  }

  function getCameraControls() {
    return { ...cameraControls };
  }

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
    let avatarImage: HTMLImageElement | null = null;
    let mediaVideo: HTMLVideoElement | null = null;
    let micMuted = false;
    let cameraEnabled = true;
    let drawVersion = 0;
    let dirty = true;

    const draw = () => {
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

      if (cameraEnabled && mediaVideo && mediaVideo.readyState >= 2) {
        const srcWidth = mediaVideo.videoWidth || 48;
        const srcHeight = mediaVideo.videoHeight || 48;
        const side = Math.min(srcWidth, srcHeight);
        const sx = Math.max(0, (srcWidth - side) / 2);
        const sy = Math.max(0, (srcHeight - side) / 2);
        ctx.drawImage(mediaVideo, sx, sy, side, side, 28, 40, 48, 48);
      } else if (avatarImage) {
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

      if (micMuted) {
        ctx.beginPath();
        ctx.arc(72, 42, 10, 0, Math.PI * 2);
        ctx.fillStyle = "#d9534f";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px Space Grotesk, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("M", 72, 42);
      }

      ctx.fillStyle = "#e9f5ff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const maxLabelWidth = 146;
      let fontSize = 22;
      const minFontSize = 12;
      const label = identityName;
      while (fontSize > minFontSize) {
        ctx.font = `600 ${fontSize}px Space Grotesk, sans-serif`;
        if (ctx.measureText(label).width <= maxLabelWidth) {
          break;
        }
        fontSize -= 1;
      }
      ctx.font = `600 ${fontSize}px Space Grotesk, sans-serif`;
      ctx.fillText(label, 88, 64);

      texture.needsUpdate = true;
      dirty = false;
    };

    function setIdentity(name: string | null, avatarUrl: string | null) {
      identityName = name?.trim() || "Player";
      identityAvatarUrl = avatarUrl;
      avatarImage = null;

      const version = ++drawVersion;
      if (!identityAvatarUrl) {
        dirty = true;
        return;
      }

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (version !== drawVersion) return;
        avatarImage = image;
        dirty = true;
      };
      image.onerror = () => {
        if (version !== drawVersion) return;
        dirty = true;
      };
      image.src = identityAvatarUrl;
      dirty = true;
    }

    function setMediaStream(stream: MediaStream | null, muted: boolean) {
      if (!stream) {
        if (mediaVideo) {
          mediaVideo.pause();
          mediaVideo.srcObject = null;
        }
        mediaVideo = null;
        dirty = true;
        return;
      }

      if (!mediaVideo) {
        mediaVideo = document.createElement("video");
        mediaVideo.autoplay = true;
        mediaVideo.playsInline = true;
      }

      mediaVideo.muted = muted;
      mediaVideo.srcObject = stream;
      void mediaVideo.play().catch(() => {
        // autoplay can fail until user interaction
      });
      dirty = true;
    }

    function setMediaState(nextMicMuted: boolean, nextCameraEnabled: boolean) {
      micMuted = nextMicMuted;
      cameraEnabled = nextCameraEnabled;
      dirty = true;
    }

    function renderFrame() {
      if (mediaVideo && mediaVideo.readyState >= 2) {
        draw();
        return;
      }

      if (dirty) {
        draw();
      }
    }

    function dispose() {
      if (mediaVideo) {
        mediaVideo.pause();
        mediaVideo.srcObject = null;
        mediaVideo = null;
      }
      texture.dispose();
      material.dispose();
    }

    setIdentity("Player", null);

    return {
      sprite,
      setIdentity,
      setMediaState,
      setMediaStream,
      renderFrame,
      dispose
    };
  }

  function createInviteButtonSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create invite button canvas context");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(9, 43, 34, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(92, 245, 174, 0.95)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#dffff2";
    ctx.font = "600 38px Space Grotesk, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.38, 0.38, 1);
    sprite.position.set(0.86, playerRadius + 1.35, 0);
    sprite.renderOrder = 12;
    return sprite;
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
    const inviteButton = createInviteButtonSprite();
    inviteButton.visible = false;
    inviteButton.userData = {
      type: "invite-button",
      clientId
    };
    mesh.add(inviteButton);

    const player: RemotePlayer = {
      mesh,
      badge,
      inviteButton,
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

    const inviteMaterial = player.inviteButton.material;
    if (inviteMaterial.map) inviteMaterial.map.dispose();
    inviteMaterial.dispose();

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
    remote.badge.setMediaState(payload.micMuted === true, payload.cameraEnabled !== false);
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

  function clearWorldModels() {
    while (worldRoot.children.length > 0) {
      const child = worldRoot.children[0];
      if (!child) break;
      worldRoot.remove(child);
      child.traverse((node: any) => {
        if (node.geometry) node.geometry.dispose();
        const material = node.material;
        if (Array.isArray(material)) {
          for (const item of material) {
            if (item?.map) item.map.dispose();
            item.dispose();
          }
        } else if (material) {
          if (material.map) material.map.dispose();
          material.dispose();
        }
      });
    }
    loadingSpinners.clear();
    imageTextureCache.clear();
  }

  function createWorldLoadingSpinner() {
    const spinner = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.06, 12, 28),
      new THREE.MeshStandardMaterial({
        color: 0x84d7ff,
        emissive: 0x10394e,
        roughness: 0.35,
        metalness: 0.2
      })
    );
    ring.rotation.x = Math.PI / 2;
    spinner.add(ring);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x2f6078,
        roughness: 0.2,
        metalness: 0.1
      })
    );
    marker.position.set(0.45, 0, 0);
    spinner.add(marker);

    loadingSpinners.add(spinner);
    return spinner;
  }

  function disposeObject3D(root: any) {
    root.traverse((node: any) => {
      if (node.geometry) node.geometry.dispose();
      const material = node.material;
      if (Array.isArray(material)) {
        for (const item of material) {
          if (item?.map) item.map.dispose();
          item.dispose();
        }
      } else if (material) {
        if (material.map) material.map.dispose();
        material.dispose();
      }
    });
  }

  function setPendingWorldPostPlacement(position: { x: number; y: number; z: number } | null) {
    if (!position) {
      if (pendingWorldPostSpinner) {
        transientRoot.remove(pendingWorldPostSpinner);
        loadingSpinners.delete(pendingWorldPostSpinner);
        disposeObject3D(pendingWorldPostSpinner);
        pendingWorldPostSpinner = null;
      }
      return;
    }

    if (!pendingWorldPostSpinner) {
      pendingWorldPostSpinner = createWorldLoadingSpinner();
      pendingWorldPostSpinner.scale.set(0.7, 0.7, 0.7);
      transientRoot.add(pendingWorldPostSpinner);
    }
    pendingWorldPostSpinner.position.set(position.x, position.y, position.z);
  }

  function updateLoadingSpinners(deltaSeconds: number) {
    for (const spinner of loadingSpinners) {
      spinner.rotation.y += deltaSeconds * 3.2;
      spinner.rotation.x += deltaSeconds * 0.8;
    }
  }

  function loadModelTemplate(url: string) {
    const cached = modelTemplateCache.get(url);
    if (cached) return cached;

    const promise = new Promise<any>((resolve) => {
      gltfLoader.load(
        url,
        (gltf: any) => {
          resolve(gltf.scene);
        },
        undefined,
        () => resolve(null)
      );
    });
    modelTemplateCache.set(url, promise);
    return promise;
  }

  function loadImageTexture(url: string) {
    const cached = imageTextureCache.get(url);
    if (cached) return cached;
    const promise = new Promise<any>((resolve) => {
      textureLoader.load(
        url,
        (texture: any) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        },
        undefined,
        () => resolve(null)
      );
    });
    imageTextureCache.set(url, promise);
    return promise;
  }

  async function createPhotoWallMesh(photoWall: WorldPhotoWall, renderEpoch: number) {
    const group = new THREE.Group();
    group.position.set(photoWall.position.x, photoWall.position.y, photoWall.position.z);
    group.rotation.set(photoWall.rotation.x, photoWall.rotation.y, photoWall.rotation.z);
    group.scale.set(photoWall.scale.x, photoWall.scale.y, photoWall.scale.z);
    group.userData = { photoWallId: photoWall.id, type: "world-photo-wall" };

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.75, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x0f1727,
        roughness: 0.75,
        metalness: 0.05
      })
    );
    backing.userData = { photoWallId: photoWall.id };
    group.add(backing);

    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.71),
      new THREE.MeshBasicMaterial({
        color: 0x22344c,
        transparent: false
      })
    );
    front.position.z = 0.026;
    front.userData = { photoWallId: photoWall.id, type: "world-photo-wall-face" };
    group.add(front);

    const texture = await loadImageTexture(photoWall.imageUrl);
    if (renderEpoch !== worldRenderEpoch) {
      disposeObject3D(group);
      return null;
    }
    if (texture && front.material) {
      const material = front.material as any;
      if (material.map) material.map.dispose();
      material.map = texture;
      material.color = new THREE.Color(0xffffff);
      material.needsUpdate = true;
    }

    return group;
  }

  function createPostControlButtonSprite(options: {
    postId: string;
    action: "toggle-minimize" | "open-comments";
    label: string;
    width?: number;
    height?: number;
    fontSize?: number;
    rounded?: number;
  }) {
    const canvas = document.createElement("canvas");
    canvas.width = options.width ?? 96;
    canvas.height = options.height ?? 96;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create post control canvas context");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    if ((options.width ?? 96) === (options.height ?? 96)) {
      ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2 - 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(8, 14, 24, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(123, 201, 255, 0.8)";
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      drawRoundedRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, options.rounded ?? 18);
      ctx.fillStyle = "rgba(8, 14, 24, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(123, 201, 255, 0.8)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = "#e8f5ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${options.fontSize ?? 34}px Space Grotesk, sans-serif`;
    ctx.fillText(options.label, canvas.width / 2, canvas.height / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    const defaultScaleX = (options.width ?? 96) / 250;
    const defaultScaleY = (options.height ?? 96) / 250;
    sprite.scale.set(defaultScaleX, defaultScaleY, 1);
    sprite.renderOrder = 11;
    sprite.userData = {
      type: "world-post-control",
      action: options.action,
      postId: options.postId
    };
    return sprite;
  }

  function createWorldPostBillboard(post: WorldPost) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = post.isMinimized ? 120 : 740;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create post billboard canvas context");
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const group = new THREE.Group();
    group.position.set(post.position.x, post.position.y, post.position.z);
    group.userData = { postId: post.id, type: "world-post" };

    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 0, 0);
    sprite.renderOrder = 9;
    sprite.scale.set(post.isMinimized ? 2.8 : 3.8, post.isMinimized ? 0.55 : 4.2, 1);
    sprite.userData = { postId: post.id, type: "world-post-body" };
    group.add(sprite);

    const controlButton = createPostControlButtonSprite({
      postId: post.id,
      action: "toggle-minimize",
      label: post.isMinimized ? "+" : "-"
    });
    controlButton.position.set(post.isMinimized ? 1.2 : 1.55, post.isMinimized ? 0.2 : 1.25, 0.01);
    group.add(controlButton);

    if (!post.isMinimized) {
      const commentsButton = createPostControlButtonSprite({
        postId: post.id,
        action: "open-comments",
        label: post.commentCount > 5 ? "Show more" : "Comments",
        width: 220,
        height: 64,
        fontSize: 20
      });
      commentsButton.position.set(0.65, -1.88, 0.01);
      group.add(commentsButton);
    }

    let image: HTMLImageElement | null = null;
    let imageReady = false;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawRoundedRect(ctx, 12, 12, canvas.width - 24, canvas.height - 24, 24);
      ctx.fillStyle = "rgba(8, 14, 24, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(123, 201, 255, 0.55)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#e8f5ff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "600 26px Space Grotesk, sans-serif";
      const authorLabel = `${post.author.name}`;
      ctx.fillText(authorLabel, 32, 44);

      if (post.isMinimized) {
        ctx.fillStyle = "rgba(232, 245, 255, 0.75)";
        ctx.font = "500 20px Space Grotesk, sans-serif";
        const compactText =
          post.message.length > 56 ? `${post.message.slice(0, 56)}...` : post.message;
        ctx.fillText(compactText, 32, 84);
        texture.needsUpdate = true;
        return;
      }

      drawRoundedRect(ctx, 24, 70, canvas.width - 48, 300, 18);
      ctx.fillStyle = "rgba(19, 29, 45, 0.95)";
      ctx.fill();

      if (image && imageReady) {
        const srcWidth = image.naturalWidth || 1;
        const srcHeight = image.naturalHeight || 1;
        const targetX = 24;
        const targetY = 70;
        const targetW = canvas.width - 48;
        const targetH = 300;
        const scale = Math.max(targetW / srcWidth, targetH / srcHeight);
        const drawW = srcWidth * scale;
        const drawH = srcHeight * scale;
        const dx = targetX + (targetW - drawW) / 2;
        const dy = targetY + (targetH - drawH) / 2;
        ctx.save();
        drawRoundedRect(ctx, 24, 70, canvas.width - 48, 300, 18);
        ctx.clip();
        ctx.drawImage(image, dx, dy, drawW, drawH);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(34, 50, 76, 1)";
        ctx.fillRect(24, 70, canvas.width - 48, 300);
        ctx.fillStyle = "rgba(232, 245, 255, 0.75)";
        ctx.font = "500 22px Space Grotesk, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading image...", canvas.width / 2, 220);
        ctx.textAlign = "left";
      }

      const maxWidth = canvas.width - 64;
      const lineHeight = 30;
      let y = 396;
      ctx.fillStyle = "#f3fbff";
      ctx.font = "500 24px Space Grotesk, sans-serif";
      for (const line of wrapText(ctx, post.message, maxWidth, 3)) {
        ctx.fillText(line, 32, y);
        y += lineHeight;
      }

      const commentsTop = 500;
      drawRoundedRect(ctx, 24, commentsTop - 28, canvas.width - 48, 162, 16);
      ctx.fillStyle = "rgba(11, 20, 33, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(123, 201, 255, 0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#cfe8fb";
      ctx.font = "600 18px Space Grotesk, sans-serif";
      ctx.fillText(
        `Comments (${post.commentCount})`,
        36,
        commentsTop - 5
      );

      const preview = post.commentPreview.slice(0, 5);
      if (preview.length === 0) {
        ctx.fillStyle = "rgba(232, 245, 255, 0.72)";
        ctx.font = "500 18px Space Grotesk, sans-serif";
        ctx.fillText("No comments yet", 36, commentsTop + 24);
      } else {
        const fitTextToWidth = (
          text: string,
          maxWidth: number,
          font: string
        ) => {
          ctx.font = font;
          if (ctx.measureText(text).width <= maxWidth) return text;
          let trimmed = text;
          while (trimmed.length > 1) {
            trimmed = trimmed.slice(0, -1);
            const candidate = `${trimmed}...`;
            if (ctx.measureText(candidate).width <= maxWidth) {
              return candidate;
            }
          }
          return "...";
        };
        const nameX = 36;
        const nameColWidth = 104;
        const commentX = nameX + nameColWidth + 14;
        const commentColWidth = canvas.width - commentX - 34;
        let commentY = commentsTop + 18;
        for (const comment of preview) {
          ctx.fillStyle = "#e8f5ff";
          const nameFont = "600 17px Space Grotesk, sans-serif";
          ctx.font = nameFont;
          const name = fitTextToWidth(comment.author.name, nameColWidth, nameFont);
          ctx.fillText(name, nameX, commentY);
          ctx.fillStyle = "rgba(232, 245, 255, 0.78)";
          const commentFont = "500 16px Space Grotesk, sans-serif";
          ctx.font = commentFont;
          const line = fitTextToWidth(comment.message, commentColWidth, commentFont);
          ctx.fillText(line, commentX, commentY);
          commentY += 24;
        }
      }

      drawRoundedRect(ctx, 380, 662, 236, 52, 14);
      ctx.fillStyle = "rgba(18, 40, 61, 0.95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(123, 201, 255, 0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#e8f5ff";
      ctx.textAlign = "center";
      ctx.font = "600 19px Space Grotesk, sans-serif";
      ctx.fillText(
        post.commentCount > 5 ? "Show more comments" : "Open comments",
        498,
        688
      );
      ctx.textAlign = "left";

      texture.needsUpdate = true;
    };

    const wrapText = (
      context: CanvasRenderingContext2D,
      text: string,
      maxWidth: number,
      maxLines: number
    ) => {
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length === 0) return [""];
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (context.measureText(next).width <= maxWidth) {
          current = next;
          continue;
        }
        if (current) {
          lines.push(current);
          current = word;
        } else {
          lines.push(word);
          current = "";
        }
        if (lines.length >= maxLines) break;
      }
      if (lines.length < maxLines && current) {
        lines.push(current);
      }
      if (lines.length > maxLines) {
        lines.length = maxLines;
      }
      if (lines.length === maxLines && words.length > 0) {
        const joined = lines.join(" ");
        if (joined.length < text.length) {
          const lastIndex = lines.length - 1;
          lines[lastIndex] = `${lines[lastIndex]!.replace(/\.\.\.$/, "")}...`;
        }
      }
      return lines;
    };

    draw();

    image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageReady = true;
      draw();
    };
    image.onerror = () => {
      imageReady = false;
      draw();
    };
    image.src = post.imageUrl;

    return group;
  }

  async function renderWorldModels() {
    const renderEpoch = ++worldRenderEpoch;
    clearWorldModels();
    if (!worldState) return;

    const assetById = new Map(worldState.assets.map((asset) => [asset.id, asset]));
    const placements = worldState.placements;

    await Promise.all(
      placements.map(async (placement) => {
        const asset = assetById.get(placement.assetId);
        const modelUrl = asset?.currentVersion?.fileUrl;
        if (!modelUrl) return;

        const spinner = createWorldLoadingSpinner();
        spinner.position.set(
          placement.position.x,
          placement.position.y,
          placement.position.z
        );
        spinner.rotation.set(
          placement.rotation.x,
          placement.rotation.y,
          placement.rotation.z
        );
        spinner.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
        spinner.userData = {
          placementId: placement.id,
          assetId: placement.assetId
        };
        worldRoot.add(spinner);

        const template = await loadModelTemplate(modelUrl);
        if (!template || renderEpoch !== worldRenderEpoch) {
          worldRoot.remove(spinner);
          loadingSpinners.delete(spinner);
          return;
        }

        const instance = template.clone(true);
        instance.position.set(
          placement.position.x,
          placement.position.y,
          placement.position.z
        );
        instance.rotation.set(
          placement.rotation.x,
          placement.rotation.y,
          placement.rotation.z
        );
        instance.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
        instance.userData = {
          placementId: placement.id,
          assetId: placement.assetId
        };
        worldRoot.remove(spinner);
        loadingSpinners.delete(spinner);
        worldRoot.add(instance);
      })
    );

    if (renderEpoch !== worldRenderEpoch) return;
    await Promise.all(
      (worldState.photoWalls ?? []).map(async (photoWall) => {
        const spinner = createWorldLoadingSpinner();
        spinner.position.set(photoWall.position.x, photoWall.position.y, photoWall.position.z);
        spinner.userData = { photoWallId: photoWall.id };
        worldRoot.add(spinner);

        const mesh = await createPhotoWallMesh(photoWall, renderEpoch);
        worldRoot.remove(spinner);
        loadingSpinners.delete(spinner);
        if (!mesh || renderEpoch !== worldRenderEpoch) return;
        worldRoot.add(mesh);
      })
    );
    if (renderEpoch !== worldRenderEpoch) return;
    for (const post of worldState.posts ?? []) {
      const billboard = createWorldPostBillboard(post);
      worldRoot.add(billboard);
    }
  }

  function updateRemotePlayers(deltaSeconds: number) {
    const blend = Math.min(1, deltaSeconds * 8);
    for (const remote of remotePlayers.values()) {
      remote.mesh.position.lerp(remote.targetPosition, blend);
      remote.mesh.rotation.y +=
        (remote.targetRotationY - remote.mesh.rotation.y) * blend;
      remote.inviteButton.visible = options.canShowRemoteInvite?.(
        remote.inviteButton.userData.clientId
      ) ?? false;
      remote.badge.renderFrame();
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
    const inviteIntersections = raycaster.intersectObjects(
      [...remotePlayers.values()].map((remote) => remote.inviteButton),
      false
    );
    const inviteHit = inviteIntersections[0]?.object;
    if (
      inviteHit?.userData?.type === "invite-button" &&
      typeof inviteHit.userData.clientId === "string"
    ) {
      options.onRemoteInviteClick?.(inviteHit.userData.clientId);
      return;
    }

    const modelIntersections = raycaster.intersectObjects(worldRoot.children, true);
    const postControlHit = modelIntersections.find((intersection: any) => {
      let node: any = intersection.object;
      while (node) {
        if (node.userData?.type === "world-post-control") {
          return true;
        }
        node = node.parent;
      }
      return false;
    });

    if (postControlHit) {
      let node: any = postControlHit.object;
      while (node) {
        if (
          node.userData?.type === "world-post-control" &&
          typeof node.userData.postId === "string"
        ) {
          if (node.userData?.action === "toggle-minimize") {
            options.onWorldPostToggleMinimize?.(node.userData.postId);
          } else if (node.userData?.action === "open-comments") {
            options.onWorldPostOpenComments?.(node.userData.postId);
          }
          return;
        }
        node = node.parent;
      }
    }

    const photoWallHit = modelIntersections.find((intersection: any) => {
      let node: any = intersection.object;
      while (node) {
        if (typeof node.userData?.photoWallId === "string") return true;
        node = node.parent;
      }
      return false;
    });
    if (photoWallHit) {
      let node: any = photoWallHit.object;
      while (node) {
        if (typeof node.userData?.photoWallId === "string") {
          options.onWorldPhotoWallSelect?.(node.userData.photoWallId);
          break;
        }
        node = node.parent;
      }
    }

    const placementHit = modelIntersections.find((intersection: any) => {
      let node: any = intersection.object;
      while (node) {
        if (typeof node.userData?.postId === "string") {
          return false;
        }
        if (typeof node.userData?.placementId === "string") {
          return true;
        }
        node = node.parent;
      }
      return false;
    });

    const postHit = modelIntersections.find((intersection: any) => {
      let node: any = intersection.object;
      while (node) {
        if (typeof node.userData?.postId === "string") {
          return true;
        }
        node = node.parent;
      }
      return false;
    });

    if (postHit) {
      let node: any = postHit.object;
      let postIdFromHit: string | null = null;
      while (node) {
        if (typeof node.userData?.postId === "string") {
          postIdFromHit = node.userData.postId;
          break;
        }
        node = node.parent;
      }

      const bodyHitObject = postHit.object as any;
      const uv = postHit.uv as { x: number; y: number } | undefined;
      if (
        uv &&
        bodyHitObject?.userData?.type === "world-post-body" &&
        typeof postIdFromHit === "string"
      ) {
        const post = worldState?.posts.find((item) => item.id === postIdFromHit) ?? null;
        if (post && !post.isMinimized) {
          const canvasW = 640;
          const canvasH = 740;
          const px = uv.x * canvasW;
          const pyA = uv.y * canvasH;
          const pyB = (1 - uv.y) * canvasH;
          const inButtonX = px >= 380 && px <= 616;
          const inButtonY =
            (pyA >= 662 && pyA <= 714) || (pyB >= 662 && pyB <= 714);
          if (inButtonX && inButtonY) {
            options.onWorldPostOpenComments?.(postIdFromHit);
            return;
          }
        }
      }

      node = postHit.object;
      while (node) {
        if (typeof node.userData?.postId === "string") {
          options.onWorldPostSelect?.(node.userData.postId);
          break;
        }
        node = node.parent;
      }
    }

    if (placementHit) {
      let node: any = placementHit.object;
      while (node) {
        if (typeof node.userData?.placementId === "string") {
          options.onWorldPlacementSelect?.(node.userData.placementId);
          break;
        }
        node = node.parent;
      }
    }

    const intersections = raycaster.intersectObject(floor, false);
    if (intersections.length === 0) return;

    const hitPoint = intersections[0]?.point;
    if (!hitPoint) return;

    const consumedByPlacement =
      options.onWorldPhotoWallPlacementRequest?.({
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z
      }) ?? false;
    if (consumedByPlacement) {
      return;
    }

    const consumedByPostPlacement =
      options.onWorldPostPlacementRequest?.({
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z
      }) ?? false;
    if (consumedByPostPlacement) {
      return;
    }

    const consumedByModelPlacement =
      options.onWorldPlacementRequest?.({
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z
      }) ?? false;
    if (consumedByModelPlacement) {
      return;
    }

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
    localBadge.renderFrame();
    updateRemotePlayers(deltaSeconds);
    updateLoadingSpinners(deltaSeconds);

    cameraOffset.copy(cameraOffsetBase).multiplyScalar(cameraControls.zoom);
    cameraOffset.applyAxisAngle(yAxis, THREE.MathUtils.degToRad(cameraControls.rotateY));
    cameraOffset.applyAxisAngle(zAxis, THREE.MathUtils.degToRad(cameraControls.rotateZ));
    camera.position.copy(localPlayer.position).add(cameraOffset);

    cameraTarget.set(localPlayer.position.x, 0, localPlayer.position.z);
    camera.lookAt(cameraTarget);

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

  function setLocalMediaState(micMuted: boolean, cameraEnabled: boolean) {
    localBadge.setMediaState(micMuted, cameraEnabled);
  }

  function setRemoteMediaState(
    clientId: string,
    micMuted: boolean,
    cameraEnabled: boolean
  ) {
    const remote = remotePlayers.get(clientId);
    if (!remote) return;
    remote.badge.setMediaState(micMuted, cameraEnabled);
  }

  function setLocalMediaStream(stream: MediaStream | null) {
    localBadge.setMediaStream(stream, true);
  }

  function setRemoteMediaStream(clientId: string, stream: MediaStream | null) {
    if (!stream) {
      const existing = remotePlayers.get(clientId);
      if (existing) {
        existing.badge.setMediaStream(null, false);
      }
      return;
    }

    const remote = ensureRemotePlayer(clientId);
    remote.badge.setMediaStream(stream, false);
  }

  function forceSyncLocalState() {
    maybeSendLocalState(true);
  }

  function setWorldData(nextWorldState: WorldState | null) {
    worldState = nextWorldState;
    void renderWorldModels();
  }

  return {
    start,
    setSelfClientId,
    setLocalIdentity,
    setLocalMediaState,
    setLocalMediaStream,
    setRemoteMediaState,
    setRemoteMediaStream,
    forceSyncLocalState,
    getCameraControls,
    setCameraControls,
    setWorldData,
    setPendingWorldPostPlacement,
    applyRemoteSnapshot,
    applyRemoteUpdate: applyRemotePlayerState,
    removeRemotePlayer
  };
}
