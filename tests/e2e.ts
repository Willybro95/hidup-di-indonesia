// End-to-end browser test of the real website.
// A small local stand-in for Supabase serves the built site and answers the few calls the site makes:
//   auth (guest sign-up), REST reads (run as the signed-in user, so the real RLS policies decide),
//   the game-action function (the real handler on the real SQL), and Realtime (Phoenix websocket:
//   postgres_changes pushes filtered by RLS, plus presence).
// Then three separate browser sessions play a full game, with a bot, a page reload and a double click.
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';
import { handleAction } from '../supabase/functions/_shared/handler.ts';
import { db, setup, newUser, asUser, exclusive } from './pg.ts';

const PORT = 54399, ORIGIN = `http://127.0.0.1:${PORT}`;
// Uses the project's Playwright if installed (npm i -D playwright && npx playwright install chromium), else PLAYWRIGHT_PATH.
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return createRequire(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/')('playwright'); } })();
const results: [boolean, string][] = [];
const ok = (c: unknown, m: string) => { results.push([!!c, m]); console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── auth ──
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokens = new Map<string, string>();
async function signup(existing?: string) {
  const id = existing || await newUser(), exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp, is_anonymous: true })}.sig`;
  tokens.set(token, id);
  const user = { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, email: '', app_metadata: {}, user_metadata: {}, identities: [], created_at: new Date().toISOString() };
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${id}`, user };
}
const userOf = (req: http.IncomingMessage) => tokens.get((req.headers.authorization || '').replace(/^Bearer\s+/i, '')) || null;

// ── REST: translate the site's PostgREST reads into SQL run as that user (RLS applies) ──
const TABLES: Record<string, string[]> = {
  profiles: ['id', 'nickname', 'avatar', 'updated_at'], game_rooms: ['code', 'status', 'version', 'state', 'updated_at', 'host_id'],
  game_players: ['room_code', 'user_id'], 
};
async function rest(uid: string, table: string, url: URL, method: string, body: string) {
  if (!TABLES[table]) return { status: 404, body: [] };
  if (method === 'POST' && table === 'profiles') {
    const p = JSON.parse(body);
    const r = await asUser(uid, `insert into public.profiles (id, nickname, avatar, updated_at) values ($1,$2,$3,now()) on conflict (id) do update set nickname = excluded.nickname, avatar = excluded.avatar`, [p.id, p.nickname, p.avatar]);
    return { status: r.error ? 403 : 201, body: r.error ? { message: r.error } : [] };
  }
  const select = url.searchParams.get('select') || '*';
  const where: string[] = [], params: unknown[] = [];
  for (const [k, v] of url.searchParams) {
    if (k === 'select' || k === 'limit') continue;
    if (!TABLES[table].includes(k) || !v.startsWith('eq.')) return { status: 400, body: { message: 'unsupported filter' } };
    params.push(v.slice(3)); where.push(`t.${k} = $${params.length}`);
  }
  const embed = select.match(/game_rooms\(([^)]*)\)/);
  const cols = select.replace(/,?game_rooms\([^)]*\)/, '').split(',').filter(Boolean).map(c => { if (!TABLES[table].includes(c)) throw new Error('bad col ' + c); return `t.${c}`; });
  let sql = `select ${cols.join(', ')}`;
  if (embed) sql += `, (select row_to_json(x) from (select ${embed[1].split(',').map(c => `r.${c}`).join(', ')} from public.game_rooms r where r.code = t.room_code) x) as game_rooms`;
  sql += ` from public.${table} t${where.length ? ' where ' + where.join(' and ') : ''}`;
  const r = await asUser(uid, sql, params);
  return { status: r.error ? 400 : 200, body: r.error ? { message: r.error } : r.rows };
}

// ── Realtime (Phoenix protocol, vsn 1.0.0) ──
interface Sub { ws: WebSocket; topic: string; uid: string; code: string; changeId: number; joinRef: string; presenceKey: string }
const subs: Sub[] = [];
const presence = new Map<string, Map<string, { ws: WebSocket; meta: unknown }>>(); // topic → key → socket
const send = (ws: WebSocket, m: unknown) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
function presenceState(topic: string) {
  const out: Record<string, { metas: unknown[] }> = {};
  for (const [k, v] of presence.get(topic) || []) out[k] = { metas: [{ phx_ref: k, ...(v.meta as object) }] };
  return out;
}
function broadcastPresence(topic: string, joins: Record<string, unknown>, leaves: Record<string, unknown>) {
  for (const s of subs.filter(x => x.topic === topic)) send(s.ws, { topic, event: 'presence_diff', payload: { joins, leaves }, ref: null });
}
async function pushRoomChange(code: string) {
  const row = (await exclusive(() => db.query<any>('select code, status, version, state, host_id, updated_at from public.game_rooms where code = $1', [code]))).rows[0];
  for (const s of subs.filter(x => x.code === code)) {
    const allowed = (await asUser(s.uid, 'select public.is_room_member($1) as m', [code])).rows[0]?.m; // Realtime applies RLS per subscriber
    if (!allowed) continue;
    send(s.ws, { topic: s.topic, event: 'postgres_changes', ref: null, payload: { ids: [s.changeId], data: { type: 'UPDATE', schema: 'public', table: 'game_rooms', commit_timestamp: new Date().toISOString(), record: row, old_record: {}, columns: [], errors: null } } });
  }
}

// ── HTTP ──
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', ORIGIN);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  const reply = (status: number, body: unknown, extra: Record<string, string> = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...cors, ...extra }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  let body = ''; for await (const ch of req) body += ch;
  try {
    if (url.pathname === '/auth/v1/signup') return reply(200, await signup());
    if (url.pathname === '/auth/v1/logout') return reply(204, {});
    if (url.pathname === '/auth/v1/user') { const uid = userOf(req); return uid ? reply(200, (await signup(uid)).user) : reply(401, { message: 'no auth' }); }
    if (url.pathname === '/auth/v1/token') { const rt = JSON.parse(body || '{}').refresh_token || ''; return rt.startsWith('r-') ? reply(200, await signup(rt.slice(2))) : reply(400, { message: 'bad token' }); }
    if (url.pathname.startsWith('/auth/')) { console.log('unhandled auth call', url.pathname); return reply(404, { message: 'not found' }); }
    if (url.pathname.startsWith('/rest/v1/')) {
      const uid = userOf(req); if (!uid) return reply(401, { message: 'no auth' });
      const r = await rest(uid, url.pathname.slice(9), url, req.method || 'GET', body);
      return reply(r.status, r.body, { 'Content-Range': `0-${Array.isArray(r.body) ? r.body.length : 0}/*` });
    }
    if (url.pathname === '/functions/v1/game-action') {
      const uid = userOf(req); if (!uid) return reply(401, { ok: false, error: 'auth', kind: 'input' });
      const parsed = JSON.parse(body);
      calls.push(parsed.action);
      const r = await handleAction(serverStore(), uid, parsed);
      if (r.ok && !r.duplicate) await pushRoomChange(r.code);
      return reply(200, r);
    }
    // static site
    let f = join('dist', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!existsSync(f) || statSync(f).isDirectory()) f = join('dist', 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
  } catch (e) { console.error('mock error', e); reply(500, { message: String(e) }); }
});
const calls: string[] = [];
let storeRef: any = null;
const serverStore = () => storeRef;

const wss = new WebSocketServer({ server, path: '/realtime/v1/websocket' });
wss.on('connection', (ws, req) => {
  const params = new URL(req.url || '', ORIGIN).searchParams; void params;
  ws.on('message', async raw => {
    const m = JSON.parse(String(raw));
    const { topic, event, payload, ref, join_ref } = m;
    if (topic === 'phoenix' && event === 'heartbeat') return send(ws, { topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref });
    if (event === 'access_token') return;
    if (event === 'phx_join') {
      const uid = tokens.get(payload.access_token) || '';
      const cfg = payload.config || {}, pc = (cfg.postgres_changes || [])[0];
      const code = pc?.filter?.replace('code=eq.', '') || '';
      const sub: Sub = { ws, topic, uid, code, changeId: Math.floor(Math.random() * 1e6), joinRef: join_ref || ref, presenceKey: cfg.presence?.key || uid };
      subs.push(sub);
      send(ws, { topic, event: 'phx_reply', ref, join_ref, payload: { status: 'ok', response: { postgres_changes: pc ? [{ id: sub.changeId, event: pc.event, schema: pc.schema, table: pc.table, filter: pc.filter }] : [] } } });
      send(ws, { topic, event: 'system', ref: null, payload: { status: 'ok', message: 'Subscribed to PostgreSQL', extension: 'postgres_changes', channel: topic.replace('realtime:', '') } });
      send(ws, { topic, event: 'presence_state', ref: null, payload: presenceState(topic) });
      return;
    }
    if (event === 'presence' && payload?.event === 'track') {
      const sub = subs.find(s => s.ws === ws && s.topic === topic); if (!sub) return;
      if (!presence.has(topic)) presence.set(topic, new Map());
      presence.get(topic)!.set(sub.presenceKey, { ws, meta: payload.payload });
      send(ws, { topic, event: 'phx_reply', ref, payload: { status: 'ok', response: {} } });
      broadcastPresence(topic, { [sub.presenceKey]: { metas: [{ phx_ref: sub.presenceKey, ...payload.payload }] } }, {});
      return;
    }
    if (event === 'phx_leave') { drop(ws, topic); return send(ws, { topic, event: 'phx_reply', ref, payload: { status: 'ok', response: {} } }); }
    send(ws, { topic, event: 'phx_reply', ref, payload: { status: 'ok', response: {} } });
  });
  ws.on('close', () => { for (const t of new Set(subs.filter(s => s.ws === ws).map(s => s.topic))) drop(ws, t); });
});
function drop(ws: WebSocket, topic: string) {
  for (let i = subs.length - 1; i >= 0; i--) if (subs[i].ws === ws && subs[i].topic === topic) subs.splice(i, 1);
  const pm = presence.get(topic); if (!pm) return;
  for (const [k, v] of pm) if (v.ws === ws) { pm.delete(k); broadcastPresence(topic, {}, { [k]: { metas: [{ phx_ref: k }] } }); }
}

// ── the test ──
async function main() {
  const { store } = await import('./pg.ts'); storeRef = store;
  await setup();
  mkdirSync('tests/screens', { recursive: true });
  execSync('npx vite build --logLevel error', { env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'test-anon-key' }, stdio: 'inherit' });
  await new Promise<void>(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors: string[] = [];
  async function player(name: string, mobile = false) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m: any) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    return { name, ctx, page };
  }
  const A = await player('Budi'), B = await player('Sari', true), C = await player('Andi');
  const code = async () => (await A.page.locator('.codebig').textContent())!.trim();

  // A: signs in as a guest automatically, creates a room
  await A.page.goto(ORIGIN + '/');
  await A.page.locator('#nick').fill('Budi');
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  await A.page.locator('.codebig').waitFor({ timeout: 10000 });
  const C0 = await code();
  ok(/^[A-Z0-9]{5}$/.test(C0), `guest signs in and creates room ${C0}`);
  ok(new URL(A.page.url()).searchParams.get('room') === C0, 'address bar carries the room code');

  // B: opens the invite link on a phone-sized screen
  await B.page.goto(`${ORIGIN}/?room=${C0}`);
  await B.page.locator('#joincode').waitFor({ timeout: 10000 });
  await B.page.waitForFunction((c: string) => (document.querySelector('#joincode') as HTMLInputElement)?.value === c, C0, { timeout: 10000 });
  ok(true, 'invite link pre-fills the room code');
  await B.page.locator('#nick').fill('Sari');
  await B.page.getByRole('button', { name: 'Join', exact: true }).click();
  await B.page.locator('.codebig').waitFor({ timeout: 10000 });
  await A.page.getByText('Sari').first().waitFor({ timeout: 10000 });
  ok(true, 'second player joins from invite link; host sees them live');

  // C: joins by typing the code
  await C.page.goto(ORIGIN + '/');
  await C.page.locator('#nick').fill('Andi');
  await C.page.locator('#joincode').fill(C0);
  await C.page.getByRole('button', { name: 'Join', exact: true }).click();
  await C.page.locator('.codebig').waitFor({ timeout: 10000 });
  await A.page.waitForFunction(() => document.querySelectorAll('.pitem .nm').length === 3, null, { timeout: 10000 });
  ok(true, 'third player joins by code before the start');
  await A.page.waitForFunction(() => [...document.querySelectorAll('.pitem')].filter(e => e.textContent!.includes('Online')).length === 3, null, { timeout: 10000 });
  ok(true, 'presence shows all three players online');

  // host adds a bot, sets 10 rounds; everyone readies; only host can start
  await A.page.getByRole('button', { name: '🤖 Add a bot' }).click();
  await B.page.waitForFunction(() => document.querySelectorAll('.pitem .nm').length === 4, null, { timeout: 10000 });
  ok(true, 'host adds a bot; other players see it');
  await A.page.locator('[data-act="rounds"][data-v="10"]').click();
  ok(await B.page.getByRole('button', { name: 'Start game' }).count() === 0, 'non-host has no start button');
  for (const P of [A, B, C]) await P.page.locator('[data-act="ready"]').click();
  await A.page.waitForFunction(() => { const b = document.querySelector('[data-act="start"]') as HTMLButtonElement | null; return b && !b.disabled; }, null, { timeout: 10000 });
  await A.page.locator('[data-act="start"]').click();

  // job draft: each human picks one of their offers
  for (const P of [A, B, C]) await P.page.locator('.jobcard').first().waitFor({ timeout: 10000 });
  ok(await B.page.locator('.jobcard').count() === 4, 'each player is offered 4 jobs');
  await B.page.screenshot({ path: 'tests/screens/phone-jobs.png' });
  for (const P of [A, B, C]) await P.page.locator('[data-act="pickJob"]').nth(1).click();
  for (const P of [A, B, C]) await P.page.locator('#stage').waitFor({ timeout: 15000 });
  ok(true, 'after everyone picks a job, every browser shows the board');
  await sleep(1500);
  await A.page.screenshot({ path: 'tests/screens/desktop-board.png' });
  ok(await B.page.evaluate(() => window.scrollY) === 0, 'game screen opens at the top on phones');
  await B.page.screenshot({ path: 'tests/screens/phone-board.png' });
  const bW = await B.page.evaluate(() => {
    const wide = [...document.querySelectorAll('body *')].map(e => [e, e.getBoundingClientRect()] as const).filter(([e, r]) => r.right > 391 && !(e as HTMLElement).closest('.toast')).slice(0, 6).map(([e, r]) => `${e.tagName}.${(e as HTMLElement).className}:${Math.round(r.right)}`);
    return { iw: window.innerWidth, sw: document.documentElement.scrollWidth, wide };
  });
  ok(bW.iw === 390 && bW.sw <= 390, `phone layout fits 390px without sideways scroll (${JSON.stringify(bW)})`);

  // the test browsers render WebGL in software, which is too slow for three pages at once: play the long game on the 2D board
  for (const P of [A, B, C]) { await P.page.locator('[data-act="toggleView"]').click({ force: true }); await P.page.locator('.board2d-svg').waitFor({ timeout: 20000 }); }
  ok(true, 'switching between the 3D and 2D board works');
  // play until the end, with a double-click test and a reload in the middle
  const players = [A, B, C];
  let doubleTested = false, reloaded = false, steps = 0;
  const room = async () => (await exclusive(() => db.query<any>('select state, version from public.game_rooms where code = $1', [C0]))).rows[0];
  const vis = async (l: any) => await l.isVisible().catch(() => false) && await l.isEnabled().catch(() => false);
  const t0 = Date.now(); let endErr = false, lastVer = 0, lastChange = Date.now(), dumped = false;
  while (Date.now() - t0 < 480000) {
    const { state: g, version: ver } = await room();
    if (g.status !== 'playing') break;
    if (ver !== lastVer) { lastVer = ver; lastChange = Date.now(); }
    else if (Date.now() - lastChange > 12000 && !dumped) {
      dumped = true; const cu = g.order[g.turnIdx], PP = players.find(p => p.name === g.ps[cu].nick);
      console.log('STUCK', JSON.stringify({ cur: g.ps[cu].nick, bot: g.ps[cu].bot, phase: g.phase, q: g.q, status: g.status }), 'calls:', calls.slice(-8).join(','));
      if (PP) { await PP.page.screenshot({ path: 'tests/screens/debug-stuck.png' }); console.log('BUTTONS', await PP.page.evaluate(() => [...document.querySelectorAll('button[data-act]')].filter(b => (b as HTMLElement).offsetParent).map(b => `${b.getAttribute('data-act')}${(b as HTMLButtonElement).disabled ? '(off)' : ''}`).join(' '))); } else await A.page.screenshot({ path: 'tests/screens/debug-stuck.png' });
    }
    const cur = g.order[g.turnIdx];
    if (g.ps[cur].bot) { await sleep(200); continue; } // the host's page plays bots
    const P = players.find(p => p.name === g.ps[cur].nick)!;
    const pg = P.page;
    if (!reloaded && steps > 6 && P === B) {
      const tr = Date.now(); await pg.reload(); await pg.locator('#stage').waitFor({ timeout: 30000 }).then(() => console.log('reload took', Date.now() - tr, 'ms')).catch(async (e: Error) => { await pg.screenshot({ path: 'tests/screens/debug-reload.png' }); console.log('URL', pg.url(), errors); throw e; });
      ok(true, 'reloading the page mid-game restores the board'); reloaded = true; continue;
    }
    const roll = pg.locator('[data-act="roll"]').first();
    const opt = pg.locator('.opt[data-act="resolve"]:not([disabled])').first();
    const bk = pg.locator('.opt[data-act="bkAsk"]:not([disabled])').first();
    const bkYes = pg.locator('[data-act="bkYes"]');
    const end = pg.locator('[data-act="end"]');
    const open = pg.locator('[data-act="openPending"]');
    if (await vis(roll)) {
      const before = g.log.filter((e: any) => e.t.startsWith('Rolled')).length;
      if (!doubleTested) { const bb = await roll.boundingBox(); if (!bb) { await sleep(200); continue; } await pg.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2); } else await roll.click({ timeout: 3000, force: true }).catch(() => {});
      await sleep(900);
      if (!doubleTested) { for (let w = 0; w < 20 && (await room()).state.log.filter((e: any) => e.t.startsWith('Rolled')).length === before; w++) await sleep(200); await sleep(800); const after = (await room()).state.log.filter((e: any) => e.t.startsWith('Rolled')).length; ok(after - before === 1, `double-clicking the dice rolls once (${after - before})`); if (after - before !== 1) await pg.screenshot({ path: 'tests/screens/debug-dbl.png' }); doubleTested = true; }
      steps++; continue;
    }
    if (await vis(bkYes)) { await bkYes.click({ timeout: 3000, force: true }).catch(() => {}); await sleep(400); continue; }
    if (await opt.isVisible().catch(() => false)) { await opt.click({ timeout: 8000, force: true }).catch(() => {}); await sleep(400); steps++; continue; }
    if (await bk.isVisible().catch(() => false)) { await bk.click({ timeout: 3000, force: true }).catch(() => {}); await sleep(300); continue; }
    if (await vis(open)) { await open.click({ timeout: 3000, force: true }).catch(() => {}); await sleep(200); continue; }
    if (await vis(end)) { await end.click({ timeout: 3000, force: true }).catch((e: Error) => { if (!endErr) { endErr = true; console.log('END CLICK', P.name, String(e.message).split('\n').slice(0, 12).join(' | ')); } }); await sleep(400); steps++; continue; }
    await sleep(250);
  }
  const fin = (await room()).state;
  ok(fin.status === 'ended', `game played to the end through the UI (${fin.turnNo} turns, ${Math.round((Date.now() - t0) / 1000)}s)`);
  ok(fin.order.filter((id: string) => fin.ps[id].bot).every((id: string) => fin.log.some((e: any) => e.p === id && e.t.startsWith('Rolled'))), 'the bot took its turns automatically');
  for (const P of players) await P.page.locator('.podium').waitFor({ timeout: 15000 });
  ok(await C.page.locator('.rank').count() === 4, 'every browser shows the final ranking with titles');
  await A.page.screenshot({ path: 'tests/screens/results.png', fullPage: true });
  await A.page.locator('[data-act="rematch"]').click();
  for (const P of players) await P.page.locator('.codebig').waitFor({ timeout: 10000 });
  ok(true, 'rematch brings every browser back to the lobby');

  // an outsider cannot open the room
  const D = await player('Outsider');
  await D.page.goto(`${ORIGIN}/?room=${C0}`);
  await D.page.waitForFunction((c: string) => (document.querySelector('#joincode') as HTMLInputElement)?.value === c, C0, { timeout: 10000 });
  await sleep(1000);
  ok(await D.page.locator('.codebig').count() === 0, 'a non-member with the link lands on the join screen, not inside the room');

  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close(); wss.close();
  const pass = results.filter(r => r[0]).length;
  console.log(`\nbrowser e2e: ${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
