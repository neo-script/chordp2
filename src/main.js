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
