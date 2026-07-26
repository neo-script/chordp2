import * as Tone from "tone";

const video = document.getElementById("webcam");
const keyboardsLayer = document.getElementById("keyboardsLayer");
const plusBtn = document.getElementById("plusBtn");
const doneBtn = document.getElementById("doneBtn");
const libraryPanel = document.getElementById("libraryPanel");
const libraryGrid = document.getElementById("libraryGrid");
const newChordBtn = document.getElementById("newChordBtn");
const deleteChordBtn = document.getElementById("deleteChordBtn");
const colorInput = document.getElementById("colorInput");
const hexReadout = document.getElementById("hexReadout");
const opacityInput = document.getElementById("opacityInput");

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_TO_SEMITONE = Object.fromEntries(NOTE_NAMES.map((n, i) => [n, i]));
const ROOTS_BY_LENGTH = [...NOTE_NAMES].sort((a, b) => b.length - a.length);

const CHORD_QUALITIES = [
  { suffix: "", label: "Major", intervals: [0, 4, 7] },
  { suffix: "m", label: "Minor", intervals: [0, 3, 7] },
  { suffix: "7", label: "Dom7", intervals: [0, 4, 7, 10] },
  { suffix: "maj7", label: "Maj7", intervals: [0, 4, 7, 11] },
  { suffix: "m7", label: "Min7", intervals: [0, 3, 7, 10] },
  { suffix: "dim", label: "Dim", intervals: [0, 3, 6] },
  { suffix: "aug", label: "Aug", intervals: [0, 4, 8] },
  { suffix: "sus2", label: "Sus2", intervals: [0, 2, 7] },
  { suffix: "sus4", label: "Sus4", intervals: [0, 5, 7] },
  { suffix: "6", label: "6", intervals: [0, 4, 7, 9] },
  { suffix: "add9", label: "Add9", intervals: [0, 4, 7, 14] },
  { suffix: "m7b5", label: "m7b5", intervals: [0, 3, 6, 10] },
];

const MARGIN = 40; // fixed gap between ring edge and its box hitbox, same for every keyboard
const MIN_RADIUS = 50;

let expandedRoot = null; // which root's quality accordion is open in the library panel

const limiter = new Tone.Limiter(-6).toDestination();
const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "sine" },
  envelope: { attack: 0.4, decay: 0.2, sustain: 0.8, release: 1.2 },
}).connect(limiter);
synth.volume.value = -10;

function parseChordName(name) {
  const root = ROOTS_BY_LENGTH.find((r) => name.startsWith(r)) || "C";
  const suffix = name.slice(root.length);
  return { root, suffix };
}

function chordToNotes(chordName) {
  const { root, suffix } = parseChordName(chordName);
  const quality = CHORD_QUALITIES.find((q) => q.suffix === suffix) || CHORD_QUALITIES[0];
  const rootSemitone = NOTE_TO_SEMITONE[root] ?? 0;
  const baseMidi = 60 + rootSemitone;
  return quality.intervals.map((iv) => Tone.Frequency(baseMidi + iv, "midi").toNote());
}

function hexToRgba(hex, opacityPct) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacityPct / 100})`;
}

let uidCounter = 0;
const uid = () => "id" + uidCounter++;

const state = {
  keyboards: [],
  mode: "idle", // "idle" | "editing" | "selected"
  activeKbId: null,
  selectedPadId: null,
};

const activeChordIds = new Set();

function makeChord(name) {
  return { id: uid(), name, color: "#ffffff", opacity: 100 };
}

function createKeyboard(x, y) {
  return {
    id: uid(),
    x,
    y,
    radius: 90,
    chords: [makeChord("C"), makeChord("G"), makeChord("F"), makeChord("Am")],
  };
}

function nextPosition() {
  const count = state.keyboards.length;
  return {
    x: 220 + (count % 3) * 220,
    y: 220 + Math.floor(count / 3) * 220,
  };
}

function activeKeyboard() {
  return state.keyboards.find((k) => k.id === state.activeKbId) || null;
}

function boxRect(x, y, radius) {
  const size = 2 * (radius + MARGIN);
  return { left: x - size / 2, top: y - size / 2, right: x + size / 2, bottom: y + size / 2 };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function wouldCollide(kbId, x, y, radius) {
  const testRect = boxRect(x, y, radius);
  return state.keyboards.some(
    (other) => other.id !== kbId && rectsOverlap(testRect, boxRect(other.x, other.y, other.radius))
  );
}

let padDrag = null;
let boxDrag = null;
let resizeDrag = null;

window.addEventListener("mousemove", (e) => {
  if (padDrag) {
    const kb = state.keyboards.find((k) => k.id === padDrag.kbId);
    if (!kb) return;
    const n = kb.chords.length;
    const angleDeg = (Math.atan2(e.clientY - kb.y, e.clientX - kb.x) * 180) / Math.PI;
    const normalized = (angleDeg + 90 + 360) % 360;
    const targetIndex = Math.round(normalized / (360 / n)) % n;
    const currentIndex = kb.chords.findIndex((c) => c.id === padDrag.chordId);
    if (currentIndex !== -1 && currentIndex !== targetIndex) {
      const [moved] = kb.chords.splice(currentIndex, 1);
      kb.chords.splice(targetIndex, 0, moved);
      render();
    }
  } else if (boxDrag) {
    const kb = state.keyboards.find((k) => k.id === boxDrag.kbId);
    if (!kb) return;
    const dx = e.clientX - boxDrag.lastX;
    const dy = e.clientY - boxDrag.lastY;
    const newX = kb.x + dx;
    if (!wouldCollide(kb.id, newX, kb.y, kb.radius)) kb.x = newX;
    const newY = kb.y + dy;
    if (!wouldCollide(kb.id, kb.x, newY, kb.radius)) kb.y = newY;
    boxDrag.lastX = e.clientX;
    boxDrag.lastY = e.clientY;
    render();
  } else if (resizeDrag) {
    const kb = state.keyboards.find((k) => k.id === resizeDrag.kbId);
    if (!kb) return;
    const dist = Math.hypot(e.clientX - kb.x, e.clientY - kb.y);
    const newRadius = Math.max(MIN_RADIUS, dist - MARGIN);
    if (!wouldCollide(kb.id, kb.x, kb.y, newRadius)) kb.radius = newRadius;
    render();
  }
});

window.addEventListener("mouseup", () => {
  padDrag = null;
  boxDrag = null;
  resizeDrag = null;
});

function renderBox(kb) {
  const size = 2 * (kb.radius + MARGIN);
  const box = document.createElement("div");
  box.className = "kbBox" + (state.mode === "selected" && kb.id === state.activeKbId ? " selected" : "");
  box.style.left = kb.x + "px";
  box.style.top = kb.y + "px";
  box.style.width = size + "px";
  box.style.height = size + "px";
  box.addEventListener("mousedown", (e) => {
    state.mode = "selected";
    state.activeKbId = kb.id;
    boxDrag = { kbId: kb.id, lastX: e.clientX, lastY: e.clientY };
    render();
  });
  keyboardsLayer.appendChild(box);

  if (state.mode === "selected" && kb.id === state.activeKbId) {
    const half = size / 2;
    [
      [kb.x - half, kb.y - half],
      [kb.x + half, kb.y - half],
      [kb.x - half, kb.y + half],
      [kb.x + half, kb.y + half],
    ].forEach(([hx, hy]) => {
      const handle = document.createElement("div");
      handle.className = "handle";
      handle.style.left = hx + "px";
      handle.style.top = hy + "px";
      handle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        resizeDrag = { kbId: kb.id };
      });
      keyboardsLayer.appendChild(handle);
    });

    const editBtn = document.createElement("button");
    editBtn.className = "boxActionBtn editBtn";
    editBtn.textContent = "Edit chords";
    editBtn.style.left = kb.x - 45 + "px";
    editBtn.style.top = kb.y - half - 14 + "px";
    editBtn.addEventListener("click", () => {
      state.mode = "editing";
      state.selectedPadId = kb.chords[0] ? kb.chords[0].id : null;
      render();
    });
    keyboardsLayer.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "boxActionBtn deleteBtn";
    deleteBtn.textContent = "Delete";
    deleteBtn.style.left = kb.x + 45 + "px";
    deleteBtn.style.top = kb.y - half - 14 + "px";
    deleteBtn.addEventListener("click", () => {
      state.keyboards = state.keyboards.filter((k) => k.id !== kb.id);
      state.mode = "idle";
      state.activeKbId = null;
      render();
    });
    keyboardsLayer.appendChild(deleteBtn);
  }
}

function renderKeyboardPads(kb) {
  const n = kb.chords.length;
  const isActiveEditing = state.mode === "editing" && kb.id === state.activeKbId;
  const isActiveSelected = state.mode === "selected" && kb.id === state.activeKbId;
  const isPlayable = state.mode === "idle" || (state.mode === "selected" && !isActiveSelected);

  kb.chords.forEach((chord, i) => {
    const angle = ((-90 + i * (360 / n)) * Math.PI) / 180;
    const px = kb.x + kb.radius * Math.cos(angle);
    const py = kb.y + kb.radius * Math.sin(angle);

    const pad = document.createElement("div");
    pad.className = "pad";
    pad.style.left = px + "px";
    pad.style.top = py + "px";
    pad.style.background = hexToRgba(chord.color, chord.opacity);
    pad.textContent = chord.name;

    if (isActiveEditing && chord.id === state.selectedPadId) {
      pad.classList.add("selected");
    }

    if (isActiveEditing) {
      pad.addEventListener("mousedown", () => {
        padDrag = { kbId: kb.id, chordId: chord.id };
        state.selectedPadId = chord.id;
        render();
      });
    } else if (isPlayable) {
      const notes = chordToNotes(chord.name);
      const start = () => {
        if (activeChordIds.has(chord.id)) return;
        activeChordIds.add(chord.id);
        Tone.start();
        synth.triggerAttack(notes);
        pad.classList.add("playing");
      };
      const stop = () => {
        if (!activeChordIds.has(chord.id)) return;
        activeChordIds.delete(chord.id);
        synth.triggerRelease(notes);
        pad.classList.remove("playing");
      };
      pad.addEventListener("mousedown", start);
      pad.addEventListener("mouseup", stop);
      pad.addEventListener("mouseleave", stop);
    }

    keyboardsLayer.appendChild(pad);
  });
}

function renderLibrary() {
  libraryGrid.innerHTML = "";
  const kb = activeKeyboard();
  const currentPad = kb ? kb.chords.find((c) => c.id === state.selectedPadId) : null;
  const currentParsed = currentPad ? parseChordName(currentPad.name) : null;

  NOTE_NAMES.forEach((root) => {
    const rootRow = document.createElement("div");
    rootRow.className = "rootRow" + (currentParsed && currentParsed.root === root ? " current" : "");

    const label = document.createElement("span");
    label.className = "rootLabel";
    label.textContent = root;
    rootRow.appendChild(label);

    const arrow = document.createElement("button");
    arrow.className = "rootArrow";
    arrow.textContent = expandedRoot === root ? "\u25B4" : "\u25BE";
    arrow.setAttribute("aria-label", "Show " + root + " variations");
    arrow.addEventListener("click", () => {
      expandedRoot = expandedRoot === root ? null : root;
      renderLibrary();
    });
    rootRow.appendChild(arrow);

    libraryGrid.appendChild(rootRow);

    if (expandedRoot === root) {
      const qualityRow = document.createElement("div");
      qualityRow.className = "qualityRow";
      CHORD_QUALITIES.forEach((q) => {
        const chordName = root + q.suffix;
        const btn = document.createElement("button");
        btn.textContent = chordName;
        if (currentPad && currentPad.name === chordName) btn.classList.add("assigned");
        btn.addEventListener("click", () => {
          if (!kb || !state.selectedPadId) return;
          const pad = kb.chords.find((c) => c.id === state.selectedPadId);
          if (pad) pad.name = chordName;
          render();
        });
        qualityRow.appendChild(btn);
      });
      libraryGrid.appendChild(qualityRow);
    }
  });
}

function updateAdvancedSettingsUI() {
  const kb = activeKeyboard();
  const pad = kb ? kb.chords.find((c) => c.id === state.selectedPadId) : null;
  if (!pad) return;
  colorInput.value = pad.color;
  hexReadout.textContent = pad.color;
  opacityInput.value = pad.opacity;
}

function render() {
  keyboardsLayer.innerHTML = "";

  if (state.mode !== "editing") {
    state.keyboards.forEach(renderBox);
  }
  state.keyboards.forEach(renderKeyboardPads);

  plusBtn.style.display = state.mode === "editing" ? "none" : "flex";
  libraryPanel.style.display = state.mode === "editing" ? "block" : "none";

  if (state.mode === "editing") {
    renderLibrary();
    updateAdvancedSettingsUI();
    const kb = activeKeyboard();
    const canDelete = kb && kb.chords.length > 1 && state.selectedPadId;
    deleteChordBtn.disabled = !canDelete;
  }
}

keyboardsLayer.addEventListener("click", (e) => {
  if (e.target === keyboardsLayer && state.mode === "selected") {
    state.mode = "idle";
    state.activeKbId = null;
    render();
  }
});

plusBtn.addEventListener("click", () => {
  const { x, y } = nextPosition();
  const kb = createKeyboard(x, y);
  state.keyboards.push(kb);
  state.mode = "editing";
  state.activeKbId = kb.id;
  state.selectedPadId = kb.chords[0].id;
  expandedRoot = null;
  render();
});

newChordBtn.addEventListener("click", () => {
  const kb = activeKeyboard();
  if (!kb) return;
  const newChord = makeChord("C");
  kb.chords.push(newChord);
  state.selectedPadId = newChord.id;
  render();
});

deleteChordBtn.addEventListener("click", () => {
  const kb = activeKeyboard();
  if (!kb || kb.chords.length <= 1) return;
  kb.chords = kb.chords.filter((c) => c.id !== state.selectedPadId);
  state.selectedPadId = kb.chords[0] ? kb.chords[0].id : null;
  render();
});

colorInput.addEventListener("input", () => {
  const kb = activeKeyboard();
  const pad = kb ? kb.chords.find((c) => c.id === state.selectedPadId) : null;
  if (!pad) return;
  pad.color = colorInput.value;
  hexReadout.textContent = pad.color;
  render();
});

opacityInput.addEventListener("input", () => {
  const kb = activeKeyboard();
  const pad = kb ? kb.chords.find((c) => c.id === state.selectedPadId) : null;
  if (!pad) return;
  pad.opacity = Number(opacityInput.value);
  render();
});

doneBtn.addEventListener("click", () => {
  state.mode = "idle";
  state.activeKbId = null;
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
