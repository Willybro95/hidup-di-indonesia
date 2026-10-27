import { useEffect, useRef } from 'react';
import { CHAT_PRESETS, nameOf } from '../../supabase/functions/_shared/engine.js';
import type { Game } from '../../supabase/functions/_shared/engine.js';
import { Avatar } from './ui';

export function Chat({ g, onSend, bare }: { g: Game; onSend: (i: number) => void; bare?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const msgs = (g.chat || []).slice(-14);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs.length]);
  const avFor = (id: string) => g.players.find(p => p.id === id)?.av ?? g.ps?.[id]?.av ?? 0;
  return (
    <div className={bare ? '' : 'panel'} style={{ padding: bare ? 0 : 14 }}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="label">Obrolan cepat</div>
        <div className="chatbox" ref={box}>
          {msgs.length ? msgs.map((c, i) => (
            <div className="chatmsg" key={i}><Avatar av={avFor(c.p)} small /><span className="small" style={{ fontWeight: 800 }}>{nameOf(g, c.p)}</span><span className="b">{CHAT_PRESETS[c.i] || ''}</span></div>
          )) : <div className="empty" style={{ padding: 10 }}>Belum ada obrolan. Sapa pemain lain!</div>}
        </div>
        <div className="presets">{CHAT_PRESETS.map((m, i) => <button key={i} className="btn sm" onClick={() => onSend(i)}>{m}</button>)}</div>
      </div>
    </div>
  );
}
