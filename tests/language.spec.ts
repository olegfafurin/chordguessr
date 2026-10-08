import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_CHORD_SETTINGS, INTERVAL_TYPES, initialGame, startGame, submitGuess, type Game } from '../src/game';
import { LANGUAGE_KEY } from '../src/i18n';
import { SESSION_KEY } from '../src/session';

async function seed(page: Page, game: Game, language = 'en') {
  await page.addInitScript(({ key, value, languageKey, language }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
    if (!sessionStorage.getItem(languageKey)) sessionStorage.setItem(languageKey, language);
  }, { key: SESSION_KEY, value: JSON.stringify(game), languageKey: LANGUAGE_KEY, language });
  await page.goto('/');
}
async function state(page: Page): Promise<Game> {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), SESSION_KEY);
}
async function russian(page: Page) {
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('radio', { name: 'Russian', exact: true }).check();
  await expect(page.getByRole('dialog', { name: 'Язык', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
}

test('/ru selects Russian immediately and follows the normal setup workflow', async ({ page }) => {
  await page.goto('/ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('dialog', { name: 'Краткое руководство.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Понятно', exact: true }).click();
  await page.getByRole('button', { name: 'Начать игру', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ответ: Малая секунда', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('button', { name: 'Ответ: Малая секунда', exact: true })).toBeVisible();
});

test('/ru overrides a saved English preference without changing the active round', async ({ page }) => {
  const game = { ...startGame(initialGame(DEFAULT_CHORD_SETTINGS)), selected: [48], wrongAttempts: 1, feedback: 'incorrect' as const };
  await seed(page, game);
  await page.goto('/ru/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(await page.evaluate(key => sessionStorage.getItem(key), LANGUAGE_KEY)).toBe('ru');
  expect(await state(page)).toEqual(game);
  await expect(page.getByRole('button', { name: 'До3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  expect(await state(page)).toEqual(game);
});

test('English defaults and Russian covers setup, themes, help and the language dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Change language', exact: true })).toHaveText('EN');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await russian(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('button', { name: 'Изменить язык', exact: true })).toHaveText('RU');
  await expect(page).toHaveTitle('Chordguessr — найдите свою гармонию');
  await expect(page.getByRole('heading', { name: 'Найдите свою гармонию.' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Интервалы', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('radio', { name: /^Лёгкий/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Малая секунда', exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Большая септима', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Аккорды', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Доминантсептаккорд/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Мажор/ })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Включить обращения', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Изменить цвета', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ваши цвета.', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Светло-розовый' })).toBeChecked();
  await page.getByRole('radio', { name: 'Небесно-голубой' }).check();
  await page.getByRole('radio', { name: 'Тёплый', exact: true }).check();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await page.getByRole('button', { name: 'Как играть', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Краткое руководство.', exact: true })).toBeVisible();
  await expect(page.getByText('По одной ноте', { exact: true })).toBeVisible();
  await expect(page.getByText(/Фортепиано: библиотека Александра Хольма/)).toBeVisible();
  await page.getByRole('button', { name: 'Понятно', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить язык', exact: true }).click();
  await page.getByRole('radio', { name: 'Английский', exact: true }).check();
  await expect(page.getByRole('dialog', { name: 'Language', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: 'Chords', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('changing language preserves the round and selection, translates errors, and persists after refresh and restart', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as unknown as { voices: number }).voices = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      (window as unknown as { voices: number }).voices++;
      return start.apply(this, args);
    };
  });
  const game = { ...startGame(initialGame(DEFAULT_CHORD_SETTINGS)), selected: [48], wrongAttempts: 1, feedback: 'incorrect' as const };
  await seed(page, game);
  await russian(page);
  expect(await state(page)).toEqual(game);
  expect(await page.evaluate(() => (window as unknown as { voices: number }).voices)).toBe(0);
  await expect(page.getByRole('button', { name: 'До3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 нота выбрана', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сыграть аккорд по нотам' })).toBeEnabled();
  await expect(page.getByText('Пока не совсем. Послушайте ещё — у вас получится.', { exact: true })).toBeVisible();
  await page.route('**/audio/C3.mp3', route => route.abort());
  await page.getByRole('button', { name: 'Проверить выбранные ноты', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ваш ответ сохранён');
  await page.getByRole('button', { name: 'Изменить язык', exact: true }).click();
  await page.getByRole('radio', { name: 'Английский', exact: true }).check();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your guess is saved');
  await russian(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(await state(page)).toEqual(game);
  await page.getByRole('button', { name: 'Начать новую игру', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Начать заново?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить новую игру', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('button', { name: 'Начать игру', exact: true })).toBeVisible();
});

test('Russian interval buttons submit immediately and both layouts fit small phones', async ({ page }) => {
  const game = startGame(initialGame({ mode: 'intervals', difficulty: 'easy', types: [...INTERVAL_TYPES], inversions: false }));
  game.target = { type: 'major3', root: 48, inversion: 0, notes: [48, 52] };
  await seed(page, game, 'ru');
  await expect(page.getByRole('group', { name: 'Интервалы: Терции', exact: true }).getByRole('button')).toHaveCount(2);
  const fits = () => page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }));
  for (const viewport of [{ width: 320, height: 667 }, { width: 375, height: 667 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const size = await fits();
    expect(size.width).toBeLessThanOrEqual(size.viewportWidth);
    expect(size.height).toBeLessThanOrEqual(size.viewportHeight);
  }
  await page.getByRole('button', { name: 'Ответ: Большая терция', exact: true }).click();
  await expect.poll(async () => (await state(page)).counts.major3).toBe(1);
  await page.getByRole('button', { name: 'Начать новую игру', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить новую игру', exact: true }).click();
  await page.getByRole('radio', { name: /^Обычный/ }).check();
  await page.getByRole('button', { name: 'Начать игру', exact: true }).click();
  for (const viewport of [{ width: 320, height: 667 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    const size = await fits();
    expect(size.width).toBeLessThanOrEqual(size.viewportWidth);
    expect(size.height).toBeLessThanOrEqual(size.viewportHeight);
  }
  await expect(page.getByRole('button', { name: 'До3', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/russian-interval-phone.png`, fullPage: true });
});

for (const total of [5, 10, 15]) {
  test(`Russian celebration at ${total} survives refresh and translates continuation`, async ({ page }) => {
    const base = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    base.target = { type: 'major', root: 48, inversion: 0, notes: [48, 52, 55] };
    const game = submitGuess({ ...base, total: total - 1, round: total, selected: base.target.notes, counts: { ...base.counts, major: total - 3, minor: 2 } });
    await seed(page, game, 'ru');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(`УГАДАНО ${total} АККОРДОВ`, { exact: true })).toBeVisible();
    await expect(page.locator('.milestone-art img')).toHaveAttribute('alt', total === 5 ? 'Росток на клавише фортепиано' : total === 10 ? 'Цветок в окружении музыкальных нот' : 'Золотая звезда над праздничным фортепиано');
    await page.reload();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (total === 15) {
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Начать новую игру', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Продолжить игру', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    }
    await expect(page.getByText(`РАУНД ${String(total + 1).padStart(2, '0')}`, { exact: true })).toBeVisible();
    expect((await state(page)).total).toBe(total);
  });
}
