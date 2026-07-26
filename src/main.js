import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const PINCH_THRESHOLD_PX = 40; // distance below this (in real pixels) counts as a pinch
const WAND_EXTEND = 1.8; // how far past the index knuckle the "virtual wand" point sits

let handLandmarker = null;
let lastVideoTime = -1;

// Landmark indices from MediaPipe's hand model
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5; // base knuckle of the index finger
const INDEX_TIP = 8;

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
    audio: false,
  });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadeddata = () => resolve(video);
  });
}

async function setupHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

function toPixel(landmark) {
  return { x: landmark.x * canvas.width, y: landmark.y * canvas.height };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawDot(point, color, radius = 10) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function renderLoop() {
  requestAnimationFrame(renderLoop);

  if (!handLandmarker || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const results = handLandmarker.detectForVideo(video, performance.now());
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let statusLines = [];

  results.landmarks.forEach((landmarks, i) => {
    const handedness = results.handednesses[i][0].categoryName; // "Left" or "Right"

    const wrist = toPixel(landmarks[WRIST]);
    const indexMcp = toPixel(landmarks[INDEX_MCP]);
    const indexTip = toPixel(landmarks[INDEX_TIP]);
    const thumbTip = toPixel(landmarks[THUMB_TIP]);

    // Candidate A: raw fingertip position
    drawDot(indexTip, "#EF9F27", 10); // amber

    // Candidate B: virtual wand — extend the wrist->knuckle line past the hand
    const dx = indexMcp.x - wrist.x;
    const dy = indexMcp.y - wrist.y;
    const wandPoint = {
      x: wrist.x + dx * WAND_EXTEND,
      y: wrist.y + dy * WAND_EXTEND,
    };
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.lineTo(wandPoint.x, wandPoint.y);
    ctx.strokeStyle = "#378ADD";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawDot(wandPoint, "#378ADD", 10); // blue

    // Pinch detection (confirm gesture)
    const pinching = dist(thumbTip, indexTip) < PINCH_THRESHOLD_PX;
    if (pinching) {
      ctx.beginPath();
      ctx.arc(indexTip.x, indexTip.y, 20, 0, Math.PI * 2);
      ctx.strokeStyle = "#EF9F27";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    statusLines.push(
      `${handedness} hand — pinch: ${pinching ? "YES" : "no"}`
    );
  });

  statusEl.textContent =
    statusLines.length > 0
      ? statusLines.join(" | ")
      : "No hand detected — show a hand to the camera";
}

async function main() {
  statusEl.textContent = "Requesting camera…";
  await setupCamera();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  statusEl.textContent = "Loading hand tracking model…";
  await setupHandLandmarker();

  statusEl.textContent = "Ready — show a hand to the camera";
  renderLoop();
}

main().catch((err) => {
  statusEl.textContent = "Error: " + err.message;
  console.error(err);
});
