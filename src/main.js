const video = document.getElementById("webcam");
const keyboardsLayer = document.getElementById("keyboardsLayer");
const plusBtn = document.getElementById("plusBtn");
const doneBtn = document.getElementById("doneBtn");
const libraryPanel = document.getElementById("libraryPanel");
const libraryGrid = document.getElementById("libraryGrid");
const newChordBtn = document.getElementById("newChordBtn");
const deleteChordBtn = document.getElementById("deleteChordBtn");

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHORD_LIBRARY = NOTE_NAMES.flatMap((n) => [n, n + "m"]);

let uidCounter = 0;
const uid = () => "id" + uidCounter++;

const state = {
  keyboards: [],
  mode: "idle", // "idle" | "editing"
  editingId: null,
  selectedPadId: null,
};

function createKeyboard(x, y) {
  return {
    id: uid(),
    x,
    y,
    radius: 90,
    chords: [
      { id: uid(), name: "C" },
      { id: uid(), name: "G" },
      { id: uid(), name: "F" },
      { id: uid(), name: "Am" },
    ],
  };
}

function nextPosition() {
  const count = state.keyboards.length;
  return {
    x: 220 + (count % 3) * 220,
    y: 220 + Math.floor(count / 3) * 220,
  };
}

function editingKeyboard() {
  return state.keyboards.find((k) => k.id === state.editingId) || null;
}

// --- drag-to-reorder state ---
let dragging = null; // { kbId, chordId }

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const kb = state.keyboards.find((k) => k.id === dragging.kbId);
  if (!kb) return;
  const n = kb.chords.length;
  const angleDeg = (Math.atan2(e.clientY - kb.y, e.clientX - kb.x) * 180) / Math.PI;
  const normalized = (angleDeg + 90 + 360) % 360;
  const targetIndex = Math.round(normalized / (360 / n)) % n;
  const currentIndex = kb.chords.findIndex((c) => c.id === dragging.chordId);
  if (currentIndex !== -1 && currentIndex !== targetIndex) {
    const [moved] = kb.chords.splice(currentIndex, 1);
    kb.chords.splice(targetIndex, 0, moved);
    render();
  }
});

window.addEventListener("mouseup", () => {
  dragging = null;
});

function playChord(chord, padEl) {
  console.log("played", chord.name);
  padEl.classList.add("playing");
  setTimeout(() => padEl.classList.remove("playing"), 200);
}

function renderKeyboard(kb) {
  const n = kb.chords.length;
  kb.chords.forEach((chord, i) => {
    const angle = ((-90 + i * (360 / n)) * Math.PI) / 180;
    const px = kb.x + kb.radius * Math.cos(angle);
    const py = kb.y + kb.radius * Math.sin(angle);

    const pad = document.createElement("div");
    pad.className = "pad";
    pad.style.left = px + "px";
    pad.style.top = py + "px";
    pad.textContent = chord.name;

    const isEditingThisKb = state.mode === "editing" && state.editingId === kb.id;
    if (isEditingThisKb && chord.id === state.selectedPadId) {
      pad.classList.add("selected");
    }

    if (isEditingThisKb) {
      pad.addEventListener("mousedown", () => {
        dragging = { kbId: kb.id, chordId: chord.id };
        state.selectedPadId = chord.id;
        render();
      });
    } else if (state.mode === "idle") {
      pad.addEventListener("click", () => playChord(chord, pad));
    }

    keyboardsLayer.appendChild(pad);
  });
}

function renderLibrary() {
  libraryGrid.innerHTML = "";
  CHORD_LIBRARY.forEach((name) => {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.addEventListener("click", () => {
      const kb = editingKeyboard();
      if (!kb || !state.selectedPadId) return;
      const pad = kb.chords.find((c) => c.id === state.selectedPadId);
      if (pad) pad.name = name;
      render();
    });
    libraryGrid.appendChild(btn);
  });
}

function render() {
  keyboardsLayer.innerHTML = "";
  state.keyboards.forEach(renderKeyboard);

  plusBtn.style.display = state.mode === "idle" ? "block" : "none";
  doneBtn.style.display = state.mode === "editing" ? "block" : "none";
  libraryPanel.style.display = state.mode === "editing" ? "block" : "none";

  if (state.mode === "editing") {
    renderLibrary();
    const kb = editingKeyboard();
    const canDelete = kb && kb.chords.length > 1 && state.selectedPadId;
    deleteChordBtn.disabled = !canDelete;
  }
}

plusBtn.addEventListener("click", () => {
  const { x, y } = nextPosition();
  const kb = createKeyboard(x, y);
  state.keyboards.push(kb);
  state.mode = "editing";
  state.editingId = kb.id;
  state.selectedPadId = kb.chords[0].id;
  render();
});

newChordBtn.addEventListener("click", () => {
  const kb = editingKeyboard();
  if (!kb) return;
  const newChord = { id: uid(), name: "C" };
  kb.chords.push(newChord);
  state.selectedPadId = newChord.id;
  render();
});

deleteChordBtn.addEventListener("click", () => {
  const kb = editingKeyboard();
  if (!kb || kb.chords.length <= 1) return;
  kb.chords = kb.chords.filter((c) => c.id !== state.selectedPadId);
  state.selectedPadId = kb.chords[0] ? kb.chords[0].id : null;
  render();
});

doneBtn.addEventListener("click", () => {
  state.mode = "idle";
  state.editingId = null;
  state.selectedPadId = null;
  render();
});

async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    console.warn("Camera unavailable, continuing without it:", err);
  }
}

setupCamera();
render();
