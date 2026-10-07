import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_CHORD_SETTINGS, initialGame, startGame, submitGuess, type Game } from '../src/game';
import { INSTRUMENT_KEY, type Instrument } from '../src/instrument';
import { LANGUAGE_KEY } from '../src/i18n';
import { SESSION_KEY } from '../src/session';

async function seed(page: Page, game: Game, instrument: Instrument = 'piano') {
  await page.addInitScript(({ sessionKey, game, instrumentKey, instrument }) => {
    if (!sessionStorage.getItem(sessionKey)) sessionStorage.setItem(sessionKey, game);
    if (!sessionStorage.getItem(instrumentKey)) sessionStorage.setItem(instrumentKey, instrument);
  }, { sessionKey: SESSION_KEY, game: JSON.stringify(game), instrumentKey: INSTRUMENT_KEY, instrument });
  await page.goto('/');
}
async function state(page: Page): Promise<Game> {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), SESSION_KEY);
}
async function recordSamples(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { sampleVoices: string[] };
    state.sampleVoices = [];
    const encoded = new WeakMap<ArrayBuffer, string>();
    const decoded = new WeakMap<AudioBuffer, string>();
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await fetchOriginal(...args);
      if (response.url.endsWith('.mp3')) {
        const original = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => {
          const buffer = await original();
          encoded.set(buffer, new URL(response.url).pathname);
          return buffer;
        };
      }
      return response;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (data: ArrayBuffer) {
      return decode.call(this, data).then(buffer => { decoded.set(buffer, encoded.get(data)!); return buffer; });
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      state.sampleVoices.push(decoded.get(this.buffer!)!);
      return start.apply(this, args);
    };
  });
}
const voices = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { sampleVoices: string[] }).sampleVoices);

async function choose(page: Page, instrument: string) {
  await page.getByRole('button', { name: 'Change instrument', exact: true }).click();
  await page.getByRole('radio', { name: instrument, exact: true }).check();
  await expect(page.getByRole('radio', { name: instrument, exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: instrument, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
}

test('instrument picker defaults to piano and preserves setup, refresh and new games', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  const before = await state(page);
  await page.getByRole('button', { name: 'Change instrument', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Piano', exact: true })).toBeChecked();
  await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(4);
  await page.getByRole('radio', { name: 'Flute', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Flute', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change instrument', exact: true })).toHaveAttribute('title', 'Change instrument: Flute');
  expect(await state(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change instrument', exact: true })).toHaveAttribute('title', 'Change instrument: Flute');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Start a new game', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm new game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change instrument', exact: true })).toHaveAttribute('title', 'Change instrument: Flute');
});

for (const instrument of ['flute', 'guitar', 'voice'] as const) {
  test(`${instrument} plays secret intervals and hints while keys and guesses stay piano`, async ({ page }) => {
    await recordSamples(page);
    const game = startGame(initialGame({ ...initialGame().settings, difficulty: 'regular', types: [...initialGame().settings.types, 'unison'] }));
    game.target = { type: 'unison', root: 48, inversion: 0, notes: [48] };
    game.wrongAttempts = 1;
    await seed(page, game);
    await choose(page, instrument[0].toUpperCase() + instrument.slice(1));
    expect(await voices(page)).toEqual([]);
    await page.getByRole('button', { name: 'Replay current interval', exact: true }).click();
    await expect.poll(() => voices(page)).toEqual([`/audio/${instrument}/C3.mp3`]);
    await page.getByRole('button', { name: 'Play interval note by note', exact: true }).click();
    await expect.poll(() => voices(page)).toEqual([`/audio/${instrument}/C3.mp3`, `/audio/${instrument}/C3.mp3`]);
    await page.getByRole('button', { name: 'C3', exact: true }).click();
    await expect.poll(async () => (await voices(page)).at(-1)).toBe('/audio/C3.mp3');
    await page.getByRole('button', { name: 'C3', exact: true }).click();
    expect(await voices(page)).toHaveLength(3);
    await page.getByRole('button', { name: 'C3', exact: true }).click();
    await expect.poll(async () => (await voices(page)).length).toBe(4);
    await page.getByRole('button', { name: 'Play current guess', exact: true }).click();
    await expect.poll(async () => (await voices(page)).length).toBe(5);
    await page.getByRole('button', { name: 'Submit current guess', exact: true }).click();
    await expect.poll(async () => (await voices(page)).length).toBe(6);
    expect((await voices(page)).slice(2)).toEqual(Array(4).fill('/audio/C3.mp3'));
    expect((await state(page)).counts.unison).toBe(1);
    await expect(page.getByText('ROUND 02', { exact: true })).toBeVisible();
    await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(6);
    expect((await voices(page)).slice(6).every(path => path.startsWith(`/audio/${instrument}/`))).toBe(true);
    await page.reload();
    expect(await voices(page)).toEqual([]);
    await page.getByRole('button', { name: 'Replay current interval', exact: true }).click();
    await expect.poll(async () => (await voices(page)).length).toBeGreaterThan(0);
    expect((await voices(page)).every(path => path.startsWith(`/audio/${instrument}/`))).toBe(true);
  });
}

test('selected instrument plays the first secret chord and survives a language change', async ({ page }) => {
  await recordSamples(page);
  const setup = initialGame(DEFAULT_CHORD_SETTINGS, true);
  await seed(page, setup);
  await choose(page, 'Guitar');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(async () => (await voices(page)).length).toBe(3);
  expect((await voices(page)).every(path => path.startsWith('/audio/guitar/'))).toBe(true);
  const game = await state(page);
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('radio', { name: 'Russian', exact: true }).check();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить инструмент', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Инструмент для загаданных нот', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Гитара', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Голос', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  expect(await state(page)).toEqual(game);
});

test('failed instrument loading retains the current sound and round and allows retry', async ({ page }) => {
  const game = startGame(initialGame());
  await seed(page, game);
  await page.route('**/audio/flute/C3.mp3', route => route.abort());
  await page.getByRole('button', { name: 'Change instrument', exact: true }).click();
  await page.getByRole('radio', { name: 'Flute', exact: true }).check();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Choose it again to retry');
  await expect(page.getByRole('radio', { name: 'Piano', exact: true })).toBeChecked();
  expect(await state(page)).toEqual(game);
  await page.unroute('**/audio/flute/C3.mp3');
  await page.getByRole('radio', { name: 'Flute', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Flute', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Flute', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});

test('changing instruments cancels a target still loading', async ({ page }) => {
  await recordSamples(page);
  const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  await seed(page, game, 'flute');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/audio/flute/C3.mp3', async route => { await gate; await route.continue(); });
  await page.getByRole('button', { name: 'Replay current chord', exact: true }).click();
  await choose(page, 'Guitar');
  release();
  // A new playback supersedes the pending flute, even when it finishes decoding later.
  await page.getByRole('button', { name: 'Replay current chord', exact: true }).click();
  await expect.poll(async () => (await voices(page)).length).toBe(3);
  expect((await voices(page)).every(path => path.startsWith('/audio/guitar/'))).toBe(true);
  expect(await state(page)).toEqual(game);
});

test('instrument settings pause advancement during success without awarding twice', async ({ page }) => {
  const base = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
  const success = submitGuess({ ...base, selected: base.target!.notes });
  await seed(page, success);
  await page.getByRole('button', { name: 'Change instrument', exact: true }).click();
  await page.getByRole('radio', { name: 'Voice', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Voice', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Voice', exact: true })).toBeEnabled();
  // The open settings dialog keeps the correct round in view until it is closed.
  await page.clock.install();
  await page.clock.fastForward(2500);
  expect((await state(page)).round).toBe(1);
  expect((await state(page)).total).toBe(1);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.clock.fastForward(2000);
  await expect(page.getByText('ROUND 02', { exact: true })).toBeVisible();
  expect((await state(page)).total).toBe(1);
});

test('the instrument control stays usable on short portrait phones', async ({ page }) => {
  await page.addInitScript(key => sessionStorage.setItem(key, 'ru'), LANGUAGE_KEY);
  await seed(page, startGame(initialGame()));
  for (const viewport of [{ width: 320, height: 667 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    const headerButtons = page.locator('.header-actions button');
    await expect(headerButtons).toHaveCount(5);
    for (const button of await headerButtons.all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.getByRole('button', { name: 'Изменить инструмент', exact: true }).click();
  await page.screenshot({ path: 'test-results/instrument-picker-phone.png', fullPage: true });
});
