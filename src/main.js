import * as Tone from "tone";

const video = document.getElementById("webcam");
const keyboardsLayer = document.getElementById("keyboardsLayer");
const arCursorsLayer = document.getElementById("arCursors");
const dimOverlay = document.getElementById("dimOverlay");
const plusBtn = document.getElementById("plusBtn");
const doneBtn = document.getElementById("doneBtn");
const libraryPanel = document.getElementById("libraryPanel");
const libraryGrid = document.getElementById("libraryGrid");
const newChordBtn = document.getElementById("newChordBtn");
const deleteChordBtn = document.getElementById("deleteChordBtn");
const colorInput = document.getElementById("colorInput");
const hexReadout = document.getElementById("hexReadout");
const opacityInput = document.getElementById("opacityInput");
const opacityValue = document.getElementById("opacityValue");

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
const DEFAULT_RADIUS = 90;
const GUIDE_OFFSET = 14; // how much further out the dashed guide sits beyond the pads
const DIMMED_OPACITY = 0.3; // opacity for other keyboards' pads while one is being edited
const PAD_HIT_RADIUS = 32; // how close the marker cursor must be to a pad center to trigger it
const DET_SCALE = 0.55; // downscale factor for the detection canvas, for performance

let expandedRoot = null;

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

function padVisualStyle(chord) {
  const fill = hexToRgba(chord.color, chord.opacity);
  const glow = hexToRgba(chord.color, 45);
  return {
    background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 45%), ${fill}`,
    boxShadow: `0 0 16px ${glow}, 0 2px 6px rgba(0,0,0,0.35), inset 0 -3px 5px rgba(0,0,0,0.22), inset 0 2px 4px rgba(255,255,255,0.3)`,
  };
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

function playChordById(chord) {
  if (activeChordIds.has(chord.id)) return;
  activeChordIds.add(chord.id);
  Tone.start();
  synth.triggerAttack(chordToNotes(chord.name));
  const el = keyboardsLayer.querySelector(`[data-chord-id="${chord.id}"]`);
  if (el) el.classList.add("playing");
}

function stopChordById(chord) {
  if (!activeChordIds.has(chord.id)) return;
  activeChordIds.delete(chord.id);
  synth.triggerRelease(chordToNotes(chord.name));
  const el = keyboardsLayer.querySelector(`[data-chord-id="${chord.id}"]`);
  if (el) el.classList.remove("playing");
}

function makeChord(name) {
  return { id: uid(), name, color: "#ffffff", opacity: 100 };
}

function createKeyboard(x, y) {
  return {
    id: uid(),
    x,
    y,
    radius: DEFAULT_RADIUS,
    chords: [makeChord("C"), makeChord("G"), makeChord("F"), makeChord("Am")],
  };
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

function findFreePosition(radius) {
  const stepX = 240;
  const stepY = 240;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      const x = 200 + col * stepX;
      const y = 200 + row * stepY;
      if (!wouldCollide(null, x, y, radius)) return { x, y };
    }
  }
  return { x: 200 + Math.random() * 600, y: 200 + Math.random() * 600 };
}

function activeKeyboard() {
  return state.keyboards.find((k) => k.id === state.activeKbId) || null;
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

function renderRingGuide(kb) {
  const guideRadius = kb.radius + GUIDE_OFFSET;
  const guide = document.createElement("div");
  guide.className = "ringGuide";
  guide.style.left = kb.x + "px";
  guide.style.top = kb.y + "px";
  guide.style.width = guideRadius * 2 + "px";
  guide.style.height = guideRadius * 2 + "px";
  keyboardsLayer.appendChild(guide);
}

function renderBox(kb) {
  const size = 2 * (kb.radius + MARGIN);
  const isSelected = state.mode === "selected" && kb.id === state.activeKbId;
  const box = document.createElement("div");
  box.className = "kbBox";
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

  if (isSelected) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.overflow = "visible";
    svg.style.pointerEvents = "none";
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", "1");
    rect.setAttribute("y", "1");
    rect.setAttribute("width", size - 2);
    rect.setAttribute("height", size - 2);
    rect.setAttribute("rx", "14");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "rgba(255,255,255,0.55)");
    rect.setAttribute("stroke-width", "1.5");
    rect.setAttribute("stroke-dasharray", "6 5");
    rect.setAttribute("class", "marchAnts");
    svg.appendChild(rect);
    box.appendChild(svg);
  }

  keyboardsLayer.appendChild(box);

  if (isSelected) {
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
  const isDimmed = state.mode === "editing" && !isActiveEditing;

  kb.chords.forEach((chord, i) => {
    const angle = ((-90 + i * (360 / n)) * Math.PI) / 180;
    const px = kb.x + kb.radius * Math.cos(angle);
    const py = kb.y + kb.radius * Math.sin(angle);

    const pad = document.createElement("div");
    pad.className = "pad";
    pad.dataset.chordId = chord.id;
    pad.style.left = px + "px";
    pad.style.top = py + "px";
    const visual = padVisualStyle(chord);
    pad.style.background = visual.background;
    pad.style.boxShadow = visual.boxShadow;
    pad.style.opacity = isDimmed ? DIMMED_OPACITY : 1;
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
      pad.addEventListener("mousedown", () => playChordById(chord));
      pad.addEventListener("mouseup", () => stopChordById(chord));
      pad.addEventListener("mouseleave", () => stopChordById(chord));
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
  opacityValue.value = pad.opacity;
}

function setOpacity(pad, value) {
  const clamped = Math.min(100, Math.max(0, Math.round(value) || 0));
  pad.opacity = clamped;
  opacityInput.value = clamped;
  opacityValue.value = clamped;
}

function render() {
  keyboardsLayer.innerHTML = "";

  if (state.mode !== "editing") {
    state.keyboards.forEach(renderBox);
  }
  state.keyboards.forEach(renderRingGuide);
  state.keyboards.forEach(renderKeyboardPads);

  plusBtn.style.display = state.mode === "editing" ? "none" : "flex";
  libraryPanel.classList.toggle("open", state.mode === "editing");
  dimOverlay.classList.toggle("active", state.mode === "editing");

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
  plusBtn.classList.add("popping");
  setTimeout(() => plusBtn.classList.remove("popping"), 300);

  const { x, y } = findFreePosition(DEFAULT_RADIUS);
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
  setOpacity(pad, Number(opacityInput.value));
  render();
});

opacityValue.addEventListener("input", () => {
  const kb = activeKeyboard();
  const pad = kb ? kb.chords.find((c) => c.id === state.selectedPadId) : null;
  if (!pad) return;
  setOpacity(pad, Number(opacityValue.value));
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

// --- ArUco marker tracking (performance-mode chord triggering) ---

function findPadAtPoint(x, y) {
  if (state.mode !== "idle") return null;
  for (const kb of state.keyboards) {
    const n = kb.chords.length;
    for (let i = 0; i < n; i++) {
      const angle = ((-90 + i * (360 / n)) * Math.PI) / 180;
      const px = kb.x + kb.radius * Math.cos(angle);
      const py = kb.y + kb.radius * Math.sin(angle);
      if (Math.hypot(x - px, y - py) <= PAD_HIT_RADIUS) {
        return kb.chords[i];
      }
    }
  }
  return null;
}

// Maps a point from the (possibly downscaled) detection canvas into on-screen
// CSS pixel coordinates, accounting for the mirrored, object-fit:cover video.
function detectionPointToScreen(dx, dy, detW, detH) {
  const rawX = dx * (video.videoWidth / detW);
  const rawY = dy * (video.videoHeight / detH);
  const mirroredX = video.videoWidth - rawX;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const scale = Math.max(viewportW / video.videoWidth, viewportH / video.videoHeight);
  const displayedW = video.videoWidth * scale;
  const displayedH = video.videoHeight * scale;
  const offsetX = (displayedW - viewportW) / 2;
  const offsetY = (displayedH - viewportH) / 2;

  return { x: mirroredX * scale - offsetX, y: rawY * scale - offsetY };
}

const GRACE_MS = 250; // keep tracking a marker this long after it's briefly lost, to avoid flicker
const markerLastSeen = new Map(); // markerId -> { point, time }
const markerHoverState = new Map(); // markerId -> currently-playing chord

function updateCursorVisual(markerId, point) {
  let dot = arCursorsLayer.querySelector(`[data-marker-id="${markerId}"]`);
  if (!dot) {
    dot = document.createElement("div");
    dot.className = "arCursor";
    dot.dataset.markerId = markerId;
    arCursorsLayer.appendChild(dot);
  }
  dot.style.left = point.x + "px";
  dot.style.top = point.y + "px";
}

function removeCursorVisual(markerId) {
  const dot = arCursorsLayer.querySelector(`[data-marker-id="${markerId}"]`);
  if (dot) dot.remove();
}

function handleMarkerHover(markerId, point) {
  const hitChord = findPadAtPoint(point.x, point.y);
  const prevChord = markerHoverState.get(markerId) || null;
  const changed = (hitChord ? hitChord.id : null) !== (prevChord ? prevChord.id : null);

  if (changed && prevChord) stopChordById(prevChord);
  if (changed && hitChord) playChordById(hitChord);

  if (hitChord) markerHoverState.set(markerId, hitChord);
  else markerHoverState.delete(markerId);
}

function releaseMarkerHover(markerId) {
  const prevChord = markerHoverState.get(markerId);
  if (prevChord) stopChordById(prevChord);
  markerHoverState.delete(markerId);
}

function processMarkers(markers, detW, detH) {
  const now = performance.now();

  markers.forEach((marker) => {
    const cx = marker.corners.reduce((sum, c) => sum + c.x, 0) / 4;
    const cy = marker.corners.reduce((sum, c) => sum + c.y, 0) / 4;
    const point = detectionPointToScreen(cx, cy, detW, detH);
    markerLastSeen.set(marker.id, { point, time: now });
  });

  // Act on every marker seen recently (not just this exact frame), so a brief
  // dropout in detection doesn't flicker the cursor or cut off a held chord.
  for (const [markerId, info] of markerLastSeen.entries()) {
    if (now - info.time <= GRACE_MS) {
      updateCursorVisual(markerId, info.point);
      handleMarkerHover(markerId, info.point);
    } else {
      releaseMarkerHover(markerId);
      removeCursorVisual(markerId);
      markerLastSeen.delete(markerId);
    }
  }
}

let detector = null;
let detCanvas = null;
let detCtx = null;

function setupMarkerDetection() {
  if (!window.AR) {
    console.warn("ArUco library not loaded; marker tracking disabled.");
    return;
  }
  detector = new window.AR.Detector({ dictionaryName: "ARUCO_MIP_36h12" });
  detCanvas = document.createElement("canvas");
  detCtx = detCanvas.getContext("2d", { willReadFrequently: true });
  requestAnimationFrame(detectLoop);
}

function detectLoop() {
  requestAnimationFrame(detectLoop);
  if (!detector || !video.videoWidth) return;

  const detW = Math.max(160, Math.round(video.videoWidth * DET_SCALE));
  const detH = Math.max(90, Math.round(video.videoHeight * DET_SCALE));
  if (detCanvas.width !== detW || detCanvas.height !== detH) {
    detCanvas.width = detW;
    detCanvas.height = detH;
  }
  detCtx.drawImage(video, 0, 0, detW, detH);

  let markers = [];
  try {
    const imageData = detCtx.getImageData(0, 0, detW, detH);
    markers = detector.detect(imageData);
  } catch (err) {
    console.warn("Marker detection error:", err);
    return;
  }
  processMarkers(markers, detW, detH);
}

setupCamera();
setupMarkerDetection();
render();
