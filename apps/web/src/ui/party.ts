import type { CurrentUser, PartyState } from "../lib/types";

type SearchResult = {
  id: string;
  name: string;
  description: string | null;
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  isPublic: boolean;
  memberCount: number;
  onlineVisitorCount: number;
  modelCount: number;
  placementCount: number;
  updatedAt: string;
  isCurrentWorld: boolean;
  canJoin: boolean;
};

type PartyElements = {
  status: HTMLDivElement | null;
  searchInput: HTMLInputElement | null;
  searchButton: HTMLButtonElement | null;
  searchResults: HTMLDivElement | null;
  memberList: HTMLDivElement | null;
  leaveButton: HTMLButtonElement | null;
  inviteModal: HTMLDivElement | null;
  inviteModalText: HTMLDivElement | null;
  inviteAcceptButton: HTMLButtonElement | null;
  inviteDeclineButton: HTMLButtonElement | null;
};

type PartyControllerOptions = {
  elements: PartyElements;
  onSearch: (query: string) => Promise<SearchResult[]>;
  onJoinWorld: (worldId: string) => void;
  onInviteResponse: (inviteId: string, accept: boolean) => void;
  onLeave: () => void;
  onKick: (userId: string) => void;
  onPromote: (userId: string) => void;
};

export function createPartyController(options: PartyControllerOptions) {
  let currentUser: CurrentUser | null = null;
  let state: PartyState = { party: null, pendingInvites: [] };
  let searchResults: SearchResult[] = [];
  let searchBusy = false;
  let activeInviteId: string | null = null;
  let inviteDeadline = 0;
  let inviteTimer: number | null = null;

  function canManageParty() {
    if (!currentUser) return false;
    if (!state.party) return false;
    const currentUserId = currentUser.id;
    const me = state.party.members.find((member) => member.userId === currentUserId);
    if (!me) return false;
    return me.role === "LEADER" || me.role === "MANAGER";
  }

  function isLeader() {
    if (!currentUser) return false;
    if (!state.party) return false;
    return state.party.leaderUserId === currentUser.id;
  }

  function canInvite() {
    if (!currentUser) return false;
    if (!state.party) return true;
    return canManageParty();
  }

  function setStatus(text: string) {
    if (options.elements.status) {
      options.elements.status.textContent = text;
    }
  }

  function clearInviteTimer() {
    if (inviteTimer !== null) {
      window.clearInterval(inviteTimer);
      inviteTimer = null;
    }
  }

  function closeInviteModal() {
    clearInviteTimer();
    activeInviteId = null;
    inviteDeadline = 0;
    if (options.elements.inviteModal) {
      options.elements.inviteModal.classList.remove("active");
    }
  }

  function showInviteModal(invite: PartyState["pendingInvites"][number]) {
    activeInviteId = invite.id;
    inviteDeadline = Date.parse(invite.expiresAt);
    if (!options.elements.inviteModal || !options.elements.inviteModalText) return;

    options.elements.inviteModal.classList.add("active");

    const renderInviteText = () => {
      const secondsLeft = Math.max(0, Math.ceil((inviteDeadline - Date.now()) / 1000));
      options.elements.inviteModalText!.textContent =
        `${invite.leader.name} invited you to join their world (${secondsLeft}s)`;
      if (secondsLeft <= 0) {
        closeInviteModal();
      }
    };

    renderInviteText();
    clearInviteTimer();
    inviteTimer = window.setInterval(renderInviteText, 250);
  }

  function renderMembers() {
    const memberList = options.elements.memberList;
    const leaveButton = options.elements.leaveButton;
    if (!memberList || !leaveButton) return;

    memberList.innerHTML = "";
    if (!state.party) {
      leaveButton.disabled = true;
      const empty = document.createElement("div");
      empty.className = "party-empty";
      empty.textContent = "No active world";
      memberList.appendChild(empty);
      return;
    }

    leaveButton.disabled = isLeader();
    leaveButton.title = isLeader() ? "World owners cannot leave their own world" : "Leave world";

    for (const member of state.party.members) {
      const row = document.createElement("div");
      row.className = "party-member-row";

      const avatar = document.createElement("div");
      avatar.className = "party-member-avatar";
      if (member.avatarUrl) {
        const image = document.createElement("img");
        image.src = member.avatarUrl;
        image.alt = `${member.name} avatar`;
        image.loading = "lazy";
        avatar.appendChild(image);
      } else {
        const initials = member.name
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("") || "?";
        avatar.textContent = initials;
      }

      const label = document.createElement("div");
      label.className = "party-member-label";
      label.textContent = `${member.role}: ${member.name}`;

      const meta = document.createElement("div");
      meta.className = "party-member-meta";
      meta.textContent = member.online ? "online" : "offline";

      row.appendChild(avatar);
      row.appendChild(label);
      row.appendChild(meta);

      if (
        canManageParty() &&
        !member.isLeader &&
        member.userId !== currentUser?.id
      ) {
        if (isLeader() && member.role === "MEMBER") {
          const promoteButton = document.createElement("button");
          promoteButton.className = "party-secondary-button";
          promoteButton.type = "button";
          promoteButton.textContent = "Promote";
          promoteButton.addEventListener("click", () => {
            options.onPromote(member.userId);
          });
          row.appendChild(promoteButton);
        }

        const kickButton = document.createElement("button");
        kickButton.className = "party-secondary-button";
        kickButton.type = "button";
        kickButton.textContent = "Kick";
        kickButton.addEventListener("click", () => {
          options.onKick(member.userId);
        });
        row.appendChild(kickButton);
      }

      memberList.appendChild(row);
    }
  }

  function renderSearchResults() {
    const searchResultsEl = options.elements.searchResults;
    if (!searchResultsEl) return;

    searchResultsEl.innerHTML = "";

    if (searchBusy) {
      const row = document.createElement("div");
      row.className = "party-empty";
      row.textContent = "Searching...";
      searchResultsEl.appendChild(row);
      return;
    }

    if (searchResults.length === 0) {
      const row = document.createElement("div");
      row.className = "party-empty";
      row.textContent = "No worlds found";
      searchResultsEl.appendChild(row);
      return;
    }

    for (const result of searchResults) {
      const row = document.createElement("div");
      row.className = "world-card";

      const title = document.createElement("div");
      title.className = "world-card-title";
      title.textContent = result.name;

      const meta = document.createElement("div");
      meta.className = "world-card-meta";
      const visibilityLabel = result.isPublic ? "Public" : "Private";
      meta.textContent = `${result.owner.name} • ${visibilityLabel} • ${result.onlineVisitorCount}/${result.memberCount} online`;

      const details = document.createElement("div");
      details.className = "world-card-details";
      details.textContent = `${result.modelCount} models • ${result.placementCount} placements`;

      const summary = document.createElement("div");
      summary.className = "world-card-summary";
      summary.textContent = result.description?.trim() || "No description";

      const updated = document.createElement("div");
      updated.className = "world-card-updated";
      const updatedLabel = new Date(result.updatedAt).toLocaleString();
      updated.textContent = `Updated ${updatedLabel}`;

      const inviteButton = document.createElement("button");
      inviteButton.className = "party-secondary-button";
      inviteButton.type = "button";
      inviteButton.textContent = result.isCurrentWorld ? "Current World" : "Join";

      const alreadyMember = result.isCurrentWorld;
      inviteButton.disabled = alreadyMember || !result.canJoin;
      inviteButton.title = alreadyMember
        ? "Current world"
        : result.canJoin
          ? "Join world"
          : "Private world";

      inviteButton.addEventListener("click", () => {
        options.onJoinWorld(result.id);
      });

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(details);
      row.appendChild(summary);
      row.appendChild(updated);
      row.appendChild(inviteButton);
      searchResultsEl.appendChild(row);
    }
  }

  async function runSearch() {
    const query = options.elements.searchInput?.value.trim() ?? "";
    searchBusy = true;
    renderSearchResults();

    try {
      searchResults = await options.onSearch(query);
    } catch {
      searchResults = [];
      setStatus("Search failed");
    } finally {
      searchBusy = false;
      renderSearchResults();
    }
  }

  function setup() {
    options.elements.searchButton?.addEventListener("click", () => {
      void runSearch();
    });

    options.elements.searchInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void runSearch();
    });

    options.elements.leaveButton?.addEventListener("click", () => {
      options.onLeave();
    });

    options.elements.inviteAcceptButton?.addEventListener("click", () => {
      if (!activeInviteId) return;
      options.onInviteResponse(activeInviteId, true);
      closeInviteModal();
    });

    options.elements.inviteDeclineButton?.addEventListener("click", () => {
      if (!activeInviteId) return;
      options.onInviteResponse(activeInviteId, false);
      closeInviteModal();
    });

    renderMembers();
    renderSearchResults();
  }

  function setCurrentUser(user: CurrentUser | null) {
    currentUser = user;
    renderMembers();
    renderSearchResults();
  }

  function setPartyState(nextState: PartyState) {
    state = nextState;
    if (!state.party) {
      setStatus("No world");
    } else if (isLeader()) {
      setStatus(
        `${state.party.name} • World owner (${state.party.members.length} visitors) • ${
          state.party.isPublic ? "Public" : "Private"
        }`
      );
    } else if (canManageParty()) {
      setStatus(
        `${state.party.name} • World manager (${state.party.members.length} visitors) • ${
          state.party.isPublic ? "Public" : "Private"
        }`
      );
    } else {
      setStatus(
        `${state.party.name} • Visiting (${state.party.members.length} visitors) • ${
          state.party.isPublic ? "Public" : "Private"
        }`
      );
    }

    if (!activeInviteId && state.pendingInvites.length > 0) {
      showInviteModal(state.pendingInvites[0]!);
    }

    renderMembers();
    renderSearchResults();
  }

  function addIncomingInvite(invite: PartyState["pendingInvites"][number]) {
    showInviteModal(invite);
  }

  function setNotice(text: string) {
    setStatus(text);
  }

  return {
    setup,
    setCurrentUser,
    setPartyState,
    addIncomingInvite,
    setNotice,
    canInvite,
    getPartyId: () => state.party?.id ?? null,
    isLeader
  };
}
