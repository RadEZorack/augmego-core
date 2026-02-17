export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

export type PlayerState = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  inventory: string[];
  updatedAt: string;
};

export type PlayerPayload = {
  clientId: string;
  userId: string | null;
  name: string | null;
  avatarUrl: string | null;
  partyId?: string | null;
  micMuted?: boolean;
  cameraEnabled?: boolean;
  state: PlayerState;
};

export type PlayerMediaPayload = {
  clientId: string;
  micMuted: boolean;
  cameraEnabled: boolean;
};

export type PartyMember = {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  online: boolean;
  clientId: string | null;
  isLeader: boolean;
  role: "LEADER" | "MANAGER" | "MEMBER";
};

export type PartyState = {
  party: {
    id: string;
    leaderUserId: string;
    members: PartyMember[];
  } | null;
  pendingInvites: Array<{
    id: string;
    partyId: string;
    leader: {
      id: string;
      name: string;
      avatarUrl: string | null;
    };
    createdAt: string;
    expiresAt: string;
  }>;
};

export type WorldAssetVersion = {
  id: string;
  version: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  fileUrl: string;
};

export type WorldAsset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: WorldAssetVersion | null;
  versions: WorldAssetVersion[];
};

export type WorldPlacement = {
  id: string;
  assetId: string;
  assetName: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  createdAt: string;
  updatedAt: string;
};

export type WorldState = {
  worldOwnerId: string;
  canManage: boolean;
  assets: WorldAsset[];
  placements: WorldPlacement[];
};
