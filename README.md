# Chordguessr

A small piano ear-training game: listen to a chord and find its exact notes. Built with React, TypeScript, and Vite using Node.js tooling, ready to host as a static site on Vercel. No backend, accounts, database, environment variables, or runtime third-party services are required.

## Play

1. Read the first-use control guide, then choose your chord palette. Major and minor are always enabled; diminished, augmented, dominant 7th, major 7th, minor 7th, half-diminished 7th, and diminished 7th are individually optional. Enable inversions for an extra challenge.
2. Tap the arrow to start. The first gesture unlocks browser audio and loads the bundled piano samples. The target chord plays automatically.
3. Select notes on the unlabeled C3–B4 keyboard. Selecting a released key briefly plays it; selecting it again releases it silently.
4. Use the icon controls to replay the target, play your selection, submit it, hear the target note by note, or skip. Help remains available from the question-mark icon.
5. Match every exact note and octave, with no extra or missing keys. Incorrect guesses preserve the selection and allow unlimited attempts. Correct guesses play a celebration and advance automatically.

The score counts correct rounds. Pictures celebrate 5, 10, and 15 correct guesses and wait for Continue. A session finishes only after **at least 15 correct guesses and at least two correct guesses for every enabled chord type**. Selecting all nine types therefore requires at least 18 correct guesses. Lower-scoring types are sampled more often, with weight `1 / (1 + correctCountForType)`. Skipping does not affect counts.

Chord settings stay fixed during play. The circular-arrow New Game control asks before clearing progress and returning to setup. The previous palette remains selected for easy replay.

## Run locally

Use **Node.js 24.x** and npm. An `.nvmrc` is provided.

```sh
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The development server binds to all interfaces, so a phone on the same network can use the computer’s LAN IP and that port. Firewall/network rules may need to permit it.

Build and preview production assets:

```sh
npm run build
npm run preview
```

The build runs TypeScript checking and writes the static application to `dist/`. The preview server normally uses `http://localhost:4173`.

## Deploy to Vercel

Push this repository to your Git provider and import it into Vercel. Select Node.js 24.x if prompted. The included `vercel.json` selects the Vite framework, `npm run build`, and `dist/` output. No environment variables or database setup are needed.

Alternatively, from a Vercel CLI installation authenticated to your account:

```sh
vercel
vercel --prod
```

Vercel serves the JavaScript, styles, artwork, and piano samples. There is no server process or serverless function to provision. See [Vercel’s Vite documentation](https://vercel.com/docs/frameworks/frontend/vite).

## Session, audio, and accessibility

- The complete game state lives in `sessionStorage` under `chordguessr.session.v1`, including settings, current chord, selected keys, counts, first-use guide status, and pending celebrations. Refreshing preserves the session. It is intended to last for the current tab; browser tab/session recovery can retain it longer. Separate tabs can diverge independently.
- Invalid or incompatible saved data returns to setup. If storage is unavailable, play continues in memory with a notice that refreshing will lose progress.
- Restoring a page does not autoplay. Tap a playback control or select a new note to resume audio. Audio-load failures preserve the game and provide a retry message.
- Piano playback uses nine locally bundled Salamander Grand Piano samples with small pitch shifts for neighboring notes, gain envelopes, and Web Audio scheduling. Target and guess playback trigger the sound-wave animation. New playback replaces previous playback; hiding the page stops sound.
- Portrait mobile layouts stack the two octaves. Desktop and sufficiently wide landscape layouts show a continuous two-octave keyboard. All keys and controls are keyboard-focusable. Keys expose note names and pressed state to assistive technology while remaining visually unlabeled.
- Dialogs trap focus and restore it when closed. Animations honor `prefers-reduced-motion`.

## Customize milestone pictures

Edit `src/milestones.ts` to change each milestone’s title, message, image URL, and alternative text. The included original illustrations are:

```text
public/milestones/5.svg
public/milestones/10.svg
public/milestones/15.svg
```

Replace them with your own SVGs, or place PNG/JPEG/WebP files in that directory and update the configuration. Public asset URLs start with `/milestones/`, without `public/`. Rebuild and redeploy after changing them. The illustration area is approximately square and scales the full image without cropping.

Chord definitions and generation rules are in `src/game.ts`; persistence validation is in `src/session.ts`; audio behavior is in `src/audio.ts`. The UI uses local system fonts and Lucide pictograms.

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

On Linux, Playwright may also require OS libraries; its documented installer is `npx playwright install --with-deps chromium webkit`. End-to-end tests launch a local Vite server on port 4173. Do not run an unrelated service on that port.

Unit tests cover chord formulas and range, inversions, weighted generation, exact matching, skips, duplicate-score prevention, milestones, completion, and session validation. Browser tests cover desktop Chromium, mobile Chromium, and mobile WebKit, including selection, audio scheduling using real decoded samples, refresh recovery, restarting, milestone ordering, layouts, and reduced motion. Generated screenshots and failure traces are ignored by Git.

Browser automation cannot establish subjective piano timbre or physical-device audio behavior. Listen once on your intended phone/headphones before sharing broadly, especially for device mute switches, interruptions, and volume settings.

## Audio credits

Salamander Grand Piano by **Alexander Holm**, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). MP3 samples are bundled unchanged from the [Tone.js audio repository](https://github.com/Tonejs/audio/tree/master/salamander). Playback applies pitch and volume adjustments. Attribution is included in the in-app help and in `public/audio/ATTRIBUTION.txt`, alongside the upstream README. No endorsement is implied.
