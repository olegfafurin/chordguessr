import { expect, test, type Page } from '@playwright/test';
import { CHORD_TYPES, DEFAULT_CHORD_SETTINGS, initialGame, noteLabel, startGame, submitGuess, type Game } from '../src/game';
import { SESSION_KEY } from '../src/session';

async function seed(page: Page, game: Game) {
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
  }, { key: SESSION_KEY, value: JSON.stringify(game) });
  await page.goto('/');
}
async function state(page: Page): Promise<Game> {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), SESSION_KEY);
}
async function chooseTarget(page: Page) {
  const game = await state(page);
  for (const note of game.target!.notes) await page.getByRole('button', { name: noteLabel(note), exact: true }).click();
}

test('first-use guide, mandatory types, settings, and starting piano playback', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.getByRole('tab', { name: 'Chords', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /^M Major/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^M Major/ })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /^m Minor/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Dominant 7th/ }).check();
  await page.getByRole('checkbox', { name: 'Include inversions' }).check();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replay current chord' })).toBeVisible();
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
  expect((await state(page)).settings).toEqual({ types: ['major', 'minor', 'dominant7'], inversions: true });
  await expect(page.locator('.piano-key')).toHaveCount(24);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('selection, wrong guesses, exact scoring, and refresh restoration', async ({ page }) => {
  await seed(page, startGame(initialGame(DEFAULT_CHORD_SETTINGS)));
  await expect(page.getByRole('button', { name: 'Submit current guess' })).toBeDisabled();
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await expect(page.getByRole('button', { name: 'C3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByText('Not quite yet. Listen again — you’ve got this.')).toBeVisible();
  expect((await state(page)).total).toBe(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'C3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.wave')).not.toHaveClass(/wave-active/);
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await chooseTarget(page);
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('button', { name: 'Submit current guess' })).toBeDisabled();
  await expect(page.locator('.piano-key[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByText('ROUND 02')).toBeVisible();
  expect((await state(page)).total).toBe(1);
});

test('skip and confirmed restart clear selections without accidental progress loss', async ({ page }) => {
  await seed(page, startGame(initialGame({ types: ['major', 'minor', 'augmented'], inversions: true })));
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await page.getByRole('button', { name: 'Skip current round' }).click();
  await expect(page.locator('.piano-key[aria-pressed="true"]')).toHaveCount(0);
  expect((await state(page)).total).toBe(0);
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  expect((await state(page)).round).toBe(2);
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await page.getByRole('button', { name: 'Confirm new game' }).click();
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Augmented/ })).toBeChecked();
  expect((await state(page)).total).toBe(0);
});

test('a final celebration at 15 survives refresh and appears before completion', async ({ page }) => {
  const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  await seed(page, { ...game, total: 14, round: 15, counts: { ...game.counts, major: 7, minor: 7 } });
  await chooseTarget(page);
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('15 CHORDS FOUND')).toBeVisible();
  await expect(page.locator('.milestone-art img')).toBeVisible();
  expect(await page.locator('.milestone-art img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('SESSION COMPLETE')).toBeVisible();
  expect((await state(page)).phase).toBe('complete');
});

test('plays beyond 15 until the last type is guessed twice', async ({ page }) => {
  const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  game.target = { type: 'minor', root: 48, inversion: 0, notes: [48, 51, 55] };
  await seed(page, { ...game, total: 15, round: 16, counts: { ...game.counts, major: 14, minor: 1 } });
  await expect(page.getByText('Fifteen found! Keep going', { exact: false })).toBeVisible();
  await chooseTarget(page);
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('16 CHORDS FOUND')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('SESSION COMPLETE')).toBeVisible();
  expect((await state(page)).total).toBe(16);
});

test('continuing a restored milestone unlocks audio for the next round', async ({ page }) => {
  const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  const before = { ...game, total: 4, round: 5, counts: { ...game.counts, major: 2, minor: 2 }, selected: game.target!.notes };
  await seed(page, submitGuess(before));
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.wave')).not.toHaveClass(/wave-active/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('ROUND 06')).toBeVisible();
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
  expect((await state(page)).total).toBe(5);
});

test('audio load failure retains a guess and allows a successful retry', async ({ page }) => {
  const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  await seed(page, { ...game, selected: game.target!.notes });
  await page.route('**/audio/C3.mp3', route => route.abort());
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByRole('alert')).toContainText('Your guess is saved');
  expect((await state(page)).total).toBe(0);
  expect((await state(page)).selected).toEqual(game.target!.notes);
  await page.unroute('**/audio/C3.mp3');
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});

test('responsive keyboard, accessible icon controls, and reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, startGame(initialGame(DEFAULT_CHORD_SETTINGS)));
  const octaves = page.locator('.octave');
  const first = (await octaves.nth(0).boundingBox())!;
  const second = (await octaves.nth(1).boundingBox())!;
  if (testInfo.project.name.startsWith('mobile')) expect(second.y).toBeGreaterThan(first.y + first.height);
  else expect(second.y).toBe(first.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const button of await page.locator('.icon-button:not(.language-trigger)').all()) {
    await expect(button).toHaveAttribute('aria-label', /.+/);
    await expect(button).toHaveText('');
  }
  expect(await page.locator('.wave span').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-game.png`, fullPage: true });
});

test('sample playback schedules piano voices and releasing a key is silent', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as unknown as { scheduledVoices: number }).scheduledVoices = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as unknown as { scheduledVoices: number }).scheduledVoices++;
      return original.apply(this, args);
    };
  });
  await seed(page, { ...startGame(initialGame(DEFAULT_CHORD_SETTINGS)), wrongAttempts: 1 });
  const voices = () => page.evaluate(() => (window as unknown as { scheduledVoices: number }).scheduledVoices);
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await expect.poll(voices).toBe(1);
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  expect(await voices()).toBe(1);
  await page.getByRole('button', { name: 'Play chord note by note' }).click();
  await expect.poll(voices).toBe(1 + (await state(page)).target!.notes.length);
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
});

test('note-by-note unlock persists through editing and refresh, then resets on skip', async ({ page }) => {
  await seed(page, startGame(initialGame(DEFAULT_CHORD_SETTINGS)));
  const hint = page.getByRole('button', { name: 'Play chord note by note' });
  await expect(hint).toBeDisabled();
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(hint).toBeEnabled();
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await expect(hint).toBeEnabled();
  await page.reload();
  await expect(hint).toBeEnabled();
  await hint.click();
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
  await page.getByRole('button', { name: 'Skip current round' }).click();
  await expect(hint).toBeDisabled();
  expect((await state(page)).wrongAttempts).toBe(0);
});

test('target controls flank the centered fading wave; guess controls stay below', async ({ page }) => {
  await seed(page, startGame(initialGame(DEFAULT_CHORD_SETTINGS)));
  const main = page.getByRole('button', { name: 'Replay current chord' });
  const center = (await main.boundingBox())!;
  const left = (await page.getByRole('button', { name: 'Play chord note by note' }).boundingBox())!;
  const right = (await page.getByRole('button', { name: 'Skip current round' }).boundingBox())!;
  expect(left.width).toBeLessThan(center.width);
  expect(center.x - left.x - left.width).toBeGreaterThan(24);
  expect(right.x - center.x - center.width).toBeGreaterThan(24);
  expect(Math.abs(left.y + left.height / 2 - center.y - center.height / 2)).toBeLessThan(1);
  expect(Math.abs(right.y + right.height / 2 - center.y - center.height / 2)).toBeLessThan(1);
  await expect(page.getByRole('group', { name: 'Chord controls', exact: true }).getByRole('button')).toHaveCount(2);
  const bottom = (await page.getByRole('button', { name: 'Play current guess' }).boundingBox())!;
  expect(bottom.y - center.y - center.height).toBeGreaterThan(24);
  const wave = (await page.locator('.wave').boundingBox())!;
  expect(Math.abs(wave.x + wave.width / 2 - center.x - center.width / 2)).toBeLessThan(1);
  expect(Math.abs(wave.y + wave.height / 2 - center.y - center.height / 2)).toBeLessThan(1);
  await main.click();
  await expect.poll(() => page.locator('.wave').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.5);
  await expect.poll(() => page.locator('.wave').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(0);
  await expect(page.getByText(/What do you hear|A few notes|Let the notes settle/)).toHaveCount(0);
});

test('first chord waits one second after the game layout appears', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { layoutAt: number; voiceTimes: number[] };
    state.layoutAt = 0;
    state.voiceTimes = [];
    new MutationObserver(() => {
      if (!state.layoutAt && document.querySelector('.piano')) state.layoutAt = performance.now();
    }).observe(document, { childList: true, subtree: true });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      state.voiceTimes.push(performance.now());
      return start.apply(this, args);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.getByRole('tab', { name: 'Chords', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { voiceTimes: number[] }).voiceTimes.length)).toBeGreaterThan(0);
  const delay = await page.evaluate(() => {
    const state = window as unknown as { layoutAt: number; voiceTimes: number[] };
    return state.voiceTimes[0] - state.layoutAt;
  });
  expect(delay).toBeGreaterThanOrEqual(950);
});

test('themes default to cold pink, recolor the piano, and survive refresh and restart', async ({ page }) => {
  await seed(page, startGame(initialGame(DEFAULT_CHORD_SETTINGS)));
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'pink');
  await expect(page.locator('html')).toHaveAttribute('data-background', 'cold');
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  const before = await page.locator('.piano-key.selected').evaluate(el => getComputedStyle(el).backgroundImage);
  const target = (await state(page)).target;
  await page.getByRole('button', { name: 'Change colors' }).click();
  await page.getByRole('radio', { name: 'Sky blue' }).check();
  await page.getByRole('radio', { name: 'Warm', exact: true }).check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.locator('.piano-key.selected').evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe(before);
  expect((await state(page)).target).toEqual(target);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
  await expect(page.locator('html')).toHaveAttribute('data-background', 'warm');
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await page.getByRole('button', { name: 'Confirm new game' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible();
});

test('15 correct guesses without type coverage advance without the final picture', async ({ page }) => {
  const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  game.target = { type: 'major', root: 48, inversion: 0, notes: [48, 52, 55] };
  await seed(page, { ...game, total: 14, round: 15, counts: { ...game.counts, major: 13, minor: 1 } });
  await chooseTarget(page);
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByText('ROUND 16')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await state(page)).phase).toBe('playing');
});

test('portrait game fits small and taller phones without page scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seed(page, startGame(initialGame({ types: [...CHORD_TYPES], inversions: true })));
  await expect(page.locator('.piano-key')).toHaveCount(24);
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: `test-results/phone-${viewport.width}-all-types.png`, fullPage: true });
    const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportHeight: window.innerHeight, viewportWidth: window.innerWidth }));
    expect(size.width).toBeLessThanOrEqual(size.viewportWidth);
    expect(size.height).toBeLessThanOrEqual(size.viewportHeight);
    const white = (await page.getByRole('button', { name: 'C3', exact: true }).boundingBox())!;
    expect(white.height).toBeGreaterThanOrEqual(96);
  }
});

test('interval setup is the default and shows only the selected game palette', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Intervals', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('radio', { name: /Easy/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Minor 2nd', exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Octave', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Unison', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Tritone', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Minor 7th', exact: true }).check();
  await page.getByRole('tab', { name: 'Chords', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Unison', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Include inversions/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Intervals', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replay current interval' })).toBeVisible();
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
  await expect(page.locator('.piano-key')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit current guess' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play current guess' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '2nd intervals', exact: true }).getByRole('button')).toHaveCount(2);
});

test('easy interval guesses unlock sequential playback, restore and score once', async ({ page }) => {
  const game = startGame(initialGame());
  game.target = { type: 'major3', root: 48, inversion: 0, notes: [48, 52] };
  await seed(page, game);
  const hint = page.getByRole('button', { name: 'Play interval note by note' });
  await expect(hint).toBeDisabled();
  await page.getByRole('button', { name: 'Guess Minor 3rd', exact: true }).click();
  await expect(hint).toBeEnabled();
  expect((await state(page)).total).toBe(0);
  await page.reload();
  await expect(hint).toBeEnabled();
  await expect(page.locator('.wave')).not.toHaveClass(/wave-active/);
  await hint.click();
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
  await page.getByRole('button', { name: 'Guess Major 3rd', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guess Major 3rd', exact: true })).toBeDisabled();
  expect((await state(page)).total).toBe(1);
  expect((await state(page)).counts.major3).toBe(1);
  await expect(page.getByText('ROUND 02')).toBeVisible();
  await expect(hint).toBeDisabled();
});

test('regular interval setup uses the piano and unisons schedule one voice', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as unknown as { scheduledVoices: number }).scheduledVoices = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as unknown as { scheduledVoices: number }).scheduledVoices++;
      return original.apply(this, args);
    };
  });
  const game = startGame(initialGame({ mode: 'intervals', difficulty: 'regular', types: [...initialGame().settings.types, 'unison'], inversions: false }));
  game.target = { type: 'unison', root: 48, inversion: 0, notes: [48] };
  await seed(page, game);
  const voices = () => page.evaluate(() => (window as unknown as { scheduledVoices: number }).scheduledVoices);
  await page.getByRole('button', { name: 'Replay current interval' }).click();
  await expect.poll(voices).toBe(1);
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await expect.poll(voices).toBe(2);
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect.poll(voices).toBe(3);
  expect((await state(page)).counts.unison).toBe(1);
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await page.getByRole('button', { name: 'Confirm new game' }).click();
  await expect(page.getByRole('radio', { name: /Regular/ })).toBeChecked();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.locator('.piano-key')).toHaveCount(24);
});

test('interval finale requires coverage and survives refresh before completion', async ({ page }) => {
  const game = startGame(initialGame());
  game.target = { type: 'octave', root: 48, inversion: 0, notes: [48, 60] };
  game.settings.types.forEach(type => { game.counts[type] = 2; });
  game.counts.octave = 1;
  game.total = 17;
  game.round = 18;
  await seed(page, game);
  await page.getByRole('button', { name: 'Guess Octave', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('18 INTERVALS FOUND')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('SESSION COMPLETE')).toBeVisible();
  expect((await state(page)).total).toBe(18);
});

test('all interval choices fit a small portrait phone in both modes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const { INTERVAL_TYPES } = await import('../src/game');
  await seed(page, startGame(initialGame({ mode: 'intervals', difficulty: 'easy', types: [...INTERVAL_TYPES], inversions: false })));
  await expect(page.locator('.interval-answer')).toHaveCount(13);
  const fits = async () => {
    const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }));
    expect(size.width).toBeLessThanOrEqual(size.viewportWidth);
    expect(size.height).toBeLessThanOrEqual(size.viewportHeight);
  };
  await fits();
  await page.screenshot({ path: 'test-results/interval-easy-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await page.getByRole('button', { name: 'Confirm new game' }).click();
  await page.getByRole('radio', { name: /Regular/ }).check();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.locator('.piano-key')).toHaveCount(24);
  await page.screenshot({ path: 'test-results/interval-regular-phone.png', fullPage: true });
  await fits();
});
