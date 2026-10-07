export const INSTRUMENTS = {
  piano: { label: 'Piano' },
  flute: { label: 'Flute' },
  guitar: { label: 'Guitar' },
  voice: { label: 'Voice' },
} as const;
export type Instrument = keyof typeof INSTRUMENTS;
export const INSTRUMENT_TYPES = Object.keys(INSTRUMENTS) as Instrument[];
export const INSTRUMENT_KEY = 'chordguessr.instrument.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadInstrument(storage?: StorageLike): Instrument {
  try {
    const saved = (storage ?? sessionStorage).getItem(INSTRUMENT_KEY);
    return saved && Object.hasOwn(INSTRUMENTS, saved) ? saved as Instrument : 'piano';
  } catch { return 'piano'; }
}
export function saveInstrument(instrument: Instrument, storage?: StorageLike): void {
  try { (storage ?? sessionStorage).setItem(INSTRUMENT_KEY, instrument); }
  catch { /* Instrument selection still works without storage. */ }
}
