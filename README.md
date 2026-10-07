# Chordguessr

A small piano ear-training game: identify intervals or find the exact notes of a chord. Built with React, TypeScript, and Vite using Node.js tooling, ready to host as a static site on Vercel. No backend, accounts, database, environment variables, or runtime third-party services are required.

## Play

1. Read the first-use control guide. **Intervals** is the default setup tab: choose **Easy** to name each interval by tapping its answer button, or **Regular** to find its exact notes on the piano. Minor/major 2nds, 3rds, and 6ths, perfect 4ths and 5ths, and octaves are always included. Unisons, tritones, and each 7th are optional. A unison plays one note and needs one selected key in Regular mode. Switch to the **Chords** tab to choose your chord palette. Major and minor are always enabled; diminished, augmented, dominant 7th, major 7th, minor 7th, half-diminished 7th, and diminished 7th are individually optional. Enable inversions for an extra challenge.
2. Tap the arrow to start. The first gesture unlocks browser audio and loads the bundled piano samples. Once the game layout appears, the first target plays automatically after one second. Manual playback or skipping cancels that pending sound.
3. Select notes on the unlabeled C3–B4 keyboard. Selecting a released key briefly plays it; selecting it again releases it silently.
4. The main listen button replays the target. The smaller button on its left plays the target note by note and unlocks after your first wrong submission in each round; the button on its right skips. The lower row plays or submits your selection. Help remains available from the question-mark icon.
5. Match every exact note and octave, with no extra or missing keys. Incorrect guesses preserve the selection and allow unlimited attempts. Correct guesses play a celebration and advance automatically.

Interval games finish when **every enabled interval kind has at least two correct guesses**, with minor and major kinds counted separately. The interval progress bar tracks that coverage. Easy mode has grouped interval answer buttons instead of a piano and guess playback/submission controls; listen, skip, and the note-by-note hint remain available.

The score counts correct rounds. Pictures celebrate 5 and 10 correct guesses and wait for Continue. The final picture appears when the session actually finishes: **at least 15 correct guesses and at least two correct guesses for every enabled chord type**. Selecting all nine types therefore requires at least 18 correct guesses. Reaching 15 without that coverage advances normally. Lower-scoring types are sampled more often, with weight `1 / (1 + correctCountForType)`. Skipping does not affect counts and resets the note-by-note hint lock.

Game settings stay fixed during play. The circular-arrow New Game control asks before clearing progress and returning to setup. The previous palette remains selected for easy replay.

Use the color circle in the upper-right corner to choose light pink, lavender, sky blue, mint, peach, or butter yellow accents and a cold or warm background. Colors apply immediately across the interface and persist through refreshes and new games within the tab session. The default is **cold background / light pink accent**.

Use the language icon beside the color control to switch between **English** (the default) and **Russian**. The whole interface, help, celebrations, errors, and accessible control names update immediately. Language is saved separately under `chordguessr.language.v1` for the tab session and survives refreshes and new games. Switching languages preserves the current round and selected keys.

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

- The complete game state lives in `sessionStorage` under `chordguessr.session.v3`, including settings, current target, selected keys, counts, wrong attempts in the current round, first-use guide status, and pending celebrations. Version 1 and 2 chord sessions migrate automatically without losing progress. Theme preferences use `chordguessr.theme.v1`. Refreshing preserves the session. It is intended to last for the current tab; browser tab/session recovery can retain it longer. Separate tabs can diverge independently.
- Invalid or incompatible saved data returns to setup. If storage is unavailable, play continues in memory with a notice that refreshing will lose progress.
- Restoring a page does not autoplay. Tap a playback control or select a new note to resume audio. Audio-load failures preserve the game and provide a retry message.
- Piano playback uses nine locally bundled Salamander Grand Piano samples with small pitch shifts for neighboring notes, gain envelopes, and Web Audio scheduling. Target and guess playback trigger a sound wave centered behind the main listen button, with smooth fades. New playback replaces previous playback; hiding the page stops sound.
- Portrait mobile layouts stack the two octaves. Desktop and sufficiently wide landscape layouts show a continuous two-octave keyboard. All keys and controls are keyboard-focusable. Keys expose note names and pressed state to assistive technology while remaining visually unlabeled.
- Dialogs trap focus and restore it when closed. Animations honor `prefers-reduced-motion`.

## Customize milestone pictures

Edit `src/milestones.ts` to change each milestone’s title, message, image URL, and alternative text. Text uses English message keys; add or update their Russian translations in `src/i18n.ts` as well. `milestones` configures the 5- and 10-point celebrations; `completionCelebration` configures the final celebration at any qualifying score. The included original illustrations are:

```text
public/milestones/5.svg
public/milestones/10.svg
public/milestones/15.svg
```

The filename `15.svg` is retained for the final artwork, but its display is tied to game completion, not a fixed score.

Replace them with your own SVGs, or place PNG/JPEG/WebP files in that directory and update the configuration. Public asset URLs start with `/milestones/`, without `public/`. Rebuild and redeploy after changing them. The illustration area is approximately square and scales the full image without cropping.

Chord and interval definitions and generation rules are in `src/game.ts`; persistence validation is in `src/session.ts`; audio behavior is in `src/audio.ts`. The UI uses local system fonts and Lucide pictograms.

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

On Linux, Playwright may also require OS libraries; its documented installer is `npx playwright install --with-deps chromium webkit`. End-to-end tests launch a local Vite server on port 4173. Do not run an unrelated service on that port.

Unit tests cover interval generation, both guessing modes, unisons, interval coverage and migration, chord formulas and range, inversions, weighted generation, exact matching, skips, duplicate-score prevention, milestones, completion, and session validation. Browser tests cover desktop Chromium, mobile Chromium, and mobile WebKit, including selection, audio scheduling using real decoded samples, refresh recovery, restarting, milestone ordering, layouts, and reduced motion. Generated screenshots and failure traces are ignored by Git.

Browser automation cannot establish subjective piano timbre or physical-device audio behavior. Listen once on your intended phone/headphones before sharing broadly, especially for device mute switches, interruptions, and volume settings.

## License

The application code, documentation, and original artwork are licensed under the [MIT License](LICENSE.md). Third-party dependencies and audio samples retain their own licenses.

### Audio license and credits

The bundled piano samples in `public/audio/` are licensed separately under **CC BY 3.0**, not MIT. Preserve their attribution and license notices when redistributing them.

Salamander Grand Piano by **Alexander Holm**, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). MP3 samples are bundled unchanged from the [Tone.js audio repository](https://github.com/Tonejs/audio/tree/master/salamander). Playback applies pitch and volume adjustments. Attribution is included in the in-app help and in `public/audio/ATTRIBUTION.txt`, alongside the upstream README. No endorsement is implied.
