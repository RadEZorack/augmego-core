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
  state: PlayerState;
};
