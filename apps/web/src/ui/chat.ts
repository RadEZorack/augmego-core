import type { ChatMessage } from "../lib/types";
type ChatChannel = "global" | "world";
type CombinedChatMessage = {
  channel: ChatChannel;
  message: ChatMessage;
};

type ChatElements = {
  chatLog: HTMLDivElement | null;
  chatStatus: HTMLSpanElement | null;
  chatInput: HTMLInputElement | null;
  chatSendButton: HTMLButtonElement | null;
  chatForm: HTMLFormElement | null;
};

export function createChatController(elements: ChatElements) {
  function setCanPost(canPost: boolean, disabledPlaceholder = "Sign in to chat") {
    if (elements.chatInput) {
      elements.chatInput.disabled = !canPost;
      elements.chatInput.placeholder = canPost ? "Type a message" : disabledPlaceholder;
    }

    if (elements.chatSendButton) {
      elements.chatSendButton.disabled = !canPost;
    }
  }

  function setStatus(text: string) {
    if (elements.chatStatus) {
      elements.chatStatus.textContent = text;
    }
  }

  function appendMessage(message: ChatMessage, channel: ChatChannel = "global") {
    if (!elements.chatLog) return;

    const row = document.createElement("div");
    row.className = `chat-row chat-row-${channel}`;
    const channelBadge = document.createElement("span");
    channelBadge.className = `chat-channel-badge chat-channel-${channel}`;
    channelBadge.textContent = channel === "world" ? "WORLD" : "GLOBAL";
    row.appendChild(channelBadge);

    const messageText = document.createElement("span");
    const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    messageText.textContent = `[${timestamp}] ${message.user.name}: ${message.text}`;
    row.appendChild(messageText);
    elements.chatLog.appendChild(row);
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight;

    while (elements.chatLog.childElementCount > 150) {
      elements.chatLog.removeChild(elements.chatLog.firstElementChild as Node);
    }
  }

  function replaceHistory(messages: ChatMessage[], channel: ChatChannel = "global") {
    if (elements.chatLog) {
      elements.chatLog.innerHTML = "";
    }

    for (const message of messages) {
      appendMessage(message, channel);
    }
  }

  function replaceCombinedHistory(entries: CombinedChatMessage[]) {
    if (elements.chatLog) {
      elements.chatLog.innerHTML = "";
    }

    for (const entry of entries) {
      appendMessage(entry.message, entry.channel);
    }
  }

  function onSubmit(handler: (text: string) => void) {
    if (!elements.chatForm) return;

    elements.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!elements.chatInput) return;

      const text = elements.chatInput.value.trim();
      if (!text) return;

      handler(text);
      elements.chatInput.value = "";
    });
  }

  return {
    setCanPost,
    setStatus,
    appendMessage,
    replaceHistory,
    replaceCombinedHistory,
    onSubmit
  };
}
