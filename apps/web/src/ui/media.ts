type DeviceOption = {
  id: string;
  label: string;
};

type MediaControllerOptions = {
  micToggle: HTMLButtonElement | null;
  cameraToggle: HTMLButtonElement | null;
  audioInputSelect: HTMLSelectElement | null;
  videoInputSelect: HTMLSelectElement | null;
  audioOutputSelect: HTMLSelectElement | null;
  remoteVolumeList: HTMLDivElement | null;
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

  const volumeRows = new Map<string, VolumeRow>();

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
      select.disabled = true;
      return;
    }

    select.disabled = false;
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

    options.micToggle?.addEventListener("click", () => {
      setMicMuted(!micMuted);
      options.onMicToggle(micMuted);
    });

    options.cameraToggle?.addEventListener("click", () => {
      setCameraEnabled(!cameraEnabled);
      options.onCameraToggle(cameraEnabled);
    });

    options.audioInputSelect?.addEventListener("change", () => {
      options.onAudioInputChange(options.audioInputSelect?.value ?? "");
    });

    options.videoInputSelect?.addEventListener("change", () => {
      options.onVideoInputChange(options.videoInputSelect?.value ?? "");
    });

    options.audioOutputSelect?.addEventListener("change", () => {
      options.onAudioOutputChange(options.audioOutputSelect?.value ?? "");
    });
  }

  return {
    setup,
    setMicMuted,
    setCameraEnabled,
    setDeviceLists,
    upsertRemoteVolume,
    removeRemoteVolume
  };
}
