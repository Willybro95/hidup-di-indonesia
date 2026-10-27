// Runs the real migrations in an embedded Postgres (PGlite) with Supabase's roles and auth.uid() emulated,
// then drives the real server handler against it. Covers RLS, idempotency, races, validation and full games.
import { randomUUID } from 'node:crypto';
import { handleAction } from '../supabase/functions/_shared/handler.ts';
import { optionsFor, CHAT_PRESETS } from '../supabase/functions/_shared/engine.js';
import { db, setup, newUser, asUser, store } from './pg.ts';

const results: [boolean, string][] = [];
const ok = (c: unknown, m: string) => { results.push([!!c, m]); if (!c) console.log('  FAIL:', m); };
const act = (uid: string, action: string, args: unknown[] = [], extra: Record<string, unknown> = {}) =>
  handleAction(store, uid, { action, args, requestId: randomUUID(), ...extra });

async function main() {
  await setup();
  ok(true, 'migrations apply cleanly on Postgres');
  const cards = await db.query<any>('select count(*)::int as n from public.card_definitions');
  ok(cards.rows[0].n === 141, `reference cards seeded (${cards.rows[0].n})`);

  const [u1, u2, u3, outsider] = [await newUser(), await newUser(), await newUser(), await newUser()];

  // ── rooms ──
  const c = await act(u1, 'create', ['Budi', 3, 0]);
  ok(c.ok && /^[A-Z0-9]{5}$/.test((c as any).code) && (c as any).state.code === (c as any).code, 'host creates a room; server picks the code');
  const code = (c as any).code as string;
  ok((await act(u2, 'join', ['Sari', 1], { code })).ok, 'second player joins by code');
  ok((await act(u3, 'join', ['  Andi\u0000<b>  ', 2], { code })).ok, 'third player joins before start');
  const st = (await store.loadRoom(code))!.state;
  ok(st.players.find(p => p.id === u3)!.nick === 'Andi<b>', 'nickname control characters stripped server-side');

  // ── RLS ──
  ok((await asUser(u2, 'select code from public.game_rooms where code = $1', [code])).rows.length === 1, 'member can read the room');
  ok((await asUser(outsider, 'select code from public.game_rooms where code = $1', [code])).rows.length === 0, 'non-member cannot read the room (RLS)');
  ok((await asUser(outsider, 'select * from public.game_players')).rows.length === 0, 'non-member cannot read the roster');
  const upd = await asUser(u1, `update public.game_rooms set state = jsonb_set(state, '{v}', '999') where code = $1`, [code]);
  ok(!!upd.error, 'browser cannot update a room directly');
  const ins = await asUser(outsider, 'insert into public.game_players (room_code, user_id) values ($1, $2)', [code, outsider]);
  ok(!!ins.error, 'browser cannot add itself to a room');
  const rpc = await asUser(u1, `select public.apply_game_action('${code}', 1, '{}'::jsonb, '{}'::jsonb, 'lobby', null, '${u1}', '${randomUUID()}', 'x', '[]'::jsonb)`);
  ok(!!rpc.error, 'browser cannot call the write function');
  const priv = await asUser(u1, 'select * from public.game_private');
  ok(!!priv.error || priv.rows.length === 0, 'private deck state invisible to browsers');
  ok((await asUser(outsider, 'select id from public.card_definitions limit 1')).rows.length === 1, 'card definitions readable');

  // ── validation ──
  ok(!(await act(u1, 'setCash', [1e9], { code })).ok, 'unknown action refused');
  ok(!(await act(u1, 'roll', [{ dice: [6, 6] }], { code })).ok, 'client-supplied dice refused');
  ok(!(await act(u1, 'rounds', [999], { code })).ok, 'invalid rounds refused');
  ok(!(await handleAction(store, u1, { action: 'roll', code, requestId: 'nope' })).ok, 'malformed request id refused');
  ok(!(await act(outsider, 'chat', [0], { code })).ok, 'non-member cannot act in a room');

  // ── start ──
  ok(!(await act(u1, 'start', [], { code })).ok, 'start refused until everyone is ready');
  ok(!(await act(u2, 'rounds', [8], { code })).ok, 'only the host changes settings');
  await act(u1, 'rounds', [8], { code });
  for (const u of [u1, u2, u3]) await act(u, 'ready', [true], { code });
  ok(!(await act(u2, 'start', [], { code })).ok, 'only the host can start');
  const s = await act(u1, 'start', [], { code });
  ok(s.ok && (s as any).state.status === 'playing', 'host starts the game');
  ok(!('decks' in (s as any).state), 'returned state carries no deck order');
  const pr = await store.loadRoom(code);
  ok(pr!.priv && Object.keys(pr!.priv).length > 0 && !('decks' in pr!.state), 'deck order kept server-side only');
  const mine = await asUser(u2, 'select player_id, goal_key from public.player_secrets');
  ok(mine.rows.length === 1 && mine.rows[0].player_id === u2, 'each player reads only their own secret goal');
  ok(!JSON.stringify(pr!.state).includes(mine.rows[0].goal_key + '"') || !pr!.state.reveals || Object.keys(pr!.state.reveals).length === 0, 'goals not exposed in public state during play');
  ok(!(await act(outsider, 'join', ['Telat', 0], { code })).ok, 'late joiner refused once the game runs');

  // ── turns, duplicates, races ──
  let g = (await store.loadRoom(code))!.state;
  const cur = g.order![g.turnIdx!], other = g.order!.find(x => x !== cur)!;
  ok(!(await act(other, 'roll', [], { code })).ok, 'only the active player can roll');
  const rid = randomUUID();
  const r1 = await handleAction(store, cur, { action: 'roll', code, requestId: rid });
  const cashAfter = JSON.stringify((await store.loadRoom(code))!.state.ps);
  const r2 = await handleAction(store, cur, { action: 'roll', code, requestId: rid });
  ok(r1.ok && r2.ok && (r2 as any).duplicate === true, 'repeated request is acknowledged as a duplicate');
  ok(JSON.stringify((await store.loadRoom(code))!.state.ps) === cashAfter, 'duplicate request changed no balances');
  const rolls = (await store.loadRoom(code))!.state.log.filter(e => e.t.startsWith('Kocok')).length;
  ok(rolls === 1, 'dice rolled exactly once');

  // finish this turn, then race two different roll requests on the next one
  async function finishTurn(uid: string) {
    for (let i = 0; i < 40; i++) {
      const gg = (await store.loadRoom(code))!.state;
      if (gg.status !== 'playing' || gg.order![gg.turnIdx!] !== uid) return;
      if (gg.phase === 'act') { const opts = optionsFor(gg, uid, gg.q![0]); const idx = opts.findIndex(o => o.ok); await act(uid, 'resolve', [idx], { code }); }
      else if (gg.phase === 'end') { await act(uid, 'end', [], { code }); return; }
      else if (gg.phase === 'roll') await act(uid, 'roll', [], { code });
    }
  }
  await finishTurn(cur);
  g = (await store.loadRoom(code))!.state;
  const nx = g.order![g.turnIdx!], tn = g.turnNo;
  const [a, b] = await Promise.all([act(nx, 'roll', [], { code }), act(nx, 'roll', [], { code })]);
  const g2 = (await store.loadRoom(code))!.state;
  ok([a, b].filter(x => x.ok).length === 1 && g2.log.filter(e => e.t.startsWith('Kocok') && e.p === nx && e.n === tn).length === 1, 'two simultaneous rolls: exactly one applied');
  const same = randomUUID();
  await finishTurn(nx);
  g = (await store.loadRoom(code))!.state;
  const nx2 = g.order![g.turnIdx!], v0 = (await store.loadRoom(code))!.version;
  const [d1, d2] = await Promise.all([1, 2].map(() => handleAction(store, nx2, { action: 'roll', code, requestId: same })));
  const v1 = (await store.loadRoom(code))!.version;
  ok(d1.ok && d2.ok && v1 === v0 + 1, 'same request sent twice at once: applied once');
  const actions = await db.query<any>('select count(*)::int as n from public.game_actions where request_id = $1', [same]);
  ok(actions.rows[0].n === 1, 'action log holds one row per request');

  // ── play to the end ──
  let guard = 0;
  while ((await store.loadRoom(code))!.state.status === 'playing' && guard++ < 3000) {
    const gg = (await store.loadRoom(code))!.state, u = gg.order![gg.turnIdx!];
    if (gg.phase === 'roll') await act(u, 'roll', [], { code });
    else if (gg.phase === 'act') { const opts = optionsFor(gg, u, gg.q![0]); const okIdx = opts.map((o, i) => o.ok ? i : -1).filter(i => i >= 0); await act(u, 'resolve', [okIdx[Math.floor(Math.random() * okIdx.length)]], { code }); }
    else await act(u, 'end', [], { code });
    const ps = Object.values(gg.ps!);
    if (!ps.every(p => Number.isInteger(p.cash) && p.cash >= 0 && Number.isInteger(p.debt) && p.debt >= 0)) { ok(false, 'balance invariant broken'); break; }
  }
  const fin = (await store.loadRoom(code))!.state;
  ok(fin.status === 'ended', `game reached the end (${fin.turnNo} turns)`);
  ok(Object.keys(fin.reveals || {}).length === 3, 'all secret goals revealed at the end');

  // ── rematch ──
  const rm = await act(u1, 'rematch', [], { code });
  const rg = (await store.loadRoom(code))!.state;
  ok(rm.ok && rg.status === 'lobby' && !rg.ps && rg.log.length === 0 && rg.players.every(p => !p.ready), 'rematch resets to a clean lobby');
  ok(rg.gameId !== fin.gameId, 'rematch gets a new game id');
  ok((await act(u1, 'kick', [u3], { code })).ok, 'host kicks a player in the lobby');
  ok((await asUser(u3, 'select code from public.game_rooms where code = $1', [code])).rows.length === 0, 'kicked player loses read access');

  // ── bots ──
  const bc = await act(u2, 'create', ['Sari', 1, 3]);
  const bcode = (bc as any).code;
  await act(u2, 'rounds', [8], { code: bcode }); await act(u2, 'ready', [true], { code: bcode });
  const bs = await act(u2, 'start', [], { code: bcode });
  if (!bs.ok) console.log('   start reply:', JSON.stringify(bs), JSON.stringify((await store.loadRoom(bcode))?.state.players));
  ok(bs.ok, 'solo game with 3 bots starts');
  const botSecrets = await db.query<any>('select count(*)::int as n from public.player_secrets where room_code = $1 and user_id is null', [bcode]);
  ok(botSecrets.rows[0].n === 3, 'bot goals stored server-side');
  guard = 0;
  while ((await store.loadRoom(bcode))!.state.status === 'playing' && guard++ < 3000) {
    const room = (await store.loadRoom(bcode))!, gg = room.state, u = gg.order![gg.turnIdx!];
    if (gg.ps![u].bot) {
      const stale = await act(u2, 'botStep', [], { code: bcode, expect: room.version - 1 });
      if (guard === 1) ok(!stale.ok && (stale as any).kind === 'stale', 'bot step with an old version is ignored');
      await act(u2, 'botStep', [], { code: bcode, expect: room.version });
    } else if (gg.phase === 'roll') await act(u2, 'roll', [], { code: bcode });
    else if (gg.phase === 'act') { const opts = optionsFor(gg, u, gg.q![0]); await act(u2, 'resolve', [opts.findIndex(o => o.ok)], { code: bcode }); }
    else await act(u2, 'end', [], { code: bcode });
  }
  const bfin = (await store.loadRoom(bcode))!.state;
  ok(bfin.status === 'ended' && Object.keys(bfin.reveals || {}).length === 4, 'game vs bots finishes with all goals revealed');
  ok(!(await act(u2, 'botStep', [], { code: bcode })).ok, 'bot step refused when it is not a bot turn');

  const pass = results.filter(r => r[0]).length;
  console.log(`\nserver tests: ${pass}/${results.length} passed`);
  for (const [p, m] of results) console.log(`${p ? 'PASS' : 'FAIL'}  ${m}`);
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
void CHAT_PRESETS;
