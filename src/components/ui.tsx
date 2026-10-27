import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { AVATARS } from '../../supabase/functions/_shared/engine.js';
import type { Conn } from '../lib/useRoom';

export interface AppCtx { me: string; toast: (m: string) => void; openRules: () => void }
export const Ctx = createContext<AppCtx>({ me: '', toast: () => {}, openRules: () => {} });
export const useApp = () => useContext(Ctx);

export const PCOL = ['#FFBE1A', '#5CC07A', '#F07EB0', '#6C8EEA', '#F28A45', '#2FB3A3'];
export const typeColor = (t: string) => `var(--t-${t})`;

export function Avatar({ av, small, bg }: { av: number; small?: boolean; bg?: string }) {
  return <span className={`av ${small ? 's' : ''}`} style={{ background: bg || 'var(--surface2)' }} aria-hidden="true">{AVATARS[av] || AVATARS[0]}</span>;
}

export function Dot({ on }: { on: boolean | null }) {
  return <span className={`dot ${on === null ? '' : on ? 'on' : 'off'}`} />;
}

export function ConnChip({ conn }: { conn: Conn }) {
  const label = conn === 'online' ? 'Online' : conn === 'connecting' ? 'Menyambung…' : 'Terputus';
  return <span className="chip" title={`Koneksi: ${label}`} aria-label={`Koneksi: ${label}`}><Dot on={conn === 'online' ? true : conn === 'offline' ? false : null} /><span className="conn-label">{label}</span></span>;
}

export function Modal({ children, label, wide, onClose }: { children: ReactNode; label: string; wide?: boolean; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={label}>
      <div className="card" style={wide ? { width: 'min(640px,100%)' } : undefined}>{children}</div>
    </div>
  );
}

export function Confirm({ title, text, onYes, onNo }: { title: string; text: string; onYes: () => void; onNo: () => void }) {
  return (
    <Modal label={title} onClose={onNo}>
      <div className="body">
        <h2>{title}</h2>
        <div className="desc">{text}</div>
        <div className="row"><button className="btn pink" onClick={onYes}>Ya, lanjutkan</button><button className="btn ghost" onClick={onNo}>Batal</button></div>
      </div>
    </Modal>
  );
}

export function Die({ n, spin, red }: { n: number; spin?: boolean; red?: boolean }) {
  const on = ({ 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] } as Record<number, number[]>)[n] || [];
  return (
    <div className={`die ${spin ? 'spin' : ''} ${red ? 'red' : ''}`} aria-label={`Dadu ${n}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={on.includes(i + 1) ? 'on' : ''} />)}
    </div>
  );
}

export function TopBar({ code, round, conn, sound, onSound, onRules, onHome }: {
  code?: string; round?: string; conn?: Conn; sound: boolean; onSound: () => void; onRules: () => void; onHome?: () => void;
}) {
  return (
    <header className="top">
      <div className="in">
        <button className="brand" onClick={onHome} style={{ background: 'none', border: 0, padding: 0, cursor: onHome ? 'pointer' : 'default' }} aria-label="Ke halaman depan"><span className="wide-only">HIDUP DI <b>INDONESIA</b></span><span className="narrow-only">{code ? <b>HDI</b> : <>HIDUP DI <b>INDONESIA</b></>}</span></button>
        {code && <span className="chip disp" style={{ letterSpacing: '.12em' }}>{code}</span>}
        {round && <span className="chip num">{round}</span>}
        <span className="sp" />
        {conn && <ConnChip conn={conn} />}
        <button className="btn sm ghost" onClick={onSound} aria-label={sound ? 'Matikan suara' : 'Nyalakan suara'}>{sound ? '🔊' : '🔇'}</button>
        <button className="btn sm ghost" onClick={onRules} aria-label="Aturan main"><span className="wide-only">Aturan</span><span className="narrow-only">?</span></button>
      </div>
    </header>
  );
}
