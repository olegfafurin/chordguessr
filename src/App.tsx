import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleHelp, Headphones, Leaf, ListMusic, LoaderCircle, Play, Plus, RotateCcw, SkipForward, Sparkles, Trophy, Volume2, X } from 'lucide-react';
import { CHORDS, CHORD_TYPES, REQUIRED_TYPES, initialGame, isComplete, nextRound, startGame, submitGuess, toggleNote, type ChordType, type Game } from './game';
import { loadSession, saveSession } from './session';
import { PianoAudio, type PlaybackKind } from './audio';
import { Confetti, IconButton, Keyboard, Modal, Wave } from './components';
import { milestones } from './milestones';

const helpItems = [
  { icon: Volume2, title: 'Listen again', text: 'Replay the chord you’re trying to find.' },
  { icon: Play, title: 'Hear your guess', text: 'Play the keys you have selected.' },
  { icon: Check, title: 'Check your chord', text: 'Play and submit your guess. Every note and octave must match.' },
  { icon: ListMusic, title: 'One note at a time', text: 'Hear the target from its lowest note to its highest.' },
  { icon: SkipForward, title: 'A fresh chord', text: 'Skip this round. There’s no penalty.' },
];

export default function App() {
  const [game, setGame] = useState<Game>(loadSession);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [helpOpen, setHelpOpen] = useState(!game.hintsSeen);
  const [restartOpen, setRestartOpen] = useState(false);
  const [playing, setPlaying] = useState<PlaybackKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const audio = useRef<PianoAudio | null>(null);
  const actionPending = useRef(false);

  useEffect(() => {
    const piano = new PianoAudio();
    piano.onPlayback = setPlaying;
    audio.current = piano;
    const onVisibility = () => { if (document.hidden) piano.stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); piano.onPlayback = () => {}; piano.dispose(); };
  }, []);

  useEffect(() => { setStorageUnavailable(!saveSession(game)); }, [game]);

  const play = useCallback(async (notes: readonly number[], kind: PlaybackKind) => {
    setAudioError('');
    try { await audio.current?.play(notes, kind); }
    catch { setAudioError('The piano couldn’t load. Check your connection and tap a play control to try again.'); }
  }, []);

  useEffect(() => {
    if (game.phase === 'playing' && audio.current?.ready && !document.hidden) void play(game.target!.notes, 'target');
    // Only a new round or returning from a milestone should autoplay, never key selection or a wrong answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.round, play]);

  useEffect(() => {
    if (game.phase !== 'success') return;
    const timer = setTimeout(() => setGame(current => nextRound(current)), 1900);
    return () => clearTimeout(timer);
  }, [game.phase, game.total]);

  async function begin() {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setAudioError('');
    try {
      await audio.current!.prepare();
      setGame(current => startGame(current));
    } catch { setAudioError('The piano couldn’t load. Check your connection and try starting again.'); }
    finally { actionPending.current = false; setBusy(false); }
  }

  function selectNote(note: number) {
    const current = gameRef.current;
    if (current.phase !== 'playing' || busy) return;
    if (!current.selected.includes(note)) void play([note], 'note');
    setGame(state => toggleNote(state, note));
  }

  async function submit() {
    if (actionPending.current || gameRef.current.phase !== 'playing' || !gameRef.current.selected.length) return;
    actionPending.current = true;
    setBusy(true);
    setAudioError('');
    try {
      await audio.current!.prepare();
      const current = gameRef.current;
      if (current.phase !== 'playing') return;
      void play(current.selected, 'guess');
      setGame(state => submitGuess(state));
    } catch { setAudioError('The piano couldn’t load. Your guess is saved. Tap submit to try again.'); }
    finally { actionPending.current = false; setBusy(false); }
  }

  async function advance() {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setAudioError('');
    audio.current?.stop();
    try {
      // Continue and Skip are also audio-unlocking gestures after a restored session.
      if (!isComplete(gameRef.current)) await audio.current!.prepare();
      setGame(current => nextRound(current));
    } catch { setAudioError('The piano couldn’t load. Check your connection and try again.'); }
    finally { actionPending.current = false; setBusy(false); }
  }
  function closeHelp() { setHelpOpen(false); setGame(current => ({ ...current, hintsSeen: true })); }
  function restart() {
    audio.current?.stop();
    setRestartOpen(false);
    setAudioError('');
    setGame(current => initialGame(current.settings, current.hintsSeen));
  }
  function toggleType(type: ChordType) {
    if (REQUIRED_TYPES.includes(type)) return;
    setGame(current => ({ ...current, settings: { ...current.settings, types: CHORD_TYPES.filter(candidate => candidate === type ? !current.settings.types.includes(type) : current.settings.types.includes(candidate)) } }));
  }

  const setup = game.phase === 'setup';
  const complete = game.phase === 'complete';
  const success = game.phase === 'success' || game.phase === 'milestone';
  const locked = game.phase !== 'playing' || busy;
  const milestone = game.phase === 'milestone' ? milestones[game.total] : null;
  const mastered = game.settings.types.filter(type => game.counts[type] >= 2).length;

  return <div className="app-shell">
    <header className="header">
      <a className="wordmark" href="/" aria-label="Chordguessr home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>chordguessr<span className="brand-period">.</span></a>
      <div className="header-actions">
        {!setup && <IconButton label="Start a new game" icon={RotateCcw} disabled={busy} onClick={() => { audio.current?.stop(); setRestartOpen(true); }} className="quiet" />}
        <IconButton label="How to play" icon={CircleHelp} onClick={() => setHelpOpen(true)} className="quiet" />
      </div>
    </header>

    <main>
      {setup ? <section className="setup" aria-labelledby="setup-title">
        <div className="eyebrow"><span /> A LITTLE DAILY EAR TRAINING</div>
        <h1 id="setup-title">Find your <em>harmony.</em></h1>
        <p className="intro">Listen closely. Find the notes. <span>Let your ears lead the way.</span></p>
        <div className="settings-panel">
          <div className="section-heading"><h2>Your chord palette</h2><span>Make it your own</span></div>
          <div className="chord-options">
            {CHORD_TYPES.map(type => <label key={type} className={`chord-option ${game.settings.types.includes(type) ? 'chosen' : ''} ${REQUIRED_TYPES.includes(type) ? 'required' : ''}`}>
              <input type="checkbox" checked={game.settings.types.includes(type)} disabled={REQUIRED_TYPES.includes(type) || busy} onChange={() => toggleType(type)} />
              <span className="chord-symbol">{CHORDS[type].symbol}</span>
              <span className="chord-label">{CHORDS[type].label}{REQUIRED_TYPES.includes(type) && <small>Always included</small>}</span>
              {game.settings.types.includes(type) ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            </label>)}
          </div>
          <label className="inversions-option">
            <span><strong>A different perspective</strong><small>Include inversions for an extra challenge</small></span>
            <input type="checkbox" aria-label="Include inversions" checked={game.settings.inversions} disabled={busy} onChange={event => setGame(current => ({ ...current, settings: { ...current.settings, inversions: event.target.checked } }))} />
          </label>
          <div className="start-row"><div><strong>Ready when you are.</strong><span>15 correct chords · each type at least twice</span></div>
            <IconButton label={busy ? 'Loading piano' : 'Start game'} icon={busy ? LoaderCircle : ArrowRight} className={`primary ${busy ? 'loading' : ''}`} onClick={() => void begin()} disabled={busy} />
          </div>
        </div>
        <p className="headphone-note"><Headphones size={15} aria-hidden="true" /> A quiet moment and headphones go a long way.</p>
      </section> : <>
        <section className="game-top" aria-label="Game progress and controls">
          <div className="progress-heading"><span className="eyebrow">{complete ? 'SESSION COMPLETE' : 'LISTEN. EXPLORE. DISCOVER.'}</span><span className="score"><strong>{game.total}</strong><span> / 15 <span className="score-word">found</span></span></span></div>
          <div className="progress-track" role="progressbar" aria-label="Correct chords toward 15" aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.min(game.total, 15)}><span style={{ width: `${Math.min(game.total / 15, 1) * 100}%` }} /></div>
          <div className={`listening-space ${success ? 'celebrating' : ''}`}>
            <Wave active={playing !== null && playing !== 'note'} />
            {success && <Confetti />}
            <div className="listening-content">
              <span className="round-label">{complete ? 'BEAUTIFULLY PLAYED' : `ROUND ${String(game.round).padStart(2, '0')}`}</span>
              <h1>{complete ? <>A little more <em>musical.</em></> : success ? <>That’s <em>the one.</em></> : <>What do you <em>hear?</em></>}</h1>
              <p aria-live="polite" className={game.feedback === 'incorrect' ? 'incorrect' : ''}>
                {complete ? 'Every chord family explored. Every little win earned.' : success ? 'Beautifully found. Trust those ears.' : game.feedback === 'incorrect' ? 'Not quite yet. Listen again — you’ve got this.' : playing === 'sequence' ? 'One note at a time. Follow the melody.' : playing === 'target' ? 'Let the notes settle in.' : playing === 'guess' ? 'Here’s the harmony you found.' : 'A few notes. One little discovery.'}
              </p>
              <IconButton label={complete ? 'Start another game' : 'Replay current chord'} icon={complete ? RotateCcw : success ? Check : Volume2}
                className={`listen-button ${success ? 'success-button' : ''}`} disabled={busy || success}
                onClick={() => complete ? restart() : void play(game.target!.notes, 'target')} active={playing === 'target'} />
              <span className="listen-caption">{complete ? 'Another little adventure?' : success ? 'Nicely done' : 'Tap to listen'}</span>
            </div>
          </div>
          {!complete && <div className="controls" role="group" aria-label="Chord controls">
            <IconButton label="Play current guess" icon={Play} disabled={locked || !game.selected.length} onClick={() => void play(game.selected, 'guess')} active={playing === 'guess'} />
            <IconButton label="Play chord note by note" icon={ListMusic} disabled={locked} onClick={() => void play(game.target!.notes, 'sequence')} active={playing === 'sequence'} />
            <span className="control-divider" />
            <IconButton label="Skip current round" icon={SkipForward} disabled={locked} onClick={() => void advance()} />
            <IconButton label="Submit current guess" icon={busy ? LoaderCircle : Check} className={`primary submit-button ${busy ? 'loading' : ''}`} disabled={locked || !game.selected.length} onClick={() => void submit()} />
          </div>}
        </section>

        <section className="keyboard-section" aria-label="Choose your notes">
          <div className="keyboard-heading"><span>{complete ? 'A practice worth celebrating' : 'YOUR LITTLE PIANO'}</span><span aria-live="polite">{complete ? `${game.total} chords found` : `${game.selected.length} ${game.selected.length === 1 ? 'note' : 'notes'} selected`}</span></div>
          <Keyboard selected={game.selected} disabled={locked} onToggle={selectNote} />
          <p className="keyboard-hint">{complete ? 'Come back whenever you feel like listening.' : 'Tap a key to keep it. Tap again to let it go.'}</p>
        </section>

        <section className="type-progress" aria-label="Chord type progress">
          <div className="section-heading"><h2>Your growing repertoire</h2><span>{mastered} / {game.settings.types.length} explored twice</span></div>
          <div className="type-chips">{game.settings.types.map(type => <span key={type} className={`type-chip ${game.counts[type] >= 2 ? 'mastered' : ''}`} title={`${CHORDS[type].label}: ${game.counts[type]} correct`}>
            {CHORDS[type].label}<span className="count-dots" aria-hidden="true"><i className={game.counts[type] >= 1 ? 'filled' : ''} /><i className={game.counts[type] >= 2 ? 'filled' : ''} /></span><span className="sr-only">{game.counts[type]} correct</span>
          </span>)}</div>
          {game.total >= 15 && !complete && !isComplete(game) && <p className="extra-practice">Fifteen found! Keep going until every chord family has two little wins.</p>}
        </section>
      </>}
      {audioError && <p role="alert" className="error-message">{audioError}</p>}
      {storageUnavailable && <p role="status" className="storage-message">Your browser can’t save this session. You can keep playing, but refreshing will start over.</p>}
    </main>

    <footer><span><Leaf size={13} aria-hidden="true" /> A little practice. A better ear.</span><span>Made for the joy of listening.</span></footer>

    {helpOpen && <Modal title="A little guide to listening." onClose={closeHelp} className="help-modal">
      <p className="modal-intro">Hear a chord, then find its exact notes on the piano. Tap keys to select or release them.</p>
      <div className="help-items">{helpItems.map(({ icon: Icon, title, text }) => <div key={title}><span className="help-icon"><Icon size={21} aria-hidden="true" /></span><div><strong>{title}</strong><p>{text}</p></div></div>)}</div>
      <p className="help-goal"><Sparkles size={18} aria-hidden="true" /> Find at least 15 chords and each enabled type twice. Take your time — there’s no clock.</p>
      <div className="modal-action"><span>Let’s make a little music</span><IconButton label="Got it" icon={ArrowRight} className="primary" onClick={closeHelp} /></div>
      <p className="audio-credit">Piano: Alexander Holm’s <a href="/audio/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Salamander Grand Piano</a> · CC BY 3.0</p>
    </Modal>}

    {restartOpen && <Modal title="A fresh beginning?" onClose={() => setRestartOpen(false)}>
      <p className="modal-intro">This session’s progress will be cleared. You can choose a new chord palette before starting again.</p>
      <div className="restart-actions"><div><IconButton label="Keep playing" icon={X} onClick={() => setRestartOpen(false)} /><span>Keep playing</span></div><div><IconButton label="Confirm new game" icon={RotateCcw} className="primary" onClick={restart} /><span>Start fresh</span></div></div>
    </Modal>}

    {milestone && <Modal title={milestone.title} className="milestone-modal">
      <div className="milestone-art"><img src={milestone.image} alt={milestone.alt} /><Confetti /></div>
      <span className="eyebrow">{game.total} CHORDS FOUND</span>
      <p className="modal-intro">{milestone.message}</p>
      {game.total === 15 && !isComplete(game) && <p className="milestone-note">A few chord families still need their second win. Your adventure continues.</p>}
      {audioError && <p role="alert" className="error-message">{audioError}</p>}
      <div className="modal-action"><span>{isComplete(game) ? 'Celebrate your session' : 'Follow the next note'}</span><IconButton label="Continue" icon={busy ? LoaderCircle : isComplete(game) ? Trophy : ArrowRight} className={`primary ${busy ? 'loading' : ''}`} disabled={busy} onClick={() => void advance()} /></div>
    </Modal>}
  </div>;
}
