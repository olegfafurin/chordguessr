import { describe, expect, it } from 'vitest';
import { CHORDS, CHORD_TYPES, HIGH_NOTE, LOW_NOTE, generateTarget, initialGame, isComplete, nextRound, sameNotes, startGame, submitGuess, toggleNote, typeWeight, voicings, type Game } from './game';

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
    const game = initialGame();
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
    let game = startGame(initialGame());
    expect(submitGuess(game)).toBe(game);
    game = toggleNote(game, 48);
    expect(game.selected).toEqual([48]);
    game = submitGuess(game);
    expect(game.feedback).toBe('incorrect');
    expect(game.selected).toEqual([48]);
    expect(game.total).toBe(0);
    expect(toggleNote(game, 48).selected).toEqual([]);
    expect(toggleNote(game, 72)).toBe(game);
  });
  it('awards each round exactly once and clears keys', () => {
    const game = startGame(initialGame());
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
    const game = toggleNote(startGame(initialGame()), 48);
    const skipped = nextRound(game);
    expect(skipped.total).toBe(0);
    expect(skipped.counts).toEqual(game.counts);
    expect(skipped.round).toBe(2);
    expect(skipped.selected).toEqual([]);
    expect(sameNotes(skipped.target!.notes, game.target!.notes)).toBe(false);
  });
  it.each([5, 10, 15])('pauses for milestone %i before advancing or completing', total => {
    const game = startGame(initialGame());
    const almost = { ...game, total: total - 1, round: total, counts: { ...game.counts, major: total - 3, minor: 2 } };
    const scored = correct(almost);
    expect(scored.total).toBe(total);
    expect(scored.phase).toBe('milestone');
    expect(nextRound(scored).phase).toBe(total === 15 ? 'complete' : 'playing');
  });
  it('continues beyond 15 until every type has two correct answers', () => {
    const game = startGame(initialGame());
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
