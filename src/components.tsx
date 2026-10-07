import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { Guitar, MicVocal, Piano, X, type LucideIcon } from 'lucide-react';
import type { Instrument } from './instrument';
import { labels, translate, type Language } from './i18n';

export function IconButton({ label, icon: Icon, onClick, disabled = false, className = '', active = false }: {
  label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; className?: string; active?: boolean;
}) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={`icon-button ${className} ${active ? 'active' : ''}`}><Icon aria-hidden="true" strokeWidth={1.65} /></button>;
}

export function Modal({ title, children, onClose, className = '', language = 'en' }: { language?: Language; title: string; children: ReactNode; onClose?: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previouslyFocused?.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={heading} className={`modal ${className}`}
    onCancel={event => { event.preventDefault(); onClose?.(); }}>
    {onClose && <IconButton className="modal-close quiet" label={translate(language, 'Close dialog')} icon={X} onClick={onClose} />}
    <h2 id={heading}>{title}</h2>
    {children}
  </dialog>;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [{ offset: 1, position: 1 }, { offset: 3, position: 2 }, { offset: 6, position: 4 }, { offset: 8, position: 5 }, { offset: 10, position: 6 }];

export function Keyboard({ selected, disabled, onToggle, language = 'en' }: { language?: Language; selected: number[]; disabled: boolean; onToggle: (note: number) => void }) {
  const text = labels(language);
  function key(note: number, black: boolean, style?: CSSProperties) {
    return <button key={note} type="button" className={`piano-key ${black ? 'black' : 'white'} ${selected.includes(note) ? 'selected' : ''}`}
      style={style} aria-label={text.note(note)} aria-pressed={selected.includes(note)} disabled={disabled} onClick={() => onToggle(note)}>
      <span className="key-dot" aria-hidden="true" />
    </button>;
  }
  return <div className={`piano ${disabled ? 'piano-disabled' : ''}`} aria-label={translate(language, 'Piano keyboard')}>
    {[48, 60].map((base, index) => <div className="octave" role="group" aria-label={text.octave(index + 3)} key={base}>
      <div className="white-keys">{WHITE.map(offset => key(base + offset, false))}</div>
      {BLACK.map(({ offset, position }) => key(base + offset, true, { left: `${position / 7 * 100}%` }))}
    </div>)}
  </div>;
}

export function Wave({ active }: { active: boolean }) {
  return <div className={`wave ${active ? 'wave-active' : ''}`} aria-hidden="true">
    {Array.from({ length: 49 }, (_, i) => <span key={i} style={{ '--height': `${12 + Math.sin(i * 0.62) ** 2 * (1 - Math.abs(i - 24) / 28) * 116}px`, '--delay': `${i * -0.11}s` } as CSSProperties} />)}
  </div>;
}

export function Confetti() {
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--angle': `${i * 22.5}deg`, '--distance': `${80 + i % 4 * 24}px`, '--confetti-color': ['var(--accent-strong)', 'var(--accent)', 'var(--accent-mid)'][i % 3] } as CSSProperties} />)}</div>;
}


export function InstrumentIcon({ instrument }: { instrument: Instrument }) {
  const Icon = instrument === 'piano' ? Piano : instrument === 'guitar' ? Guitar : instrument === 'voice' ? MicVocal : null;
  if (Icon) return <Icon aria-hidden="true" strokeWidth={1.65} />;
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17 17 3l4 4L7 21Z M15 5l4 4 M4 16l4 4 M17 3l2-2 4 4-2 2" />
    <circle cx="10" cy="16" r=".6" /><circle cx="13" cy="13" r=".6" /><circle cx="16" cy="10" r=".6" />
  </svg>;
}
