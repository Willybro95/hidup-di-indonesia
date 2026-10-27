import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import type { ActionReply } from './lib/api';
import { ls } from './lib/storage';
import { setSound, soundOn } from './lib/sound';
import { Ctx, TopBar } from './components/ui';
import { Rules } from './components/Rules';
import { SetupNeeded, SignIn } from './components/Welcome';
import { Home } from './components/Home';
import { RoomScreen } from './components/RoomScreen';

const CODE = /^[A-Z0-9]{5}$/;
function urlRoom() { const c = new URLSearchParams(location.search).get('room')?.toUpperCase() || ''; return CODE.test(c) ? c : null; }
function setUrlRoom(code: string | null) {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
  history.replaceState(null, '', u.toString());
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [rules, setRules] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sound, setSnd] = useState(soundOn());
  const [profile, setProfile] = useState({ nick: ls.get('hdi.nick') || '', av: Number(ls.get('hdi.av') || 0) || 0 });
  const [room, setRoom] = useState<{ code: string; initial?: ActionReply } | null>(null);
  const [invite, setInvite] = useState<string | null>(urlRoom());
  const [resolving, setResolving] = useState(true);
  const toastTimer = useRef<number>();

  const toast = useCallback((m: string) => {
    setToastMsg(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToastMsg(null), 3400);
  }, []);
  const openRules = useCallback(() => setRules(true), []);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const me = session?.user.id || '';

  // Load the saved profile, then reopen the room from the link or the last session if this account is in it.
  useEffect(() => {
    if (!me) { setResolving(false); return; }
    let alive = true;
    (async () => {
      setResolving(true);
      const { data: p } = await supabase.from('profiles').select('nickname, avatar').eq('id', me).maybeSingle();
      if (alive && p) setProfile({ nick: p.nickname, av: p.avatar });
      const want = urlRoom() || ls.get('hdi.room');
      if (want && CODE.test(want)) {
        const { data } = await supabase.from('game_rooms').select('code, status').eq('code', want).maybeSingle();
        if (alive && data && data.status !== 'closed') { setRoom({ code: want }); setInvite(null); }
        else if (alive) { ls.del('hdi.room'); setInvite(urlRoom()); }
      }
      if (alive) setResolving(false);
    })();
    return () => { alive = false; };
  }, [me]);

  useEffect(() => {
    if (!me || resolving) return;
    if (room) { ls.set('hdi.room', room.code); setUrlRoom(room.code); }
    else { ls.del('hdi.room'); setUrlRoom(invite); }
  }, [room, invite, me, resolving]);

  const saveProfile = useCallback((nick: string, av: number) => {
    setProfile({ nick, av }); ls.set('hdi.nick', nick); ls.set('hdi.av', String(av));
    supabase.from('profiles').upsert({ id: me, nickname: nick, avatar: av, updated_at: new Date().toISOString() }).then(() => {});
  }, [me]);

  const toggleSound = () => { setSound(!sound); setSnd(!sound); };
  const plainTop = <TopBar sound={sound} onSound={toggleSound} onRules={openRules} />;

  let screen;
  if (!configured) screen = <>{plainTop}<SetupNeeded /></>;
  else if (session === undefined || (me && resolving)) screen = <>{plainTop}<div className="wrap"><div className="empty"><span className="spinner" /> Menyiapkan meja permainan…</div></div></>;
  else if (!session) screen = <>{plainTop}<SignIn onRules={openRules} /></>;
  else if (room) screen = <RoomScreen key={room.code} code={room.code} initial={room.initial} sound={sound} onSound={toggleSound} onLeave={() => { setRoom(null); setInvite(null); }} />;
  else screen = <>{plainTop}<Home nick={profile.nick} av={profile.av} isGuest={!!session.user.is_anonymous} email={session.user.email || null} invite={invite}
    onProfile={saveProfile} onEnter={(code, initial) => { setInvite(null); setRoom({ code, initial }); }} /></>;

  return (
    <Ctx.Provider value={{ me, toast, openRules }}>
      {screen}
      {rules && <Rules onClose={() => setRules(false)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
