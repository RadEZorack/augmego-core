import type { CurrentUser } from "../lib/types";
import {
  PENDING_WORLD_JOIN_STORAGE_KEY,
  parseWorldIdFromUrl
} from "../lib/urls";

type AuthElements = {
  loginMenu: HTMLElement | null;
  loginToggleButton: HTMLButtonElement | null;
  loginLinkedinButton: HTMLButtonElement | null;
  loginGoogleButton: HTMLButtonElement | null;
  loginAppleButton: HTMLButtonElement | null;
  logoutButton: HTMLButtonElement | null;
  profileMenu: HTMLElement | null;
  userAvatar: HTMLImageElement | null;
};

type AuthControllerOptions = {
  elements: AuthElements;
  apiUrl: (path: string) => string;
  onUserChange?: (user: CurrentUser | null) => void;
};

export function createAuthController(options: AuthControllerOptions) {
  let currentUser: CurrentUser | null = null;
  let menuExpanded = false;

  function displayName(user: CurrentUser) {
    return user.name?.trim() || "User";
  }

  function buildFallbackAvatarDataUrl(name: string) {
    const initials =
      name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "U";
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#0f4060' offset='0'/><stop stop-color='#0b8fb3' offset='1'/></linearGradient></defs><rect width='80' height='80' fill='url(#g)'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#e9fbff' font-size='30' font-family='Arial, sans-serif'>${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function notify() {
    options.onUserChange?.(currentUser);
  }

  function setMenuExpanded(expanded: boolean) {
    const { loginMenu, loginToggleButton } = options.elements;
    menuExpanded = expanded;
    if (loginMenu) {
      loginMenu.classList.toggle("expanded", expanded);
    }
    if (loginToggleButton) {
      loginToggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function updateButtons() {
    const {
      loginMenu,
      loginToggleButton,
      loginLinkedinButton,
      loginGoogleButton,
      loginAppleButton,
      logoutButton,
      profileMenu,
      userAvatar
    } = options.elements;

    if (currentUser) {
      setMenuExpanded(false);
      if (loginMenu) loginMenu.style.display = "none";
      if (loginToggleButton) loginToggleButton.style.display = "none";
      if (logoutButton) {
        logoutButton.textContent = "Log out";
        logoutButton.style.display = "inline-flex";
      }
      if (profileMenu) {
        profileMenu.hidden = false;
        profileMenu.style.display = "flex";
      }
      if (loginLinkedinButton) loginLinkedinButton.style.display = "none";
      if (loginGoogleButton) loginGoogleButton.style.display = "none";
      if (loginAppleButton) loginAppleButton.style.display = "none";

      if (userAvatar) {
        const name = displayName(currentUser);
        userAvatar.src = currentUser.avatarUrl ?? buildFallbackAvatarDataUrl(name);
        userAvatar.alt = `${name} avatar`;
        userAvatar.style.display = "block";
      }
      return;
    }

    if (logoutButton) logoutButton.style.display = "none";
    if (profileMenu) {
      profileMenu.hidden = true;
      profileMenu.style.display = "none";
    }
    if (loginMenu) loginMenu.style.display = "flex";
    if (loginToggleButton) loginToggleButton.style.display = "inline-flex";
    if (loginLinkedinButton) loginLinkedinButton.style.display = "inline-flex";
    if (loginGoogleButton) loginGoogleButton.style.display = "inline-flex";
    if (loginAppleButton) loginAppleButton.style.display = "inline-flex";
    setMenuExpanded(false);

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
      loginMenu,
      loginToggleButton,
      loginLinkedinButton,
      loginGoogleButton,
      loginAppleButton,
      logoutButton
    } = options.elements;

    const persistPendingWorldJoin = () => {
      try {
        const worldId = parseWorldIdFromUrl(new URL(window.location.href));
        if (worldId) {
          window.sessionStorage.setItem(PENDING_WORLD_JOIN_STORAGE_KEY, worldId);
        }
      } catch {
        // Ignore storage/url parsing failures and continue login flow.
      }
    };

    if (loginToggleButton) {
      loginToggleButton.addEventListener("click", () => {
        setMenuExpanded(!menuExpanded);
      });
    }

    if (loginMenu) {
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (!menuExpanded) return;
        if (!loginMenu.contains(target)) {
          setMenuExpanded(false);
        }
      });
    }

    if (loginLinkedinButton) {
      loginLinkedinButton.addEventListener("click", () => {
        setMenuExpanded(false);
        persistPendingWorldJoin();
        window.location.href = options.apiUrl("/api/v1/auth/linkedin");
      });
    }

    if (loginGoogleButton) {
      loginGoogleButton.addEventListener("click", () => {
        setMenuExpanded(false);
        persistPendingWorldJoin();
        window.location.href = options.apiUrl("/api/v1/auth/google");
      });
    }

    if (loginAppleButton) {
      loginAppleButton.addEventListener("click", () => {
        setMenuExpanded(false);
        persistPendingWorldJoin();
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
    getCurrentUser,
    displayName
  };
}
