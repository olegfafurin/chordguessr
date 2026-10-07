import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, CircleHelp, Headphones, Leaf, ListMusic, LoaderCircle, Play, Plus, RotateCcw, SkipForward, Sparkles, Trophy, Volume2, X } from 'lucide-react';
import { CHORDS, CHORD_TYPES, REQUIRED_TYPES, INTERVALS, INTERVAL_TYPES, INTERVAL_GROUPS, REQUIRED_INTERVALS, DEFAULT_CHORD_SETTINGS, DEFAULT_INTERVAL_SETTINGS, initialGame, isComplete, nextRound, startGame, submitGuess, toggleNote, type GuessType, type IntervalType, type Game } from './game';
import { loadSession, saveSession } from './session';
import { PianoAudio, type PlaybackKind } from './audio';
import { Confetti, IconButton, InstrumentIcon, Keyboard, Modal, Wave } from './components';
import { completionCelebration, milestones } from './milestones';
import { labels, loadLanguage, saveLanguage, translate, type MessageKey } from './i18n';
import { INSTRUMENTS, INSTRUMENT_TYPES, loadInstrument, saveInstrument, type Instrument } from './instrument';
import { ACCENTS, applyTheme, loadTheme, saveTheme, type Accent } from './theme';

const helpItems = [
  { icon: Volume2, title: 'Listen again', text: 'Replay the notes you’re trying to identify.' },
  { icon: Play, title: 'Hear your guess', text: 'Play the keys you have selected.' },
  { icon: Check, title: 'Check your notes', text: 'Play and submit your guess. Every note and octave must match.' },
  { icon: ListMusic, title: 'One note at a time', text: 'Unlocks after your first wrong guess each round. Hear the target from lowest to highest.' },
  { icon: SkipForward, title: 'A fresh sound', text: 'Skip this round. There’s no penalty.' },
] as const;

export default function App() {
  const [instrument, setInstrument] = useState(loadInstrument);
  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;
  const [loadingInstrument, setLoadingInstrument] = useState<Instrument | null>(null);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [language, setLanguage] = useState(() => window.location.pathname === '/ru' || window.location.pathname === '/ru/' ? 'ru' as const : loadLanguage());
  const [languageOpen, setLanguageOpen] = useState(false);
  const t = (key: MessageKey) => translate(language, key);
  const text = labels(language);
  const [game, setGame] = useState<Game>(loadSession);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [helpOpen, setHelpOpen] = useState(!game.hintsSeen);
  const [restartOpen, setRestartOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [playing, setPlaying] = useState<PlaybackKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioError, setAudioError] = useState<MessageKey | ''>('');
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const audio = useRef<PianoAudio | null>(null);
  const actionPending = useRef(false);
  const pendingPlayback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelPendingPlayback = useCallback(() => {
    clearTimeout(pendingPlayback.current);
    pendingPlayback.current = undefined;
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, 'Chordguessr — find your harmony');
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate(language, 'A little piano. A little practice. Train your ear, one chord at a time.'));
    saveLanguage(language);
  }, [language]);

  useEffect(() => { saveInstrument(instrument); }, [instrument]);

  useEffect(() => { applyTheme(theme); saveTheme(theme); }, [theme]);

  useEffect(() => {
    const piano = new PianoAudio();
    piano.setTargetInstrument(instrumentRef.current);
    piano.onPlayback = setPlaying;
    audio.current = piano;
    const onVisibility = () => { if (document.hidden) { cancelPendingPlayback(); piano.stop(); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelPendingPlayback(); document.removeEventListener('visibilitychange', onVisibility); piano.onPlayback = () => {}; piano.dispose(); };
  }, [cancelPendingPlayback]);

  useEffect(() => { setStorageUnavailable(!saveSession(game)); }, [game]);

  const play = useCallback(async (notes: readonly number[], kind: PlaybackKind) => {
    cancelPendingPlayback();
    setAudioError('');
    try { await audio.current?.play(notes, kind); }
    catch { setAudioError(kind === 'target' || kind === 'sequence' ? 'The instrument couldn’t load. Check your connection and try again.' : 'The piano couldn’t load. Check your connection and tap a play control to try again.'); }
  }, [cancelPendingPlayback]);

  useEffect(() => {
    if (game.phase !== 'playing' || !audio.current?.ready || document.hidden) return;
    // Run after the layout commits; the first chord gets a full second of quiet.
    // Manual playback, a skip, restart, or hiding the tab cancels this pending sound.
    pendingPlayback.current = setTimeout(() => void play(gameRef.current.target!.notes, 'target'), game.round === 1 ? 1000 : 0);
    return cancelPendingPlayback;
  }, [game.phase, game.round, play, cancelPendingPlayback]);

  useEffect(() => {
    if (game.phase !== 'success' || instrumentOpen || busy) return;
    const timer = setTimeout(() => setGame(current => nextRound(current)), 1900);
    return () => clearTimeout(timer);
  }, [game.phase, game.total, instrumentOpen, busy]);

  async function begin() {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setAudioError('');
    try {
      await audio.current!.prepare();
      setGame(current => startGame(current));
    } catch { setAudioError('The instrument couldn’t load. Check your connection and try again.'); }
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
    cancelPendingPlayback();
    setBusy(true);
    setAudioError('');
    try {
      await audio.current!.prepare();
      const current = gameRef.current;
      if (current.phase !== 'playing') return;
      void play(current.selected, 'guess');
      setGame(state => submitGuess(state));
    } catch { setAudioError('The sound couldn’t load. Your guess is saved. Tap submit to try again.'); }
    finally { actionPending.current = false; setBusy(false); }
  }

  async function advance() {
    if (actionPending.current) return;
    actionPending.current = true;
    cancelPendingPlayback();
    setBusy(true);
    setAudioError('');
    audio.current?.stop();
    try {
      // Continue and Skip are also audio-unlocking gestures after a restored session.
      if (!isComplete(gameRef.current)) await audio.current!.prepare();
      setGame(current => nextRound(current));
    } catch { setAudioError('The instrument couldn’t load. Check your connection and try again.'); }
    finally { actionPending.current = false; setBusy(false); }
  }
  function closeHelp() { setHelpOpen(false); setGame(current => ({ ...current, hintsSeen: true })); }
  function restart() {
    cancelPendingPlayback();
    audio.current?.stop();
    setRestartOpen(false);
    setAudioError('');
    setGame(current => initialGame(current.settings, current.hintsSeen));
  }
  function toggleType(type: GuessType) {
    const required: readonly GuessType[] = game.settings.mode === 'intervals' ? REQUIRED_INTERVALS : REQUIRED_TYPES;
    const types: readonly GuessType[] = game.settings.mode === 'intervals' ? INTERVAL_TYPES : CHORD_TYPES;
    if (required.includes(type)) return;
    setGame(current => ({ ...current, settings: { ...current.settings, types: types.filter(candidate => candidate === type ? !current.settings.types.includes(type) : current.settings.types.includes(candidate)) } }));
  }

  async function guessInterval(type: IntervalType) {
    if (actionPending.current || gameRef.current.phase !== 'playing') return;
    actionPending.current = true;
    cancelPendingPlayback();
    audio.current?.stop();
    setBusy(true);
    setAudioError('');
    try {
      await audio.current!.prepare();
      setGame(current => submitGuess(current, type));
    } catch { setAudioError('The instrument couldn’t load. Check your connection and try again.'); }
    finally { actionPending.current = false; setBusy(false); }
  }

  async function chooseInstrument(choice: Instrument) {
    if (actionPending.current || choice === instrumentRef.current) return;
    actionPending.current = true;
    cancelPendingPlayback();
    audio.current?.stop();
    setLoadingInstrument(choice);
    setBusy(true);
    setAudioError('');
    try {
      await audio.current!.prepare(choice);
      audio.current!.setTargetInstrument(choice);
      setInstrument(choice);
    } catch { setAudioError('The instrument couldn’t load. Choose it again to retry.'); }
    finally { actionPending.current = false; setLoadingInstrument(null); setBusy(false); }
  }

  const intervals = game.settings.mode === 'intervals';
  const easy = intervals && game.settings.difficulty === 'easy';
  const goal = intervals ? game.settings.types.length * 2 : 15;
  const progress = intervals ? game.settings.types.reduce((sum, type) => sum + Math.min(game.counts[type], 2), 0) : Math.min(game.total, goal);
  const setup = game.phase === 'setup';
  const complete = game.phase === 'complete';
  const success = ['success', 'milestone', 'finale'].includes(game.phase);
  const locked = game.phase !== 'playing' || busy;
  const milestone = game.phase === 'finale' ? completionCelebration : game.phase === 'milestone' ? milestones[game.total] : null;
  const mastered = game.settings.types.filter(type => game.counts[type] >= 2).length;

  return <div className={`app-shell ${setup ? 'setup-shell' : 'game-shell'} ${intervals ? 'interval-game' : ''}`}>
    <header className="header">
      <a className="wordmark" href="/" aria-label={t('Chordguessr home')}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">chordguessr<span className="brand-period">.</span></span></a>
      <div className="header-actions">
        {!setup && <IconButton label={t('Start a new game')} icon={RotateCcw} disabled={busy} onClick={() => { cancelPendingPlayback(); audio.current?.stop(); setRestartOpen(true); }} className="quiet" />}
        <IconButton label={t('How to play')} icon={CircleHelp} onClick={() => setHelpOpen(true)} className="quiet" />
        <button type="button" className="icon-button quiet instrument-trigger" aria-label={t('Change instrument')} title={`${t('Change instrument')}: ${t(INSTRUMENTS[instrument].label)}`} disabled={busy} onClick={() => setInstrumentOpen(true)}><InstrumentIcon instrument={instrument} /></button>
        <button type="button" className="icon-button quiet language-trigger" aria-label={t('Change language')} title={t('Change language')} onClick={() => setLanguageOpen(true)}><span aria-hidden="true">{language.toUpperCase()}</span></button>
        <button type="button" className="icon-button quiet theme-trigger" aria-label={t('Change colors')} title={t('Change colors')} onClick={() => setThemeOpen(true)}><span aria-hidden="true" /></button>
      </div>
    </header>

    <main>
      {setup ? <section className="setup" aria-labelledby="setup-title">
        <div className="eyebrow"><span /> {t('A LITTLE DAILY EAR TRAINING')}</div>
        <h1 id="setup-title">{t('Find your ')}<em>{t('harmony.')}</em></h1>
        <p className="intro">{t('Listen closely. Find the notes.')} <span>{t('Let your ears lead the way.')}</span></p>
        <div className="settings-panel">
          <div className="setup-tabs" role="tablist" aria-label={t('Game kind')}>
            {(['intervals', 'chords'] as const).map(mode => <button key={mode} id={`${mode}-tab`} type="button" role="tab" aria-selected={(intervals ? 'intervals' : 'chords') === mode} aria-controls="setup-options" tabIndex={(intervals ? 'intervals' : 'chords') === mode ? 0 : -1} disabled={busy}
              onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'intervals' : event.key === 'End' ? 'chords' : mode === 'intervals' ? 'chords' : 'intervals'; setGame(current => initialGame(next === 'intervals' ? DEFAULT_INTERVAL_SETTINGS : DEFAULT_CHORD_SETTINGS, current.hintsSeen)); document.getElementById(`${next}-tab`)?.focus(); } }}
              onClick={() => setGame(current => initialGame(mode === 'intervals' ? DEFAULT_INTERVAL_SETTINGS : DEFAULT_CHORD_SETTINGS, current.hintsSeen))}>{t(mode === 'intervals' ? 'Intervals' : 'Chords')}</button>)}
          </div>
          <div id="setup-options" role="tabpanel" aria-labelledby={intervals ? 'intervals-tab' : 'chords-tab'}>
          {intervals ? <>
            <fieldset className="difficulty-options"><legend>{t('How would you like to guess?')}</legend>
              {(['easy', 'regular'] as const).map(difficulty => <label key={difficulty}><input type="radio" name="difficulty" checked={game.settings.difficulty === difficulty} disabled={busy} onChange={() => setGame(current => ({ ...current, settings: { ...current.settings, difficulty } }))} /><span><strong>{t(difficulty === 'easy' ? 'Easy' : 'Regular')}</strong><small>{t(difficulty === 'easy' ? 'Name the interval · no piano needed' : 'Find the exact notes on the piano')}</small></span></label>)}
            </fieldset>
            <div className="section-heading"><h2>{t('Your interval palette')}</h2><span>{t('Each kind counts separately')}</span></div>
            <div className="interval-setup-groups">{INTERVAL_GROUPS.map(group => <fieldset key={group}><legend>{text.group(group)}</legend>{INTERVAL_TYPES.filter(type => INTERVALS[type].group === group).map(type => <label key={type} className={`chord-option ${game.settings.types.includes(type) ? 'chosen' : ''} ${REQUIRED_INTERVALS.includes(type) ? 'required' : ''}`}>
              <input type="checkbox" aria-label={text.type(type)} checked={game.settings.types.includes(type)} disabled={busy || REQUIRED_INTERVALS.includes(type)} onChange={() => toggleType(type)} />
              <span className="chord-symbol">{INTERVALS[type].symbol}</span><span className="chord-label">{text.type(type)}{REQUIRED_INTERVALS.includes(type) && <small>{t('Always included')}</small>}</span>
              {game.settings.types.includes(type) ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            </label>)}</fieldset>)}</div>
          </> : <>
          <div className="section-heading"><h2>{t('Your chord palette')}</h2><span>{t('Make it your own')}</span></div>
          <div className="chord-options">
            {CHORD_TYPES.map(type => <label key={type} className={`chord-option ${game.settings.types.includes(type) ? 'chosen' : ''} ${REQUIRED_TYPES.includes(type) ? 'required' : ''}`}>
              <input type="checkbox" checked={game.settings.types.includes(type)} disabled={REQUIRED_TYPES.includes(type) || busy} onChange={() => toggleType(type)} />
              <span className="chord-symbol">{CHORDS[type].symbol}</span>
              <span className="chord-label">{text.type(type)}{REQUIRED_TYPES.includes(type) && <small>{t('Always included')}</small>}</span>
              {game.settings.types.includes(type) ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            </label>)}
          </div>
          <label className="inversions-option">
            <span><strong>{t('A different perspective')}</strong><small>{t('Include inversions for an extra challenge')}</small></span>
            <input type="checkbox" aria-label={t('Include inversions')} checked={game.settings.inversions} disabled={busy} onChange={event => setGame(current => ({ ...current, settings: { ...current.settings, inversions: event.target.checked } }))} />
          </label>
          </>}
          </div>
          <div className="start-row"><div><strong>{t('Ready when you are.')}</strong><span>{t(intervals ? 'Each interval kind at least twice' : '15 correct chords · each type at least twice')}</span></div>
            <IconButton label={t(busy ? 'Loading sound' : 'Start game')} icon={busy ? LoaderCircle : ArrowRight} className={`primary ${busy ? 'loading' : ''}`} onClick={() => void begin()} disabled={busy} />
          </div>
        </div>
        <p className="headphone-note"><Headphones size={15} aria-hidden="true" /> {t('A quiet moment and headphones go a long way.')}</p>
      </section> : <>
        <section className="game-top" aria-label={t('Game progress and controls')}>
          <div className="progress-heading"><span className="eyebrow">{t(complete ? 'SESSION COMPLETE' : 'LISTEN. EXPLORE. DISCOVER.')}</span><span className="score"><strong>{game.total}</strong><span>{!intervals && <> / {goal} </>}<span className="score-word">{t('found')}</span></span></span></div>
          <div className="progress-track" role="progressbar" aria-label={t(intervals ? 'Interval coverage toward completion' : 'Correct chords toward 15')} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={progress}><span style={{ width: `${progress / goal * 100}%` }} /></div>
          <div className={`listening-space ${success ? 'celebrating' : ''}`}>
            <span className="round-label">{complete ? t('BEAUTIFULLY PLAYED') : text.round(game.round)}</span>
            <div className="listening-row" role="group" aria-label={t(intervals ? 'Target interval controls' : 'Target chord controls')}>
              <IconButton label={t(intervals ? 'Play interval note by note' : 'Play chord note by note')} icon={ListMusic} className="side-listen" disabled={locked || game.wrongAttempts === 0} onClick={() => { if (game.wrongAttempts > 0) void play(game.target!.notes, 'sequence'); }} active={playing === 'sequence'} />
              <div className="listen-target">
                <Wave active={playing !== null && playing !== 'note'} />
                {success && <Confetti />}
                <IconButton label={t(complete ? 'Start another game' : intervals ? 'Replay current interval' : 'Replay current chord')} icon={complete ? RotateCcw : success ? Check : Volume2}
                  className={`listen-button ${success ? 'success-button' : ''}`} disabled={busy || success}
                  onClick={() => complete ? restart() : void play(game.target!.notes, 'target')} active={playing === 'target'} />
              </div>
              <IconButton label={t('Skip current round')} icon={SkipForward} className="side-listen" disabled={locked} onClick={() => void advance()} />
            </div>
            <span className="listen-caption">{t(complete ? 'Another little adventure?' : success ? 'Nicely done' : 'Tap to listen')}</span>
            <p aria-live="polite" className={`round-feedback ${game.feedback === 'incorrect' ? 'incorrect' : ''}`}>
              {success ? t('Beautifully found. Trust those ears.') : game.feedback === 'incorrect' ? t('Not quite yet. Listen again — you’ve got this.') : ''}
            </p>
          </div>
          {!complete && !easy && <div className="controls" role="group" aria-label={t(intervals ? 'Interval controls' : 'Chord controls')}>
            <IconButton label={t('Play current guess')} icon={Play} disabled={locked || !game.selected.length} onClick={() => void play(game.selected, 'guess')} active={playing === 'guess'} />
            <IconButton label={t('Submit current guess')} icon={busy ? LoaderCircle : Check} className={`primary submit-button ${busy ? 'loading' : ''}`} disabled={locked || !game.selected.length} onClick={() => void submit()} />
          </div>}
        </section>

        {easy ? <section className="interval-answer-section" aria-label={t('Choose your interval')}>
          <p className="keyboard-hint">{t('Tap an interval to submit your guess.')}</p>
          <div className="interval-answers">{INTERVAL_GROUPS.map(group => {
            const types = INTERVAL_TYPES.filter(type => game.settings.types.includes(type) && INTERVALS[type].group === group);
            return types.length ? <div key={group} role="group" aria-label={text.intervalGroup(group)}>{types.map(type => <button key={type} type="button" className="interval-answer" aria-label={text.guess(text.type(type))} disabled={locked} onClick={() => void guessInterval(type)}><span>{INTERVALS[type].symbol}</span><small>{text.type(type)}</small></button>)}</div> : null;
          })}</div>
        </section> : <section className="keyboard-section" aria-label={t('Choose your notes')}>
          <div className="keyboard-heading"><span>{t(complete ? 'A practice worth celebrating' : 'YOUR LITTLE PIANO')}</span><span aria-live="polite">{complete ? text.found(game.total, intervals) : text.selected(game.selected.length)}</span></div>
          <Keyboard language={language} selected={game.selected} disabled={locked} onToggle={selectNote} />
          <p className="keyboard-hint">{t(complete ? 'Come back whenever you feel like listening.' : 'Tap a key to keep it. Tap again to let it go.')}</p>
        </section>}

        <section className="type-progress" aria-label={t(intervals ? 'Interval type progress' : 'Chord type progress')}>
          <div className="section-heading"><h2>{t('Your growing repertoire')}</h2><span>{text.explored(mastered, game.settings.types.length)}</span></div>
          <div className="type-chips">{game.settings.types.map(type => <span key={type} className={`type-chip ${game.counts[type] >= 2 ? 'mastered' : ''}`} title={`${text.type(type)}: ${text.correct(game.counts[type])}`}>
            <span className="type-name">{text.type(type)}</span><span className="count-dots" aria-hidden="true"><i className={game.counts[type] >= 1 ? 'filled' : ''} /><i className={game.counts[type] >= 2 ? 'filled' : ''} /></span><span className="sr-only">{text.correct(game.counts[type])}</span>
          </span>)}</div>
          {!intervals && game.total >= 15 && !complete && !isComplete(game) && <p className="extra-practice">{t('Fifteen found! Keep going until every chord family has two little wins.')}</p>}
        </section>
      </>}
      {audioError && <p role="alert" className="error-message">{t(audioError)}</p>}
      {storageUnavailable && <p role="status" className="storage-message">{t('Your browser can’t save this session. You can keep playing, but refreshing will start over.')}</p>}
    </main>

    <footer><span><Leaf size={13} aria-hidden="true" /> {t('A little practice. A better ear.')}</span><span>{t('Made for the joy of listening.')}</span></footer>

    {instrumentOpen && <Modal language={language} title={t('Secret sound instrument')} onClose={() => setInstrumentOpen(false)} className="instrument-modal">
      <p className="modal-intro">{t('Choose the sound for secret chords and intervals. Piano keys and your guesses always use piano.')}</p>
      <fieldset className="instrument-options"><legend className="sr-only">{t('Secret sound instrument')}</legend>
        {INSTRUMENT_TYPES.map(choice => <label key={choice}><input type="radio" name="instrument" aria-label={t(INSTRUMENTS[choice].label)} checked={(loadingInstrument ?? instrument) === choice} disabled={busy} onChange={() => void chooseInstrument(choice)} /><InstrumentIcon instrument={choice} /><span>{t(INSTRUMENTS[choice].label)}</span></label>)}
      </fieldset>
      {busy && <p role="status" className="modal-intro">{t('Loading sound')}</p>}
      {audioError && <p role="alert" className="error-message">{t(audioError)}</p>}
    </Modal>}

    {languageOpen && <Modal language={language} title={t('Language')} onClose={() => setLanguageOpen(false)} className="language-modal">
      <fieldset className="language-options"><legend className="sr-only">{t('Language')}</legend>
        {(['en', 'ru'] as const).map(choice => <label key={choice}><input type="radio" name="language" checked={language === choice} onChange={() => setLanguage(choice)} /><span>{t(choice === 'en' ? 'English' : 'Russian')}</span></label>)}
      </fieldset>
    </Modal>}

    {themeOpen && <Modal language={language} title={t('Your colors.')} onClose={() => setThemeOpen(false)} className="theme-modal">
      <fieldset className="theme-fieldset"><legend>{t('Accent')}</legend><div className="accent-options">
        {(Object.keys(ACCENTS) as Accent[]).map(accent => <label key={accent} className="accent-choice" style={{ '--swatch': `hsl(${ACCENTS[accent].hue} ${ACCENTS[accent].saturation}% 81%)` } as CSSProperties}>
          <input type="radio" name="accent" aria-label={t(ACCENTS[accent].label)} checked={theme.accent === accent} onChange={() => setTheme(current => ({ ...current, accent }))} />
          <span>{t(ACCENTS[accent].label)}</span>
        </label>)}
      </div></fieldset>
      <fieldset className="theme-fieldset"><legend>{t('Background')}</legend><div className="background-options">
        {(['cold', 'warm'] as const).map(background => <label key={background} className={`background-choice ${background}`}>
          <input type="radio" name="background" checked={theme.background === background} onChange={() => setTheme(current => ({ ...current, background }))} />
          <span>{t(background === 'cold' ? 'Cold' : 'Warm')}</span>
        </label>)}
      </div></fieldset>
    </Modal>}

    {helpOpen && <Modal language={language} title={t('A little guide to listening.')} onClose={closeHelp} className="help-modal">
      <p className="modal-intro">{t('Start with intervals: in Easy mode, tap the interval name to submit a guess. Minor and major kinds count separately. In Regular mode or the chord game, find the exact notes and octaves on the piano. A unison needs just one key. Tap keys to select or release them.')}</p>
      <div className="help-items">{helpItems.map(({ icon: Icon, title, text }) => <div key={title}><span className="help-icon"><Icon size={21} aria-hidden="true" /></span><div><strong>{t(title)}</strong><p>{t(text)}</p></div></div>)}</div>
      <p className="help-goal"><Sparkles size={18} aria-hidden="true" /> {t('Find every enabled interval kind twice. For chords, find at least 15 and each enabled type twice. Take your time — there’s no clock.')}</p>
      <div className="modal-action"><span>{t('Let’s make a little music')}</span><IconButton label={t('Got it')} icon={ArrowRight} className="primary" onClick={closeHelp} /></div>
      <p className="modal-intro">{t('Choose the sound for secret chords and intervals. Piano keys and your guesses always use piano.')}</p>
      <p className="audio-credit">{t('Piano: Alexander Holm’s ')}<a href="/audio/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Salamander Grand Piano</a> · CC BY 3.0</p>
      <p className="audio-credit">{t('Flute, guitar and voice: Frank Wen’s ')}<a href="/audio/FLUIDR3-ATTRIBUTION.txt" target="_blank" rel="noreferrer">FluidR3</a> · CC BY 3.0</p>
    </Modal>}

    {restartOpen && <Modal language={language} title={t('A fresh beginning?')} onClose={() => setRestartOpen(false)}>
      <p className="modal-intro">{t('This session’s progress will be cleared. You can choose intervals or a new chord palette before starting again.')}</p>
      <div className="restart-actions"><div><IconButton label={t('Keep playing')} icon={X} onClick={() => setRestartOpen(false)} /><span>{t('Keep playing')}</span></div><div><IconButton label={t('Confirm new game')} icon={RotateCcw} className="primary" onClick={restart} /><span>{t('Start fresh')}</span></div></div>
    </Modal>}

    {milestone && <Modal language={language} title={t(milestone.title)} className="milestone-modal">
      <div className="milestone-art"><img src={milestone.image} alt={t(milestone.alt)} /><Confetti /></div>
      <span className="eyebrow">{text.celebrationFound(game.total, intervals)}</span>
      <p className="modal-intro">{t(milestone.message)}</p>
      {audioError && <p role="alert" className="error-message">{t(audioError)}</p>}
      <div className="modal-action"><span>{t(isComplete(game) ? 'Celebrate your session' : 'Follow the next note')}</span><IconButton label={t('Continue')} icon={busy ? LoaderCircle : isComplete(game) ? Trophy : ArrowRight} className={`primary ${busy ? 'loading' : ''}`} disabled={busy} onClick={() => void advance()} /></div>
    </Modal>}
  </div>;
}
