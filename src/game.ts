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
export const INTERVALS = {
  unison: { label: 'Unison', symbol: 'P1', semitones: 0, group: 'Unison' },
  minor2: { label: 'Minor 2nd', symbol: 'm2', semitones: 1, group: '2nd' },
  major2: { label: 'Major 2nd', symbol: 'M2', semitones: 2, group: '2nd' },
  minor3: { label: 'Minor 3rd', symbol: 'm3', semitones: 3, group: '3rd' },
  major3: { label: 'Major 3rd', symbol: 'M3', semitones: 4, group: '3rd' },
  perfect4: { label: 'Perfect 4th', symbol: 'P4', semitones: 5, group: '4th' },
  tritone: { label: 'Tritone', symbol: 'TT', semitones: 6, group: 'Tritone' },
  perfect5: { label: 'Perfect 5th', symbol: 'P5', semitones: 7, group: '5th' },
  minor6: { label: 'Minor 6th', symbol: 'm6', semitones: 8, group: '6th' },
  major6: { label: 'Major 6th', symbol: 'M6', semitones: 9, group: '6th' },
  minor7Interval: { label: 'Minor 7th', symbol: 'm7', semitones: 10, group: '7th' },
  major7Interval: { label: 'Major 7th', symbol: 'M7', semitones: 11, group: '7th' },
  octave: { label: 'Octave', symbol: 'P8', semitones: 12, group: 'Octave' },
} as const;
export type IntervalType = keyof typeof INTERVALS;
export const INTERVAL_TYPES = Object.keys(INTERVALS) as IntervalType[];
export const DEFAULT_INTERVAL_TYPES = INTERVAL_TYPES.filter(type => !['unison', 'tritone', 'minor7Interval', 'major7Interval'].includes(type));
export const INTERVAL_GROUPS = [...new Set(INTERVAL_TYPES.map(type => INTERVALS[type].group))];
export const DEFINITIONS = { ...CHORDS, ...INTERVALS };
export type ChordType = keyof typeof CHORDS;
export const CHORD_TYPES = Object.keys(CHORDS) as ChordType[];
export const REQUIRED_TYPES: ChordType[] = ['major', 'minor'];
export type GuessType = ChordType | IntervalType;
export const ALL_TYPES: GuessType[] = [...CHORD_TYPES, ...INTERVAL_TYPES];
export type Counts = Record<GuessType, number>;
export interface Settings { mode?: 'chords' | 'intervals'; difficulty?: 'easy' | 'regular'; types: GuessType[]; inversions: boolean }
export const DEFAULT_CHORD_SETTINGS: Settings = { types: [...REQUIRED_TYPES], inversions: false };
export const DEFAULT_INTERVAL_SETTINGS: Settings = { mode: 'intervals', difficulty: 'easy', types: [...DEFAULT_INTERVAL_TYPES], inversions: false };
export interface Target { type: GuessType; notes: number[]; root: number; inversion: number }
export type Phase = 'setup' | 'playing' | 'success' | 'milestone' | 'finale' | 'complete';
export interface Game {
  version: 4;
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
  endless: boolean;
}
export const MILESTONE_SCORES = [5, 10] as const;

export function canStartGame(settings: Settings): boolean {
  return settings.mode === 'intervals'
    ? new Set(settings.types).size >= (settings.difficulty === 'easy' ? 2 : 1)
    : REQUIRED_TYPES.every(type => settings.types.includes(type));
}

export function initialGame(settings: Settings = DEFAULT_INTERVAL_SETTINGS, hintsSeen = false): Game {
  return { version: 4, settings, phase: 'setup', target: null, selected: [],
    counts: Object.fromEntries(ALL_TYPES.map(type => [type, 0])) as Counts,
    total: 0, round: 0, hintsSeen, feedback: 'none', wrongAttempts: 0, endless: false };
}

export function sameNotes(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort((x, y) => x - y);
  return [...a].sort((x, y) => x - y).every((note, i) => note === sortedB[i]);
}

export function voicings(type: GuessType, inversions: boolean): Target[] {
  if (type in INTERVALS) {
    const distance = INTERVALS[type as IntervalType].semitones;
    return Array.from({ length: HIGH_NOTE - LOW_NOTE - distance + 1 }, (_, i) => {
      const root = LOW_NOTE + i;
      return { type, root, inversion: 0, notes: distance === 0 ? [root] : [root, root + distance] };
    });
  }
  const intervals = CHORDS[type as ChordType].intervals;
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
  return (game.settings.mode === 'intervals' || game.total >= 15) && game.settings.types.every(type => game.counts[type] >= 2);
}

export function startGame(game: Game, random = Math.random): Game {
  if (!canStartGame(game.settings)) return game;
  const fresh = initialGame(game.settings, true);
  return { ...fresh, phase: 'playing', round: 1, target: generateTarget(fresh.settings, fresh.counts, null, random) };
}

export function toggleNote(game: Game, note: number): Game {
  if ((game.settings.mode === 'intervals' && game.settings.difficulty === 'easy') || game.phase !== 'playing' || !Number.isInteger(note) || note < LOW_NOTE || note > HIGH_NOTE) return game;
  return { ...game, feedback: 'none', selected: game.selected.includes(note)
    ? game.selected.filter(item => item !== note) : [...game.selected, note].sort((a, b) => a - b) };
}

export function submitGuess(game: Game, interval?: IntervalType): Game {
  const easy = game.settings.mode === 'intervals' && game.settings.difficulty === 'easy';
  if (easy && (!interval || !game.settings.types.includes(interval))) return game;
  if (game.phase !== 'playing' || !game.target || (!easy && !game.selected.length)) return game;
  if (easy ? interval !== game.target.type : !sameNotes(game.selected, game.target.notes)) return { ...game, feedback: 'incorrect', wrongAttempts: game.wrongAttempts + 1 };
  const total = game.total + 1;
  const counts = { ...game.counts, [game.target.type]: game.counts[game.target.type] + 1 };
  return { ...game, total, selected: [], feedback: 'none',
    counts,
    phase: game.endless ? 'success' : isComplete({ ...game, total, counts }) ? 'finale' : MILESTONE_SCORES.some(score => score === total) ? 'milestone' : 'success' };
}

export function nextRound(game: Game, random = Math.random): Game {
  if (!['playing', 'success', 'milestone', 'finale'].includes(game.phase)) return game;
  if (!game.endless && isComplete(game)) return { ...game, phase: 'complete', selected: [] };
  return { ...game, phase: 'playing', selected: [], feedback: 'none', wrongAttempts: 0, round: game.round + 1,
    target: generateTarget(game.settings, game.counts, game.target, random) };
}

export function continuePlaying(game: Game, random = Math.random): Game {
  if (game.phase !== 'finale' || !isComplete(game)) return game;
  return nextRound({ ...game, endless: true }, random);
}

const NOTE_NAMES = ['C', 'C sharp / D flat', 'D', 'D sharp / E flat', 'E', 'F', 'F sharp / G flat', 'G', 'G sharp / A flat', 'A', 'A sharp / B flat', 'B'];
export function noteLabel(note: number): string { return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`; }
