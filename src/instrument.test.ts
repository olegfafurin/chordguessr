import { describe, expect, it } from 'vitest';
import { INSTRUMENT_KEY, loadInstrument, saveInstrument } from './instrument';

describe('instrument preferences', () => {
  it.each([null, '', 'unknown', 'toString', '__proto__', 'Piano'])('defaults safely to piano for %s', saved => {
    expect(loadInstrument({ getItem: () => saved, setItem: () => {} })).toBe('piano');
  });
  it('stores the instrument separately and restores the selection', () => {
    let saved: string | null = null;
    const storage = { getItem: () => saved, setItem: (key: string, value: string) => { expect(key).toBe(INSTRUMENT_KEY); saved = value; } };
    saveInstrument('guitar', storage);
    expect(loadInstrument(storage)).toBe('guitar');
  });
  it('keeps defaults and allows changes when storage is unavailable', () => {
    const storage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
    expect(loadInstrument(storage)).toBe('piano');
    expect(() => saveInstrument('voice', storage)).not.toThrow();
  });
});
