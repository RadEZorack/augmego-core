import type { PrismaClient } from "@prisma/client";
import { Elysia } from "elysia";
import { resolveSessionUser, type SessionUser } from "../lib/session.js";

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

type PlayerMediaState = {
  micMuted: boolean;
  cameraEnabled: boolean;
};

type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

type PendingInvite = {
  id: string;
  partyId: string;
  leaderUserId: string;
  leaderName: string;
  leaderAvatarUrl: string | null;
  targetUserId: string;
  createdAt: string;
  expiresAtMs: number;
};

export type RealtimeWsOptions = {
  prisma: PrismaClient;
  sessionCookieName: string;
  maxChatHistory: number;
  maxChatMessageLength: number;
  path?: string;
};

const WS_TOPIC = "augmego:realtime";
const INVITE_COOLDOWN_MS = 8000;
const INVITE_TTL_MS = 20000;

const socketUsers = new Map<string, SessionUser | null>();
const sockets = new Map<string, any>();
const userSockets = new Map<string, Set<string>>();
const socketPartyIds = new Map<string, string | null>();
const players = new Map<string, PlayerState>();
const playerMedia = new Map<string, PlayerMediaState>();
const chatHistory: ChatMessage[] = [];
const partyChatHistory = new Map<string, ChatMessage[]>();
const pendingInvitesByTargetUserId = new Map<string, Map<string, PendingInvite>>();
const inviteCooldownByPair = new Map<string, number>();

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

function broadcastToAll(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const socket of sockets.values()) {
    socket.send(json);
  }
}

function addUserSocket(userId: string, socketId: string) {
  const set = userSockets.get(userId) ?? new Set<string>();
  set.add(socketId);
  userSockets.set(userId, set);
}

function removeUserSocket(userId: string, socketId: string) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    userSockets.delete(userId);
  }
}

function getOnlineClientIdForUser(userId: string): string | null {
  const socketIds = userSockets.get(userId);
  if (!socketIds) return null;
  for (const socketId of socketIds) {
    if (sockets.has(socketId)) return socketId;
  }
  return null;
}

function isMediaAllowedBetweenClients(fromClientId: string, toClientId: string) {
  const fromPartyId = socketPartyIds.get(fromClientId) ?? null;
  const toPartyId = socketPartyIds.get(toClientId) ?? null;

  if (!fromPartyId && !toPartyId) return true;
  return Boolean(fromPartyId && toPartyId && fromPartyId === toPartyId);
}

async function resolvePartyIdForUser(prisma: PrismaClient, userId: string) {
  const membership = await prisma.partyMember.findUnique({
    where: { userId },
    select: { partyId: true }
  });
  return membership?.partyId ?? null;
}

async function updateSocketPartyIdsForUsers(prisma: PrismaClient, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)];
  for (const userId of uniqueUserIds) {
    const partyId = await resolvePartyIdForUser(prisma, userId);
    const socketIds = userSockets.get(userId) ?? new Set<string>();
    for (const socketId of socketIds) {
      socketPartyIds.set(socketId, partyId);
    }
  }
}

function cleanupExpiredInvites() {
  const now = Date.now();

  for (const [targetUserId, inviteMap] of pendingInvitesByTargetUserId.entries()) {
    for (const [inviteId, invite] of inviteMap.entries()) {
      if (invite.expiresAtMs <= now) {
        inviteMap.delete(inviteId);
      }
    }

    if (inviteMap.size === 0) {
      pendingInvitesByTargetUserId.delete(targetUserId);
    }
  }

  for (const [pairKey, expiresAtMs] of inviteCooldownByPair.entries()) {
    if (expiresAtMs <= now) {
      inviteCooldownByPair.delete(pairKey);
    }
  }
}

function removeInvitesForUser(userId: string) {
  pendingInvitesByTargetUserId.delete(userId);

  for (const [targetUserId, inviteMap] of pendingInvitesByTargetUserId.entries()) {
    for (const [inviteId, invite] of inviteMap.entries()) {
      if (invite.leaderUserId === userId) {
        inviteMap.delete(inviteId);
      }
    }
    if (inviteMap.size === 0) {
      pendingInvitesByTargetUserId.delete(targetUserId);
    }
  }

  for (const pairKey of inviteCooldownByPair.keys()) {
    if (pairKey.startsWith(`${userId}:`) || pairKey.endsWith(`:${userId}`)) {
      inviteCooldownByPair.delete(pairKey);
    }
  }
}

function hasPartyManagePermissions(membership: {
  userId: string;
  role: "MEMBER" | "MANAGER";
  party: { leaderId: string };
}) {
  return membership.party.leaderId === membership.userId || membership.role === "MANAGER";
}

async function buildPartyStateForUser(prisma: PrismaClient, user: SessionUser) {
  cleanupExpiredInvites();

  const membership = await prisma.partyMember.findUnique({
    where: { userId: user.id },
    include: {
      party: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true
                }
              }
            },
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  const pendingInvites = [
    ...(pendingInvitesByTargetUserId.get(user.id)?.values() ?? [])
  ].map((invite) => ({
    id: invite.id,
    partyId: invite.partyId,
    leader: {
      id: invite.leaderUserId,
      name: invite.leaderName,
      avatarUrl: invite.leaderAvatarUrl
    },
    createdAt: invite.createdAt,
    expiresAt: new Date(invite.expiresAtMs).toISOString()
  }));

  if (!membership) {
    return {
      party: null,
      pendingInvites
    };
  }

  const party = membership.party;
  return {
    party: {
      id: party.id,
      leaderUserId: party.leaderId,
      members: party.members.map((member) => {
        const onlineClientId = getOnlineClientIdForUser(member.userId);
        const isLeader = member.userId === party.leaderId;
        return {
          userId: member.user.id,
          name: member.user.name ?? member.user.email ?? "User",
          email: member.user.email,
          avatarUrl: member.user.avatarUrl,
          online: Boolean(onlineClientId),
          clientId: onlineClientId,
          isLeader,
          role: isLeader ? "LEADER" : member.role
        };
      })
    },
    pendingInvites
  };
}

async function sendPartyStateToUser(prisma: PrismaClient, user: SessionUser) {
  const state = await buildPartyStateForUser(prisma, user);
  const socketIds = userSockets.get(user.id) ?? new Set<string>();

  for (const socketId of socketIds) {
    const socket = sockets.get(socketId);
    if (!socket) continue;

    socketPartyIds.set(socketId, state.party?.id ?? null);
    sendJson(socket, { type: "party:state", ...state });
    sendJson(socket, {
      type: "party:chat:history",
      messages: state.party ? partyChatHistory.get(state.party.id) ?? [] : []
    });
  }
}

async function sendPartyStateToUsers(prisma: PrismaClient, users: SessionUser[]) {
  for (const user of users) {
    await sendPartyStateToUser(prisma, user);
  }
}

function notifyLeaderInviteUpdate(
  leaderUserId: string,
  payload: {
    type: string;
    inviteId: string;
    targetUserId: string;
    accepted?: boolean;
  }
) {
  const socketIds = userSockets.get(leaderUserId) ?? new Set<string>();
  for (const socketId of socketIds) {
    const socket = sockets.get(socketId);
    if (!socket) continue;
    sendJson(socket, payload);
  }
}

function broadcastPartyPresenceForUsers(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)];
  for (const userId of uniqueUserIds) {
    const socketIds = userSockets.get(userId) ?? new Set<string>();
    for (const socketId of socketIds) {
      broadcastToAll({
        type: "player:party",
        clientId: socketId,
        partyId: socketPartyIds.get(socketId) ?? null
      });
    }
  }
}

async function ensureManagerOrCreateLeaderParty(prisma: PrismaClient, userId: string) {
  const membership = await prisma.partyMember.findUnique({
    where: { userId },
    include: { party: true }
  });

  if (membership) {
    return {
      partyId: membership.partyId,
      canManage: hasPartyManagePermissions(membership),
      created: false
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const party = await tx.party.create({
      data: {
        leaderId: userId
      }
    });

    await tx.partyMember.create({
      data: {
        partyId: party.id,
        userId
      }
    });

    return party;
  });

  return {
    partyId: created.id,
    canManage: true,
    created: true
  };
}

async function removeUserFromParty(prisma: PrismaClient, userId: string) {
  const membership = await prisma.partyMember.findUnique({
    where: { userId },
    include: {
      party: {
        include: {
          members: {
            select: {
              userId: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  if (!membership) return null;

  const partyId = membership.partyId;
  const wasLeader = membership.party.leaderId === userId;
  const allMemberIdsBefore = membership.party.members.map((member) => member.userId);

  await prisma.$transaction(async (tx) => {
    await tx.partyMember.delete({ where: { userId } });

    if (!wasLeader) {
      return;
    }

    const remainingMembers = membership.party.members
      .filter((member) => member.userId !== userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (remainingMembers.length === 0) {
      await tx.party.delete({ where: { id: partyId } });
      return;
    }

    await tx.party.update({
      where: { id: partyId },
      data: { leaderId: remainingMembers[0]!.userId }
    });
  });

  return {
    partyId,
    affectedUserIds: [...new Set(allMemberIdsBefore)]
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
      sockets.set(ws.id, ws);
      const user = await resolveSessionUser(
        options.prisma,
        ws.data.request,
        options.sessionCookieName
      );
      socketUsers.set(ws.id, user);
      if (user) {
        addUserSocket(user.id, ws.id);
        socketPartyIds.set(ws.id, await resolvePartyIdForUser(options.prisma, user.id));
      } else {
        socketPartyIds.set(ws.id, null);
      }

      playerMedia.set(ws.id, {
        micMuted: true,
        cameraEnabled: false
      });

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
          avatarUrl: socketUsers.get(clientId)?.avatarUrl ?? null,
          partyId: socketPartyIds.get(clientId) ?? null,
          micMuted: playerMedia.get(clientId)?.micMuted ?? true,
          cameraEnabled: playerMedia.get(clientId)?.cameraEnabled ?? false,
          state
        }))
      });

      if (user) {
        await sendPartyStateToUser(options.prisma, user);
      } else {
        sendJson(ws, { type: "party:state", party: null, pendingInvites: [] });
        sendJson(ws, { type: "party:chat:history", messages: [] });
      }

      broadcastToAll({
        type: "player:party",
        clientId: ws.id,
        partyId: socketPartyIds.get(ws.id) ?? null
      });
    },
    async message(ws: any, rawMessage: unknown) {
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
        const chatMessage: ChatMessage = {
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

      if (parsed.type === "party:chat:send") {
        const user = socketUsers.get(ws.id);
        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
        if (!text) {
          sendJson(ws, { type: "error", code: "EMPTY_MESSAGE" });
          return;
        }

        const membership = await options.prisma.partyMember.findUnique({
          where: { userId: user.id },
          select: { partyId: true }
        });

        if (!membership) {
          sendJson(ws, { type: "error", code: "NOT_IN_PARTY" });
          return;
        }

        const chatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: text.slice(0, options.maxChatMessageLength),
          createdAt: new Date().toISOString(),
          user: {
            id: user.id,
            name: user.name ?? user.email ?? "User",
            avatarUrl: user.avatarUrl
          }
        };

        const history = partyChatHistory.get(membership.partyId) ?? [];
        history.push(chatMessage);
        if (history.length > options.maxChatHistory) {
          history.splice(0, history.length - options.maxChatHistory);
        }
        partyChatHistory.set(membership.partyId, history);

        const members = await options.prisma.partyMember.findMany({
          where: { partyId: membership.partyId },
          select: { userId: true }
        });

        for (const member of members) {
          const socketIds = userSockets.get(member.userId) ?? new Set<string>();
          for (const socketId of socketIds) {
            const socket = sockets.get(socketId);
            if (!socket) continue;
            sendJson(socket, { type: "party:chat:new", message: chatMessage });
          }
        }

        return;
      }

      if (parsed.type === "party:invite") {
        cleanupExpiredInvites();

        const user = socketUsers.get(ws.id);
        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        let targetUserId =
          typeof parsed.targetUserId === "string" ? parsed.targetUserId : "";
        if (!targetUserId && typeof parsed.targetClientId === "string") {
          targetUserId = socketUsers.get(parsed.targetClientId)?.id ?? "";
        }

        if (!targetUserId) {
          sendJson(ws, { type: "error", code: "INVALID_INVITE_TARGET" });
          return;
        }

        if (targetUserId === user.id) {
          sendJson(ws, { type: "error", code: "INVITE_SELF_NOT_ALLOWED" });
          return;
        }

        const targetAccount = await options.prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, name: true, email: true, avatarUrl: true }
        });

        if (!targetAccount) {
          sendJson(ws, { type: "error", code: "TARGET_NOT_FOUND" });
          return;
        }

        const partyInfo = await ensureManagerOrCreateLeaderParty(options.prisma, user.id);
        if (!partyInfo.canManage) {
          sendJson(ws, { type: "error", code: "NOT_PARTY_MANAGER_OR_LEADER" });
          return;
        }

        const targetMembership = await options.prisma.partyMember.findUnique({
          where: { userId: targetUserId },
          select: { partyId: true }
        });
        if (targetMembership) {
          sendJson(ws, { type: "error", code: "TARGET_ALREADY_IN_PARTY" });
          return;
        }

        if (!getOnlineClientIdForUser(targetUserId)) {
          sendJson(ws, { type: "error", code: "TARGET_OFFLINE" });
          return;
        }

        const cooldownKey = `${user.id}:${targetUserId}`;
        const nowMs = Date.now();
        const cooldownExpires = inviteCooldownByPair.get(cooldownKey) ?? 0;
        if (cooldownExpires > nowMs) {
          sendJson(ws, {
            type: "error",
            code: "INVITE_COOLDOWN",
            retryAfterMs: cooldownExpires - nowMs
          });
          return;
        }

        const inviteId = crypto.randomUUID();
        const invite: PendingInvite = {
          id: inviteId,
          partyId: partyInfo.partyId,
          leaderUserId: user.id,
          leaderName: user.name ?? user.email ?? "User",
          leaderAvatarUrl: user.avatarUrl,
          targetUserId,
          createdAt: new Date(nowMs).toISOString(),
          expiresAtMs: nowMs + INVITE_TTL_MS
        };

        const inviteMap =
          pendingInvitesByTargetUserId.get(targetUserId) ?? new Map<string, PendingInvite>();
        inviteMap.set(inviteId, invite);
        pendingInvitesByTargetUserId.set(targetUserId, inviteMap);
        inviteCooldownByPair.set(cooldownKey, nowMs + INVITE_COOLDOWN_MS);

        const targetSocketIds = userSockets.get(targetUserId) ?? new Set<string>();
        for (const targetSocketId of targetSocketIds) {
          const targetSocket = sockets.get(targetSocketId);
          if (!targetSocket) continue;

          sendJson(targetSocket, {
            type: "party:invite",
            invite: {
              id: invite.id,
              partyId: invite.partyId,
              leader: {
                id: invite.leaderUserId,
                name: invite.leaderName,
                avatarUrl: invite.leaderAvatarUrl
              },
              createdAt: invite.createdAt,
              expiresAt: new Date(invite.expiresAtMs).toISOString()
            }
          });
        }

        sendJson(ws, {
          type: "party:invite:sent",
          inviteId,
          targetUserId
        });

        await updateSocketPartyIdsForUsers(options.prisma, [user.id]);
        await sendPartyStateToUser(options.prisma, user);
        broadcastPartyPresenceForUsers([user.id]);

        return;
      }

      if (parsed.type === "party:invite:respond") {
        cleanupExpiredInvites();

        const user = socketUsers.get(ws.id);
        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        const inviteId = typeof parsed.inviteId === "string" ? parsed.inviteId : "";
        const accept = parsed.accept === true;

        if (!inviteId) {
          sendJson(ws, { type: "error", code: "INVALID_INVITE_ID" });
          return;
        }

        const inviteMap = pendingInvitesByTargetUserId.get(user.id);
        const invite = inviteMap?.get(inviteId);
        if (!invite || invite.expiresAtMs <= Date.now()) {
          if (inviteMap) inviteMap.delete(inviteId);
          sendJson(ws, { type: "error", code: "INVITE_EXPIRED" });
          await sendPartyStateToUser(options.prisma, user);
          return;
        }

        inviteMap?.delete(inviteId);
        if (inviteMap && inviteMap.size === 0) {
          pendingInvitesByTargetUserId.delete(user.id);
        }

        if (!accept) {
          notifyLeaderInviteUpdate(invite.leaderUserId, {
            type: "party:invite:resolved",
            inviteId,
            targetUserId: user.id,
            accepted: false
          });
          await sendPartyStateToUser(options.prisma, user);
          return;
        }

        const joined = await options.prisma.$transaction(async (tx) => {
          const alreadyMember = await tx.partyMember.findUnique({
            where: { userId: user.id },
            select: { partyId: true }
          });
          if (alreadyMember) {
            return { ok: false as const, reason: "TARGET_ALREADY_IN_PARTY" };
          }

          const party = await tx.party.findUnique({
            where: { id: invite.partyId },
            select: { id: true }
          });
          if (!party) {
            return { ok: false as const, reason: "PARTY_NOT_FOUND" };
          }

          await tx.partyMember.create({
            data: {
              partyId: invite.partyId,
              userId: user.id
            }
          });

          return { ok: true as const, partyId: invite.partyId };
        });

        if (!joined.ok) {
          sendJson(ws, { type: "error", code: joined.reason });
          await sendPartyStateToUser(options.prisma, user);
          return;
        }

        const partyMembers = await options.prisma.partyMember.findMany({
          where: { partyId: joined.partyId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        });

        const affectedUsers = partyMembers
          .map((member) => member.user)
          .filter((member): member is SessionUser => Boolean(member));

        await updateSocketPartyIdsForUsers(
          options.prisma,
          affectedUsers.map((item) => item.id)
        );
        await sendPartyStateToUsers(options.prisma, affectedUsers);
        broadcastPartyPresenceForUsers(affectedUsers.map((item) => item.id));

        notifyLeaderInviteUpdate(invite.leaderUserId, {
          type: "party:invite:resolved",
          inviteId,
          targetUserId: user.id,
          accepted: true
        });

        return;
      }

      if (parsed.type === "party:leave") {
        const user = socketUsers.get(ws.id);
        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        const result = await removeUserFromParty(options.prisma, user.id);
        if (!result) {
          sendJson(ws, { type: "error", code: "NOT_IN_PARTY" });
          return;
        }

        const affectedUsers = await options.prisma.user.findMany({
          where: { id: { in: result.affectedUserIds } },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        });

        await updateSocketPartyIdsForUsers(
          options.prisma,
          affectedUsers.map((item) => item.id)
        );
        await sendPartyStateToUsers(options.prisma, affectedUsers);
        broadcastPartyPresenceForUsers(affectedUsers.map((item) => item.id));

        return;
      }

      if (parsed.type === "party:kick") {
        const user = socketUsers.get(ws.id);
        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        const targetUserId =
          typeof parsed.targetUserId === "string" ? parsed.targetUserId : "";
        if (!targetUserId || targetUserId === user.id) {
          sendJson(ws, { type: "error", code: "INVALID_KICK_TARGET" });
          return;
        }

        const actingMembership = await options.prisma.partyMember.findUnique({
          where: { userId: user.id },
          include: { party: true }
        });
        if (!actingMembership) {
          sendJson(ws, { type: "error", code: "NOT_IN_PARTY" });
          return;
        }

        if (!hasPartyManagePermissions(actingMembership)) {
          sendJson(ws, { type: "error", code: "NOT_PARTY_MANAGER_OR_LEADER" });
          return;
        }

        const targetMembership = await options.prisma.partyMember.findUnique({
          where: { userId: targetUserId },
          select: { partyId: true, role: true }
        });

        if (!targetMembership || targetMembership.partyId !== actingMembership.partyId) {
          sendJson(ws, { type: "error", code: "TARGET_NOT_IN_PARTY" });
          return;
        }

        if (targetUserId === actingMembership.party.leaderId) {
          sendJson(ws, { type: "error", code: "CANNOT_KICK_LEADER" });
          return;
        }

        await options.prisma.partyMember.delete({ where: { userId: targetUserId } });

        const affectedUsers = await options.prisma.user.findMany({
          where: {
            id: {
              in: [
                user.id,
                targetUserId,
                ...(
                  await options.prisma.partyMember.findMany({
                    where: { partyId: actingMembership.partyId },
                    select: { userId: true }
                  })
                ).map((member) => member.userId)
              ]
            }
          },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        });

        await updateSocketPartyIdsForUsers(
          options.prisma,
          affectedUsers.map((item) => item.id)
        );
        await sendPartyStateToUsers(options.prisma, affectedUsers);
        broadcastPartyPresenceForUsers(affectedUsers.map((item) => item.id));

        return;
      }

      if (parsed.type === "party:promote") {
        const user = socketUsers.get(ws.id);
        if (!user) {
          sendJson(ws, { type: "error", code: "AUTH_REQUIRED" });
          return;
        }

        const targetUserId =
          typeof parsed.targetUserId === "string" ? parsed.targetUserId : "";
        if (!targetUserId || targetUserId === user.id) {
          sendJson(ws, { type: "error", code: "INVALID_PROMOTION_TARGET" });
          return;
        }

        const actingMembership = await options.prisma.partyMember.findUnique({
          where: { userId: user.id },
          include: { party: true }
        });
        if (!actingMembership) {
          sendJson(ws, { type: "error", code: "NOT_IN_PARTY" });
          return;
        }

        if (actingMembership.party.leaderId !== user.id) {
          sendJson(ws, { type: "error", code: "NOT_PARTY_LEADER" });
          return;
        }

        const targetMembership = await options.prisma.partyMember.findUnique({
          where: { userId: targetUserId },
          select: { userId: true, partyId: true, role: true }
        });
        if (!targetMembership || targetMembership.partyId !== actingMembership.partyId) {
          sendJson(ws, { type: "error", code: "TARGET_NOT_IN_PARTY" });
          return;
        }

        if (targetMembership.role === "MANAGER") {
          sendJson(ws, { type: "error", code: "TARGET_ALREADY_MANAGER" });
          return;
        }

        await options.prisma.partyMember.update({
          where: { userId: targetUserId },
          data: { role: "MANAGER" }
        });

        const affectedUsers = await options.prisma.user.findMany({
          where: {
            id: {
              in: [
                user.id,
                targetUserId,
                ...(
                  await options.prisma.partyMember.findMany({
                    where: { partyId: actingMembership.partyId },
                    select: { userId: true }
                  })
                ).map((member) => member.userId)
              ]
            }
          },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        });

        await sendPartyStateToUsers(options.prisma, affectedUsers);
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
            avatarUrl: user?.avatarUrl ?? null,
            partyId: socketPartyIds.get(ws.id) ?? null,
            micMuted: playerMedia.get(ws.id)?.micMuted ?? true,
            cameraEnabled: playerMedia.get(ws.id)?.cameraEnabled ?? false,
            state
          }
        });
        return;
      }

      if (parsed.type === "player:media") {
        const micMuted = parsed.micMuted === true;
        const cameraEnabled = parsed.cameraEnabled !== false;
        playerMedia.set(ws.id, {
          micMuted,
          cameraEnabled
        });
        broadcastJson(ws, {
          type: "player:media",
          player: {
            clientId: ws.id,
            micMuted,
            cameraEnabled
          }
        });
        return;
      }

      if (parsed.type === "rtc:signal") {
        const toClientId =
          typeof parsed.toClientId === "string" ? parsed.toClientId : "";
        const signal =
          parsed.signal && typeof parsed.signal === "object"
            ? parsed.signal
            : null;

        if (!toClientId || !signal) {
          sendJson(ws, { type: "error", code: "INVALID_SIGNAL_PAYLOAD" });
          return;
        }

        const targetSocket = sockets.get(toClientId);
        if (!targetSocket) {
          sendJson(ws, { type: "error", code: "SIGNAL_TARGET_NOT_FOUND" });
          return;
        }

        if (!isMediaAllowedBetweenClients(ws.id, toClientId)) {
          sendJson(ws, { type: "error", code: "PARTY_MEDIA_RESTRICTED" });
          return;
        }

        sendJson(targetSocket, {
          type: "rtc:signal",
          fromClientId: ws.id,
          signal
        });
      }
    },
    close(ws: any) {
      const user = socketUsers.get(ws.id);
      if (user) {
        removeUserSocket(user.id, ws.id);
        removeInvitesForUser(user.id);
      }

      sockets.delete(ws.id);
      socketUsers.delete(ws.id);
      socketPartyIds.delete(ws.id);
      players.delete(ws.id);
      playerMedia.delete(ws.id);
      ws.publish(WS_TOPIC, JSON.stringify({ type: "player:leave", clientId: ws.id }));
    }
  });
}
