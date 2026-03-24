"use client";

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";

type BlockColor = "grass" | "stone" | "sand" | "coral" | "sky";

type VoxelBlock = {
  color: BlockColor;
  position: [number, number, number];
};

type VoxelMap = Record<string, VoxelBlock>;

const BLOCK_COLORS: Record<BlockColor, string> = {
  grass: "#7fb069",
  stone: "#8d99ae",
  sand: "#f2cc8f",
  coral: "#e07a5f",
  sky: "#81b29a",
};

const PALETTE: BlockColor[] = ["grass", "stone", "sand", "coral", "sky"];

function toKey([x, y, z]: [number, number, number]) {
  return `${x},${y},${z}`;
}

function createInitialWorld() {
  const blocks: VoxelMap = {};

  for (let x = -8; x <= 8; x += 1) {
    for (let z = -8; z <= 8; z += 1) {
      const distance = Math.sqrt(x * x + z * z);
      const wave = Math.sin(x * 0.8) + Math.cos(z * 0.65);
      const height = Math.max(1, Math.round(3.5 - distance * 0.22 + wave * 0.45));

      for (let y = 0; y < height; y += 1) {
        const isTop = y === height - 1;
        const color: BlockColor = isTop ? (height <= 2 ? "sand" : "grass") : "stone";
        const position: [number, number, number] = [x, y, z];
        blocks[toKey(position)] = { color, position };
      }
    }
  }

  const pillars: Array<[number, number, number, BlockColor]> = [
    [-4, 4, -2, "coral"],
    [-4, 5, -2, "coral"],
    [3, 4, 4, "sky"],
    [3, 5, 4, "sky"],
    [0, 4, -5, "sand"],
    [0, 5, -5, "sand"],
  ];

  for (const [x, y, z, color] of pillars) {
    const position: [number, number, number] = [x, y, z];
    blocks[toKey(position)] = { color, position };
  }

  return blocks;
}

function Block({
  block,
  selected,
  onInteract,
}: {
  block: VoxelBlock;
  selected: boolean;
  onInteract: (event: ThreeEvent<MouseEvent>, block: VoxelBlock) => void;
}) {
  return (
    <mesh position={block.position} castShadow receiveShadow onClick={(event) => onInteract(event, block)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={BLOCK_COLORS[block.color]} />
      {selected ? (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.04, 1.04, 1.04)]} />
          <lineBasicMaterial color="#fff8e7" />
        </lineSegments>
      ) : null}
    </mesh>
  );
}

function Scene({
  blocks,
  activeColor,
  hoveredKey,
  onHover,
  onInteract,
}: {
  blocks: VoxelBlock[];
  activeColor: BlockColor;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, block: VoxelBlock, activeColor: BlockColor) => void;
}) {
  return (
    <>
      <color attach="background" args={["#07111f"]} />
      <fog attach="fog" args={["#07111f", 12, 34]} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[10, 18, 6]} intensity={2.4} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <hemisphereLight args={["#d9f0ff", "#16212d", 0.7]} />

      <group position={[0, -0.5, 0]}>
        {blocks.map((block) => {
          const key = toKey(block.position);
          return (
            <group key={key} onPointerOver={() => onHover(key)} onPointerOut={() => onHover(null)}>
              <Block block={block} selected={hoveredKey === key} onInteract={(event, currentBlock) => onInteract(event, currentBlock, activeColor)} />
            </group>
          );
        })}
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]} receiveShadow>
        <circleGeometry args={[20, 48]} />
        <meshStandardMaterial color="#0f1b2d" />
      </mesh>
      <gridHelper args={[40, 40, "#42617e", "#1b3147"]} position={[0, -0.49, 0]} />
      <PerspectiveCamera makeDefault position={[13, 13, 13]} fov={50} />
      <OrbitControls enablePan={false} minDistance={8} maxDistance={28} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export function VoxelGame() {
  const [blocks, setBlocks] = useState<VoxelMap>(() => createInitialWorld());
  const [activeColor, setActiveColor] = useState<BlockColor>("grass");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const blockList = useMemo(() => Object.values(blocks), [blocks]);
  const blockCount = blockList.length;

  const resetWorld = () => {
    setBlocks(createInitialWorld());
    setHoveredKey(null);
  };

  const handleInteract = (event: ThreeEvent<MouseEvent>, block: VoxelBlock, nextColor: BlockColor) => {
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
            color: nextColor,
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
        <h1>Build a tiny world from solid-color cubes.</h1>
        <p className="lede">
          Click any block to remove it. Hold <code>Shift</code> while clicking a face to place a new cube using the selected color.
        </p>

        <div className="hud-card">
          <div>
            <span className="hud-label">Blocks</span>
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
        <Canvas shadows dpr={[1, 2]}>
          <Scene
            blocks={blockList}
            activeColor={activeColor}
            hoveredKey={hoveredKey}
            onHover={setHoveredKey}
            onInteract={handleInteract}
          />
        </Canvas>
      </section>
    </main>
  );
}
