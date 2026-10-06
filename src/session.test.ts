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
  it('restores pending success, milestone, and completion without double scoring', () => {
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
    ]) expect(parseSession(JSON.stringify({ ...game, ...patch }))).toBeNull();
  });
  it('keeps the app usable when storage access throws', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadSession(storage)).toEqual(initialGame());
    expect(saveSession(initialGame(), storage)).toBe(false);
  });
});
