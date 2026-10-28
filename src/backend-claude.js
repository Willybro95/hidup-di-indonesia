// Backend for the claude.ai artifact: game documents in the artifact's shared database. Each action reads the
// latest state under a short lease, runs the rules in this browser, and writes the result back.
import { A, GameError, mkCode, mkId, rnd } from '../supabase/functions/_shared/engine.js';

export function claudeBackend({ inviteUrl, coll = 'cityGames' }) {
  let db = null, user = null, roomCap = null, me = null;
  const tabId = mkId(8), sleep = ms => new Promise(r => setTimeout(r, ms));
  async function tx(code, action, args, opts = {}) {
    const ref = db.doc(`${coll}/${code}`);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let got = false;
        for (let i = 0; i < 25; i++) { const r = await ref.acquire({ holder: tabId, ttlMs: 2500 }); if (r.acquired) { got = true; break; } await sleep(120 + rnd(240)); }
        if (!got) return { ok: false, error: 'The table is busy. Try again.', kind: 'busy' };
        const snap = await ref.get();
        let g = snap.exists ? JSON.parse(JSON.stringify(snap.data())) : {};
        if (opts.expect !== undefined && (g.v || 0) !== opts.expect) return { ok: false, error: 'stale', kind: 'stale' };
        if (action === 'create') { if (g.code && g.status !== 'closed') return { ok: false, error: 'taken', kind: 'taken' }; g = {}; A.create(g, me, ...args); }
        else { if (!g.code) return { ok: false, error: 'Room not found.', kind: 'missing' }; A[action](g, me, ...args); }
        g.v = (g.v || 0) + 1; g.at = Date.now(); g.by = me;
        await ref.set(g);
        return { ok: true, g, code };
      } catch (e) {
        if (e instanceof GameError) return { ok: false, error: e.message, kind: 'rule' };
        if (e && e.code === 'unavailable' && attempt === 0) { await sleep(400 + rnd(500)); continue; }
        if (e && e.code === 'invalid_argument') return { ok: false, error: 'You don’t have permission to play in this game.', kind: 'rule' };
        if (e && e.code === 'quota_exceeded') return { ok: false, error: 'Game storage is full. Ask the owner to clear old rooms.', kind: 'rule' };
        return { ok: false, error: 'Couldn’t reach the server. Try again.', kind: 'network' };
      }
    }
    return { ok: false, error: 'Couldn’t reach the server. Try again.', kind: 'network' };
  }
  return {
    kind: 'claude',
    ownerHint: 'You own this game. Invite friends from claude.ai’s Share menu with Editor access (or Contributor in your organization) so they can play.',
    shareHint: 'Friends open this game on claude.ai and enter the code. They need Editor or Contributor access to this artifact.',
    async init() {
      if (typeof claude === 'undefined' || !claude.use) return { fatal: 'nodb' };
      [db, user, roomCap] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('room')]);
      if (!db || !user) return { fatal: 'nodb' };
      me = await user.id(); if (!me) return { fatal: 'noid' };
      const canWrite = await user.can('data.write'), isOwner = await user.isOwner();
      let profile = {}; try { const s = await db.doc(`data/users/${me}/profile`).get(); if (s.exists) profile = s.data(); } catch (e) {}
      return { me, isOwner, profile, fatal: canWrite === false ? 'readonly' : null };
    },
    async saveProfile(p) { await db.doc(`data/users/${me}/profile`).set(p); },
    async peek(code) { const s = await db.doc(`${coll}/${code}`).get(); return s.exists ? s.data() : null; },
    subscribe(code, onState, onError) { return db.doc(`${coll}/${code}`).onSnapshot(s => onState(s.exists ? s.data() : null, { fromCache: s.metadata.fromCache }), e => { if (e.code !== 'revoked') onError(e); }); },
    async presence(code, onPeers, onConn) {
      if (!roomCap) return () => {};
      try {
        const r = await roomCap.join('city-' + code.toLowerCase()); await r.presence({ uid: me });
        r.onPeers(ch => onPeers(new Set(ch.peers.filter(p => p.kind === 'viewer').map(p => p.by || p.presence?.uid).filter(Boolean))));
        r.onConnection(onConn); onConn(r.connected());
        return () => { r.leave().catch(() => {}); };
      } catch (e) { return () => {}; }
    },
    async act(action, code, args, opts = {}) {
      if (action !== 'create') return tx(code, action, args, opts);
      for (let i = 0; i < 6; i++) { const c = mkCode(), r = await tx(c, 'create', [args[0], args[1], c, args[2]], opts); if (r.ok || r.kind !== 'taken') return r; }
      return { ok: false, error: 'Couldn’t create a unique room code. Try again.', kind: 'busy' };
    },
    inviteText(code) { return `Play HIDUP DI INDONESIA with me! Open ${inviteUrl} and enter room code ${code}.`; },
  };
}
