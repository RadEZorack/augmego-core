export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  avatarSelection?: PlayerAvatarSelection;
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
  avatarSelection?: PlayerAvatarSelection;
  avatarMode?: PlayerAvatarMode;
  partyId?: string | null;
  micMuted?: boolean;
  cameraEnabled?: boolean;
  state: PlayerState;
};

export type PlayerAvatarMode = "stationary" | "move" | "special";

export type PlayerAvatarSelection = {
  stationaryModelUrl: string | null;
  moveModelUrl: string | null;
  specialModelUrl: string | null;
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
    name: string;
    description: string | null;
    leaderUserId: string;
    isPublic: boolean;
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
  ownerId: string;
  name: string;
  visibility: "public" | "private";
  canManageVisibility: boolean;
  canChangeVisibility: boolean;
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

export type WorldPost = {
  id: string;
  imageUrl: string;
  message: string;
  position: { x: number; y: number; z: number };
  isMinimized: boolean;
  commentCount: number;
  commentPreview: WorldPostComment[];
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type WorldPostComment = {
  id: string;
  postId: string;
  message: string;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type WorldPhotoWall = {
  id: string;
  imageUrl: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  createdAt: string;
  updatedAt: string;
};

export type WorldCamera = {
  id: string;
  name: string | null;
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  createdAt: string;
  updatedAt: string;
};

export type TimelineVec3 = [number, number, number];

export type TimelineModelDiff = {
  visible?: boolean;
  position?: TimelineVec3;
  rotation?: TimelineVec3;
  scale?: TimelineVec3;
};

export type TimelineCameraDiff = {
  active?: boolean;
  position?: TimelineVec3;
  lookAt?: TimelineVec3;
};

export type TimelineFrame = {
  time: number;
  models?: Record<string, TimelineModelDiff>;
  cameras?: Record<string, TimelineCameraDiff>;
};

export type WorldState = {
  worldId: string;
  worldName: string;
  worldDescription: string | null;
  worldOwnerId: string;
  portalLat: number;
  portalLng: number;
  portalIsPublic: boolean;
  canManage: boolean;
  isPublic: boolean;
  canManageVisibility: boolean;
  assets: WorldAsset[];
  placements: WorldPlacement[];
  posts: WorldPost[];
  photoWalls: WorldPhotoWall[];
  cameras: WorldCamera[];
  timelineFrames: TimelineFrame[];
};

export type WorldPortal = {
  worldId: string;
  worldName: string;
  worldDescription: string | null;
  onlineVisitorCount?: number;
  worldIsPublic: boolean;
  portalIsPublic: boolean;
  homeCityName?: string | null;
  homeCountryName?: string | null;
  fictionalAddress?: string | null;
  portal: {
    lat: number;
    lng: number;
  };
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  isOwnedWorld: boolean;
  canJoin: boolean;
  updatedAt: string;
};

export type WorldHomeCity = {
  key: string;
  cityName: string;
  countryName: string;
  timezone: string;
};

export type WorldHomePortal = {
  worldId: string;
  worldName: string;
  worldDescription: string | null;
  portal: {
    lat: number;
    lng: number;
  };
  homeCityKey: string | null;
  homeCityName: string | null;
  homeCountryName: string | null;
  homeTimezone: string | null;
  fictionalAddress: string | null;
};

export type WorldAssetGenerationTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  generationType: "OBJECT" | "HUMANOID";
  generationSource: "TEXT" | "IMAGE";
  enhancedGraphics: boolean;
  prompt: string;
  modelName: string;
  meshyStatus: string | null;
  generatedAssetId: string | null;
  generatedVersionId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
