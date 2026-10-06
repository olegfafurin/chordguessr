import { CHORD_TYPES, REQUIRED_TYPES, LOW_NOTE, HIGH_NOTE, MILESTONE_SCORES, initialGame, isComplete, sameNotes, voicings, type ChordType, type Game, type Settings } from './game';

export const SESSION_KEY = 'chordguessr.session.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isNotes = (value: unknown): value is number[] => Array.isArray(value) && value.every(note => Number.isInteger(note) && note >= LOW_NOTE && note <= HIGH_NOTE) && new Set(value).size === value.length;

export function validSettings(value: unknown): value is Settings {
  if (!isRecord(value) || typeof value.inversions !== 'boolean' || !Array.isArray(value.types)) return false;
  const types = value.types;
  return types.every(type => CHORD_TYPES.includes(type)) && REQUIRED_TYPES.every(type => types.includes(type)) && new Set(types).size === types.length;
}

export function parseSession(raw: string | null): Game | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!isRecord(value) || value.version !== 1 || !validSettings(value.settings) || !isRecord(value.counts)) return null;
    if (!['setup', 'playing', 'success', 'milestone', 'complete'].includes(value.phase as string) || !isNotes(value.selected)) return null;
    if (!isCount(value.total) || !isCount(value.round) || typeof value.hintsSeen !== 'boolean' || !['none', 'incorrect'].includes(value.feedback as string)) return null;
    const counts = value.counts;
    if (!CHORD_TYPES.every(type => isCount(counts[type]) && ((value.settings as Settings).types.includes(type) || counts[type] === 0))) return null;
    if (CHORD_TYPES.reduce((sum, type) => sum + (counts[type] as number), 0) !== value.total) return null;
    if (value.phase === 'setup') {
      if (value.target !== null || value.total !== 0 || value.round !== 0 || value.selected.length) return null;
    } else {
      const target = value.target;
      if (!isRecord(target) || !value.settings.types.includes(target.type as ChordType) || !isNotes(target.notes) || value.round < 1) return null;
      if (!voicings(target.type as ChordType, value.settings.inversions).some(candidate => candidate.root === target.root && candidate.inversion === target.inversion && sameNotes(candidate.notes, target.notes as number[]))) return null;
      const awarded = ['success', 'milestone', 'complete'].includes(value.phase as string);
      if (awarded && (value.selected.length || value.total < 1 || !(counts[target.type as string] as number))) return null;
      if (value.total > value.round || (value.phase === 'playing' && value.total >= value.round)) return null;
      if (value.phase === 'milestone' && !MILESTONE_SCORES.some(score => score === value.total)) return null;
      if (value.phase === 'success' && MILESTONE_SCORES.some(score => score === value.total)) return null;
      if (value.phase === 'complete' && !isComplete(value as unknown as Game)) return null;
      if (value.phase === 'playing' && isComplete(value as unknown as Game)) return null;
    }
    return value as unknown as Game;
  } catch { return null; }
}

export function loadSession(storage?: StorageLike): Game {
  try { return parseSession((storage ?? window.sessionStorage).getItem(SESSION_KEY)) ?? initialGame(); }
  catch { return initialGame(); }
}

export function saveSession(game: Game, storage?: StorageLike): boolean {
  try { (storage ?? window.sessionStorage).setItem(SESSION_KEY, JSON.stringify(game)); return true; }
  catch { return false; }
}
