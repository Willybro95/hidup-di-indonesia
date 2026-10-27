import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callAction, type ActionReply } from '../lib/api';
import { useRoom } from '../lib/useRoom';
import { TopBar, useApp } from './ui';
import { Lobby } from './Lobby';
import { Game, type Act } from './Game';
import { Results } from './Results';

interface Props { code: string; initial?: ActionReply; sound: boolean; onSound: () => void; onLeave: () => void }

export function RoomScreen({ code, initial, sound, onSound, onLeave }: Props) {
  const { me, toast, openRules } = useApp();
  const { game: g, version, missing, conn, online, accept, refresh } = useRoom(code, me);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [goal, setGoal] = useState<{ gameId: string; key: string } | null>(null);

  useEffect(() => { if (initial?.ok) accept(initial.version, initial.state); }, [initial, accept]);
  const screenKey = g ? `${g.status}:${g.gameId}` : '';
  useEffect(() => { if (screenKey) window.scrollTo(0, 0); }, [screenKey]); // new screen starts at the top

  const act: Act = useCallback(async (a, args = [], opts = {}) => {
    if (!opts.silent) { if (busyRef.current) return false; busyRef.current = true; setBusy(true); }
    const r = await callAction(a, code, args, opts.expect);
    if (!opts.silent) { busyRef.current = false; setBusy(false); }
    if (r.ok) { accept(r.version, r.state); return true; }
    if (r.kind === 'stale') { refresh(); return false; }
    if (!opts.silent || r.kind === 'network') toast(r.error);
    if (r.kind === 'missing') refresh();
    return false;
  }, [code, accept, refresh, toast]);

  // Fetch my secret goal for the current game (readable only by me).
  const gameId = g?.status !== 'lobby' && g?.ps?.[me] ? g.gameId : null;
  useEffect(() => {
    if (!gameId || goal?.gameId === gameId) return;
    let alive = true, tries = 0;
    const load = async () => {
      const { data } = await supabase.from('player_secrets').select('goal_key').eq('room_code', code).eq('game_id', gameId).eq('player_id', me).maybeSingle();
      if (!alive) return;
      if (data?.goal_key) setGoal({ gameId, key: data.goal_key }); else if (tries++ < 5) setTimeout(load, 1500);
    };
    load();
    return () => { alive = false; };
  }, [gameId, code, me, goal?.gameId]);

  const round = g?.status === 'playing' ? `Ronde ${Math.min(g.round || 1, g.cfg.rounds)}/${g.cfg.rounds}` : undefined;
  const header = <TopBar code={code} round={round} conn={conn} sound={sound} onSound={onSound} onRules={openRules} onHome={onLeave} />;
  const offline = conn === 'offline' && <div className="wrap" style={{ paddingBlock: '8px 0' }}><div className="banner err">Koneksi terputus. Menyambung ulang otomatis; game akan dimuat ulang dari server begitu tersambung.</div></div>;

  let body;
  if (missing && !g) body = (
    <div className="wrap"><div className="panel" style={{ padding: 18 }}>
      <h2 className="disp" style={{ fontSize: 20 }}>Room {code} tidak bisa dibuka</h2>
      <p>Kamu bukan anggota room ini, atau room sudah ditutup.</p>
      <button className="btn pri" onClick={onLeave}>Kembali ke menu</button>
    </div></div>
  );
  else if (!g) body = <div className="wrap"><div className="empty"><span className="spinner" /> Memuat room {code}…</div></div>;
  else if (g.status === 'closed' || !g.players.some(p => p.id === me)) body = (
    <div className="wrap"><div className="panel" style={{ padding: 18 }}>
      <h2 className="disp" style={{ fontSize: 20 }}>Kamu tidak lagi di room {code}</h2>
      <button className="btn pri" onClick={onLeave}>Kembali ke menu</button>
    </div></div>
  );
  else if (g.status === 'lobby') body = <Lobby g={g} online={online} busy={busy} act={act} onLeave={onLeave} />;
  else if (g.status === 'playing') body = <Game g={g} version={version} online={online} busy={busy} act={act} goal={goal?.gameId === g.gameId ? goal.key : null} />;
  else body = <Results g={g} busy={busy} act={act} onHome={onLeave} />;

  return <>{header}{offline}{body}</>;
}
