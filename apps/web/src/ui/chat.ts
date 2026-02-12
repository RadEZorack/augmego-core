import type { ChatMessage } from "../lib/types";

type ChatElements = {
  chatLog: HTMLDivElement | null;
  chatStatus: HTMLSpanElement | null;
  chatInput: HTMLInputElement | null;
  chatSendButton: HTMLButtonElement | null;
  chatForm: HTMLFormElement | null;
};

export function createChatController(elements: ChatElements) {
  function setCanPost(canPost: boolean) {
    if (elements.chatInput) {
      elements.chatInput.disabled = !canPost;
      elements.chatInput.placeholder = canPost ? "Type a message" : "Sign in to chat";
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

  function appendMessage(message: ChatMessage) {
    if (!elements.chatLog) return;

    const row = document.createElement("div");
    row.className = "chat-row";
    const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    row.textContent = `[${timestamp}] ${message.user.name}: ${message.text}`;
    elements.chatLog.appendChild(row);
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight;

    while (elements.chatLog.childElementCount > 150) {
      elements.chatLog.removeChild(elements.chatLog.firstElementChild as Node);
    }
  }

  function replaceHistory(messages: ChatMessage[]) {
    if (elements.chatLog) {
      elements.chatLog.innerHTML = "";
    }

    for (const message of messages) {
      appendMessage(message);
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
    onSubmit
  };
}
