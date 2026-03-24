"use client";

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type BlockColor = "grass" | "stone" | "sand" | "coral" | "sky";

type VoxelBlock = {
  color: BlockColor;
  position: [number, number, number];
};

type VoxelMap = Record<string, VoxelBlock>;
type BlocksByColor = Record<BlockColor, VoxelBlock[]>;

const BLOCK_COLORS: Record<BlockColor, string> = {
  grass: "#7fb069",
  stone: "#8d99ae",
  sand: "#f2cc8f",
  coral: "#e07a5f",
  sky: "#81b29a",
};

const PALETTE: BlockColor[] = ["grass", "stone", "sand", "coral", "sky"];
const WORLD_RADIUS = 222;
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

function hasNeighbor(map: VoxelMap, x: number, y: number, z: number) {
  return Boolean(map[`${x},${y},${z}`]);
}

function createInitialWorld() {
  const fullMap: VoxelMap = {};

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
        fullMap[toKey(position)] = { color, position };
      }
    }
  }

  for (let x = -WORLD_RADIUS + 4; x <= WORLD_RADIUS - 4; x += 9) {
    for (let z = -WORLD_RADIUS + 4; z <= WORLD_RADIUS - 4; z += 9) {
      const baseHeight = 8 + Math.round(Math.sin(x * 0.21 + z * 0.17) * 2);
      const accentColor: BlockColor = (x + z) % 18 === 0 ? "coral" : "sky";
      for (let y = baseHeight; y < baseHeight + 3; y += 1) {
        const position: [number, number, number] = [x, y, z];
        fullMap[toKey(position)] = { color: accentColor, position };
      }
    }
  }

  const visibleMap: VoxelMap = {};
  for (const block of Object.values(fullMap)) {
    const [x, y, z] = block.position;
    const hidden =
      hasNeighbor(fullMap, x + 1, y, z) &&
      hasNeighbor(fullMap, x - 1, y, z) &&
      hasNeighbor(fullMap, x, y + 1, z) &&
      hasNeighbor(fullMap, x, y - 1, z) &&
      hasNeighbor(fullMap, x, y, z + 1) &&
      hasNeighbor(fullMap, x, y, z - 1);

    if (!hidden) {
      visibleMap[toKey(block.position)] = block;
    }
  }

  return visibleMap;
}

function groupBlocksByColor(blocks: VoxelBlock[]) {
  const grouped: BlocksByColor = {
    grass: [],
    stone: [],
    sand: [],
    coral: [],
    sky: [],
  };

  for (const block of blocks) {
    grouped[block.color].push(block);
  }

  return grouped;
}

function InstancedBlockLayer({
  color,
  blocks,
  hoveredKey,
  onHover,
  onInteract,
}: {
  color: BlockColor;
  blocks: VoxelBlock[];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, block: VoxelBlock) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    for (let index = 0; index < blocks.length; index += 1) {
      tempObject.position.set(...blocks[index].position);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(index, tempObject.matrix);
    }

    meshRef.current.count = blocks.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [blocks]);

  if (blocks.length === 0) {
    return null;
  }

  const hoveredBlock = hoveredKey ? blocks.find((block) => toKey(block.position) === hoveredKey) : null;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, blocks.length]}
        castShadow
        receiveShadow
        onPointerMove={(event) => {
          event.stopPropagation();
          const instanceId = event.instanceId;
          if (instanceId === undefined) {
            return;
          }

          onHover(toKey(blocks[instanceId].position));
        }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => {
          event.stopPropagation();
          const instanceId = event.instanceId;
          if (instanceId === undefined) {
            return;
          }

          onInteract(event, blocks[instanceId]);
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={BLOCK_COLORS[color]} />
      </instancedMesh>

      {hoveredBlock ? (
        <lineSegments position={hoveredBlock.position}>
          <edgesGeometry args={[new THREE.BoxGeometry(1.04, 1.04, 1.04)]} />
          <lineBasicMaterial color="#fff8e7" />
        </lineSegments>
      ) : null}
    </>
  );
}

function Scene({
  groupedBlocks,
  hoveredKey,
  onHover,
  onInteract,
}: {
  groupedBlocks: BlocksByColor;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, block: VoxelBlock) => void;
}) {
  return (
    <>
      <color attach="background" args={["#07111f"]} />
      <fog attach="fog" args={["#07111f", FOG_NEAR, FOG_FAR]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[18, 28, 12]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <hemisphereLight args={["#d9f0ff", "#16212d", 0.75]} />

      <group position={[0, -0.5, 0]}>
        {PALETTE.map((color) => (
          <InstancedBlockLayer
            key={color}
            color={color}
            blocks={groupedBlocks[color]}
            hoveredKey={hoveredKey}
            onHover={onHover}
            onInteract={onInteract}
          />
        ))}
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

  const blockList = useMemo(() => Object.values(blocks), [blocks]);
  const groupedBlocks = useMemo(() => groupBlocksByColor(blockList), [blockList]);
  const blockCount = blockList.length;

  const resetWorld = () => {
    setBlocks(createInitialWorld());
    setHoveredKey(null);
  };

  const handleInteract = (event: ThreeEvent<MouseEvent>, block: VoxelBlock) => {
    event.stopPropagation();

    const normal = event.face?.normal;
    if (event.nativeEvent.shiftKey && normal) {
      const position: [number, number, number] = [
        block.position[0] + Math.round(normal.x),
        block.position[1] + Math.round(normal.y),
        block.position[2] + Math.round(normal.z),
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

    const key = toKey(block.position);
    setBlocks((current) => {
      const next = { ...current };
      delete next[key];
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
          The terrain now spans thousands of visible cubes and still renders efficiently by batching blocks into instanced draws per color.
          Click any block to remove it, or hold <code>Shift</code> while clicking a face to place a new one.
        </p>

        <div className="hud-card">
          <div>
            <span className="hud-label">Visible blocks</span>
            <strong>{blockCount}</strong>
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
          <Scene groupedBlocks={groupedBlocks} hoveredKey={hoveredKey} onHover={setHoveredKey} onInteract={handleInteract} />
        </Canvas>
      </section>
    </main>
  );
}
