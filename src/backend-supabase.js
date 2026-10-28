// Backend for the public website: guests sign in anonymously, read their rooms (row-level security decides what
// they can see), get live updates over Realtime, and send every move to the game-action server function.
import { createClient } from '@supabase/supabase-js';

export function supabaseBackend({ url, anonKey }) {
  const configured = !!(url && anonKey);
  const sb = createClient(url || 'http://localhost', anonKey || 'missing', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  let me = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const roomFromUrl = () => { const c = (new URLSearchParams(location.search).get('room') || '').toUpperCase(); return /^[A-Z0-9]{5}$/.test(c) ? c : null; };
  return {
    kind: 'web',
    ownerHint: '',
    shareHint: 'Send the invite link. Friends can join from a phone or laptop, no account needed.',
    async init() {
      if (!configured) return { fatal: 'config' };
      let { data } = await sb.auth.getSession();
      if (!data.session) { const r = await sb.auth.signInAnonymously(); if (r.error) return { fatal: 'auth', message: r.error.message }; data = r.data; }
      me = data.session.user.id;
      let profile = {};
      try { const { data: p } = await sb.from('profiles').select('nickname, avatar').eq('id', me).maybeSingle(); if (p) profile = { nick: p.nickname, av: p.avatar }; } catch (e) {}
      return { me, profile };
    },
    async saveProfile({ nick, av }) { if (nick) await sb.from('profiles').upsert({ id: me, nickname: nick.slice(0, 16), avatar: av, updated_at: new Date().toISOString() }); },
    async peek(code) { const { data } = await sb.from('game_rooms').select('state').eq('code', code).maybeSingle(); return data?.state || null; },
    subscribe(code, onState, onError) {
      let alive = true, ver = 0;
      const pull = async () => {
        const { data, error } = await sb.from('game_rooms').select('version, state').eq('code', code).maybeSingle();
        if (!alive) return; if (error) { onError(error); return; }
        if (!data) { onState(null); return; }
        if (data.version >= ver) { ver = data.version; onState(data.state, {}); }
      };
      pull();
      const ch = sb.channel(`room-state:${code}`).on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `code=eq.${code}` }, p => {
        const n = p.new; if (n && n.state && typeof n.version === 'number') { if (n.version >= ver) { ver = n.version; onState(n.state, {}); } } else pull();
      }).subscribe(st => { if (st === 'SUBSCRIBED') pull(); });
      const wake = () => { if (document.visibilityState === 'visible') pull(); };
      document.addEventListener('visibilitychange', wake);
      const poll = setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 15000); // safety net if a push is missed
      return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', wake); sb.removeChannel(ch); };
    },
    async presence(code, onPeers, onConn) {
      const ch = sb.channel(`room-people:${code}`, { config: { presence: { key: me } } });
      ch.on('presence', { event: 'sync' }, () => onPeers(new Set(Object.keys(ch.presenceState()))));
      ch.subscribe(st => { if (st === 'SUBSCRIBED') { onConn(true); ch.track({ at: Date.now() }); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') onConn(false); });
      return () => { sb.removeChannel(ch); };
    },
    // The same requestId is reused on retry, so a move that reached the server is never applied twice.
    async act(action, code, args, opts = {}) {
      const requestId = crypto.randomUUID();
      let last = 'Couldn’t reach the server. Try again.';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await sb.auth.getSession(); const token = data.session?.access_token;
          if (!token) return { ok: false, error: 'Your session ended. Reload the page.', kind: 'auth' };
          const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/game-action`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
            body: JSON.stringify({ action, code: code || undefined, args, requestId, expect: opts.expect }),
          });
          const body = await res.json().catch(() => null);
          if (body && typeof body.ok === 'boolean') return body.ok ? { ok: true, g: body.state, code: body.code } : body;
          last = `The server answered ${res.status}.`; if (res.status < 500) break;
        } catch (e) { last = 'Connection dropped. Retrying…'; }
        await sleep(400 * (attempt + 1));
      }
      return { ok: false, error: last, kind: 'network' };
    },
    inviteText(code) { return `Play HIDUP DI INDONESIA with me! ${location.origin}${location.pathname}?room=${code}`; },
    urlRoom: roomFromUrl,
    setUrlRoom(code) { try { const u = new URL(location.href); if (code) u.searchParams.set('room', code); else u.searchParams.delete('room'); history.replaceState(null, '', u.toString()); } catch (e) {} },
  };
}
