import { expect, test, type Page } from '@playwright/test';
import { initialGame, noteLabel, startGame, submitGuess, type Game } from '../src/game';
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
  await seed(page, startGame(initialGame()));
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

test('milestone 15 survives refresh and appears before completion', async ({ page }) => {
  const game = startGame(initialGame());
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
  const game = startGame(initialGame());
  game.target = { type: 'minor', root: 48, inversion: 0, notes: [48, 51, 55] };
  await seed(page, { ...game, total: 15, round: 16, counts: { ...game.counts, major: 14, minor: 1 } });
  await expect(page.getByText('Fifteen found! Keep going', { exact: false })).toBeVisible();
  await chooseTarget(page);
  await page.getByRole('button', { name: 'Submit current guess' }).click();
  await expect(page.getByText('SESSION COMPLETE')).toBeVisible();
  expect((await state(page)).total).toBe(16);
});

test('continuing a restored milestone unlocks audio for the next round', async ({ page }) => {
  const game = startGame(initialGame());
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
  const game = startGame(initialGame());
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
  await seed(page, startGame(initialGame()));
  const octaves = page.locator('.octave');
  const first = (await octaves.nth(0).boundingBox())!;
  const second = (await octaves.nth(1).boundingBox())!;
  if (testInfo.project.name.startsWith('mobile')) expect(second.y).toBeGreaterThan(first.y + first.height);
  else expect(second.y).toBe(first.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const button of await page.locator('.icon-button').all()) {
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
  await seed(page, startGame(initialGame()));
  const voices = () => page.evaluate(() => (window as unknown as { scheduledVoices: number }).scheduledVoices);
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  await expect.poll(voices).toBe(1);
  await page.getByRole('button', { name: 'C3', exact: true }).click();
  expect(await voices()).toBe(1);
  await page.getByRole('button', { name: 'Play chord note by note' }).click();
  await expect.poll(voices).toBe(1 + (await state(page)).target!.notes.length);
  await expect(page.locator('.wave')).toHaveClass(/wave-active/);
});
