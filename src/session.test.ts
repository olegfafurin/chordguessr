import { describe, expect, it } from 'vitest';
import { INTERVAL_TYPES, DEFAULT_INTERVAL_TYPES, voicings, DEFAULT_CHORD_SETTINGS, continuePlaying, initialGame, nextRound, startGame, submitGuess, toggleNote, type IntervalType } from './game';
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
    let game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    game = { ...game, total: 14, round: 15, counts: { ...game.counts, major: 7, minor: 7 } };
    const milestone = submitGuess({ ...game, selected: game.target!.notes });
    expect(parseSession(JSON.stringify(milestone))).toEqual(milestone);
    const complete = nextRound(milestone);
    expect(parseSession(JSON.stringify(complete))).toEqual(complete);
    const fresh = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const success = submitGuess({ ...fresh, selected: fresh.target!.notes });
    expect(parseSession(JSON.stringify(success))).toEqual(success);
  });
  it('preserves the hint unlock after feedback clears and the page is refreshed', () => {
    let game = submitGuess(toggleNote(startGame(initialGame(DEFAULT_CHORD_SETTINGS)), 48));
    game = toggleNote(game, 48);
    expect(game.feedback).toBe('none');
    expect(parseSession(JSON.stringify(game))?.wrongAttempts).toBe(1);
  });
  it('migrates existing sessions, including the old 15-point celebration', () => {
    const base = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const old = { ...base, version: 1, total: 15, round: 15, phase: 'milestone', counts: { ...base.counts, major: 14, minor: 1 } };
    expect(parseSession(JSON.stringify(old))).toMatchObject({ version: 4, total: 15, phase: 'success', wrongAttempts: 0 });
    old.counts = { ...base.counts, major: 13, minor: 2 };
    expect(parseSession(JSON.stringify(old))).toMatchObject({ version: 4, total: 15, phase: 'finale' });
    const legacyWrong = { ...base, version: 1, feedback: 'incorrect', selected: [48] };
    expect(parseSession(JSON.stringify(legacyWrong))?.wrongAttempts).toBe(1);
    const storage = { getItem: (key: string) => key === 'chordguessr.session.v1' ? JSON.stringify(legacyWrong) : null, setItem: () => {} };
    expect(loadSession(storage)).toMatchObject({ version: 4, wrongAttempts: 1 });
  });
  it.each([null, '', '{', 'null', '[]', '{"version":2}', '{"version":1}'])('ignores corrupt or incompatible data: %s', raw => {
    expect(parseSession(raw)).toBeNull();
  });
  it('rejects invalid settings, counts, targets, and selected notes', () => {
    const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
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
    expect(saveSession(initialGame(DEFAULT_CHORD_SETTINGS), storage)).toBe(false);
  });
  it('restores continued play, including success at the old milestone scores', () => {
    const base = startGame(initialGame({ mode: 'intervals', difficulty: 'regular', types: ['unison'], inversions: false }));
    const finale = { ...base, phase: 'finale' as const, total: 2, round: 2, counts: { ...base.counts, unison: 2 } };
    let game = continuePlaying(finale);
    expect(parseSession(JSON.stringify(game))).toEqual(game);
    while (game.total < 16) {
      const success = submitGuess({ ...game, selected: game.target!.notes });
      const restored = parseSession(JSON.stringify(success))!;
      expect(restored).toEqual(success);
      expect(submitGuess(restored).total).toBe(success.total);
      game = nextRound(restored);
      expect(parseSession(JSON.stringify(game))).toEqual(game);
    }
    for (const patch of [{ endless: 'true' }, { phase: 'finale' }, { phase: 'complete' }, { phase: 'milestone' }]) {
      expect(parseSession(JSON.stringify({ ...game, ...patch }))).toBeNull();
    }
    expect(parseSession(JSON.stringify({ ...base, endless: true }))).toBeNull();
    expect(parseSession(JSON.stringify({ ...initialGame(), endless: true }))).toBeNull();
    const { endless: _endless, ...missingFlag } = game;
    expect(parseSession(JSON.stringify(missingFlag))).toBeNull();
  });
  it('migrates v3 games and final celebrations without losing settings or progress', () => {
    for (const settings of [DEFAULT_CHORD_SETTINGS, initialGame().settings]) {
      const base = startGame(initialGame(settings));
      const success = submitGuess({ ...base, selected: settings.mode === 'intervals' ? [] : base.target!.notes }, settings.mode === 'intervals' ? base.target!.type as IntervalType : undefined);
      const counts = { ...base.counts };
      settings.types.forEach(type => { counts[type] = 2; });
      if (settings.mode !== 'intervals') counts.major = 13;
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const finale = { ...base, phase: 'finale' as const, total, round: total, counts };
      for (const game of [base, success, finale]) {
        const { endless: _endless, ...old } = game;
        const raw = JSON.stringify({ ...old, version: 3 });
        expect(parseSession(raw)).toEqual(game);
        const storage = { getItem: (key: string) => key === 'chordguessr.session.v3' ? raw : null, setItem: () => {} };
        expect(loadSession(storage)).toEqual(game);
      }
    }
  });
});


describe('interval session validation and migration', () => {
  it.each(['easy', 'regular'] as const)('preserves incomplete %s setup palettes on refresh', difficulty => {
    for (const types of [[], ['unison']] as const) {
      const game = initialGame({ mode: 'intervals', difficulty, types: [...types], inversions: false });
      expect(parseSession(JSON.stringify(game))).toEqual(game);
    }
  });
  it('restores minimal easy and regular palettes through scoring and completion', () => {
    for (const difficulty of ['easy', 'regular'] as const) {
      const types = difficulty === 'easy' ? ['unison', 'tritone'] as const : ['unison'] as const;
      let game = startGame(initialGame({ mode: 'intervals', difficulty, types: [...types], inversions: false }));
      expect(parseSession(JSON.stringify(game))).toEqual(game);
      for (const type of [...types, ...types]) {
        const target = voicings(type, false)[0];
        game = submitGuess({ ...game, target, selected: difficulty === 'easy' ? [] : target.notes }, difficulty === 'easy' ? type : undefined);
        expect(parseSession(JSON.stringify(game))).toEqual(game);
        game = nextRound(game);
      }
      expect(game.phase).toBe('complete');
      expect(parseSession(JSON.stringify(game))).toEqual(game);
    }
  });
  it.each(['easy', 'regular'] as const)('restores %s interval rounds and hint unlocks', difficulty => {
    const base = startGame(initialGame({ mode: 'intervals', difficulty, types: [...INTERVAL_TYPES], inversions: false }));
    const game = { ...base, target: voicings('unison', false)[0], wrongAttempts: 1, selected: difficulty === 'regular' ? [48] : [] };
    expect(parseSession(JSON.stringify(game))).toEqual(game);
    const success = submitGuess(game, difficulty === 'easy' ? 'unison' : undefined);
    expect(parseSession(JSON.stringify(success))).toEqual(success);
  });
  it('restores interval milestones and the actual finale without awarding twice', () => {
    const game = startGame(initialGame());
    const milestone = submitGuess({ ...game, target: voicings('minor2', false)[0], round: 5, total: 4, counts: { ...game.counts, minor2: 4 } }, 'minor2');
    expect(parseSession(JSON.stringify(milestone))).toEqual(milestone);
    const counts = { ...game.counts };
    DEFAULT_INTERVAL_TYPES.forEach(type => { counts[type] = 2; });
    counts.minor2 = 1;
    const finale = submitGuess({ ...game, target: voicings('minor2', false)[0], round: 18, total: 17, counts }, 'minor2');
    expect(parseSession(JSON.stringify(finale))).toEqual(finale);
    expect(submitGuess(parseSession(JSON.stringify(finale))!, 'minor2').total).toBe(18);
    expect(parseSession(JSON.stringify(nextRound(finale)))?.phase).toBe('complete');
  });
  it('migrates v2 chord progress and initializes interval counters', () => {
    const base = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const old = { ...submitGuess({ ...base, selected: base.target!.notes }), version: 2 };
    const counts = Object.fromEntries(Object.entries(old.counts).filter(([type]) => !INTERVAL_TYPES.includes(type as typeof INTERVAL_TYPES[number])));
    const migrated = parseSession(JSON.stringify({ ...old, counts }))!;
    expect(migrated).toMatchObject({ version: 4, phase: 'success', total: 1, target: base.target });
    expect(migrated.counts.minor2).toBe(0);
    const storage = { getItem: (key: string) => key === 'chordguessr.session.v2' ? JSON.stringify({ ...old, counts }) : null, setItem: () => {} };
    expect(loadSession(storage)).toEqual(migrated);
    const { major: _major, ...missingCount } = counts;
    expect(parseSession(JSON.stringify({ ...old, counts: missingCount }))).toBeNull();
  });
  it('rejects mixed or undersized active palettes, invalid difficulty and easy piano selections', () => {
    const game = startGame(initialGame());
    for (const patch of [
      { settings: { ...game.settings, types: [...game.settings.types, 'major'] } },
      { settings: { ...game.settings, types: ['minor2'] } },
      { settings: { ...game.settings, types: [] } },
      { settings: { ...game.settings, difficulty: 'regular', types: [] } },
      { settings: { ...game.settings, types: ['minor2', 'minor2'] } },
      { settings: { ...game.settings, difficulty: 'unknown' } },
      { settings: { ...game.settings, inversions: true } },
      { selected: [48] }, { counts: { ...game.counts, major: 1 }, total: 1 },
      { target: { type: 'unison', notes: [48, 48], root: 48, inversion: 0 } },
    ]) expect(parseSession(JSON.stringify({ ...game, ...patch }))).toBeNull();
  });
});
