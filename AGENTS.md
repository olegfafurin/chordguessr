# Development context

Chordguessr is a mobile-first piano chord guessing game. It is a static React/TypeScript application built with Vite and Node.js 24.x and hosted on Vercel. Keep it self-contained: no accounts, database, backend, analytics, or external runtime asset services are needed.

## Product invariants

- The keyboard contains exactly C3–B4 (MIDI 48–71), with no visible key labels. Portrait phones stack octaves; desktop uses a continuous keyboard.
- Match the exact set of MIDI notes. Octave substitution, octave doubling, extra notes, and missing notes are incorrect.
- Major/minor cannot be disabled. Other chord types and inversions are selected before starting and remain locked until a confirmed new game.
- Generated chords fit entirely in range. Favor types with fewer correct guesses using `1 / (1 + count)` and avoid consecutive identical note sets.
- Selecting a released key plays it briefly; releasing a selected key makes no new sound. Submitting plays the guess whether correct or incorrect.
- Wrong answers retain selection. Correct answers increment the total and one type count exactly once, clear keys, and advance after feedback. Skips do not score.
- Milestones at 5, 10, and 15 require Continue. Finish only when total >= 15 AND each enabled type has count >= 2. Show any milestone before the completion screen.
- Save the full session in `sessionStorage`, including transient celebration phases. Refresh must not award a round twice or bypass a milestone. Restores require a user gesture for sound.
- Game controls use pictograms only, with accessible names. First-use text explains them; help remains available.

## Architecture

- `src/game.ts`: pure chord definitions, generation, selection, scoring, and round transitions. Inject randomness for deterministic tests.
- `src/session.ts`: versioned persistence and validation. Untrusted or corrupt storage must recover to setup; unavailable storage must not block play.
- `src/audio.ts`: one lazy Web Audio context, bundled sampled piano, cancellation, and playback-state callbacks. Resume audio inside a user gesture before asynchronous work. Do not introduce oscillator-only substitutes or external sample URLs.
- `src/App.tsx` and `src/components.tsx`: React orchestration and accessible controls/dialogs/keyboard. `src/styles.css`: responsive layout and reduced-motion styles.
- `src/milestones.ts` and `public/milestones/`: editable celebration copy and artwork. Keep audio credits alongside samples and visible in help.

## Working rules

- Read existing code before editing; use `rg` for searches. Make focused changes and preserve user work.
- Keep game logic independent of React and browser APIs. Prevent races between audio preparation, rapid submissions, round transitions, and resets.
- Keep browser storage validation consistent with state changes. Change the session version/key for incompatible formats rather than trusting old data.
- Use local assets. Preserve third-party license notices. Use SVG/CSS for simple artwork and icons; no external font requests.
- Keep touch targets comfortable, ensure keyboard focus is visible, use semantic controls and native modal dialogs, and honor reduced motion. Never disable browser zoom.
- Do not expose implementation details in the playing experience unless the player needs to act on them.
- Add meaningful tests for behavior changes; avoid tests that merely repeat implementation details. Do not deploy, publish, or send external messages unless requested.

## Checks

Run `npm test`, `npm run typecheck`, and `npm run build` for game, type, or build changes. For UI/audio/session changes also run `npm run test:e2e` (Playwright Chromium and WebKit must be installed). Tests live in `src/*.test.ts` and `tests/`.

Check portrait and desktop layouts, no horizontal overflow, selection behavior, refresh recovery, audio gesture handling, milestone ordering, and new-game confirmation. Browser automation verifies scheduled sample playback, but report honestly when physical-device or subjective listening checks were not performed.

Use `npm ci` with the committed lockfile. Build output (`dist/`), browser artifacts, and `node_modules/` are ignored. Hosting configuration is `vercel.json`; no secrets or environment variables are required.
