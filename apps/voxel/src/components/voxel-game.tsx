"use client";

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type BlockColor = "grass" | "stone" | "sand" | "coral" | "sky";
type FaceDirectionName = "px" | "nx" | "py" | "ny" | "pz" | "nz";

type VoxelBlock = {
  color: BlockColor;
  position: [number, number, number];
};

type VoxelMap = Record<string, VoxelBlock>;

type FaceInstance = {
  block: VoxelBlock;
  key: string;
  normal: [number, number, number];
};

type FacesByDirection = Record<FaceDirectionName, FaceInstance[]>;
type FacesByColor = Record<BlockColor, FacesByDirection>;

const BLOCK_COLORS: Record<BlockColor, string> = {
  grass: "#7fb069",
  stone: "#8d99ae",
  sand: "#f2cc8f",
  coral: "#e07a5f",
  sky: "#81b29a",
};

const PALETTE: BlockColor[] = ["grass", "stone", "sand", "coral", "sky"];
const FACE_DIRECTIONS: Array<{
  name: FaceDirectionName;
  normal: [number, number, number];
  positionOffset: [number, number, number];
  rotation: [number, number, number];
}> = [
  { name: "px", normal: [1, 0, 0], positionOffset: [0.5, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { name: "nx", normal: [-1, 0, 0], positionOffset: [-0.5, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { name: "py", normal: [0, 1, 0], positionOffset: [0, 0.5, 0], rotation: [-Math.PI / 2, 0, 0] },
  { name: "ny", normal: [0, -1, 0], positionOffset: [0, -0.5, 0], rotation: [Math.PI / 2, 0, 0] },
  { name: "pz", normal: [0, 0, 1], positionOffset: [0, 0, 0.5], rotation: [0, 0, 0] },
  { name: "nz", normal: [0, 0, -1], positionOffset: [0, 0, -0.5], rotation: [0, Math.PI, 0] },
];
const WORLD_RADIUS = 444;
const GROUND_SIZE = WORLD_RADIUS * 3;
const GRID_SIZE = WORLD_RADIUS * 4;
const FOG_NEAR = Math.max(48, WORLD_RADIUS * 0.7);
const FOG_FAR = Math.max(180, WORLD_RADIUS * 2.4);
const CAMERA_DISTANCE = Math.max(26, WORLD_RADIUS * 0.95);
const CAMERA_HEIGHT = Math.max(24, WORLD_RADIUS * 0.7);
const MIN_ZOOM_DISTANCE = Math.max(12, WORLD_RADIUS * 0.08);
const MAX_ZOOM_DISTANCE = Math.max(64, WORLD_RADIUS * 3);

const tempObject = new THREE.Object3D();

function toKey([x, y, z]: [number, number, number]) {
  return `${x},${y},${z}`;
}

function createEmptyFacesByColor(): FacesByColor {
  return {
    grass: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    stone: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    sand: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    coral: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    sky: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
  };
}

function createInitialWorld() {
  const blocks: VoxelMap = {};

  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x += 1) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z += 1) {
      const distance = Math.sqrt(x * x + z * z);
      const ridge = Math.sin(x * 0.28) * 1.8 + Math.cos(z * 0.24) * 1.4;
      const dunes = Math.sin((x + z) * 0.16) * 1.2 + Math.cos((x - z) * 0.12) * 0.8;
      const plateau = Math.max(0, 8.5 - distance * 0.2);
      const height = Math.max(1, Math.round(plateau + ridge + dunes));

      for (let y = 0; y < height; y += 1) {
        const isTop = y === height - 1;
        const nearEdge = distance > WORLD_RADIUS - 5;
        const color: BlockColor = isTop ? (nearEdge || height <= 3 ? "sand" : "grass") : "stone";
        const position: [number, number, number] = [x, y, z];
        blocks[toKey(position)] = { color, position };
      }
    }
  }

  for (let x = -WORLD_RADIUS + 4; x <= WORLD_RADIUS - 4; x += 9) {
    for (let z = -WORLD_RADIUS + 4; z <= WORLD_RADIUS - 4; z += 9) {
      const baseHeight = 8 + Math.round(Math.sin(x * 0.21 + z * 0.17) * 2);
      const accentColor: BlockColor = (x + z) % 18 === 0 ? "coral" : "sky";

      for (let y = baseHeight; y < baseHeight + 3; y += 1) {
        const position: [number, number, number] = [x, y, z];
        blocks[toKey(position)] = { color: accentColor, position };
      }
    }
  }

  return blocks;
}

function buildFacesByColor(blocks: VoxelMap) {
  const facesByColor = createEmptyFacesByColor();

  for (const block of Object.values(blocks)) {
    const [x, y, z] = block.position;
    const key = toKey(block.position);

    for (const direction of FACE_DIRECTIONS) {
      const [nx, ny, nz] = direction.normal;
      if (blocks[`${x + nx},${y + ny},${z + nz}`]) {
        continue;
      }

      facesByColor[block.color][direction.name].push({
        block,
        key,
        normal: direction.normal,
      });
    }
  }

  return facesByColor;
}

function countVisibleFaces(facesByColor: FacesByColor) {
  let total = 0;

  for (const color of PALETTE) {
    for (const direction of FACE_DIRECTIONS) {
      total += facesByColor[color][direction.name].length;
    }
  }

  return total;
}

function FaceLayer({
  color,
  direction,
  faces,
  hoveredKey,
  onHover,
  onInteract,
}: {
  color: BlockColor;
  direction: (typeof FACE_DIRECTIONS)[number];
  faces: FaceInstance[];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, face: FaceInstance) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    for (let index = 0; index < faces.length; index += 1) {
      const [x, y, z] = faces[index].block.position;
      const [ox, oy, oz] = direction.positionOffset;
      tempObject.position.set(x + ox, y + oy, z + oz);
      tempObject.rotation.set(...direction.rotation);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(index, tempObject.matrix);
    }

    meshRef.current.count = faces.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [direction.positionOffset, direction.rotation, faces]);

  if (faces.length === 0) {
    return null;
  }

  const hoveredFace = hoveredKey ? faces.find((face) => face.key === hoveredKey) : null;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, faces.length]}
        castShadow
        receiveShadow
        onPointerMove={(event) => {
          event.stopPropagation();
          const instanceId = event.instanceId;
          if (instanceId === undefined) {
            return;
          }

          onHover(faces[instanceId].key);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => {
          event.stopPropagation();
          const instanceId = event.instanceId;
          if (instanceId === undefined) {
            return;
          }

          onInteract(event, faces[instanceId]);
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={BLOCK_COLORS[color]} side={THREE.FrontSide} />
      </instancedMesh>

      {hoveredFace ? (
        <lineSegments position={hoveredFace.block.position}>
          <edgesGeometry args={[new THREE.BoxGeometry(1.04, 1.04, 1.04)]} />
          <lineBasicMaterial color="#fff8e7" />
        </lineSegments>
      ) : null}
    </>
  );
}

function Scene({
  facesByColor,
  hoveredKey,
  onHover,
  onInteract,
}: {
  facesByColor: FacesByColor;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, face: FaceInstance) => void;
}) {
  return (
    <>
      <color attach="background" args={["#07111f"]} />
      <fog attach="fog" args={["#07111f", FOG_NEAR, FOG_FAR]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[18, 28, 12]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <hemisphereLight args={["#d9f0ff", "#16212d", 0.75]} />

      <group position={[0, -0.5, 0]}>
        {PALETTE.flatMap((color) =>
          FACE_DIRECTIONS.map((direction) => (
            <FaceLayer
              key={`${color}-${direction.name}`}
              color={color}
              direction={direction}
              faces={facesByColor[color][direction.name]}
              hoveredKey={hoveredKey}
              onHover={onHover}
              onInteract={onInteract}
            />
          )),
        )}
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]} receiveShadow>
        <circleGeometry args={[GROUND_SIZE, 72]} />
        <meshStandardMaterial color="#0f1b2d" />
      </mesh>
      <gridHelper args={[GRID_SIZE, GRID_SIZE, "#42617e", "#1b3147"]} position={[0, -0.49, 0]} />
      <PerspectiveCamera makeDefault position={[CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_DISTANCE]} fov={54} far={FOG_FAR * 1.8} />
      <OrbitControls enablePan={false} minDistance={MIN_ZOOM_DISTANCE} maxDistance={MAX_ZOOM_DISTANCE} maxPolarAngle={Math.PI / 2.03} />
    </>
  );
}

export function VoxelGame() {
  const [blocks, setBlocks] = useState<VoxelMap>(() => createInitialWorld());
  const [activeColor, setActiveColor] = useState<BlockColor>("grass");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const facesByColor = useMemo(() => buildFacesByColor(blocks), [blocks]);
  const blockCount = useMemo(() => Object.keys(blocks).length, [blocks]);
  const visibleFaceCount = useMemo(() => countVisibleFaces(facesByColor), [facesByColor]);

  const resetWorld = () => {
    setBlocks(createInitialWorld());
    setHoveredKey(null);
  };

  const handleInteract = (event: ThreeEvent<MouseEvent>, face: FaceInstance) => {
    event.stopPropagation();

    if (event.nativeEvent.shiftKey) {
      const [nx, ny, nz] = face.normal;
      const position: [number, number, number] = [
        face.block.position[0] + nx,
        face.block.position[1] + ny,
        face.block.position[2] + nz,
      ];
      const key = toKey(position);

      setBlocks((current) => {
        if (current[key]) {
          return current;
        }

        return {
          ...current,
          [key]: {
            color: activeColor,
            position,
          },
        };
      });

      return;
    }

    setBlocks((current) => {
      const next = { ...current };
      delete next[face.key];
      return next;
    });
    setHoveredKey(null);
  };

  return (
    <main className="voxel-page">
      <section className="voxel-copy">
        <p className="eyebrow">Voxel Sandbox</p>
        <h1>Build across a much larger world.</h1>
        <p className="lede">
          The renderer now draws only exposed voxel faces instead of full cubes, which cuts hidden geometry and improves long-distance rendering.
          Click a face to remove its block, or hold <code>Shift</code> while clicking to place a new one on that side.
        </p>

        <div className="hud-card">
          <div>
            <span className="hud-label">Blocks</span>
            <strong>{blockCount}</strong>
          </div>
          <div>
            <span className="hud-label">Visible faces</span>
            <strong>{visibleFaceCount}</strong>
          </div>
          <button className="reset-button" type="button" onClick={resetWorld}>
            Reset world
          </button>
        </div>

        <div className="palette" role="list" aria-label="Block palette">
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className={color === activeColor ? "palette-swatch active" : "palette-swatch"}
              onClick={() => setActiveColor(color)}
            >
              <span className="swatch-chip" style={{ backgroundColor: BLOCK_COLORS[color] }} aria-hidden="true" />
              {color}
            </button>
          ))}
        </div>
      </section>

      <section className="canvas-shell" aria-label="3D voxel scene">
        <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: false, powerPreference: "high-performance" }}>
          <Scene facesByColor={facesByColor} hoveredKey={hoveredKey} onHover={setHoveredKey} onInteract={handleInteract} />
        </Canvas>
      </section>
    </main>
  );
}
