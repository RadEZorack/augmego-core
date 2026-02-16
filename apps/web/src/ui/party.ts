import type { CurrentUser, PartyState } from "../lib/types";

type SearchResult = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
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
  onInviteUser: (userId: string) => void;
  onInviteResponse: (inviteId: string, accept: boolean) => void;
  onLeave: () => void;
  onKick: (userId: string) => void;
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
        `${invite.leader.name} invited you to join their party (${secondsLeft}s)`;
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
      empty.textContent = "Not in a party";
      memberList.appendChild(empty);
      return;
    }

    leaveButton.disabled = false;

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
      label.textContent = `${member.isLeader ? "Leader" : "Member"}: ${member.name}`;

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
      row.textContent = "No results";
      searchResultsEl.appendChild(row);
      return;
    }

    const memberUserIds = new Set(state.party?.members.map((member) => member.userId) ?? []);

    for (const result of searchResults) {
      const row = document.createElement("div");
      row.className = "party-result-row";

      const label = document.createElement("div");
      label.className = "party-result-label";
      label.textContent = result.name || result.email || "User";

      const inviteButton = document.createElement("button");
      inviteButton.className = "party-invite-button";
      inviteButton.type = "button";
      inviteButton.textContent = "+";

      const alreadyMember = memberUserIds.has(result.id);
      inviteButton.disabled = !canInvite() || alreadyMember;
      inviteButton.title = alreadyMember
        ? "Already in party"
        : canInvite()
          ? "Send invite"
          : "Only the leader can invite";

      inviteButton.addEventListener("click", () => {
        options.onInviteUser(result.id);
      });

      row.appendChild(label);
      row.appendChild(inviteButton);
      searchResultsEl.appendChild(row);
    }
  }

  async function runSearch() {
    const query = options.elements.searchInput?.value.trim() ?? "";
    if (query.length < 2) {
      searchResults = [];
      renderSearchResults();
      return;
    }

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
      setStatus("No party");
    } else if (canManageParty()) {
      setStatus(`Party leader (${state.party.members.length} members)`);
    } else {
      setStatus(`In party (${state.party.members.length} members)`);
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
    isLeader: () => canManageParty()
  };
}
