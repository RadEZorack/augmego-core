import type { PrismaClient } from "@prisma/client";
import { Elysia } from "elysia";
import { resolveSessionUser, type SessionUser } from "../lib/session";

type PlayerStateInput = {
  position?: { x?: number; y?: number; z?: number };
  rotation?: { x?: number; y?: number; z?: number };
  inventory?: string[];
};

type PlayerState = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  inventory: string[];
  updatedAt: string;
};

export type RealtimeWsOptions = {
  prisma: PrismaClient;
  sessionCookieName: string;
  maxChatHistory: number;
  maxChatMessageLength: number;
  path?: string;
};

const WS_TOPIC = "augmego:realtime";

const socketUsers = new Map<string, SessionUser | null>();
const players = new Map<string, PlayerState>();
const chatHistory: Array<{
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}> = [];

function sendJson(ws: { send: (payload: string) => unknown }, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function broadcastJson(
  ws: {
    send: (payload: string) => unknown;
    publish: (topic: string, payload: string) => unknown;
  },
  payload: unknown
) {
  const json = JSON.stringify(payload);
  ws.send(json);
  ws.publish(WS_TOPIC, json);
}

function safeParseMessage(message: unknown) {
  if (!message) return null;

  if (typeof message === "object") {
    return message as Record<string, unknown>;
  }

  if (typeof message !== "string") {
    return null;
  }

  try {
    return JSON.parse(message) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitizeVector(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const vector = value as { x?: unknown; y?: unknown; z?: unknown };
  if (
    typeof vector.x !== "number" ||
    typeof vector.y !== "number" ||
    typeof vector.z !== "number"
  ) {
    return null;
  }
  return { x: vector.x, y: vector.y, z: vector.z };
}

function sanitizePlayerState(state: unknown): PlayerState | null {
  if (!state || typeof state !== "object") return null;
  const input = state as PlayerStateInput;
  const position = sanitizeVector(input.position);
  const rotation = sanitizeVector(input.rotation);
  if (!position || !rotation) return null;
  const inventory = Array.isArray(input.inventory)
    ? input.inventory.filter((item): item is string => typeof item === "string")
    : [];

  return {
    position,
    rotation,
    inventory,
    updatedAt: new Date().toISOString()
  };
}

export function registerRealtimeWs<
  T extends Elysia<any, any, any, any, any, any, any>
>(
  app: T,
  options: RealtimeWsOptions
) {
  return app.ws(options.path ?? "/api/v1/ws", {
    async open(ws: any) {
      ws.subscribe(WS_TOPIC);
      const user = await resolveSessionUser(
        options.prisma,
        ws.data.request,
        options.sessionCookieName
      );
      socketUsers.set(ws.id, user);

      sendJson(ws, {
        type: "session:info",
        clientId: ws.id,
        authenticated: Boolean(user),
        user: user
          ? {
              id: user.id,
              name: user.name ?? user.email ?? "User",
              avatarUrl: user.avatarUrl
            }
          : null
      });

      sendJson(ws, { type: "chat:history", messages: chatHistory });
      sendJson(ws, {
        type: "player:snapshot",
        players: [...players.entries()].map(([clientId, state]) => ({
          clientId,
          userId: socketUsers.get(clientId)?.id ?? null,
          name:
            socketUsers.get(clientId)?.name ??
            socketUsers.get(clientId)?.email ??
            null,
          state
        }))
      });
    },
    message(ws: any, rawMessage: unknown) {
      const parsed = safeParseMessage(rawMessage);
      if (!parsed || typeof parsed.type !== "string") {
        sendJson(ws, { type: "error", code: "INVALID_PAYLOAD" });
        return;
      }

      if (parsed.type === "chat:send") {
        const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
        const user = socketUsers.get(ws.id);

        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        if (!text) {
          sendJson(ws, { type: "error", code: "EMPTY_MESSAGE" });
          return;
        }

        const limitedText = text.slice(0, options.maxChatMessageLength);
        const chatMessage = {
          id: crypto.randomUUID(),
          text: limitedText,
          createdAt: new Date().toISOString(),
          user: {
            id: user.id,
            name: user.name ?? user.email ?? "User",
            avatarUrl: user.avatarUrl
          }
        };

        chatHistory.push(chatMessage);
        if (chatHistory.length > options.maxChatHistory) {
          chatHistory.splice(0, chatHistory.length - options.maxChatHistory);
        }

        broadcastJson(ws, { type: "chat:new", message: chatMessage });
        return;
      }

      if (parsed.type === "player:update") {
        const state = sanitizePlayerState(parsed.state);
        if (!state) {
          sendJson(ws, { type: "error", code: "INVALID_PLAYER_STATE" });
          return;
        }

        const user = socketUsers.get(ws.id);
        players.set(ws.id, state);
        broadcastJson(ws, {
          type: "player:update",
          player: {
            clientId: ws.id,
            userId: user?.id ?? null,
            name: user?.name ?? user?.email ?? null,
            state
          }
        });
      }
    },
    close(ws: any) {
      socketUsers.delete(ws.id);
      players.delete(ws.id);
      ws.publish(WS_TOPIC, JSON.stringify({ type: "player:leave", clientId: ws.id }));
    }
  });
}
