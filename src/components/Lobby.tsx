import type { Game } from '../../supabase/functions/_shared/engine.js';
import { Avatar, Dot, useApp } from './ui';
import { Chat } from './Chat';

interface Props { g: Game; online: Set<string>; busy: boolean; act: (a: string, args?: unknown[]) => Promise<boolean>; onLeave: () => void }

export function inviteLink(code: string) { return `${location.origin}${location.pathname}?room=${code}`; }

export function Lobby({ g, online, busy, act, onLeave }: Props) {
  const { me, toast, openRules } = useApp();
  const host = g.hostId === me, mine = g.players.find(p => p.id === me);
  const readyN = g.players.filter(p => p.ready).length;
  const allReady = readyN === g.players.length && g.players.length >= 2;
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); toast(done); } catch { toast(`Salin manual: ${text}`); }
  }
  async function share() {
    const text = `Ayo main HIDUP DI INDONESIA bareng aku! Kode room: ${g.code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Hidup di Indonesia', text, url: inviteLink(g.code) }); return; } catch { /* cancelled */ } }
    copy(`${text}\n${inviteLink(g.code)}`, 'Undangan disalin. Tempel di WhatsApp!');
  }
  if (!mine) return <div className="wrap"><div className="empty">Kamu tidak lagi di room ini.</div></div>;

  return (
    <div className="wrap">
      <div className="home-grid">
        <div className="stack">
          <div className="panel" style={{ padding: 18 }}>
            <div className="stack">
              <div className="label">Kode room</div>
              <div className="row"><span className="codebig">{g.code}</span></div>
              <div className="row">
                <button className="btn sm" onClick={() => copy(g.code, 'Kode room disalin.')}>Salin kode</button>
                <button className="btn sm" onClick={() => copy(inviteLink(g.code), 'Link undangan disalin.')}>Salin link</button>
                <button className="btn sm pri" onClick={share}>Bagikan undangan</button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Teman membuka link undangan atau memasukkan kode di halaman depan.</p>
            </div>
          </div>
          <div className="panel" style={{ padding: 18 }}>
            <div className="stack">
              <div className="label">Pemain {g.players.length}/6 · {readyN} siap</div>
              <div className="plist">
                {g.players.map(p => {
                  const on = p.bot ? true : online.has(p.id);
                  return (
                    <div className="pitem" key={p.id}>
                      <Avatar av={p.av} />
                      <div className="grow">
                        <div className="nm">{p.nick}{p.id === me && <span className="muted small"> (kamu)</span>}</div>
                        <div className="row small" style={{ gap: 6 }}>
                          {p.id === g.hostId && <span className="chip">👑 Host</span>}
                          {p.bot ? <span className="chip">🤖 Bot</span> : <span className="chip"><Dot on={on} />{on ? 'Online' : 'Offline'}</span>}
                        </div>
                      </div>
                      <span className="chip" style={{ background: p.ready ? 'var(--good)' : 'var(--surface)', color: p.ready ? '#fff' : 'var(--ink)' }}>{p.ready ? 'Siap' : 'Belum siap'}</span>
                      {host && p.id !== me && <button className="btn sm ghost" aria-label={`Keluarkan ${p.nick}`} onClick={() => act('kick', [p.id])} disabled={busy}>✕</button>}
                    </div>
                  );
                })}
                {Array.from({ length: 6 - g.players.length }, (_, i) => (
                  <div className="pitem" key={`e${i}`} style={{ borderStyle: 'dashed', opacity: 0.6 }}><span className="av" style={{ borderStyle: 'dashed' }}>+</span><span className="muted small">Slot kosong</span></div>
                ))}
              </div>
              {host && g.players.length < 6 && <button className="btn block" onClick={() => act('addBot')} disabled={busy}>🤖 Tambah bot</button>}
              <button className={`btn big block ${mine.ready ? '' : 'pri'}`} onClick={() => act('ready', [!mine.ready])} disabled={busy}>{mine.ready ? 'Batal siap' : 'Saya siap!'}</button>
              {host ? (
                <>
                  <button className="btn big block teal" onClick={() => act('start')} disabled={!allReady || busy}>Mulai game</button>
                  <p className="small muted" style={{ margin: 0 }}>{g.players.length < 2 ? 'Butuh minimal 2 pemain. Tambah bot kalau mau main sendiri.' : allReady ? 'Semua siap. Gas!' : 'Menunggu semua pemain siap.'}</p>
                </>
              ) : <p className="small muted" style={{ margin: 0 }}>Menunggu host memulai game.</p>}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="panel" style={{ padding: 18 }}>
            <div className="stack">
              <div className="label">Pengaturan {host ? '' : '(diatur host)'}</div>
              <div className="row">
                <span className="small" style={{ fontWeight: 700 }}>Lama game</span>
                <div className="seg" role="group" aria-label="Jumlah ronde">
                  {[8, 12, 16, 20].map(n => <button key={n} aria-pressed={g.cfg.rounds === n} disabled={!host || busy} onClick={() => act('rounds', [n])}>{n}</button>)}
                </div>
                <span className="small muted">ronde · ±{Math.round(g.cfg.rounds * Math.max(2, g.players.length) * 0.75)} menit</span>
              </div>
            </div>
          </div>
          <Chat g={g} onSend={i => act('chat', [i])} />
          <div className="row">
            <button className="btn ghost" onClick={async () => { if (await act('leave')) onLeave(); }} disabled={busy}>Keluar dari room</button>
            <button className="btn ghost" onClick={openRules}>Aturan main</button>
          </div>
        </div>
      </div>
    </div>
  );
}
