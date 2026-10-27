import { useEffect, useState } from 'react';
import { AVATARS } from '../../supabase/functions/_shared/engine.js';
import { supabase } from '../lib/supabase';
import { callAction, type ActionReply } from '../lib/api';
import { useApp } from './ui';
import { Hero } from './Welcome';

interface Props {
  nick: string; av: number; isGuest: boolean; email: string | null; invite: string | null;
  onProfile: (nick: string, av: number) => void;
  onEnter: (code: string, reply?: ActionReply) => void;
}
interface MyRoom { code: string; status: string; updated: string }

const cleanNick = (n: string) => n.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
const STATUS_LABEL: Record<string, string> = { lobby: 'Di lobby', playing: 'Sedang main', ended: 'Selesai' };

export function Home({ nick: nick0, av: av0, isGuest, email, invite, onProfile, onEnter }: Props) {
  const { me, toast, openRules } = useApp();
  const [nick, setNick] = useState(nick0);
  const [av, setAv] = useState(av0);
  const [code, setCode] = useState(invite || '');
  const [busy, setBusy] = useState('');
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [saveEmail, setSaveEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');

  useEffect(() => { setNick(n => n || nick0); setAv(av0); }, [nick0, av0]);
  useEffect(() => {
    let alive = true;
    supabase.from('game_players').select('room_code, game_rooms(status, updated_at)').eq('user_id', me).then(({ data }) => {
      if (!alive) return;
      const list = (data || []).map((r: any) => { const g = Array.isArray(r.game_rooms) ? r.game_rooms[0] : r.game_rooms; return { code: r.room_code, status: g?.status, updated: g?.updated_at }; })
        .filter(r => r.status && r.status !== 'closed').sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 5);
      setRooms(list);
    });
    return () => { alive = false; };
  }, [me]);

  function ready(): string | null {
    const n = cleanNick(nick);
    if (!n) { toast('Isi nama panggilan dulu.'); document.getElementById('nick')?.focus(); return null; }
    onProfile(n, av); return n;
  }
  async function create(bots: number) {
    const n = ready(); if (!n) return;
    setBusy(bots ? 'bots' : 'create');
    const r = await callAction('create', null, [n, av, bots]);
    setBusy('');
    if (r.ok) onEnter(r.code, r); else toast(r.error);
  }
  async function join() {
    const n = ready(); if (!n) return;
    const c = code.toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(c)) { toast('Kode room terdiri dari 5 huruf/angka.'); return; }
    setBusy('join');
    const r = await callAction('join', c, [n, av]);
    setBusy('');
    if (r.ok) onEnter(r.code, r); else toast(r.error);
  }
  async function upgrade(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(saveEmail)) { setEmailMsg('Alamat email belum benar.'); return; }
    const { error } = await supabase.auth.updateUser({ email: saveEmail }, { emailRedirectTo: location.origin + location.pathname });
    setEmailMsg(error ? error.message : 'Cek emailmu dan klik link konfirmasi. Setelah itu akun tamu ini jadi akun tetap.');
  }

  return (
    <div className="wrap">
      <Hero />
      <div className="home-grid" style={{ marginTop: 8 }}>
        <div className="panel" style={{ padding: 18 }}>
          <div className="stack">
            <div className="label">Langkah 1 · Identitas pemain</div>
            <label className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 700 }}>Nama panggilan</span>
              <input className="field" id="nick" maxLength={16} placeholder="mis. Budi Tanggal Tua" value={nick} onChange={e => setNick(e.target.value)} autoComplete="off" />
            </label>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 700 }}>Avatar</span>
              <div className="avpick" role="group" aria-label="Pilih avatar">
                {AVATARS.map((a, i) => <button key={i} type="button" aria-pressed={i === av} aria-label={`Avatar ${i + 1}`} onClick={() => setAv(i)}>{a}</button>)}
              </div>
            </div>
            <div className="label" style={{ marginTop: 6 }}>Langkah 2 · Main</div>
            {invite && <div className="banner info">Kamu diundang ke room <b>{invite}</b>. Isi nama, lalu tekan Gabung.</div>}
            <button className="btn pri big block" onClick={() => create(0)} disabled={!!busy}>{busy === 'create' && <span className="spinner" />}Buat room baru</button>
            <button className="btn block" onClick={() => create(3)} disabled={!!busy}>{busy === 'bots' && <span className="spinner" />}🤖 Main lawan bot</button>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="field code" id="joincode" maxLength={5} placeholder="KODE" value={code} aria-label="Kode room" autoComplete="off"
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') join(); }} />
              <button className="btn pink" onClick={join} disabled={!!busy} style={{ flex: 'none' }}>{busy === 'join' && <span className="spinner" />}Gabung</button>
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="panel" style={{ padding: 16 }}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="label">Room kamu</div>
              {rooms === null ? <div className="small muted">Memuat…</div> : rooms.length === 0 ? <div className="empty" style={{ padding: 12 }}>Belum ada room. Buat room baru atau gabung dengan kode.</div> : (
                <div className="roomlist">
                  {rooms.map(r => <button key={r.code} onClick={() => onEnter(r.code)}><span className="disp" style={{ letterSpacing: '.12em' }}>{r.code}</span><span className="chip">{STATUS_LABEL[r.status] || r.status}</span></button>)}
                </div>
              )}
            </div>
          </div>
          <div className="panel" style={{ padding: 16 }}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="label">Akun</div>
              {isGuest ? (
                <>
                  <div className="small">Kamu main sebagai <b>tamu</b>. Simpan akun dengan email supaya bisa lanjut di perangkat lain.</div>
                  <form onSubmit={upgrade} className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="field" type="email" placeholder="nama@email.com" value={saveEmail} onChange={e => setSaveEmail(e.target.value)} aria-label="Email untuk menyimpan akun" />
                    <button className="btn sm" type="submit" style={{ flex: 'none' }}>Simpan</button>
                  </form>
                  {emailMsg && <div className="small">{emailMsg}</div>}
                </>
              ) : <div className="small">Masuk sebagai <b>{email}</b>.</div>}
              <div className="row"><button className="btn sm ghost" onClick={() => supabase.auth.signOut()}>{isGuest ? "Keluar (akun tamu hilang)" : "Keluar"}</button><button className="btn sm ghost" onClick={openRules}>Aturan main</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
