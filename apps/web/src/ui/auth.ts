import type { CurrentUser } from "../lib/types";

type AuthElements = {
  loginLinkedinButton: HTMLButtonElement | null;
  loginGoogleButton: HTMLButtonElement | null;
  loginAppleButton: HTMLButtonElement | null;
  logoutButton: HTMLButtonElement | null;
  userAvatar: HTMLImageElement | null;
};

type AuthControllerOptions = {
  elements: AuthElements;
  apiUrl: (path: string) => string;
  onUserChange?: (user: CurrentUser | null) => void;
};

export function createAuthController(options: AuthControllerOptions) {
  let currentUser: CurrentUser | null = null;

  function displayName(user: CurrentUser) {
    return user.name ?? user.email ?? "User";
  }

  function notify() {
    options.onUserChange?.(currentUser);
  }

  function updateButtons() {
    const {
      loginLinkedinButton,
      loginGoogleButton,
      loginAppleButton,
      logoutButton,
      userAvatar
    } = options.elements;

    if (currentUser) {
      if (logoutButton) {
        logoutButton.textContent = `Log out ${displayName(currentUser)}`;
        logoutButton.style.display = "inline-flex";
      }
      if (loginLinkedinButton) loginLinkedinButton.style.display = "none";
      if (loginGoogleButton) loginGoogleButton.style.display = "none";
      if (loginAppleButton) loginAppleButton.style.display = "none";

      if (userAvatar) {
        userAvatar.src = currentUser.avatarUrl ?? "";
        userAvatar.alt = currentUser.avatarUrl
          ? `${displayName(currentUser)} avatar`
          : "";
        userAvatar.style.display = currentUser.avatarUrl ? "block" : "none";
      }
      return;
    }

    if (logoutButton) logoutButton.style.display = "none";
    if (loginLinkedinButton) loginLinkedinButton.style.display = "inline-flex";
    if (loginGoogleButton) loginGoogleButton.style.display = "inline-flex";
    if (loginAppleButton) loginAppleButton.style.display = "inline-flex";

    if (userAvatar) {
      userAvatar.removeAttribute("src");
      userAvatar.alt = "";
      userAvatar.style.display = "none";
    }
  }

  async function loadCurrentUser() {
    try {
      const response = await fetch(options.apiUrl("/api/v1/auth/me"), {
        credentials: "include"
      });

      if (!response.ok) {
        currentUser = null;
        updateButtons();
        notify();
        return;
      }

      const data = (await response.json()) as { user: CurrentUser | null };
      currentUser = data.user;
    } catch {
      currentUser = null;
    }

    updateButtons();
    notify();
  }

  function setup() {
    const {
      loginLinkedinButton,
      loginGoogleButton,
      loginAppleButton,
      logoutButton
    } = options.elements;

    if (loginLinkedinButton) {
      loginLinkedinButton.addEventListener("click", () => {
        window.location.href = options.apiUrl("/api/v1/auth/linkedin");
      });
    }

    if (loginGoogleButton) {
      loginGoogleButton.addEventListener("click", () => {
        window.location.href = options.apiUrl("/api/v1/auth/google");
      });
    }

    if (loginAppleButton) {
      loginAppleButton.addEventListener("click", () => {
        window.location.href = options.apiUrl("/api/v1/auth/apple");
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        try {
          await fetch(options.apiUrl("/api/v1/auth/logout"), {
            method: "POST",
            credentials: "include"
          });
        } finally {
          currentUser = null;
          updateButtons();
          notify();
        }
      });
    }

    updateButtons();
  }

  function getCurrentUser() {
    return currentUser;
  }

  return {
    setup,
    loadCurrentUser,
    getCurrentUser
  };
}
