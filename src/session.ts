import { ALL_TYPES, CHORD_TYPES, INTERVAL_TYPES, REQUIRED_INTERVALS, REQUIRED_TYPES, LOW_NOTE, HIGH_NOTE, MILESTONE_SCORES, initialGame, isComplete, sameNotes, voicings, type GuessType, type Game, type Settings } from './game';

export const SESSION_KEY = 'chordguessr.session.v3';
const LEGACY_SESSION_KEY = 'chordguessr.session.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isNotes = (value: unknown): value is number[] => Array.isArray(value) && value.every(note => Number.isInteger(note) && note >= LOW_NOTE && note <= HIGH_NOTE) && new Set(value).size === value.length;

export function validSettings(value: unknown): value is Settings {
  if (!isRecord(value) || typeof value.inversions !== 'boolean' || !Array.isArray(value.types)) return false;
  const types = value.types;
  if (value.mode !== undefined && !['chords', 'intervals'].includes(value.mode as string)) return false;
  const interval = value.mode === 'intervals';
  if (interval ? !['easy', 'regular'].includes(value.difficulty as string) || value.inversions : value.difficulty !== undefined) return false;
  const allowed = interval ? INTERVAL_TYPES : CHORD_TYPES;
  const required = interval ? REQUIRED_INTERVALS : REQUIRED_TYPES;
  return types.every(type => (allowed as readonly unknown[]).includes(type)) && required.every(type => types.includes(type)) && new Set(types).size === types.length;
}

export function parseSession(raw: string | null): Game | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!isRecord(value) || ![1, 2, 3].includes(value.version as number) || !validSettings(value.settings) || !isRecord(value.counts)) return null;
    const legacy = value.version === 1;
    if (value.version !== 3) {
      if (value.settings.mode === 'intervals') return null;
      value.counts = { ...Object.fromEntries(INTERVAL_TYPES.map(type => [type, 0])), ...value.counts };
    }
    if (legacy) value.wrongAttempts = value.feedback === 'incorrect' ? 1 : 0;
    if (!['setup', 'playing', 'success', 'milestone', 'finale', 'complete'].includes(value.phase as string) || !isNotes(value.selected)) return null;
    if (!isCount(value.total) || !isCount(value.round) || typeof value.hintsSeen !== 'boolean' || !['none', 'incorrect'].includes(value.feedback as string)) return null;
    if (!isCount(value.wrongAttempts) || (value.feedback === 'incorrect' && value.wrongAttempts === 0)) return null;
    const counts = value.counts as Record<string, unknown>;
    if (!ALL_TYPES.every(type => isCount(counts[type]) && ((value.settings as Settings).types.includes(type) || counts[type] === 0))) return null;
    if (ALL_TYPES.reduce((sum, type) => sum + (counts[type] as number), 0) !== value.total) return null;
    if (value.settings.mode === 'intervals' && value.settings.difficulty === 'easy' && value.selected.length) return null;
    if (value.phase === 'setup') {
      if (value.target !== null || value.total !== 0 || value.round !== 0 || value.selected.length || value.wrongAttempts !== 0) return null;
    } else {
      const target = value.target;
      if (!isRecord(target) || !value.settings.types.includes(target.type as GuessType) || !isNotes(target.notes) || value.round < 1) return null;
      if (!voicings(target.type as GuessType, value.settings.inversions).some(candidate => candidate.root === target.root && candidate.inversion === target.inversion && sameNotes(candidate.notes, target.notes as number[]))) return null;
      const awarded = ['success', 'milestone', 'finale', 'complete'].includes(value.phase as string);
      if (awarded && (value.selected.length || value.total < 1 || !(counts[target.type as string] as number))) return null;
      if (value.total > value.round || (value.phase === 'playing' && value.total >= value.round)) return null;
      const finished = isComplete(value as unknown as Game);
      if (legacy && value.phase === 'milestone' && value.total === 15) value.phase = finished ? 'finale' : 'success';
      if (legacy && value.phase === 'success' && finished) value.phase = 'finale';
      if (value.phase === 'milestone' && !MILESTONE_SCORES.some(score => score === value.total)) return null;
      if (value.phase === 'success' && (MILESTONE_SCORES.some(score => score === value.total) || finished)) return null;
      if (['finale', 'complete'].includes(value.phase as string) && !finished) return null;
      if (value.phase === 'playing' && finished) return null;
    }
    return { ...value, version: 3 } as unknown as Game;
  } catch { return null; }
}

export function loadSession(storage?: StorageLike): Game {
  try {
    const source = storage ?? window.sessionStorage;
    return parseSession(source.getItem(SESSION_KEY) ?? source.getItem('chordguessr.session.v2') ?? source.getItem(LEGACY_SESSION_KEY)) ?? initialGame();
  }
  catch { return initialGame(); }
}

export function saveSession(game: Game, storage?: StorageLike): boolean {
  try { (storage ?? window.sessionStorage).setItem(SESSION_KEY, JSON.stringify(game)); return true; }
  catch { return false; }
}
