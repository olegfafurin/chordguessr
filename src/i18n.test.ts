import { describe, expect, it } from 'vitest';
import { labels, LANGUAGE_KEY, loadLanguage, saveLanguage, translate } from './i18n';

describe('language preference', () => {
  it('defaults to English and accepts only a supported saved language', () => {
    for (const value of [null, '', 'en', 'unknown', 'RU']) expect(loadLanguage({ getItem: () => value, setItem: () => {} })).toBe('en');
    expect(loadLanguage({ getItem: () => 'ru', setItem: () => {} })).toBe('ru');
  });
  it('saves separately from the game and survives unavailable storage', () => {
    let stored: string | null = null;
    const storage = { getItem: () => stored, setItem: (key: string, value: string) => { expect(key).toBe(LANGUAGE_KEY); stored = value; } };
    saveLanguage('ru', storage);
    expect(loadLanguage(storage)).toBe('ru');
    const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
    expect(loadLanguage(blocked)).toBe('en');
    expect(() => saveLanguage('ru', blocked)).not.toThrow();
  });
});

describe('Russian game terminology', () => {
  it('distinguishes seventh intervals from seventh chords', () => {
    const text = labels('ru');
    expect(text.type('major7Interval')).toBe('Большая септима');
    expect(text.type('minor7Interval')).toBe('Малая септима');
    expect(text.type('major7')).toBe('Большой мажорный септаккорд');
    expect(text.type('minor7')).toBe('Малый минорный септаккорд');
  });
  it.each([[0, 'нот выбрано'], [1, 'нота выбрана'], [2, 'ноты выбраны'], [5, 'нот выбрано'], [11, 'нот выбрано'], [12, 'нот выбрано'], [21, 'нота выбрана'], [22, 'ноты выбраны']])('uses Russian note forms for %s', (count, ending) => {
    expect(labels('ru').selected(count as number)).toBe(`${count} ${ending}`);
  });
  it('translates dynamic feedback and accessible piano labels', () => {
    const text = labels('ru');
    expect(text.celebrationFound(21, true)).toBe('УГАДАН 21 ИНТЕРВАЛ');
    expect(text.celebrationFound(22, false)).toBe('УГАДАНО 22 АККОРДА');
    expect(text.celebrationFound(12, true)).toBe('УГАДАНО 12 ИНТЕРВАЛОВ');
    expect(text.note(48)).toBe('До3');
    expect(text.note(61)).toBe('До-диез / Ре-бемоль4');
    expect(text.octave(3)).toBe('Октава 3');
    expect(translate('en', 'Start game')).toBe('Start game');
    expect(translate('ru', 'Start game')).toBe('Начать игру');
  });
});
