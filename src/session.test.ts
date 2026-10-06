import { describe, expect, it } from 'vitest';
import { initialGame, nextRound, startGame, submitGuess, toggleNote } from './game';
import { loadSession, parseSession, saveSession, SESSION_KEY } from './session';

describe('session persistence', () => {
  it('round-trips settings, target, selection, counts, and first-use status', () => {
    const game = toggleNote(startGame(initialGame({ types: ['major', 'minor', 'dominant7'], inversions: true })), 60);
    let saved = '';
    const storage = { getItem: () => saved, setItem: (key: string, value: string) => { expect(key).toBe(SESSION_KEY); saved = value; } };
    expect(saveSession(game, storage)).toBe(true);
    expect(loadSession(storage)).toEqual(game);
  });
  it('restores pending success, final celebration, and completion without double scoring', () => {
    let game = startGame(initialGame());
    game = { ...game, total: 14, round: 15, counts: { ...game.counts, major: 7, minor: 7 } };
    const milestone = submitGuess({ ...game, selected: game.target!.notes });
    expect(parseSession(JSON.stringify(milestone))).toEqual(milestone);
    const complete = nextRound(milestone);
    expect(parseSession(JSON.stringify(complete))).toEqual(complete);
    const fresh = startGame(initialGame());
    const success = submitGuess({ ...fresh, selected: fresh.target!.notes });
    expect(parseSession(JSON.stringify(success))).toEqual(success);
  });
  it('preserves the hint unlock after feedback clears and the page is refreshed', () => {
    let game = submitGuess(toggleNote(startGame(initialGame()), 48));
    game = toggleNote(game, 48);
    expect(game.feedback).toBe('none');
    expect(parseSession(JSON.stringify(game))?.wrongAttempts).toBe(1);
  });
  it('migrates existing sessions, including the old 15-point celebration', () => {
    const base = startGame(initialGame());
    const old = { ...base, version: 1, total: 15, round: 15, phase: 'milestone', counts: { ...base.counts, major: 14, minor: 1 } };
    expect(parseSession(JSON.stringify(old))).toMatchObject({ version: 2, total: 15, phase: 'success', wrongAttempts: 0 });
    old.counts = { ...base.counts, major: 13, minor: 2 };
    expect(parseSession(JSON.stringify(old))).toMatchObject({ version: 2, total: 15, phase: 'finale' });
    const legacyWrong = { ...base, version: 1, feedback: 'incorrect', selected: [48] };
    expect(parseSession(JSON.stringify(legacyWrong))?.wrongAttempts).toBe(1);
    const storage = { getItem: (key: string) => key === 'chordguessr.session.v1' ? JSON.stringify(legacyWrong) : null, setItem: () => {} };
    expect(loadSession(storage)).toMatchObject({ version: 2, wrongAttempts: 1 });
  });
  it.each([null, '', '{', 'null', '[]', '{"version":2}', '{"version":1}'])('ignores corrupt or incompatible data: %s', raw => {
    expect(parseSession(raw)).toBeNull();
  });
  it('rejects invalid settings, counts, targets, and selected notes', () => {
    const game = startGame(initialGame());
    for (const patch of [
      { settings: { types: ['major'], inversions: false } },
      { settings: { types: ['major', 'minor', 'unknown'], inversions: false } },
      { settings: { types: ['major', 'minor', 'minor'], inversions: false } },
      { counts: { ...game.counts, major: -1 } }, { counts: { ...game.counts, major: 1 } },
      { selected: [48, 48] }, { selected: [72] }, { selected: [48.5] },
      { target: { ...game.target, notes: [48, 49, 50] } },
      { phase: 'complete' }, { phase: 'milestone' }, { round: 0 },
      { wrongAttempts: -1 }, { wrongAttempts: 1.5 }, { phase: 'finale' },
    ]) expect(parseSession(JSON.stringify({ ...game, ...patch }))).toBeNull();
  });
  it('keeps the app usable when storage access throws', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadSession(storage)).toEqual(initialGame());
    expect(saveSession(initialGame(), storage)).toBe(false);
  });
});
