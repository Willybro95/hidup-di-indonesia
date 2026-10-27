// Live room state: reads the committed row, subscribes to changes, tracks who is online,
// and re-fetches after reconnects so a refreshed or reconnected browser always shows the database's truth.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Game } from '../../supabase/functions/_shared/engine.js';

export type Conn = 'connecting' | 'online' | 'offline';

export function useRoom(code: string | null, myId: string | null) {
  const [game, setGame] = useState<Game | null>(null);
  const [version, setVersion] = useState(0);
  const [missing, setMissing] = useState(false);
  const [conn, setConn] = useState<Conn>('connecting');
  const [online, setOnline] = useState<Set<string>>(new Set());
  const verRef = useRef(0);

  const accept = useCallback((v: number, state: Game) => {
    if (v <= verRef.current) return;
    verRef.current = v; setVersion(v); setGame(state); setMissing(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!code) return;
    const { data, error } = await supabase.from('game_rooms').select('version, state').eq('code', code).maybeSingle();
    if (error) { setConn('offline'); return; }
    if (!data) { setMissing(true); return; }
    accept(data.version, data.state as Game);
  }, [code, accept]);

  useEffect(() => {
    verRef.current = 0; setGame(null); setVersion(0); setMissing(false); setOnline(new Set());
    if (!code || !myId) return;
    let alive = true;
    refresh();
    const ch = supabase.channel(`room:${code}`, { config: { presence: { key: myId } } });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `code=eq.${code}` }, payload => {
      const n = payload.new as { version?: number; state?: Game } | null;
      if (n && typeof n.version === 'number' && n.state) accept(n.version, n.state); else refresh();
    });
    ch.on('presence', { event: 'sync' }, () => { if (alive) setOnline(new Set(Object.keys(ch.presenceState()))); });
    ch.subscribe(status => {
      if (!alive) return;
      if (status === 'SUBSCRIBED') { setConn('online'); ch.track({ at: Date.now() }); refresh(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConn('offline');
    });
    const onWake = () => { if (document.visibilityState === 'visible') refresh(); };
    const onOnline = () => refresh();
    const onOffline = () => setConn('offline');
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000); // safety net if a push is missed
    return () => {
      alive = false; clearInterval(poll);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      supabase.removeChannel(ch);
    };
  }, [code, myId, refresh, accept]);

  return { game, version, missing, conn, online, accept, refresh };
}
