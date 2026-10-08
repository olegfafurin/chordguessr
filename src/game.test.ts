import { describe, expect, it } from 'vitest';
import { CHORDS, CHORD_TYPES, INTERVALS, INTERVAL_TYPES, DEFAULT_INTERVAL_TYPES, HIGH_NOTE, LOW_NOTE, generateTarget, DEFAULT_CHORD_SETTINGS, continuePlaying, initialGame, isComplete, nextRound, sameNotes, startGame, submitGuess, toggleNote, typeWeight, voicings, type Game } from './game';

function seededRandom(seed = 1234) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function correct(game: Game) { return submitGuess({ ...game, selected: game.target!.notes }); }

describe('piano chord generation', () => {
  it.each(CHORD_TYPES)('keeps %s voicings in range and preserves chord tones', type => {
    for (const inversions of [false, true]) {
      const choices = voicings(type, inversions);
      expect(choices.length).toBeGreaterThan(12);
      expect(new Set(choices.map(target => target.root % 12)).size).toBe(12);
      expect(new Set(choices.map(target => target.inversion)).size).toBe(inversions ? CHORDS[type].intervals.length : 1);
      for (const target of choices) {
        expect(target.notes.length).toBe(CHORDS[type].intervals.length);
        expect(target.notes[0]).toBeGreaterThanOrEqual(LOW_NOTE);
        expect(target.notes.at(-1)).toBeLessThanOrEqual(HIGH_NOTE);
        expect(new Set(target.notes).size).toBe(target.notes.length);
        expect(target.notes.map(note => (note - target.root) % 12).sort((a, b) => a - b)).toEqual([...CHORDS[type].intervals]);
        expect(target.notes[0] - target.root).toBe(CHORDS[type].intervals[target.inversion]);
      }
    }
  });
  it('uses the standard triad and seventh intervals', () => {
    expect(Object.fromEntries(CHORD_TYPES.map(type => [type, CHORDS[type].intervals]))).toEqual({ major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8], dominant7: [0, 4, 7, 10], major7: [0, 4, 7, 11], minor7: [0, 3, 7, 10], halfDiminished7: [0, 3, 6, 10], diminished7: [0, 3, 6, 9] });
  });
  it('favors underguessed types and never repeats the preceding exact notes', () => {
    const game = initialGame(DEFAULT_CHORD_SETTINGS);
    game.counts.major = 8;
    expect(typeWeight(0)).toBe(1);
    expect(typeWeight(8)).toBeCloseTo(1 / 9);
    const random = seededRandom();
    let previous = null;
    let minorCount = 0;
    for (let i = 0; i < 1500; i++) {
      const target = generateTarget(game.settings, game.counts, previous, random);
      expect(game.settings.types).toContain(target.type);
      if (previous) expect(sameNotes(previous.notes, target.notes)).toBe(false);
      if (target.type === 'minor') minorCount++;
      previous = target;
    }
    expect(minorCount / 1500).toBeGreaterThan(.86);
    expect(minorCount / 1500).toBeLessThan(.94);
  });
});

describe('rounds and scoring', () => {
  it('requires exact keys, regardless of selection order', () => {
    expect(sameNotes([48, 52, 55], [55, 48, 52])).toBe(true);
    expect(sameNotes([48, 52, 55], [60, 52, 55])).toBe(false);
    expect(sameNotes([48, 52, 55], [48, 52, 55, 60])).toBe(false);
    expect(sameNotes([48, 52, 55], [48, 52])).toBe(false);
  });
  it('toggles notes and preserves incorrect selections without scoring', () => {
    let game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    expect(submitGuess(game)).toBe(game);
    game = toggleNote(game, 48);
    expect(game.selected).toEqual([48]);
    game = submitGuess(game);
    expect(game.feedback).toBe('incorrect');
    expect(game.wrongAttempts).toBe(1);
    expect(game.selected).toEqual([48]);
    expect(game.total).toBe(0);
    expect(toggleNote(game, 48).selected).toEqual([]);
    expect(toggleNote(game, 48).wrongAttempts).toBe(1);
    expect(toggleNote(game, 72)).toBe(game);
  });
  it('awards each round exactly once and clears keys', () => {
    const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const scored = correct(game);
    expect(scored.total).toBe(1);
    expect(scored.counts[game.target!.type]).toBe(1);
    expect(scored.phase).toBe('success');
    expect(scored.selected).toEqual([]);
    expect(submitGuess(scored)).toBe(scored);
    expect(toggleNote(scored, 48)).toBe(scored);
    const next = nextRound(scored);
    expect(next.round).toBe(2);
    expect(next.phase).toBe('playing');
  });
  it('skips without increasing any counters', () => {
    const game = submitGuess(toggleNote(startGame(initialGame(DEFAULT_CHORD_SETTINGS)), 48));
    const skipped = nextRound(game);
    expect(skipped.total).toBe(0);
    expect(skipped.counts).toEqual(game.counts);
    expect(skipped.round).toBe(2);
    expect(skipped.selected).toEqual([]);
    expect(skipped.wrongAttempts).toBe(0);
    expect(sameNotes(skipped.target!.notes, game.target!.notes)).toBe(false);
  });
  it.each([5, 10])('pauses for milestone %i before advancing', total => {
    const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const almost = { ...game, total: total - 1, round: total, counts: { ...game.counts, major: total - 3, minor: 2 } };
    const scored = correct(almost);
    expect(scored.total).toBe(total);
    expect(scored.phase).toBe('milestone');
    expect(nextRound(scored).phase).toBe('playing');
  });
  it('celebrates the actual finish, including finishes after 15', () => {
    const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    for (const total of [15, 16, 23]) {
      const almost = { ...game, total: total - 1, round: total, counts: { ...game.counts, major: total - 3, minor: 2 } };
      const scored = correct(almost);
      expect(scored.phase).toBe('finale');
      expect(submitGuess(scored)).toBe(scored);
      expect(nextRound(scored).phase).toBe('complete');
    }
  });
  it('does not show the final celebration at 15 while a type is still underguessed', () => {
    const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const target = { type: 'major' as const, root: 48, inversion: 0, notes: [48, 52, 55] };
    const almost = { ...game, target, total: 14, round: 15, counts: { ...game.counts, major: 13, minor: 1 } };
    const scored = correct(almost);
    expect(scored.total).toBe(15);
    expect(scored.phase).toBe('success');
    expect(nextRound(scored).phase).toBe('playing');
  });
  it('continues beyond 15 until every type has two correct answers', () => {
    const game = startGame(initialGame(DEFAULT_CHORD_SETTINGS));
    const at15 = { ...game, total: 15, counts: { ...game.counts, major: 14, minor: 1 } };
    expect(isComplete(at15)).toBe(false);
    expect(nextRound(at15).phase).toBe('playing');
    expect(isComplete({ ...at15, total: 16, counts: { ...at15.counts, minor: 2 } })).toBe(true);
    expect(isComplete({ ...game, total: 4, counts: { ...game.counts, major: 2, minor: 2 } })).toBe(false);
  });
  it('requires at least 18 correct answers when all nine types are selected', () => {
    const game = initialGame({ types: [...CHORD_TYPES], inversions: true });
    CHORD_TYPES.forEach(type => { game.counts[type] = 2; });
    game.total = 18;
    expect(isComplete(game)).toBe(true);
    game.counts.diminished7 = 1;
    game.total = 17;
    expect(isComplete(game)).toBe(false);
  });
});


describe('continuing after the finale', () => {
  it.each(['chords', 'easy', 'regular'] as const)('keeps %s settings and scores indefinitely without another celebration', mode => {
    const settings = mode === 'chords' ? DEFAULT_CHORD_SETTINGS : { mode: 'intervals' as const, difficulty: mode, types: ['unison', 'tritone'] as const, inversions: false };
    const base = startGame(initialGame({ ...settings, types: [...settings.types] }));
    const finale: Game = { ...base, phase: 'finale', total: mode === 'chords' ? 15 : 4, round: mode === 'chords' ? 15 : 4,
      wrongAttempts: 1, counts: { ...base.counts, ...(mode === 'chords' ? { major: 13, minor: 2 } : { unison: 2, tritone: 2 }) } };
    const random = seededRandom();
    let game = continuePlaying(finale, random);
    expect(game).toMatchObject({ phase: 'playing', endless: true, total: finale.total, round: finale.round + 1, wrongAttempts: 0 });
    expect(game.settings).toEqual(finale.settings);
    expect(game.counts).toEqual(finale.counts);
    expect(sameNotes(game.target!.notes, finale.target!.notes)).toBe(false);
    for (let round = 0; round < 30; round++) {
      const scored = submitGuess({ ...game, selected: mode === 'easy' ? [] : game.target!.notes }, mode === 'easy' ? game.target!.type as keyof typeof INTERVALS : undefined);
      expect(scored.phase).toBe('success');
      expect(scored.total).toBe(game.total + 1);
      expect(submitGuess(scored, 'unison')).toBe(scored);
      game = nextRound(scored, random);
      expect(game.phase).toBe('playing');
    }
    const skipped = nextRound(game, random);
    expect(skipped.total).toBe(game.total);
    expect(skipped.counts).toEqual(game.counts);
    const reset = initialGame(game.settings, game.hintsSeen);
    expect(reset).toMatchObject({ phase: 'setup', total: 0, endless: false });
    expect(reset.settings).toEqual(game.settings);
  });
  it('only offers continued play after reaching the final celebration', () => {
    const setup = initialGame();
    const playing = startGame(setup);
    for (const game of [setup, playing, { ...playing, phase: 'finale' as const }]) expect(continuePlaying(game)).toBe(game);
  });
});

describe('interval games', () => {
  it('defaults to easy intervals with the default palette', () => {
    expect(initialGame().settings).toMatchObject({ mode: 'intervals', difficulty: 'easy', types: DEFAULT_INTERVAL_TYPES });
    expect(initialGame().settings.types).toEqual(['minor2', 'major2', 'minor3', 'major3', 'perfect4', 'perfect5', 'minor6', 'major6', 'octave']);
  });
  it.each(['easy', 'regular'] as const)('blocks undersized %s palettes from starting', difficulty => {
    for (const types of difficulty === 'easy' ? [[], ['unison'], ['unison', 'unison']] as const : [[]] as const) {
      const game = initialGame({ mode: 'intervals', difficulty, types: [...types], inversions: false });
      expect(startGame(game)).toBe(game);
    }
  });
  it('allows any two easy types and requires both to be guessed twice', () => {
    let game = startGame(initialGame({ mode: 'intervals', difficulty: 'easy', types: ['unison', 'tritone'], inversions: false }), () => 0);
    for (const [index, type] of (['unison', 'unison', 'tritone', 'tritone'] as const).entries()) {
      game = submitGuess({ ...game, target: voicings(type, false)[0] }, type);
      expect(game.phase).toBe(index === 3 ? 'finale' : 'success');
      game = nextRound(game, () => .9);
      if (index < 3) expect(['unison', 'tritone']).toContain(game.target!.type);
    }
    expect(game).toMatchObject({ total: 4, phase: 'complete', counts: { unison: 2, tritone: 2 } });
  });
  it.each(INTERVAL_TYPES)('allows regular practice of only %s while still requiring exact pitches', type => {
    let game = startGame(initialGame({ mode: 'intervals', difficulty: 'regular', types: [type], inversions: false }), seededRandom());
    const random = seededRandom(4321);
    for (let round = 0; round < 30; round++) {
      const previous = game.target!;
      game = nextRound(game, random);
      expect(game.target!.type).toBe(type);
      expect(sameNotes(game.target!.notes, previous.notes)).toBe(false);
    }
    const alternate = voicings(type, false).find(target => !sameNotes(target.notes, game.target!.notes))!;
    expect(submitGuess({ ...game, selected: alternate.notes })).toMatchObject({ total: 0, feedback: 'incorrect' });
    game = submitGuess({ ...game, selected: game.target!.notes });
    expect(game).toMatchObject({ total: 1, phase: 'success' });
    game = nextRound(game, random);
    game = submitGuess({ ...game, selected: game.target!.notes });
    expect(game).toMatchObject({ total: 2, phase: 'finale' });
    expect(nextRound(game).phase).toBe('complete');
  });
  it.each(INTERVAL_TYPES)('generates %s within the piano range with distinct voices', type => {
    for (const target of voicings(type, false)) {
      expect(target.notes).toEqual(INTERVALS[type].semitones === 0 ? [target.root] : [target.root, target.root + INTERVALS[type].semitones]);
      expect(target.notes[0]).toBeGreaterThanOrEqual(LOW_NOTE);
      expect(target.notes.at(-1)).toBeLessThanOrEqual(HIGH_NOTE);
    }
  });
  it('scores easy answers by kind regardless of pitch, and locks piano selection', () => {
    const game = startGame(initialGame());
    expect(toggleNote(game, 48)).toBe(game);
    expect(submitGuess({ ...game, selected: game.target!.notes })).toEqual({ ...game, selected: game.target!.notes });
    const wrongType = DEFAULT_INTERVAL_TYPES.find(type => type !== game.target!.type)!;
    const wrong = submitGuess(game, wrongType);
    expect(wrong).toMatchObject({ total: 0, wrongAttempts: 1, feedback: 'incorrect' });
    const scored = submitGuess(wrong, game.target!.type as keyof typeof INTERVALS);
    expect(scored.total).toBe(1);
    expect(scored.counts[game.target!.type]).toBe(1);
    expect(submitGuess(scored, game.target!.type as keyof typeof INTERVALS)).toBe(scored);
    expect(nextRound(scored).wrongAttempts).toBe(0);
    expect(submitGuess(game, 'unison')).toBe(game);
  });
  it('regular answers require exact pitches, including a single key for unison', () => {
    const game = startGame(initialGame({ mode: 'intervals', difficulty: 'regular', types: [...DEFAULT_INTERVAL_TYPES, 'unison'], inversions: false }));
    const unison = { ...game, target: voicings('unison', false)[0] };
    expect(submitGuess({ ...unison, selected: [48] }).total).toBe(1);
    expect(submitGuess({ ...unison, selected: [48, 60] }).feedback).toBe('incorrect');
    const third = { ...game, target: voicings('major3', false)[0] };
    for (const selected of [[48], [60, 64], [48, 52, 60]]) expect(submitGuess({ ...third, selected }).feedback).toBe('incorrect');
    expect(submitGuess({ ...third, selected: [52, 48] }).total).toBe(1);
  });
  it.each(['easy', 'regular'] as const)('requires two wins for every enabled kind in %s mode', difficulty => {
    const game = startGame(initialGame({ mode: 'intervals', difficulty, types: [...INTERVAL_TYPES], inversions: false }));
    const counts = { ...game.counts };
    INTERVAL_TYPES.forEach(type => { counts[type] = 2; });
    const almost = { ...game, target: voicings('major7Interval', false)[0], counts: { ...counts, major7Interval: 1 }, total: 25, round: 26 };
    expect(isComplete(almost)).toBe(false);
    const finish = submitGuess({ ...almost, selected: difficulty === 'regular' ? almost.target.notes : [] }, difficulty === 'easy' ? 'major7Interval' : undefined);
    expect(finish).toMatchObject({ total: 26, phase: 'finale' });
    expect(nextRound(finish).phase).toBe('complete');
  });
  it.each([5, 10])('pauses interval games at %s wins', total => {
    const game = startGame(initialGame());
    const target = voicings('minor2', false)[0];
    const scored = submitGuess({ ...game, target, total: total - 1, round: total, counts: { ...game.counts, minor2: total - 1 } }, 'minor2');
    expect(scored.phase).toBe('milestone');
    expect(nextRound(scored).phase).toBe('playing');
  });
  it('weights interval kinds independently and avoids repeated notes', () => {
    const game = initialGame();
    const counts = { ...game.counts, minor2: 20 };
    const random = seededRandom();
    let previous = null;
    let minorSeconds = 0;
    for (let i = 0; i < 1000; i++) {
      const target = generateTarget(game.settings, counts, previous, random);
      if (previous) expect(sameNotes(target.notes, previous.notes)).toBe(false);
      if (target.type === 'minor2') minorSeconds++;
      previous = target;
    }
    expect(minorSeconds).toBeLessThan(20);
  });
});
