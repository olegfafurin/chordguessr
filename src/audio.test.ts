import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PianoAudio } from './audio';
import type { Instrument } from './instrument';

interface Voice {
  buffer: { url: string } | null;
  playbackRate: { value: number };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}
let voices: Voice[];
let events: string[];
let contexts: FakeContext[];
let piano: PianoAudio;
const sampleResponse = (url: string, ok = true) => ({ ok, arrayBuffer: async () => new TextEncoder().encode(url).buffer });

class FakeContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() { contexts.push(this); }
  resume = vi.fn(async () => { events.push('resume'); });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => ({ url: new TextDecoder().decode(data) }));
  createBufferSource() {
    const voice: Voice = { buffer: null, playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null };
    voices.push(voice);
    return voice;
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  voices = []; events = []; contexts = [];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { events.push(url); return sampleResponse(url); }));
  piano = new PianoAudio();
});
afterEach(() => { piano.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('instrument playback', () => {
  it.each(['flute', 'guitar', 'voice'] as Instrument[])('uses %s for targets and sequences while keys and guesses stay piano', async instrument => {
    piano.setTargetInstrument(instrument);
    await piano.play([52, 48], 'target');
    expect(voices.map(voice => voice.buffer!.url)).toEqual([`/audio/${instrument}/C3.mp3`, `/audio/${instrument}/Eb3.mp3`]);
    expect(voices[1].playbackRate.value).toBeCloseTo(2 ** (1 / 12));
    expect(voices[0].start).toHaveBeenCalledWith(.02);
    expect(voices[1].start).toHaveBeenCalledWith(.02);
    await piano.play([48, 52], 'sequence');
    expect(voices[2].buffer!.url).toBe(`/audio/${instrument}/C3.mp3`);
    expect(voices[3].start).toHaveBeenCalledWith(.52);
    await piano.play([48, 52], 'guess');
    expect(voices.slice(4, 6).map(voice => voice.buffer!.url)).toEqual(['/audio/C3.mp3', '/audio/Ds3.mp3']);
    await piano.play([48], 'note');
    expect(voices[6].buffer!.url).toBe('/audio/C3.mp3');
    expect(contexts).toHaveLength(1);
    expect(events[0]).toBe('resume');
  });
  it('loads banks once, shares concurrent preparation and stays lazy', async () => {
    expect(contexts).toHaveLength(0);
    await Promise.all([piano.prepare('flute'), piano.prepare('flute')]);
    expect(fetch).toHaveBeenCalledTimes(18);
    await piano.prepare('flute');
    await piano.play([48], 'note');
    expect(fetch).toHaveBeenCalledTimes(18);
    expect(events.every(event => event === 'resume' || event.startsWith('/audio/'))).toBe(true);
    piano.setTargetInstrument('flute');
    expect(piano.ready).toBe(true);
  });
  it.each(['stop', 'switch', 'dispose'])('cancels pending sample playback on %s', async action => {
    await piano.prepare();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.startsWith('/audio/flute/')) await gate; return sampleResponse(url); }));
    piano.setTargetInstrument('flute');
    const pending = piano.play([48], 'target');
    await Promise.resolve();
    expect(fetch).toHaveBeenCalled();
    if (action === 'switch') piano.setTargetInstrument('guitar');
    else if (action === 'dispose') piano.dispose();
    else piano.stop();
    release();
    await pending;
    expect(voices).toHaveLength(0);
  });
  it('recovers from a failed instrument load without losing piano playback', async () => {
    let failed = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/audio/flute/C3.mp3' && !failed) { failed = true; return sampleResponse(url, false); }
      return sampleResponse(url);
    }));
    await expect(piano.prepare('flute')).rejects.toThrow('Instrument sample unavailable');
    await piano.play([48], 'note');
    expect(voices[0].buffer!.url).toBe('/audio/C3.mp3');
    await piano.prepare('flute');
    piano.setTargetInstrument('flute');
    await piano.play([48], 'target');
    expect(voices[1].buffer!.url).toBe('/audio/flute/C3.mp3');
  });
  it('uses a single sample voice for unisons and cancels playback callbacks', async () => {
    const playback = vi.fn();
    piano.onPlayback = playback;
    piano.setTargetInstrument('voice');
    await piano.play([48], 'target');
    expect(voices).toHaveLength(1);
    expect(playback).toHaveBeenLastCalledWith('target');
    piano.stop();
    expect(voices[0].stop).toHaveBeenCalled();
    vi.runAllTimers();
    expect(playback).toHaveBeenLastCalledWith(null);
  });
});
