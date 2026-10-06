export const LOW_NOTE = 48; // C3
export const HIGH_NOTE = 71; // B4
export const CHORDS = {
  major: { label: 'Major', symbol: 'M', intervals: [0, 4, 7] },
  minor: { label: 'Minor', symbol: 'm', intervals: [0, 3, 7] },
  diminished: { label: 'Diminished', symbol: 'dim', intervals: [0, 3, 6] },
  augmented: { label: 'Augmented', symbol: 'aug', intervals: [0, 4, 8] },
  dominant7: { label: 'Dominant 7th', symbol: '7', intervals: [0, 4, 7, 10] },
  major7: { label: 'Major 7th', symbol: 'M7', intervals: [0, 4, 7, 11] },
  minor7: { label: 'Minor 7th', symbol: 'm7', intervals: [0, 3, 7, 10] },
  halfDiminished7: { label: 'Half-diminished 7th', symbol: 'ø7', intervals: [0, 3, 6, 10] },
  diminished7: { label: 'Diminished 7th', symbol: '°7', intervals: [0, 3, 6, 9] },
} as const;
export type ChordType = keyof typeof CHORDS;
export const CHORD_TYPES = Object.keys(CHORDS) as ChordType[];
export const REQUIRED_TYPES: ChordType[] = ['major', 'minor'];
export type Counts = Record<ChordType, number>;
export interface Settings { types: ChordType[]; inversions: boolean }
export interface Target { type: ChordType; notes: number[]; root: number; inversion: number }
export type Phase = 'setup' | 'playing' | 'success' | 'milestone' | 'finale' | 'complete';
export interface Game {
  version: 2;
  settings: Settings;
  phase: Phase;
  target: Target | null;
  selected: number[];
  counts: Counts;
  total: number;
  round: number;
  hintsSeen: boolean;
  feedback: 'none' | 'incorrect';
  wrongAttempts: number;
}
export const MILESTONE_SCORES = [5, 10] as const;

export function initialGame(settings: Settings = { types: [...REQUIRED_TYPES], inversions: false }, hintsSeen = false): Game {
  return { version: 2, settings, phase: 'setup', target: null, selected: [],
    counts: Object.fromEntries(CHORD_TYPES.map(type => [type, 0])) as Counts,
    total: 0, round: 0, hintsSeen, feedback: 'none', wrongAttempts: 0 };
}

export function sameNotes(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort((x, y) => x - y);
  return [...a].sort((x, y) => x - y).every((note, i) => note === sortedB[i]);
}

export function voicings(type: ChordType, inversions: boolean): Target[] {
  const intervals = CHORDS[type].intervals;
  const result: Target[] = [];
  for (let root = LOW_NOTE - 12; root <= HIGH_NOTE; root++) {
    for (let inversion = 0; inversion < (inversions ? intervals.length : 1); inversion++) {
      const notes = intervals.map((interval, i) => root + interval + (i < inversion ? 12 : 0)).sort((a, b) => a - b);
      if (notes[0] >= LOW_NOTE && notes.at(-1)! <= HIGH_NOTE) result.push({ type, root, inversion, notes });
    }
  }
  return result;
}

export function typeWeight(count: number): number { return 1 / (1 + count); }

export function generateTarget(settings: Settings, counts: Counts, previous: Target | null, random = Math.random): Target {
  const weights = settings.types.map(type => typeWeight(counts[type]));
  let cursor = random() * weights.reduce((a, b) => a + b, 0);
  let type = settings.types.at(-1)!;
  for (let i = 0; i < settings.types.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) { type = settings.types[i]; break; }
  }
  const candidates = voicings(type, settings.inversions).filter(candidate => !previous || !sameNotes(candidate.notes, previous.notes));
  // Choose pitch-class root, then inversion, then placement without favoring roots with more octave placements.
  const roots = [...new Set(candidates.map(candidate => candidate.root % 12))];
  const root = roots[Math.floor(random() * roots.length)];
  const byRoot = candidates.filter(candidate => candidate.root % 12 === root);
  const inversions = [...new Set(byRoot.map(candidate => candidate.inversion))];
  const inversion = inversions[Math.floor(random() * inversions.length)];
  const placements = byRoot.filter(candidate => candidate.inversion === inversion);
  return placements[Math.floor(random() * placements.length)];
}

export function isComplete(game: Pick<Game, 'total' | 'settings' | 'counts'>): boolean {
  return game.total >= 15 && game.settings.types.every(type => game.counts[type] >= 2);
}

export function startGame(game: Game, random = Math.random): Game {
  const fresh = initialGame(game.settings, true);
  return { ...fresh, phase: 'playing', round: 1, target: generateTarget(fresh.settings, fresh.counts, null, random) };
}

export function toggleNote(game: Game, note: number): Game {
  if (game.phase !== 'playing' || !Number.isInteger(note) || note < LOW_NOTE || note > HIGH_NOTE) return game;
  return { ...game, feedback: 'none', selected: game.selected.includes(note)
    ? game.selected.filter(item => item !== note) : [...game.selected, note].sort((a, b) => a - b) };
}

export function submitGuess(game: Game): Game {
  if (game.phase !== 'playing' || !game.target || !game.selected.length) return game;
  if (!sameNotes(game.selected, game.target.notes)) return { ...game, feedback: 'incorrect', wrongAttempts: game.wrongAttempts + 1 };
  const total = game.total + 1;
  const counts = { ...game.counts, [game.target.type]: game.counts[game.target.type] + 1 };
  return { ...game, total, selected: [], feedback: 'none',
    counts,
    phase: isComplete({ ...game, total, counts }) ? 'finale' : MILESTONE_SCORES.some(score => score === total) ? 'milestone' : 'success' };
}

export function nextRound(game: Game, random = Math.random): Game {
  if (!['playing', 'success', 'milestone', 'finale'].includes(game.phase)) return game;
  if (isComplete(game)) return { ...game, phase: 'complete', selected: [] };
  return { ...game, phase: 'playing', selected: [], feedback: 'none', wrongAttempts: 0, round: game.round + 1,
    target: generateTarget(game.settings, game.counts, game.target, random) };
}

const NOTE_NAMES = ['C', 'C sharp / D flat', 'D', 'D sharp / E flat', 'E', 'F', 'F sharp / G flat', 'G', 'G sharp / A flat', 'A', 'A sharp / B flat', 'B'];
export function noteLabel(note: number): string { return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`; }
