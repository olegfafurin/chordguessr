export type PlaybackKind = 'target' | 'guess' | 'sequence' | 'note';
const SAMPLES = [
  { midi: 48, file: 'C3' }, { midi: 51, file: 'Ds3' }, { midi: 54, file: 'Fs3' },
  { midi: 57, file: 'A3' }, { midi: 60, file: 'C4' }, { midi: 63, file: 'Ds4' },
  { midi: 66, file: 'Fs4' }, { midi: 69, file: 'A4' }, { midi: 72, file: 'C5' },
];

export class PianoAudio {
  private context: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private voices = new Set<AudioBufferSourceNode>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private disposed = false;
  onPlayback: (kind: PlaybackKind | null) => void = () => {};

  get ready(): boolean { return this.context?.state === 'running' && this.buffers.size === SAMPLES.length; }

  async prepare(): Promise<void> {
    if (this.disposed) return;
    if (!this.context) this.context = new AudioContext();
    // Resume immediately inside the user's gesture, before fetching or decoding.
    await this.context.resume();
    if (!this.loading) {
      const context = this.context;
      this.loading = Promise.all(SAMPLES.map(async ({ midi, file }) => {
        const response = await fetch(`/audio/${file}.mp3`);
        if (!response.ok) throw new Error('Piano sample unavailable');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(midi, buffer);
      })).then(() => {}).catch(error => { this.loading = null; throw error; });
    }
    await this.loading;
  }

  stop(): void {
    this.generation++;
    clearTimeout(this.timer);
    for (const voice of this.voices) { voice.stop(); voice.disconnect(); }
    this.voices.clear();
    this.onPlayback(null);
  }

  async play(notes: readonly number[], kind: PlaybackKind): Promise<void> {
    this.stop();
    if (!notes.length || this.disposed) return;
    const generation = this.generation;
    await this.prepare();
    if (this.disposed || generation !== this.generation || !this.context) return;
    const context = this.context;
    const now = context.currentTime + 0.02;
    const duration = kind === 'note' ? 0.7 : kind === 'sequence' ? 0.8 : 1.6;
    const ordered = [...notes].sort((a, b) => a - b);
    ordered.forEach((note, index) => {
      const sample = SAMPLES.reduce((best, item) => Math.abs(item.midi - note) < Math.abs(best.midi - note) ? item : best);
      const source = context.createBufferSource();
      source.buffer = this.buffers.get(sample.midi)!;
      source.playbackRate.value = 2 ** ((note - sample.midi) / 12);
      const gain = context.createGain();
      const start = now + (kind === 'sequence' ? index * 0.5 : 0);
      const level = kind === 'note' || kind === 'sequence' ? 0.8 : 0.8 / Math.sqrt(notes.length);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.006);
      gain.gain.setValueAtTime(level, start + duration - 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
      this.voices.add(source);
      source.start(start);
      source.stop(start + duration + 0.02);
    });
    this.onPlayback(kind);
    const total = duration + (kind === 'sequence' ? (notes.length - 1) * 0.5 : 0) + 0.05;
    this.timer = setTimeout(() => { if (generation === this.generation) this.onPlayback(null); }, total * 1000);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    void this.context?.close();
  }
}
