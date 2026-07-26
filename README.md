# Chord tool — step 1: camera + cursor tracking

This is the very first milestone: get the camera running, track a hand, and compare
two candidate "cursor" points before building any chord/ring logic on top.

## What this does
- Asks for camera access and shows your mirrored webcam feed full-screen.
- Tracks up to two hands using MediaPipe's hand-landmark model.
- Draws two candidate cursor points per hand, so you can compare them by feel:
  - **Amber dot** — the raw index fingertip. Precise, "pointing" feel, but jittery.
  - **Blue dot** — a "virtual wand": a line from your wrist through the base of your
    index finger, extended past your hand. Steadier, since it's built from two more
    rigid points rather than the twitchier fingertip.
- Detects a pinch (thumb tip close to index tip) and draws a ring around the amber
  dot when pinched — this is the planned "confirm" gesture.
- Shows which hand is which (left/right) and pinch state in the top-left corner.

## Prerequisites
- [Node.js](https://nodejs.org) version 18 or later installed.
- A webcam.
- Chrome or Edge (best support for the tech this uses).

## Run it
1. Open a terminal in this folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
4. Open the URL it prints (something like `http://localhost:5173`) in Chrome or Edge.
5. Allow camera access when prompted.
6. Wait a second for "Loading hand tracking model…" to finish — it downloads the
   model the first time, so it needs an internet connection.
7. Hold up a hand. You should see the amber and blue dots tracking it, and the
   status line at the top-left update with your handedness and pinch state.

## What to actually test right now
- Move your hand around normally, like you would while singing. Which dot looks
  steadier to you — amber (fingertip) or blue (wand)?
- Try pinching (thumb to index finger) — does it reliably show "pinch: YES"? Try it
  at different distances from the camera and different hand angles.
- Try rotating your hand so it's edge-on to the camera — does either dot glitch out
  or disappear?
- Try both hands at once.

There's no "right answer" to look for yet — this step is purely about deciding
whether fingertip or wand-point feels more usable before any ring/chord logic gets
built on top of it. Whichever one feels steadier and easier to control is the one to
carry into the next milestone.

## Next step
Once you've picked a cursor source, milestone 2 (per the main build plan) is:
hardcode one ring with 4 chords (C, G, F, Am), compute the cursor's angle around the
ring's center to pick a chord, and wire up the pinch gesture to actually trigger a
sound.
