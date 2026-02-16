import type {
  ChatMessage,
  PartyState,
  PlayerMediaPayload,
  PlayerPayload,
  PlayerState
} from "../lib/types";
import type { RtcSignalPayload } from "./webrtc";

type RealtimeEvents = {
  onStatus: (status: string) => void;
  onSessionInfo: (clientId: string | null) => void;
  onChatHistory: (messages: ChatMessage[]) => void;
  onChatMessage: (message: ChatMessage) => void;
  onPlayerSnapshot: (players: PlayerPayload[]) => void;
  onPlayerUpdate: (player: PlayerPayload) => void;
  onPlayerMedia: (player: PlayerMediaPayload) => void;
  onPlayerLeave: (clientId: string) => void;
  onPlayerParty: (clientId: string, partyId: string | null) => void;
  onPartyState: (state: PartyState) => void;
  onPartyInvite: (invite: PartyState["pendingInvites"][number]) => void;
  onPartyChatHistory: (messages: ChatMessage[]) => void;
  onPartyChatMessage: (message: ChatMessage) => void;
  onRtcSignal: (fromClientId: string, signal: RtcSignalPayload) => void;
  onAuthRequired: () => void;
  onError: (code: string, payload: Record<string, unknown>) => void;
};

export function createRealtimeClient(
  wsUrl: string,
  events: RealtimeEvents
) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;

  function isOpen() {
    return socket?.readyState === WebSocket.OPEN;
  }

  function connect() {
    if (socket?.readyState === WebSocket.OPEN) return;
    if (socket?.readyState === WebSocket.CONNECTING) return;

    events.onStatus("Connecting...");
    socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      events.onStatus("Connected");
    });

    socket.addEventListener("message", (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (!payload || typeof payload !== "object") return;

      const data = payload as {
        type?: string;
        code?: string;
        clientId?: string;
        message?: ChatMessage;
        messages?: ChatMessage[];
        player?: unknown;
        players?: PlayerPayload[];
        fromClientId?: string;
        signal?: RtcSignalPayload;
        party?: PartyState["party"];
        pendingInvites?: PartyState["pendingInvites"];
        invite?: PartyState["pendingInvites"][number];
        partyId?: string | null;
      };

      if (data.type === "session:info") {
        events.onSessionInfo(data.clientId ?? null);
        return;
      }

      if (data.type === "chat:history" && Array.isArray(data.messages)) {
        events.onChatHistory(data.messages);
        return;
      }

      if (data.type === "chat:new" && data.message) {
        events.onChatMessage(data.message);
        return;
      }

      if (data.type === "player:snapshot" && Array.isArray(data.players)) {
        events.onPlayerSnapshot(data.players);
        return;
      }

      if (data.type === "player:update" && data.player) {
        events.onPlayerUpdate(data.player as PlayerPayload);
        return;
      }

      if (data.type === "player:media" && data.player) {
        events.onPlayerMedia(data.player as PlayerMediaPayload);
        return;
      }

      if (data.type === "player:leave" && data.clientId) {
        events.onPlayerLeave(data.clientId);
        return;
      }

      if (data.type === "player:party" && data.clientId) {
        events.onPlayerParty(data.clientId, data.partyId ?? null);
        return;
      }

      if (data.type === "party:state") {
        events.onPartyState({
          party: data.party ?? null,
          pendingInvites: Array.isArray(data.pendingInvites) ? data.pendingInvites : []
        });
        return;
      }

      if (data.type === "party:invite" && data.invite) {
        events.onPartyInvite(data.invite);
        return;
      }

      if (data.type === "party:chat:history" && Array.isArray(data.messages)) {
        events.onPartyChatHistory(data.messages);
        return;
      }

      if (data.type === "party:chat:new" && data.message) {
        events.onPartyChatMessage(data.message);
        return;
      }

      if (data.type === "rtc:signal" && data.fromClientId && data.signal) {
        events.onRtcSignal(data.fromClientId, data.signal);
        return;
      }

      if (data.type === "error" && typeof data.code === "string") {
        if (data.code === "AUTH_REQUIRED") {
          events.onAuthRequired();
        }
        events.onError(data.code, data as Record<string, unknown>);
      }
    });

    socket.addEventListener("close", () => {
      events.onStatus("Disconnected");
      events.onSessionInfo(null);

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      reconnectTimer = window.setTimeout(() => {
        connect();
      }, 1500);
    });

    socket.addEventListener("error", () => {
      events.onStatus("Connection error");
    });
  }

  function sendChat(text: string) {
    if (!isOpen() || !socket) return false;

    socket.send(
      JSON.stringify({
        type: "chat:send",
        text
      })
    );

    return true;
  }

  function sendPlayerUpdate(state: PlayerState) {
    if (!isOpen() || !socket) return false;

    socket.send(
      JSON.stringify({
        type: "player:update",
        state
      })
    );

    return true;
  }

  function sendRtcSignal(toClientId: string, signal: RtcSignalPayload) {
    if (!isOpen() || !socket) return false;

    socket.send(
      JSON.stringify({
        type: "rtc:signal",
        toClientId,
        signal
      })
    );

    return true;
  }

  function sendPlayerMedia(micMuted: boolean, cameraEnabled: boolean) {
    if (!isOpen() || !socket) return false;

    socket.send(
      JSON.stringify({
        type: "player:media",
        micMuted,
        cameraEnabled
      })
    );

    return true;
  }

  function sendPartyInvite(target: { targetUserId?: string; targetClientId?: string }) {
    if (!isOpen() || !socket) return false;
    socket.send(
      JSON.stringify({
        type: "party:invite",
        ...target
      })
    );
    return true;
  }

  function sendPartyInviteResponse(inviteId: string, accept: boolean) {
    if (!isOpen() || !socket) return false;
    socket.send(
      JSON.stringify({
        type: "party:invite:respond",
        inviteId,
        accept
      })
    );
    return true;
  }

  function sendPartyLeave() {
    if (!isOpen() || !socket) return false;
    socket.send(
      JSON.stringify({
        type: "party:leave"
      })
    );
    return true;
  }

  function sendPartyKick(targetUserId: string) {
    if (!isOpen() || !socket) return false;
    socket.send(
      JSON.stringify({
        type: "party:kick",
        targetUserId
      })
    );
    return true;
  }

  function sendPartyPromote(targetUserId: string) {
    if (!isOpen() || !socket) return false;
    socket.send(
      JSON.stringify({
        type: "party:promote",
        targetUserId
      })
    );
    return true;
  }

  function sendPartyChat(text: string) {
    if (!isOpen() || !socket) return false;
    socket.send(
      JSON.stringify({
        type: "party:chat:send",
        text
      })
    );
    return true;
  }

  return {
    connect,
    isOpen,
    sendChat,
    sendPlayerUpdate,
    sendRtcSignal,
    sendPlayerMedia,
    sendPartyInvite,
    sendPartyInviteResponse,
    sendPartyLeave,
    sendPartyKick,
    sendPartyPromote,
    sendPartyChat
  };
}
