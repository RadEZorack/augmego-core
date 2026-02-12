type DeviceOption = {
  id: string;
  label: string;
};

type PermissionState = "not_requested" | "requesting" | "granted" | "blocked";

type MediaControllerOptions = {
  accessCard: HTMLDivElement | null;
  accessStatus: HTMLDivElement | null;
  enableButton: HTMLButtonElement | null;
  mutedButton: HTMLButtonElement | null;
  micToggle: HTMLButtonElement | null;
  cameraToggle: HTMLButtonElement | null;
  audioInputSelect: HTMLSelectElement | null;
  videoInputSelect: HTMLSelectElement | null;
  audioOutputSelect: HTMLSelectElement | null;
  remoteVolumeList: HTMLDivElement | null;
  onRequestAccess: () => Promise<boolean>;
  onMicToggle: (muted: boolean) => void;
  onCameraToggle: (enabled: boolean) => void;
  onAudioInputChange: (deviceId: string) => void;
  onVideoInputChange: (deviceId: string) => void;
  onAudioOutputChange: (deviceId: string) => void;
  onRemoteVolumeChange: (clientId: string, volume: number) => void;
};

type VolumeRow = {
  row: HTMLDivElement;
  slider: HTMLInputElement;
  nameEl: HTMLDivElement;
};

export function createMediaController(options: MediaControllerOptions) {
  let micMuted = false;
  let cameraEnabled = true;
  let permissionState: PermissionState = "not_requested";

  const volumeRows = new Map<string, VolumeRow>();

  function setControlsEnabled(enabled: boolean) {
    if (options.micToggle) options.micToggle.disabled = !enabled;
    if (options.cameraToggle) options.cameraToggle.disabled = !enabled;
    if (options.audioInputSelect) options.audioInputSelect.disabled = !enabled;
    if (options.videoInputSelect) options.videoInputSelect.disabled = !enabled;
    if (options.audioOutputSelect) options.audioOutputSelect.disabled = !enabled;
  }

  function setPermissionState(state: PermissionState) {
    permissionState = state;

    if (!options.accessCard || !options.accessStatus || !options.enableButton) {
      return;
    }

    options.accessCard.classList.toggle("blocked", state === "blocked");
    options.accessCard.classList.toggle("compact", state === "granted");

    if (state === "not_requested") {
      options.accessStatus.textContent =
        "To join voice/video, grant camera and microphone access.";
      options.enableButton.textContent = "Enable Camera & Mic";
      options.enableButton.disabled = false;
      setControlsEnabled(false);
      return;
    }

    if (state === "requesting") {
      options.accessStatus.textContent = "Waiting for browser permission...";
      options.enableButton.textContent = "Requesting...";
      options.enableButton.disabled = true;
      setControlsEnabled(false);
      return;
    }

    if (state === "granted") {
      options.accessStatus.textContent = "Media ready";
      options.enableButton.textContent = "Enable Camera & Mic";
      options.enableButton.disabled = false;
      setControlsEnabled(true);
      return;
    }

    options.accessStatus.textContent =
      "Access blocked. Enable Camera and Microphone for this site in Safari settings.";
    options.enableButton.textContent = "Retry access";
    options.enableButton.disabled = false;
    setControlsEnabled(false);
  }

  async function requestAccess() {
    setPermissionState("requesting");
    const granted = await options.onRequestAccess();
    setPermissionState(granted ? "granted" : "blocked");
  }

  function ensureAccess() {
    if (permissionState === "granted") return true;

    if (permissionState === "blocked") {
      setPermissionState("blocked");
      return false;
    }

    void requestAccess();
    return false;
  }

  function setMicMuted(muted: boolean) {
    micMuted = muted;
    if (!options.micToggle) return;

    options.micToggle.textContent = micMuted ? "Unmute Mic" : "Mute Mic";
    options.micToggle.classList.toggle("off", micMuted);
  }

  function setCameraEnabled(enabled: boolean) {
    cameraEnabled = enabled;
    if (!options.cameraToggle) return;

    options.cameraToggle.textContent = cameraEnabled ? "Camera Off" : "Camera On";
    options.cameraToggle.classList.toggle("off", !cameraEnabled);
  }

  function fillSelect(
    select: HTMLSelectElement | null,
    list: DeviceOption[],
    selectedId: string | null,
    fallbackLabel: string
  ) {
    if (!select) return;

    select.innerHTML = "";
    if (list.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = fallbackLabel;
      select.appendChild(option);
      return;
    }

    for (const item of list) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      select.appendChild(option);
    }

    if (selectedId) {
      select.value = selectedId;
    }
  }

  function setDeviceLists(payload: {
    audioInputs: DeviceOption[];
    videoInputs: DeviceOption[];
    audioOutputs: DeviceOption[];
    selectedAudioInputId: string | null;
    selectedVideoInputId: string | null;
    selectedAudioOutputId: string | null;
  }) {
    fillSelect(
      options.audioInputSelect,
      payload.audioInputs,
      payload.selectedAudioInputId,
      "No microphones"
    );
    fillSelect(
      options.videoInputSelect,
      payload.videoInputs,
      payload.selectedVideoInputId,
      "No cameras"
    );
    fillSelect(
      options.audioOutputSelect,
      payload.audioOutputs,
      payload.selectedAudioOutputId,
      "Default output"
    );
  }

  function upsertRemoteVolume(clientId: string, label: string, volume: number) {
    if (!options.remoteVolumeList) return;

    const existing = volumeRows.get(clientId);
    if (existing) {
      existing.nameEl.textContent = label;
      existing.slider.value = String(Math.round(volume * 100));
      return;
    }

    const row = document.createElement("div");
    row.className = "volume-row";

    const nameEl = document.createElement("div");
    nameEl.className = "volume-name";
    nameEl.textContent = label;

    const slider = document.createElement("input");
    slider.className = "volume-slider";
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(Math.round(volume * 100));
    slider.addEventListener("input", () => {
      const normalized = Number(slider.value) / 100;
      options.onRemoteVolumeChange(clientId, normalized);
    });

    row.appendChild(nameEl);
    row.appendChild(slider);
    options.remoteVolumeList.appendChild(row);

    volumeRows.set(clientId, { row, slider, nameEl });
  }

  function removeRemoteVolume(clientId: string) {
    const existing = volumeRows.get(clientId);
    if (!existing) return;

    existing.row.remove();
    volumeRows.delete(clientId);
  }

  function setup() {
    setMicMuted(false);
    setCameraEnabled(true);
    setPermissionState("not_requested");

    options.enableButton?.addEventListener("click", () => {
      void requestAccess();
    });

    options.mutedButton?.addEventListener("click", () => {
      setPermissionState("not_requested");
    });

    options.micToggle?.addEventListener("click", () => {
      if (!ensureAccess()) return;
      setMicMuted(!micMuted);
      options.onMicToggle(micMuted);
    });

    options.cameraToggle?.addEventListener("click", () => {
      if (!ensureAccess()) return;
      setCameraEnabled(!cameraEnabled);
      options.onCameraToggle(cameraEnabled);
    });

    options.audioInputSelect?.addEventListener("change", () => {
      if (!ensureAccess()) return;
      options.onAudioInputChange(options.audioInputSelect?.value ?? "");
    });

    options.videoInputSelect?.addEventListener("change", () => {
      if (!ensureAccess()) return;
      options.onVideoInputChange(options.videoInputSelect?.value ?? "");
    });

    options.audioOutputSelect?.addEventListener("change", () => {
      if (!ensureAccess()) return;
      options.onAudioOutputChange(options.audioOutputSelect?.value ?? "");
    });
  }

  return {
    setup,
    setMicMuted,
    setCameraEnabled,
    setPermissionState,
    setDeviceLists,
    upsertRemoteVolume,
    removeRemoteVolume
  };
}
