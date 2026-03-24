"use client";

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";

type BlockColor = "grass" | "stone" | "sand" | "coral" | "sky";
type FaceDirectionName = "px" | "nx" | "py" | "ny" | "pz" | "nz";
type Axis = "x" | "y" | "z";

type VoxelBlock = {
  color: BlockColor;
  position: [number, number, number];
};

type VoxelMap = Record<string, VoxelBlock>;

type GreedyQuad = {
  center: [number, number, number];
  size: [number, number];
};

type QuadsByDirection = Record<FaceDirectionName, GreedyQuad[]>;
type QuadsByColor = Record<BlockColor, QuadsByDirection>;

type ChunkCoords = [number, number, number];

type ChunkMesh = {
  key: string;
  coords: ChunkCoords;
  quadsByColor: QuadsByColor;
  quadCount: number;
};

type WorldState = {
  blocks: VoxelMap;
  chunks: Record<string, ChunkMesh>;
  blockCount: number;
  quadCount: number;
};

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
  rotation: [number, number, number];
  sweepAxis: Axis;
  axisA: Axis;
  axisB: Axis;
}> = [
  { name: "px", normal: [1, 0, 0], rotation: [0, Math.PI / 2, 0], sweepAxis: "x", axisA: "z", axisB: "y" },
  { name: "nx", normal: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0], sweepAxis: "x", axisA: "z", axisB: "y" },
  { name: "py", normal: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0], sweepAxis: "y", axisA: "x", axisB: "z" },
  { name: "ny", normal: [0, -1, 0], rotation: [Math.PI / 2, 0, 0], sweepAxis: "y", axisA: "x", axisB: "z" },
  { name: "pz", normal: [0, 0, 1], rotation: [0, 0, 0], sweepAxis: "z", axisA: "x", axisB: "y" },
  { name: "nz", normal: [0, 0, -1], rotation: [0, Math.PI, 0], sweepAxis: "z", axisA: "x", axisB: "y" },
];
const WORLD_RADIUS = 444;
const CHUNK_SIZE = 32;
const GROUND_SIZE = WORLD_RADIUS * 3;
const GRID_SIZE = WORLD_RADIUS * 4;
const GRID_DIVISIONS = Math.min(GRID_SIZE, 320);
const FOG_NEAR = Math.max(48, WORLD_RADIUS * 0.7);
const FOG_FAR = Math.max(180, WORLD_RADIUS * 2.4);
const CAMERA_DISTANCE = Math.max(26, WORLD_RADIUS * 0.95);
const CAMERA_HEIGHT = Math.max(24, WORLD_RADIUS * 0.7);
const MIN_ZOOM_DISTANCE = Math.max(12, WORLD_RADIUS * 0.08);
const MAX_ZOOM_DISTANCE = Math.max(64, WORLD_RADIUS * 3);

const tempObject = new THREE.Object3D();
const HALF_BLOCK_NUDGE = 0.01;
const PLACE_BLOCK_NUDGE = 0.51;

function toKey([x, y, z]: [number, number, number]) {
  return `${x},${y},${z}`;
}

function toChunkKey([x, y, z]: ChunkCoords) {
  return `${x},${y},${z}`;
}

function getChunkCoord(value: number) {
  return Math.floor(value / CHUNK_SIZE);
}

function getChunkCoords(position: [number, number, number]): ChunkCoords {
  return [getChunkCoord(position[0]), getChunkCoord(position[1]), getChunkCoord(position[2])];
}

function fromPoint(point: THREE.Vector3, normal: [number, number, number], nudge: number): [number, number, number] {
  return [
    Math.floor(point.x + normal[0] * nudge + 0.5),
    Math.floor(point.y + normal[1] * nudge + 0.5),
    Math.floor(point.z + normal[2] * nudge + 0.5),
  ];
}

function makePosition(sweepAxis: Axis, sweepValue: number, axisA: Axis, valueA: number, axisB: Axis, valueB: number): [number, number, number] {
  const result: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  result[sweepAxis] = sweepValue;
  result[axisA] = valueA;
  result[axisB] = valueB;
  return [result.x, result.y, result.z];
}

function createEmptyQuadsByColor(): QuadsByColor {
  return {
    grass: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    stone: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    sand: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    coral: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
    sky: { px: [], nx: [], py: [], ny: [], pz: [], nz: [] },
  };
}

function createInitialBlocks() {
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

function buildChunkGreedyQuads(blocks: VoxelMap, coords: ChunkCoords) {
  const quadsByColor = createEmptyQuadsByColor();
  const [chunkX, chunkY, chunkZ] = coords;
  const minX = chunkX * CHUNK_SIZE;
  const maxX = minX + CHUNK_SIZE - 1;
  const minY = chunkY * CHUNK_SIZE;
  const maxY = minY + CHUNK_SIZE - 1;
  const minZ = chunkZ * CHUNK_SIZE;
  const maxZ = minZ + CHUNK_SIZE - 1;

  let hasAnyBlock = false;
  for (let x = minX; x <= maxX && !hasAnyBlock; x += 1) {
    for (let y = minY; y <= maxY && !hasAnyBlock; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (blocks[`${x},${y},${z}`]) {
          hasAnyBlock = true;
          break;
        }
      }
    }
  }

  if (!hasAnyBlock) {
    return { quadsByColor, quadCount: 0 };
  }

  const bounds = { x: [minX, maxX] as const, y: [minY, maxY] as const, z: [minZ, maxZ] as const };

  for (const direction of FACE_DIRECTIONS) {
    const [normalX, normalY, normalZ] = direction.normal;
    const [minSweep, maxSweep] = bounds[direction.sweepAxis];
    const [minA, maxA] = bounds[direction.axisA];
    const [minB, maxB] = bounds[direction.axisB];
    const sizeA = maxA - minA + 1;
    const sizeB = maxB - minB + 1;

    for (let sweep = minSweep; sweep <= maxSweep; sweep += 1) {
      const mask: Array<BlockColor | null> = new Array(sizeA * sizeB).fill(null);

      for (let a = 0; a < sizeA; a += 1) {
        const valueA = minA + a;
        for (let b = 0; b < sizeB; b += 1) {
          const valueB = minB + b;
          const currentPosition = makePosition(direction.sweepAxis, sweep, direction.axisA, valueA, direction.axisB, valueB);
          const block = blocks[toKey(currentPosition)];

          if (!block) {
            continue;
          }

          const neighborPosition: [number, number, number] = [
            currentPosition[0] + normalX,
            currentPosition[1] + normalY,
            currentPosition[2] + normalZ,
          ];

          if (blocks[toKey(neighborPosition)]) {
            continue;
          }

          mask[a + b * sizeA] = block.color;
        }
      }

      const used = new Uint8Array(sizeA * sizeB);

      for (let b = 0; b < sizeB; b += 1) {
        for (let a = 0; a < sizeA; a += 1) {
          const index = a + b * sizeA;
          const color = mask[index];

          if (!color || used[index]) {
            continue;
          }

          let width = 1;
          while (a + width < sizeA) {
            const nextIndex = a + width + b * sizeA;
            if (used[nextIndex] || mask[nextIndex] !== color) {
              break;
            }
            width += 1;
          }

          let height = 1;
          let canGrow = true;
          while (b + height < sizeB && canGrow) {
            for (let w = 0; w < width; w += 1) {
              const nextIndex = a + w + (b + height) * sizeA;
              if (used[nextIndex] || mask[nextIndex] !== color) {
                canGrow = false;
                break;
              }
            }

            if (canGrow) {
              height += 1;
            }
          }

          for (let dy = 0; dy < height; dy += 1) {
            for (let dx = 0; dx < width; dx += 1) {
              used[a + dx + (b + dy) * sizeA] = 1;
            }
          }

          const startA = minA + a;
          const startB = minB + b;
          const centerA = startA + width / 2 - 0.5;
          const centerB = startB + height / 2 - 0.5;
          const centerSweep = sweep + (direction.normal[0] + direction.normal[1] + direction.normal[2]) * 0.5;
          const center = makePosition(direction.sweepAxis, centerSweep, direction.axisA, centerA, direction.axisB, centerB);

          quadsByColor[color][direction.name].push({
            center,
            size: [width, height],
          });
        }
      }
    }
  }

  let quadCount = 0;
  for (const color of PALETTE) {
    for (const direction of FACE_DIRECTIONS) {
      quadCount += quadsByColor[color][direction.name].length;
    }
  }

  return { quadsByColor, quadCount };
}

function collectChunkCoords(blocks: VoxelMap) {
  const keys = new Set<string>();

  for (const block of Object.values(blocks)) {
    keys.add(toChunkKey(getChunkCoords(block.position)));
  }

  return [...keys].map((key) => key.split(",").map(Number) as ChunkCoords);
}

function buildWorldState(blocks: VoxelMap): WorldState {
  const chunks: Record<string, ChunkMesh> = {};
  let quadCount = 0;

  for (const coords of collectChunkCoords(blocks)) {
    const key = toChunkKey(coords);
    const { quadsByColor, quadCount: chunkQuadCount } = buildChunkGreedyQuads(blocks, coords);
    if (chunkQuadCount === 0) {
      continue;
    }

    chunks[key] = {
      key,
      coords,
      quadsByColor,
      quadCount: chunkQuadCount,
    };
    quadCount += chunkQuadCount;
  }

  return {
    blocks,
    chunks,
    blockCount: Object.keys(blocks).length,
    quadCount,
  };
}

function createInitialWorldState() {
  return buildWorldState(createInitialBlocks());
}

function getAffectedChunkKeys(position: [number, number, number]) {
  const keys = new Set<string>();

  for (const direction of FACE_DIRECTIONS) {
    const neighbor: [number, number, number] = [
      position[0] + direction.normal[0],
      position[1] + direction.normal[1],
      position[2] + direction.normal[2],
    ];
    keys.add(toChunkKey(getChunkCoords(neighbor)));
  }

  keys.add(toChunkKey(getChunkCoords(position)));
  return [...keys];
}

function updateWorldState(
  current: WorldState,
  changes: Array<
    | { type: "remove"; position: [number, number, number] }
    | { type: "place"; position: [number, number, number]; color: BlockColor }
  >,
) {
  const blocks = { ...current.blocks };
  const affectedChunkKeys = new Set<string>();
  let changed = false;

  for (const change of changes) {
    const key = toKey(change.position);
    if (change.type === "remove") {
      if (!blocks[key]) {
        continue;
      }
      delete blocks[key];
      changed = true;
    } else {
      const existing = blocks[key];
      if (existing && existing.color === change.color) {
        continue;
      }
      blocks[key] = { color: change.color, position: change.position };
      changed = true;
    }

    for (const chunkKey of getAffectedChunkKeys(change.position)) {
      affectedChunkKeys.add(chunkKey);
    }
  }

  if (!changed) {
    return current;
  }

  const chunks = { ...current.chunks };
  let quadCount = current.quadCount;

  for (const chunkKey of affectedChunkKeys) {
    const existingChunk = chunks[chunkKey];
    if (existingChunk) {
      quadCount -= existingChunk.quadCount;
    }

    const coords = chunkKey.split(",").map(Number) as ChunkCoords;
    const { quadsByColor, quadCount: nextQuadCount } = buildChunkGreedyQuads(blocks, coords);

    if (nextQuadCount === 0) {
      delete chunks[chunkKey];
      continue;
    }

    chunks[chunkKey] = {
      key: chunkKey,
      coords,
      quadsByColor,
      quadCount: nextQuadCount,
    };
    quadCount += nextQuadCount;
  }

  return {
    blocks,
    chunks,
    blockCount: Object.keys(blocks).length,
    quadCount,
  };
}

function ChunkQuadLayer({
  color,
  direction,
  quads,
  onHover,
  onInteract,
}: {
  color: BlockColor;
  direction: (typeof FACE_DIRECTIONS)[number];
  quads: GreedyQuad[];
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, normal: [number, number, number]) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    for (let index = 0; index < quads.length; index += 1) {
      const quad = quads[index];
      tempObject.position.set(...quad.center);
      tempObject.rotation.set(...direction.rotation);
      tempObject.scale.set(quad.size[0], quad.size[1], 1);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(index, tempObject.matrix);
    }

    meshRef.current.count = quads.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [direction.rotation, quads]);

  if (quads.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, quads.length]}
      frustumCulled
      onPointerMove={(event) => {
        event.stopPropagation();
        const hoveredPosition = fromPoint(event.point, direction.normal, -HALF_BLOCK_NUDGE);
        onHover(toKey(hoveredPosition));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        onInteract(event, direction.normal);
      }}
    >
      <planeGeometry args={[1, 1]} />
      <meshLambertMaterial color={BLOCK_COLORS[color]} side={THREE.FrontSide} />
    </instancedMesh>
  );
}

function ChunkMeshView({
  chunk,
  onHover,
  onInteract,
}: {
  chunk: ChunkMesh;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, normal: [number, number, number]) => void;
}) {
  return (
    <>
      {PALETTE.flatMap((color) =>
        FACE_DIRECTIONS.map((direction) => (
          <ChunkQuadLayer
            key={`${chunk.key}-${color}-${direction.name}`}
            color={color}
            direction={direction}
            quads={chunk.quadsByColor[color][direction.name]}
            onHover={onHover}
            onInteract={onInteract}
          />
        )),
      )}
    </>
  );
}

function Scene({
  chunks,
  hoveredBlock,
  onHover,
  onInteract,
}: {
  chunks: ChunkMesh[];
  hoveredBlock: VoxelBlock | null;
  onHover: (key: string | null) => void;
  onInteract: (event: ThreeEvent<MouseEvent>, normal: [number, number, number]) => void;
}) {
  return (
    <>
      <color attach="background" args={["#07111f"]} />
      <fog attach="fog" args={["#07111f", FOG_NEAR, FOG_FAR]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[18, 28, 12]} intensity={1.9} />
      <hemisphereLight args={["#d9f0ff", "#16212d", 0.75]} />

      {chunks.map((chunk) => (
        <ChunkMeshView key={chunk.key} chunk={chunk} onHover={onHover} onInteract={onInteract} />
      ))}

      {hoveredBlock ? (
        <lineSegments position={hoveredBlock.position}>
          <edgesGeometry args={[new THREE.BoxGeometry(1.04, 1.04, 1.04)]} />
          <lineBasicMaterial color="#fff8e7" />
        </lineSegments>
      ) : null}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
        <circleGeometry args={[GROUND_SIZE, 72]} />
        <meshLambertMaterial color="#0f1b2d" />
      </mesh>
      <gridHelper args={[GRID_SIZE, GRID_DIVISIONS, "#42617e", "#1b3147"]} position={[0, -0.49, 0]} />
      <PerspectiveCamera makeDefault position={[CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_DISTANCE]} fov={54} far={FOG_FAR * 1.8} />
      <OrbitControls enablePan={false} minDistance={MIN_ZOOM_DISTANCE} maxDistance={MAX_ZOOM_DISTANCE} maxPolarAngle={Math.PI / 2.03} />
    </>
  );
}

export function VoxelGame() {
  const [world, setWorld] = useState<WorldState>(() => createInitialWorldState());
  const [activeColor, setActiveColor] = useState<BlockColor>("grass");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const hoveredBlock = hoveredKey ? world.blocks[hoveredKey] ?? null : null;
  const chunkList = Object.values(world.chunks);

  const resetWorld = () => {
    setWorld(createInitialWorldState());
    setHoveredKey(null);
  };

  const handleInteract = (event: ThreeEvent<MouseEvent>, normal: [number, number, number]) => {
    event.stopPropagation();

    const removePosition = fromPoint(event.point, normal, -HALF_BLOCK_NUDGE);

    if (event.nativeEvent.shiftKey) {
      const placePosition = fromPoint(event.point, normal, PLACE_BLOCK_NUDGE);
      setWorld((current) =>
        updateWorldState(current, [
          {
            type: "place",
            position: placePosition,
            color: activeColor,
          },
        ]),
      );
      return;
    }

    setWorld((current) =>
      updateWorldState(current, [
        {
          type: "remove",
          position: removePosition,
        },
      ]),
    );
    setHoveredKey(null);
  };

  return (
    <main className="voxel-page">
      <section className="voxel-copy">
        <p className="eyebrow">Voxel Sandbox</p>
        <h1>Build across a much larger world.</h1>
        <p className="lede">
          The world now uses chunked greedy meshing, so edits rebuild only the touched chunk neighborhood instead of remeshing the whole terrain.
          Click a face to remove its block, or hold <code>Shift</code> while clicking to place a new one on that side.
        </p>

        <div className="hud-card">
          <div>
            <span className="hud-label">Blocks</span>
            <strong>{world.blockCount}</strong>
          </div>
          <div>
            <span className="hud-label">Greedy quads</span>
            <strong>{world.quadCount}</strong>
          </div>
          <div>
            <span className="hud-label">Chunks</span>
            <strong>{chunkList.length}</strong>
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
        <Canvas
          frameloop="demand"
          dpr={[0.75, 1.25]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          performance={{ min: 0.5 }}
        >
          <Scene chunks={chunkList} hoveredBlock={hoveredBlock} onHover={setHoveredKey} onInteract={handleInteract} />
        </Canvas>
      </section>
    </main>
  );
}
