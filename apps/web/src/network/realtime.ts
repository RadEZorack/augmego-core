import type { ChatMessage, PlayerPayload, PlayerState } from "../lib/types";
import type { RtcSignalPayload } from "./webrtc";

type RealtimeEvents = {
  onStatus: (status: string) => void;
  onSessionInfo: (clientId: string | null) => void;
  onChatHistory: (messages: ChatMessage[]) => void;
  onChatMessage: (message: ChatMessage) => void;
  onPlayerSnapshot: (players: PlayerPayload[]) => void;
  onPlayerUpdate: (player: PlayerPayload) => void;
  onPlayerLeave: (clientId: string) => void;
  onRtcSignal: (fromClientId: string, signal: RtcSignalPayload) => void;
  onAuthRequired: () => void;
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
        player?: PlayerPayload;
        players?: PlayerPayload[];
        fromClientId?: string;
        signal?: RtcSignalPayload;
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
        events.onPlayerUpdate(data.player);
        return;
      }

      if (data.type === "player:leave" && data.clientId) {
        events.onPlayerLeave(data.clientId);
        return;
      }

      if (data.type === "rtc:signal" && data.fromClientId && data.signal) {
        events.onRtcSignal(data.fromClientId, data.signal);
        return;
      }

      if (data.type === "error" && data.code === "AUTH_REQUIRED") {
        events.onAuthRequired();
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

  return {
    connect,
    isOpen,
    sendChat,
    sendPlayerUpdate,
    sendRtcSignal
  };
}
