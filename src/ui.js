// ================= HIDUP DI INDONESIA · City Edition — client UI =================
// One UI for both builds. The server connection is a "backend" passed to startApp():
//   backend-claude.js   — claude.ai artifact storage (rules run in the browser under a short lease)
//   backend-supabase.js — the public website (rules run in the Supabase game-action function)
import {
  A, BOARD, GROUPS, SPACE_TYPES, CARDS, JOBS, TITLES, CHAT_PRESETS, AVATARS, PCOLORS, U,
  optionsFor, computeResults, netWorth, rentFor, rentTable, houseCost, buildCost, takeoverPrice, jamFee,
  canBuild, canSellHouse, canMortgage, unmortCost, mortValueFor, owned, cardMeta, isLegacy, nameOf, avOf, rp, rpShort,
} from '../supabase/functions/_shared/engine.js';
import { HexGeo, Board3D } from './board3d.js';

let BE = null;
const $app = () => document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const light = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };

const S = {
  me: null, isOwner: false,
  nick: ls.get('hdi.nick') || '', av: +(ls.get('hdi.av') || 0) || 0, joinCode: '',
  code: null, g: null, unsub: null, leavePresence: null, hasPresence: false, online: new Set(), roomConn: null, netOk: navigator.onLine !== false, fromCache: false,
  busy: false, toast: null, tab: 'players', modal: null, minimized: false, tileSel: null,
  anim: null, lastMoveK: null, lastRollK: null, lastCardK: null, lastTurnKey: null, sound: ls.get('hdi.sound') !== '0', view: ls.get('hdi.view') || '3d',
  booted: false, fatal: null, fatalMsg: '', screen: null, mounted3d: false,
};

// ---------- sound ----------
let actx = null;
function beep(f = 660, d = 0.08, type = 'square', vol = 0.05) { if (!S.sound) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), v = actx.createGain(); o.type = type; o.frequency.value = f; v.gain.value = vol; o.connect(v); v.connect(actx.destination); o.start(); v.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d); o.stop(actx.currentTime + d + 0.02); } catch (e) {} }

// ---------- boot ----------
export function startApp(backend) { BE = backend; boot(); }
async function boot() {
  render();
  let r;
  try { r = await BE.init(); } catch (e) { r = { fatal: 'auth', message: String(e && e.message || e) }; }
  S.me = r.me || null; S.isOwner = !!r.isOwner;
  if (r.fatal) { S.fatal = r.fatal; S.fatalMsg = r.message || ''; S.booted = true; render(); return; }
  const prof = r.profile || {};
  if (prof.nick) S.nick = prof.nick; if (Number.isInteger(prof.av)) S.av = prof.av;
  S.lastRoom = prof.lastCity || ls.get('hdi.city') || null;
  const linked = BE.urlRoom ? BE.urlRoom() : null; if (linked) S.joinCode = linked;
  S.booted = true; render();
  const want = linked || S.lastRoom;
  if (want) {
    let g = null; try { g = await BE.peek(want); } catch (e) {}
    if (g && g.code && g.status !== 'closed' && g.players?.some(p => p.id === S.me)) enterRoom(want);
    else if (want === S.lastRoom) S.lastRoom = null;
    S.forceFull = !S.code; render();
  }
}
window.addEventListener('online', () => { S.netOk = true; render(); if (S.code) subscribe(S.code); });
window.addEventListener('offline', () => { S.netOk = false; render(); });
async function saveProfile(extra = {}) {
  ls.set('hdi.nick', S.nick); ls.set('hdi.av', String(S.av)); if (extra.lastCity !== undefined) ls.set('hdi.city', extra.lastCity || '');
  try { await BE.saveProfile({ nick: S.nick, av: S.av, lastCity: extra.lastCity !== undefined ? extra.lastCity : (S.code || null) }); } catch (e) {}
}

// ---------- realtime ----------
function subscribe(code) {
  if (S.unsub) { S.unsub(); S.unsub = null; }
  S.unsub = BE.subscribe(code, (g, meta) => {
    S.fromCache = !!meta?.fromCache;
    if (!g || !g.code) { toast('Room not found.'); leaveLocal(); return; }
    if (S.g && S.g.code === g.code && S.g.gameId === g.gameId && (g.v || 0) < (S.g.v || 0)) return; // older than what we already show
    onGame(g);
  }, () => { S.netOk = false; render(); setTimeout(() => { if (S.code === code) { S.netOk = navigator.onLine !== false; subscribe(code); } }, 2500); });
}
async function joinPresence(code) {
  if (S.leavePresence) { S.leavePresence(); S.leavePresence = null; }
  S.leavePresence = await BE.presence(code, set => { S.online = set; S.hasPresence = true; renderParts(); }, ok => { S.roomConn = ok; renderParts(); });
}
function enterRoom(code) { S.code = code; S.g = null; S.lastMoveK = null; S.lastRollK = null; S.lastCardK = null; S.anim = null; S.modal = null; S.tileSel = null; subscribe(code); joinPresence(code); saveProfile({ lastCity: code }); if (BE.setUrlRoom) BE.setUrlRoom(code); render(); }
function leaveLocal() { if (S.unsub) { S.unsub(); S.unsub = null; } if (S.leavePresence) { S.leavePresence(); S.leavePresence = null; } S.code = null; S.g = null; S.online = new Set(); S.hasPresence = false; S.modal = null; if (BE.setUrlRoom) BE.setUrlRoom(null); render(); }

function onGame(g) {
  const prev = S.g, first = !prev || prev.gameId !== g.gameId; S.g = g;
  if (g.status === 'playing' && g.order && !isLegacy(g)) {
    const cur = g.order[g.turnIdx], key = g.turnNo + ':' + cur;
    if (key !== S.lastTurnKey) { const was = S.lastTurnKey; S.lastTurnKey = key; S.minimized = false; if (was && cur === S.me) { beep(523, .1); setTimeout(() => beep(784, .15), 110); toast('Your turn!'); } }
    const mv = g.move, newRoll = g.rollK && g.rollK !== S.lastRollK, newMove = mv && mv.k !== S.lastMoveK;
    const q0 = g.q?.[0], cardK = q0 && q0.k === 'card' ? `${g.actN}:${q0.id}` : null, newCard = cardK && cardK !== S.lastCardK;
    if (first || S.lastMoveK === null) { S.lastMoveK = mv?.k || ''; S.lastRollK = g.rollK || ''; S.lastCardK = cardK; }
    else if (newRoll || newMove || newCard) {
      S.lastRollK = g.rollK || S.lastRollK; S.lastMoveK = mv?.k || S.lastMoveK; if (cardK) S.lastCardK = cardK;
      queueAnim({ roll: newRoll ? g.dice : null, move: newMove ? mv : null, card: newCard ? CARDS[q0.id].deck : null });
    }
  }
  if (prev && prev.status === 'playing' && g.status === 'ended') beep(392, .25, 'triangle', .08);
  render();
  scheduleBot();
}

// ---------- animation queue (dice, the token's hops, then the card draw) ----------
const animQ = [];
function queueAnim(a) { animQ.push(a); if (!S.anim) runAnim(); }
async function runAnim() {
  while (animQ.length) {
    const a = animQ.shift(), mover = a.move?.p || S.g?.order?.[S.g.turnIdx], three = Board3D.ok && use3d();
    S.anim = { p: mover, phase: 'dice', dice: a.roll, path: a.move?.path || [], from: a.move?.from, step: -1 };
    if (three && (a.roll || a.move)) Board3D.hold(mover);
    renderParts();
    if (a.roll) { beep(300, .05); if (three) await Board3D.capped(Board3D.rollDice(a.roll), 2500); else await sleep(750); }
    if (a.move && a.move.path.length) {
      S.anim.phase = 'move';
      if (three) { await Board3D.capped(Board3D.animate(S.g, a.move), 1500 + a.move.path.length * 450); }
      else for (let k = 0; k < a.move.path.length; k++) { S.anim.step = k; beep(520 + k * 20, .03, 'square', .03); renderParts(); await sleep(a.move.jumps?.includes(k) ? 450 : 160); }
    }
    if (three) Board3D.hold(null);
    if (a.card) { S.anim.phase = 'card'; beep(700, .06, 'triangle', .05); if (three) await Board3D.capped(Board3D.drawCard(a.card), 3500); else await sleep(250); }
    await sleep(200);
  }
  S.anim = null; renderParts(); scheduleBot();
}
const use3d = () => S.view === '3d';
function shownPos(g, pid) {
  const a = S.anim; if (!a || a.p !== pid) return g.ps[pid].pos;
  if (a.phase === 'card') return g.ps[pid].pos;
  if (a.phase === 'dice' || a.step < 0) return a.from ?? g.ps[pid].pos;
  return a.path[a.step];
}

// ---------- committing actions through the backend ----------
const isBusy = () => S.busy;
async function commit(action, args = [], opts = {}) {
  if (isBusy() && !opts.silent) return false;
  if (!S.netOk) { if (!opts.silent) toast('You’re offline. Wait for the connection to return.'); return false; }
  if (!opts.silent) { S.busy = true; renderParts(); }
  try {
    const code = opts.code !== undefined ? opts.code : S.code;
    const r = await BE.act(action, code, args, { expect: opts.expect, me: S.me });
    if (r.ok) {
      S.lastResult = r;
      if (r.g && code && code === S.code && (!S.g || r.g.gameId !== S.g.gameId || (r.g.v || 0) > (S.g.v || 0))) onGame(r.g);
      return true;
    }
    if (r.kind !== 'stale' && !opts.silent) toast(r.error || 'Something went wrong. Try again.');
    return false;
  } catch (e) {
    if (!opts.silent) toast('Couldn’t reach the server. Try again.');
    return false;
  } finally { if (!opts.silent) { S.busy = false; renderParts(); } }
}

// ---------- bots: the host's page plays them; another player's page takes over if the host is offline ----------
let botTimer = null;
const isBot = id => !!(S.g?.ps?.[id]?.bot || S.g?.players?.find(p => p.id === id)?.bot);
const online = id => isBot(id) ? true : S.hasPresence ? S.online.has(id) : null;
function botDriver() {
  const g = S.g; if (!g || g.status !== 'playing') return false;
  if (g.hostId === S.me) return true;
  if (online(g.hostId) !== false) return false;
  return g.order.filter(id => !g.ps[id].bot && !g.ps[id].out).find(id => online(id)) === S.me;
}
function scheduleBot() {
  if (botTimer) return;
  const g = S.g, cur = g?.order?.[g.turnIdx]; if (!g || g.status !== 'playing' || isLegacy(g) || !g.ps[cur]?.bot || !botDriver()) return;
  botTimer = setTimeout(async () => {
    botTimer = null;
    if (S.anim || isBusy()) { scheduleBot(); return; }
    const g2 = S.g, c2 = g2?.order?.[g2.turnIdx]; if (!g2 || g2.status !== 'playing' || !g2.ps[c2]?.bot || !botDriver()) return;
    await commit('botStep', [], { silent: true, expect: g2.v });
    setTimeout(scheduleBot, 300);
  }, S.g.phase === 'act' ? 1400 : 800);
}

// ---------- toast ----------
let toastT = null;
function toast(m) { S.toast = m; renderOverlays(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = null; renderOverlays(); }, 3400); }

// ---------- helpers ----------
const isHost = () => S.g && S.g.hostId === S.me;
const curId = () => S.g?.order?.[S.g.turnIdx];
const myTurn = () => S.g?.status === 'playing' && curId() === S.me;
const pCol = (g, id) => PCOLORS[(g.ps?.[id]?.col ?? Math.max(0, g.players.findIndex(p => p.id === id))) % PCOLORS.length];
function avHtml(av, cls = '', bg) { return `<span class="av ${cls}" style="background:${bg || 'var(--surface2)'}">${AVATARS[av] || AVATARS[0]}</span>`; }
function connChip() { const ok = S.netOk && S.roomConn !== false, lab = ok ? (S.fromCache ? 'Syncing…' : 'Online') : 'Offline'; return `<span class="chip" title="Connection: ${lab}"><span class="dot ${ok ? 'on' : 'off'}"></span><span class="conn-label">${lab}</span></span>`; }
function dieHtml(n, spin, red) { const on = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n] || []; let s = ''; for (let i = 1; i <= 9; i++) s += `<i class="${on.includes(i) ? 'on' : ''}"></i>`; return `<div class="die ${spin ? 'spin' : ''} ${red ? 'red' : ''}" aria-label="Die ${n}">${s}</div>`; }
const groupName = s => s.t === 'city' ? GROUPS[s.g].name : SPACE_TYPES[s.t].lab;
const bandColor = s => s.t === 'city' ? GROUPS[s.g].color : ({ transport: '#4F6D8F', utility: '#2FB3A3', event: '#5CC07A', reality: '#E9566B', tax: '#9AA7B0', start: '#FFBE1A', jam: '#F28A45', rest: '#A6D96A', gojam: '#E2453D', market: '#F6A63B', arisan: '#9B6BD6' })[s.t];
const jobOf = (g, id) => JOBS[g.ps?.[id]?.job];
const jobChip = (g, id) => { const j = jobOf(g, id); return j ? `<span class="chip" title="${esc(j.name)}">${j.ic} ${esc(j.name)}</span>` : ''; };

// ---------- render: screen skeleton once, parts on every change ----------
function screenOf() {
  if (!S.booted) return 'boot'; if (S.fatal) return 'fatal';
  if (S.code) { if (!S.g) return 'loading'; if (isLegacy(S.g)) return 'legacy'; return { lobby: 'lobby', jobs: 'jobs', playing: 'game', ended: 'results' }[S.g.status] || 'home'; }
  return 'home';
}
function render() {
  const screen = screenOf();
  if (screen !== S.screen || S.forceFull) {
    S.forceFull = false;
    if (S.screen === 'game' && screen !== 'game') { Board3D.destroy(); S.mounted3d = false; }
    S.screen = screen;
    let body = '';
    if (screen === 'boot') body = `<div class="wrap"><div class="empty"><span class="spinner"></span> Setting up the table…</div></div>`;
    else if (screen === 'fatal') body = fatalView();
    else if (screen === 'loading') body = `<div class="wrap"><div class="empty"><span class="spinner"></span> Entering room <b>${esc(S.code)}</b>…</div></div>`;
    else if (screen === 'home') body = homeView();
    else if (screen === 'game') body = gameSkeleton();
    else body = '<div class="wrap" id="screen"></div>';
    $app().innerHTML = `<div id="top"></div>${body}<div id="ov"></div>`;
    window.scrollTo(0, 0);
    if (screen === 'game') mountBoard();
  }
  renderParts();
}
// Replaces an element's HTML only when it changed, so buttons are not swapped out under the pointer mid-click.
function setHtml(el, h) { if (el && el._h !== h) { el.innerHTML = h; el._h = h; return true; } return false; }
function renderParts() {
  setHtml(document.getElementById('top'), topBar());
  const scr = document.getElementById('screen');
  if (S.screen === 'lobby' && scr) { const cb = scr.querySelector('.chatbox'); scr.innerHTML = lobbyView(); const nb = scr.querySelector('.chatbox'); if (nb) nb.scrollTop = nb.scrollHeight; void cb; }
  if (S.screen === 'results' && scr) scr.innerHTML = resultsView();
  if (S.screen === 'jobs' && scr) scr.innerHTML = jobsView();
  if (S.screen === 'legacy' && scr) scr.innerHTML = `<div class="panel" style="padding:18px;max-width:620px"><h2 class="disp" style="font-size:20px">This game used the old board</h2><p>Room ${esc(S.g.code)} started before the board became a hexagon with jobs, so it can’t continue. ${isHost() ? 'Start fresh in this room and everyone keeps their seat.' : 'Ask the host to start fresh, or go back to the menu.'}</p><div class="row">${isHost() ? `<button class="btn pri" data-act="resetLegacy" ${isBusy() ? 'disabled' : ''}>Start fresh in this room</button>` : ''}<button class="btn ghost" data-act="home">Back to menu</button></div></div>`;
  if (S.screen === 'game' && S.g?.ps) renderGameParts();
  renderOverlays();
}
function renderOverlays() {
  const ov = document.getElementById('ov'); if (!ov) return;
  let h = '';
  if (S.modal === 'rules') h += rulesModal();
  else if (S.modal === 'confirmEnd') h += confirmModal('End the game now?', 'Final scores use everyone’s current net worth.', 'hostEndYes');
  else if (S.modal === 'confirmSkip') h += confirmModal(`Skip ${esc(nameOf(S.g, curId()))}’s turn?`, 'Waiting decisions are made automatically with the safest choice. Required payments still apply.', 'hostSkipYes');
  else if (S.modal === 'confirmBk') h += confirmModal('Declare bankruptcy?', 'You’re out of the game. This can’t be undone.', 'bkYes');
  else if (S.screen === 'game' && S.g?.status === 'playing' && !S.anim && S.g.q?.length && !S.minimized) h += pendingModal();
  if (S.toast) h += `<div class="toast" role="status">${esc(S.toast)}</div>`;
  setHtml(ov, h);
}
function topBar() {
  const g = S.g, inRoom = S.code && g;
  return `<header class="top"><div class="in">
    <button class="brand" data-act="homeBtn" style="background:none;border:0;padding:0" aria-label="Home"><span class="wide-only">HIDUP DI <b>INDONESIA</b></span><span class="narrow-only">${inRoom ? '<b>HDI</b>' : 'HIDUP DI <b>INDONESIA</b>'}</span></button>
    ${inRoom ? `<span class="chip disp" style="letter-spacing:.12em">${esc(g.code)}</span>` : ''}
    ${inRoom && g.status === 'playing' ? `<span class="chip num">Round ${Math.min(g.round, g.cfg.rounds)}/${g.cfg.rounds}</span>` : ''}
    <span class="sp"></span>
    ${S.code ? connChip() : ''}
    <button class="btn sm ghost" data-act="sound" aria-label="${S.sound ? 'Mute' : 'Unmute'}">${S.sound ? '🔊' : '🔇'}</button>
    <button class="btn sm ghost" data-act="rules" aria-label="Rules"><span class="wide-only">Rules</span><span class="narrow-only">?</span></button>
  </div></header>
  ${!S.netOk ? `<div class="wrap" style="padding-block:8px 0"><div class="banner err">You’re offline. The game reconnects automatically; your moves wait until you’re back.</div></div>` : ''}`;
}
function hero() { return `<section class="hero"><h1><span class="l1">HIDUP DI</span><span class="l2">INDONESIA</span></h1><span class="tag" style="justify-self:start">City Edition · Salary in, trouble out.</span></section>`; }
function fatalView() {
  const msg = {
    nodb: ['Sign in to claude.ai to play', 'This game keeps rooms and turns on claude.ai. Open it while signed in.'],
    noid: ['We couldn’t identify you', 'Reload the page, or ask the owner to share the game with your account again.'],
    readonly: ['You can watch, not play', 'To play, ask the owner to invite you from the Share menu with Editor access (or Contributor if you’re in the same organization).'],
    config: ['The game server isn’t connected yet', 'This website hasn’t been given its Supabase address. The site owner needs to finish the launch steps in the README.'],
    auth: ['We couldn’t sign you in', `Guest sign-in failed. ${S.fatalMsg ? 'The server said: ' + S.fatalMsg : ''} If you run this site, turn on anonymous sign-ins in Supabase (README step 3).`],
  }[S.fatal] || ['Something went wrong', S.fatalMsg || 'Reload the page.'];
  return `<div class="wrap">${hero()}<div class="panel" style="padding:18px;max-width:560px"><h2 class="disp" style="font-size:20px">${msg[0]}</h2><p>${msg[1]}</p><button class="btn" data-act="rules">Read the rules</button></div></div>`;
}
function homeView() {
  const avs = AVATARS.map((a, i) => `<button type="button" data-act="av" data-v="${i}" aria-pressed="${i === S.av}" aria-label="Avatar ${i + 1}">${a}</button>`).join('');
  return `<div class="wrap">${hero()}
  <p style="max-width:60ch;margin:0 0 16px;font-size:16px">A 3D property game on a hexagon of 22 Indonesian cities for 2–6 players. Pick a job, buy cities from Jayapura to Jakarta, charge rent, build houses and towers, and survive what Indonesia throws at everyone: fuel hikes, floods, cash aid and surge pricing.</p>
  <div class="home-grid">
    <div class="panel" style="padding:18px"><div class="stack">
      <div class="label">Step 1 · Your player</div>
      <label class="stack" style="gap:6px"><span class="small" style="font-weight:700">Nickname</span><input class="field" id="nick" maxlength="16" placeholder="e.g. Budi Payday" value="${esc(S.nick)}" autocomplete="off"></label>
      <div class="stack" style="gap:6px"><span class="small" style="font-weight:700">Avatar</span><div class="avpick" id="avpick">${avs}</div></div>
      <div class="label" style="margin-top:6px">Step 2 · Play</div>
      ${S.lastRoom ? `<button class="btn teal block" data-act="resume">Continue room ${esc(S.lastRoom)}</button>` : ''}
      <button class="btn pri big block" data-act="create">Create a room</button>
      <button class="btn block" data-act="createBots">🤖 Play against bots</button>
      <div class="row" style="flex-wrap:nowrap"><input class="field code" id="joincode" maxlength="5" placeholder="CODE" value="${esc(S.joinCode)}" autocomplete="off" aria-label="Room code"><button class="btn pink" data-act="join" style="flex:none">Join</button></div>
    </div></div>
    <div class="stack">
      <div class="feat">
        <div><b>17 jobs</b>Pick from 3–4 offers. Ojol drivers dodge traffic, contractors build cheap, doctors shrug off dengue.</div>
        <div><b>Hexagon board</b>36 spaces, 6 corners, in 3D. Rotate, zoom, tap any city.</div>
        <div><b>80 cards</b>Some hit only you, some hit everyone, some hit one job or one region.</div>
        <div><b>Takeovers</b>Pay rent, then buy the city from its owner at 150%.</div>
      </div>
      <button class="btn" data-act="rules">How to play</button>
      ${BE.ownerHint && S.isOwner ? `<div class="banner info">${esc(BE.ownerHint)}</div>` : ''}
    </div>
  </div></div>`;
}

// ---------- lobby ----------
function lobbyView() {
  const g = S.g, host = isHost(), me = g.players.find(p => p.id === S.me);
  if (!me) return `<div class="panel" style="padding:18px"><h2 class="disp" style="font-size:20px">You’re not in room ${esc(g.code)}</h2><p>${g.players.length >= 6 ? 'The room is full.' : 'Join now, before the game starts.'}</p><div class="row"><button class="btn pri" data-act="joinThis" ${g.players.length >= 6 ? 'disabled' : ''}>Join room</button><button class="btn ghost" data-act="home">Back</button></div></div>`;
  const readyN = g.players.filter(p => p.ready).length, allReady = readyN === g.players.length && g.players.length >= 2;
  const plist = g.players.map((p, k) => { const on = online(p.id); return `<div class="pitem">${avHtml(p.av, '', PCOLORS[k % PCOLORS.length])}<div class="grow"><div class="nm">${esc(p.nick)}${p.id === S.me ? ' <span class="muted small">(you)</span>' : ''}</div><div class="row small" style="gap:6px">${p.id === g.hostId ? '<span class="chip">👑 Host</span>' : ''}${p.bot ? '<span class="chip">🤖 Bot</span>' : `<span class="chip"><span class="dot ${on === null ? '' : on ? 'on' : 'off'}"></span>${on === null ? '—' : on ? 'Online' : 'Offline'}</span>`}</div></div><span class="chip" style="background:${p.ready ? 'var(--good)' : 'var(--surface)'};color:${p.ready ? '#fff' : 'var(--ink)'}">${p.ready ? 'Ready' : 'Not ready'}</span>${host && p.id !== S.me ? `<button class="btn sm ghost" data-act="kick" data-v="${esc(p.id)}" aria-label="Remove ${esc(p.nick)}">✕</button>` : ''}</div>`; }).join('');
  const empties = Array.from({ length: 6 - g.players.length }, () => `<div class="pitem" style="border-style:dashed;opacity:.6"><span class="av" style="border-style:dashed">+</span><span class="muted small">Open seat</span></div>`).join('');
  return `<div class="home-grid">
  <div class="stack">
    <div class="panel" style="padding:18px"><div class="stack">
      <div class="label">Room code</div><div class="row"><span class="codebig">${esc(g.code)}</span></div>
      <div class="row"><button class="btn sm" data-act="copyCode">Copy code</button><button class="btn sm" data-act="copyInvite">Copy invite</button></div>
      <p class="small muted" style="margin:0">${esc(BE.shareHint || '')}</p>
    </div></div>
    <div class="panel" style="padding:18px"><div class="stack">
      <div class="label">Players ${g.players.length}/6 · ${readyN} ready</div>
      <div class="plist">${plist}${empties}</div>
      ${host && g.players.length < 6 ? `<button class="btn block" data-act="addBot" ${isBusy() ? 'disabled' : ''}>🤖 Add a bot</button>` : ''}
      <button class="btn big block ${me.ready ? '' : 'pri'}" data-act="ready" ${isBusy() ? 'disabled' : ''}>${me.ready ? 'Not ready' : 'I’m ready!'}</button>
      ${host ? `<button class="btn big block teal" data-act="start" ${!allReady || isBusy() ? 'disabled' : ''}>Start game</button><p class="small muted" style="margin:0">${g.players.length < 2 ? 'You need at least 2 players. Add a bot to play solo.' : allReady ? 'Everyone’s ready. Let’s go!' : 'Waiting for everyone to be ready.'}</p>` : `<p class="small muted" style="margin:0">Waiting for the host to start.</p>`}
    </div></div>
  </div>
  <div class="stack">
    <div class="panel" style="padding:18px"><div class="stack">
      <div class="label">Settings ${host ? '' : '(host)'}</div>
      <div class="row"><span class="small" style="font-weight:700">Game length</span>
        <div class="seg" role="group" aria-label="Rounds">${[10, 15, 20, 30].map(n => `<button data-act="rounds" data-v="${n}" aria-pressed="${g.cfg.rounds === n}" ${host ? '' : 'disabled'}>${n}</button>`).join('')}</div>
        <span class="small muted">rounds · about ${Math.round(g.cfg.rounds * Math.max(2, g.players.length) * 0.4)} min</span></div>
      <p class="small muted" style="margin:0">After the host starts, each player picks a job from 3–4 offers. The game ends after the last round (richest player wins) or when only one player is left.</p>
    </div></div>
    ${chatPanel()}
    <div class="row"><button class="btn ghost" data-act="leave">Leave room</button><button class="btn ghost" data-act="rules">Rules</button></div>
  </div></div>`;
}
function chatPanel(bare) {
  const g = S.g;
  const msgs = (g.chat || []).slice(-14).map(c => `<div class="chatmsg">${avHtml(g.players.find(p => p.id === c.p)?.av ?? g.ps?.[c.p]?.av ?? 0, 's')}<span class="small" style="font-weight:800">${esc(nameOf(g, c.p))}</span><span class="b">${esc(CHAT_PRESETS[c.i] || '')}</span></div>`).join('');
  return `<div class="${bare ? '' : 'panel'}" style="padding:${bare ? 0 : 14}px"><div class="stack" style="gap:8px"><div class="label">Quick chat</div>
    <div class="chatbox">${msgs || '<div class="empty" style="padding:10px">No messages yet. Say hi!</div>'}</div>
    <div class="presets">${CHAT_PRESETS.map((m, i) => `<button class="btn sm" data-act="chat" data-v="${i}">${esc(m)}</button>`).join('')}</div></div></div>`;
}

// ---------- game ----------
function gameSkeleton() {
  return `<div class="wrap"><div class="game">
    <div class="stack">
      <div class="stage ${use3d() ? '' : 'flat'}" id="stage"><div id="b3" style="position:absolute;inset:0"></div><div id="b2" style="position:absolute;inset:0"></div>
        <div class="hud" id="hud"></div><div class="tip" id="tip"></div>
        <div class="tools"><button class="btn sm" data-act="resetView" id="resetBtn" aria-label="Reset camera">↺ View</button><button class="btn sm" data-act="toggleView">${use3d() ? '2D' : '3D'}</button></div>
      </div>
      <div id="actionbar"></div>
    </div>
    <aside class="side panel" style="padding:0;overflow:hidden"><div id="sidetabs"></div><div class="tabbody" id="sidebody"></div></aside>
  </div></div>`;
}
function mountBoard() {
  const el = document.getElementById('b3');
  S.mounted3d = use3d() && Board3D.init(el, i => { S.tileSel = i; Board3D.select(i); renderGameParts(); });
  if (use3d() && !S.mounted3d) { S.view = '2d'; toast('3D isn’t available on this device. Showing the 2D board.'); document.getElementById('stage').classList.add('flat'); }
  const rb = document.getElementById('resetBtn'); if (rb) rb.hidden = !S.mounted3d;
}
function renderGameParts() {
  const g = S.g; if (!g?.ps) return;
  if (S.mounted3d) Board3D.sync(g, S.me);
  const b2 = document.getElementById('b2'); if (b2) { b2.hidden = S.mounted3d; setHtml(b2, S.mounted3d ? '' : board2d(g)); }
  setHtml(document.getElementById('hud'), hudHtml(g));
  setHtml(document.getElementById('tip'), S.tileSel !== null && S.tileSel !== undefined ? tileCard(g, S.tileSel, true) : '');
  setHtml(document.getElementById('actionbar'), actionBar(g));
  setHtml(document.getElementById('sidetabs'), tabsHtml());
  const sb = document.getElementById('sidebody'); if (sb) { const lg = sb.querySelector('.log'), sc = lg ? lg.scrollTop : 0; if (!setHtml(sb, sideBody(g))) return; const nl = sb.querySelector('.log'); if (nl) nl.scrollTop = sc; const cb = sb.querySelector('.chatbox'); if (cb) cb.scrollTop = cb.scrollHeight; }
}
function hudHtml(g) {
  const d = S.anim?.dice || g.dice;
  return `<span class="chip fund" title="Community Fund: land on the Rest Area to collect it">🌴 Fund ${esc(rpShort(g.fund))}</span>${d && !S.mounted3d ? '' : d ? `<span class="chip num">🎲 ${S.anim?.phase === 'dice' ? '…' : `${d[0]} + ${d[1]} = ${d[0] + d[1]}`}</span>` : ''}`;
}
function board2d(g) {
  // Same hexagon geometry as the 3D board, drawn top-down as SVG.
  const cur = curId(), d = S.anim?.dice || g.dice || [1, 1], spin = S.anim?.phase === 'dice';
  const R = HexGeo.R, ext = R + 1.1, verts = HexGeo.vertices();
  const hexPts = (r) => verts.map(([x, z]) => `${(x / R * r).toFixed(2)},${(z / R * r).toFixed(2)}`).join(' ');
  const innerR = (R * Math.cos(Math.PI / 6) - HexGeo.D) / Math.cos(Math.PI / 6);
  let t = `<polygon points="${hexPts(R + .85)}" fill="#17201B"/><polygon points="${hexPts(innerR)}" fill="#1A7383"/>`;
  BOARD.forEach((sp, i) => {
    const tg = HexGeo.tile(i), pr = g.props[i], rot = HexGeo.rotSvg(tg), w = tg.corner ? 1.1 : HexGeo.W, h = tg.corner ? 1.1 : HexGeo.D;
    const fill = tg.corner ? ({ start: '#FFE08A', jam: '#FFD2C2', rest: '#CDEFC4', gojam: '#FFD0D6', market: '#FFE3B3', arisan: '#E7D9FF' })[sp.t] : ({ event: '#DDF3D8', reality: '#FFE1DF' })[sp.t] || '#FFF8E8';
    const hs = pr && pr.h ? (pr.h === 5 ? '🏢' : '🏠'.repeat(pr.h)) : '';
    t += `<g transform="translate(${tg.x.toFixed(2)} ${tg.z.toFixed(2)}) rotate(${rot.toFixed(1)})" data-act="tile" data-v="${i}" style="cursor:pointer" role="button" aria-label="${esc(sp.n)}">
      <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${tg.corner ? .25 : .05}" fill="${fill}" stroke="${S.tileSel === i ? '#E23E6B' : '#17201B'}" stroke-width="${S.tileSel === i ? .09 : .04}" ${pr?.m ? 'opacity=".5"' : ''}/>
      ${sp.t === 'city' ? `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height=".3" fill="${GROUPS[sp.g].color}"/>` : `<text y="-.12" font-size=".42" text-anchor="middle">${SPACE_TYPES[sp.t].ic}</text>`}
      <text y="${sp.t === 'city' ? .08 : .2}" font-size=".17" font-weight="800" text-anchor="middle" fill="#17201B" font-family="Plus Jakarta Sans, system-ui, sans-serif">${esc(sp.n.toUpperCase().slice(0, 12))}</text>
      ${sp.price ? `<text y=".34" font-size=".15" text-anchor="middle" fill="#17201B" font-family="system-ui">${esc(rpShort(sp.price))}</text>` : ''}
      ${hs ? `<text y="-.33" font-size=".2" text-anchor="middle">${hs}</text>` : ''}
      ${pr?.o ? `<rect x="${-w / 2 + .05}" y="${h / 2 - .14}" width="${w - .1}" height=".1" fill="${pCol(g, pr.o)}" stroke="#17201B" stroke-width=".02"/>` : ''}
    </g>`;
  });
  const byTile = {};
  g.order.forEach(id => { if (g.ps[id].out) return; const pos = shownPos(g, id); (byTile[pos] = byTile[pos] || []).push(id); });
  for (const [pos, ids] of Object.entries(byTile)) {
    const tg = HexGeo.tile(+pos), sx = -tg.nz, sz = tg.nx;
    ids.forEach((id, k) => { const off = (k - (ids.length - 1) / 2) * .3, x = tg.x + sx * off - tg.nx * .05, z = tg.z + sz * off - tg.nz * .05;
      t += `<g transform="translate(${x.toFixed(2)} ${z.toFixed(2)})"><circle r=".2" fill="${pCol(g, id)}" stroke="#17201B" stroke-width=".05"${id === cur ? ' class="pulse"' : ''}/><text y=".08" font-size=".22" text-anchor="middle">${avOf(g, id)}</text></g>`; });
  }
  t += `<text y="-1.6" font-size=".75" text-anchor="middle" fill="#FFF8E8" font-family="Bungee, Arial Black, sans-serif">HIDUP DI</text><text y="-.8" font-size=".75" text-anchor="middle" fill="#FFBE1A" font-family="Bungee, Arial Black, sans-serif">INDONESIA</text>`;
  t += `<text y="1.9" font-size=".34" text-anchor="middle" fill="#FFF8E8" font-family="Plus Jakarta Sans, system-ui">${cur === S.me ? 'Your turn!' : esc(nameOf(g, cur)) + '’s turn'}</text>`;
  return `<div class="board2d-svg"><svg viewBox="${-ext} ${-ext} ${ext * 2} ${ext * 2}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${t}</svg><div class="dice2d">${dieHtml(d[0], spin)}${dieHtml(d[1], spin, true)}</div></div>`;
}
function tileCard(g, i, closable) {
  const s = BOARD[i], pr = g.props?.[i], bc = bandColor(s), lt = light(bc);
  let body = `<div class="small muted">${esc(groupName(s))}</div>${s.note ? `<div>${esc(s.note)}</div>` : ''}`;
  if (pr) {
    body += `<div class="row" style="gap:6px"><b>${esc(rp(s.price))}</b>${pr.o ? `<span class="chip"><span class="swatch" style="background:${pCol(g, pr.o)}"></span>${esc(nameOf(g, pr.o))}${pr.m ? ' · mortgaged' : ''}</span>` : '<span class="chip">For sale</span>'}</div>`;
    if (s.t === 'city') { const rt = rentTable(i), lab = ['Rent', '1 house', '2 houses', '3 houses', '4 houses', 'Tower']; body += `<div class="rent">${rt.map((v, k) => `<span class="${pr.h === k && pr.o ? 'on' : ''}">${lab[k]}${k === 0 ? ' (×2 with full group)' : ''}</span><span class="${pr.h === k && pr.o ? 'on' : ''}">${esc(rpShort(v))}</span>`).join('')}</div><div class="small muted">Building: ${esc(rpShort(g.ps?.[S.me] ? buildCost(g, S.me, i) : houseCost(i)))} each · Takeover ${esc(rpShort(g.ps?.[S.me] ? takeoverPrice(g, S.me, i) : s.price * 1.5))}${pr.o && JOBS[g.ps[pr.o]?.job]?.protect ? ' (protected: owner is a Lawyer)' : ''}</div>`; }
    else if (s.t === 'transport') body += `<div class="rent"><span>Own 1 / 2 / 3</span><span>Rp250K / Rp500K / Rp1M</span></div>`;
  }
  return `<div class="tilecard"><div class="tb ${lt ? 'light' : ''}" style="background:${bc}"><span>${SPACE_TYPES[s.t].ic}</span><span style="flex:1">${esc(s.n)}</span>${closable ? `<button class="btn sm" data-act="tile" data-v="${i}" style="background:#fff;color:#17201B;min-height:28px">✕</button>` : ''}</div><div class="bd">${body}</div></div>`;
}
function actionBar(g) {
  const cur = curId(), mine = cur === S.me, p = g.ps[S.me], cp = g.ps[cur];
  if (!p) return `<div class="actionbar"><div class="turnbar">You’re watching this game.</div></div>`;
  const anim = !!S.anim, busy = isBusy();
  let main = '', note = '';
  if (mine && !p.out) {
    if (g.phase === 'roll') {
      if (p.jam) {
        main = `<div class="row" style="flex-wrap:wrap">
          <button class="btn pri big" style="flex:1" data-act="roll" ${busy || anim ? 'disabled' : ''}>🎲 Roll for doubles</button>
          <button class="btn big" data-act="jamPay" ${busy || anim || p.cash < jamFee(g, S.me) ? 'disabled' : ''}>${jamFee(g, S.me) ? 'Pay Rp500K' : 'Leave free (ojol)'}</button>
          ${p.cards ? `<button class="btn big teal" data-act="jamCard" ${busy || anim ? 'disabled' : ''}>Use Shortcut Card</button>` : ''}</div>`;
        note = `Stuck in the Traffic Jam: roll doubles, pay, or use a card. ${p.jam} ${p.jam === 1 ? 'try' : 'tries'} left.`;
      } else { main = `<button class="btn pri big block" data-act="roll" ${busy || anim ? 'disabled' : ''}>🎲 Roll the dice</button>`; note = 'Doubles roll again. Three doubles in a row sends you to the Traffic Jam.'; }
    } else if (g.phase === 'act') { main = `<button class="btn pink big block" data-act="openPending" ${anim ? 'disabled' : ''}>Decide (${g.q.length})</button>`; note = 'Finish this decision before ending your turn.'; }
    else if (g.phase === 'end') { main = `<button class="btn teal big block" data-act="end" ${busy || anim ? 'disabled' : ''}>End turn ➜</button>`; note = 'Build houses or manage mortgages in “My cities” first.'; }
  } else if (g.phase === 'act' && S.minimized && !anim) main = `<button class="btn block" data-act="openPending">See ${esc(nameOf(g, cur))}’s card</button>`;
  if (cp.bot) note = '🤖 Bot is playing its turn.';
  if (p.out) note = 'You’re bankrupt. Keep watching, the game goes on!';
  const on = online(cur);
  const bar = `<div class="turnbar ${mine ? 'mine' : ''}">${avHtml(cp.av, '', pCol(g, cur))}<div class="grow"><div style="font-weight:800">${mine ? 'Your turn' : `${esc(nameOf(g, cur))}’s turn`}</div>
    <div class="small muted">${jobOf(g, cur) ? `${jobOf(g, cur).ic} ${esc(jobOf(g, cur).name)} · ` : ''}${esc(rp(cp.cash))} cash · ${owned(g, cur).length} properties${cp.jam ? ' · 🚗 stuck' : ''}${on === false ? ' · <span class="neg">offline</span>' : ''}</div></div>
    ${!mine ? `<span class="chip">${cp.bot ? '🤖 ' : ''}${g.phase === 'roll' ? 'Rolling' : g.phase === 'act' ? 'Deciding' : 'Finishing'}</span>` : ''}</div>`;
  const hostCtl = isHost() ? `<details class="collap"><summary class="small muted" style="font-weight:700;padding:4px 0">Host controls ▾</summary><div class="row" style="margin-top:6px">${!mine && !cp.bot ? `<button class="btn sm" data-act="hostSkip">Skip ${esc(nameOf(g, cur))}’s turn</button>` : ''}<button class="btn sm ghost" data-act="hostEnd">End the game now</button></div><p class="small muted" style="margin:6px 0 0">Use “Skip” if the current player has been disconnected for a while.</p></details>` : '';
  return `<div class="actionbar">${bar}${main}${note ? `<div class="small muted" style="text-align:center">${note}</div>` : ''}${hostCtl}</div>`;
}
const TABS = [['players', 'Players'], ['cities', 'My cities'], ['log', 'Log'], ['chat', 'Chat']];
function tabsHtml() { return `<div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>`; }
function sideBody(g) {
  if (S.tab === 'players') return playersTab(g);
  if (S.tab === 'cities') return citiesTab(g);
  if (S.tab === 'log') return logTab(g);
  return chatPanel(true);
}
function playersTab(g) {
  const cur = curId();
  return g.order.map(id => {
    const p = g.ps[id], on = online(id), props = owned(g, id), houses = props.reduce((s, i) => s + (g.props[i].h || 0), 0);
    return `<div class="pcard ${id === cur ? 'act' : ''}" style="${p.out ? 'opacity:.55' : ''}"><div class="hd">${avHtml(p.av, 's', pCol(g, id))}<span class="nm">${p.bot ? '🤖 ' : ''}${esc(nameOf(g, id))}${id === S.me ? ' (you)' : ''}</span><span class="dot ${on === null ? '' : on ? 'on' : 'off'}"></span>${id === g.hostId ? '👑' : ''}</div>
      <div class="small">${jobOf(g, id) ? `${jobOf(g, id).ic} <b>${esc(jobOf(g, id).name)}</b> · ${esc(rpShort(p.sal))}/Payday` : ''}</div>
      ${p.out ? '<div class="small neg" style="font-weight:800">Bankrupt</div>' : `<div class="kv"><div>Cash<b>${esc(rpShort(p.cash))}</b></div><div>Net worth<b>${esc(rpShort(netWorth(g, id)))}</b></div><div>Properties<b>${props.length}${houses ? ` · ${houses}🏠` : ''}</b></div></div>`}
      <div class="row" style="gap:3px">${props.map(i => `<span class="swatch" title="${esc(BOARD[i].n)}" style="background:${bandColor(BOARD[i])};${g.props[i].m ? 'opacity:.35' : ''}"></span>`).join('')}${p.jam ? '<span class="chip">🚗 stuck</span>' : ''}${p.cards ? '<span class="chip">🎫 shortcut</span>' : ''}${p.owe ? `<span class="chip neg">owes ${esc(rpShort(p.owe))}</span>` : ''}</div></div>`;
  }).join('');
}
function citiesTab(g) {
  const p = g.ps[S.me]; if (!p) return '<div class="empty">You’re not in this game.</div>';
  const can = myTurn() && ['roll', 'end'].includes(g.phase) && !g.q.length && !isBusy() && !S.anim && !p.out;
  const mine = owned(g, S.me);
  const list = mine.length ? mine.map(i => {
    const s = BOARD[i], pr = g.props[i], acts = [];
    if (canBuild(g, S.me, i)) acts.push(`<button class="btn sm pri" data-act="build" data-v="${i}" ${can && p.cash >= buildCost(g, S.me, i) ? '' : 'disabled'}>${pr.h === 4 ? 'Tower' : 'House'} ${esc(rpShort(buildCost(g, S.me, i)))}</button>`);
    if (canSellHouse(g, S.me, i)) acts.push(`<button class="btn sm" data-act="sellHouse" data-v="${i}" ${can ? '' : 'disabled'}>Sell +${esc(rpShort(houseCost(i) / 2))}</button>`);
    if (canMortgage(g, S.me, i)) acts.push(`<button class="btn sm" data-act="mortgage" data-v="${i}" ${can ? '' : 'disabled'}>Mortgage +${esc(rpShort(mortValueFor(g, S.me, i)))}</button>`);
    if (pr.m) acts.push(`<button class="btn sm teal" data-act="unmortgage" data-v="${i}" ${can && p.cash >= unmortCost(g, S.me, i) ? '' : 'disabled'}>Redeem ${esc(rpShort(unmortCost(g, S.me, i)))}</button>`);
    return `<div class="prop ${pr.m ? 'mort' : ''}"><span class="swatch" style="background:${bandColor(s)}"></span><button data-act="tile" data-v="${i}" style="all:unset;cursor:pointer;min-width:0"><b>${esc(s.n)}</b><div class="small muted"><span class="houses">${pr.h === 5 ? '🏢 tower' : pr.h ? '🏠'.repeat(pr.h) : ''}</span> rent ${esc(rpShort(rentFor(g, i, 7)))}${pr.m ? ' · mortgaged' : ''}</div></button><div class="acts">${acts.join('')}</div></div>`;
  }).join('') : '<div class="empty" style="padding:12px">You don’t own anything yet. Land on a city to buy it.</div>';
  const jb = jobOf(g, S.me);
  return `<div class="stat"><div><div class="label">Cash</div><div class="v">${esc(rp(p.cash))}</div></div><div><div class="label">Net worth</div><div class="v">${esc(rp(netWorth(g, S.me)))}</div></div></div>
    ${jb ? `<div class="jobmini"><div><b>${jb.ic} ${esc(jb.name)}</b> · ${esc(rpShort(p.sal))} per Payday</div><div class="small pos">${jb.pros.map(esc).join(' · ')}</div><div class="small neg">${jb.cons.map(esc).join(' · ')}</div></div>` : ''}
    ${p.owe ? `<div class="banner err">Loan app: ${esc(rp(p.owe))} is due at your next Payday.</div>` : ''}
    <div class="plist2">${list}</div>
    <div class="small muted">${can ? 'Houses: own 2 cities of a color group and build evenly. Tower: own the whole group and 4 houses on the city.' : 'You can build and mortgage on your turn, before rolling or before ending your turn.'}</div>`;
}
function logTab(g) {
  if (!g.log.length) return '<div class="empty">Nothing has happened yet.</div>';
  return `<div class="log">${[...g.log].reverse().map(e => `<div class="e">${e.p ? avHtml(g.ps?.[e.p]?.av ?? 0, 's', pCol(g, e.p)) : '<span class="av s">🎲</span>'}<div>${e.p ? `<b>${esc(nameOf(g, e.p))}</b> · ` : ''}${esc(e.t)}</div><span class="d ${e.d > 0 ? 'pos' : e.d < 0 ? 'neg' : ''}">${e.d ? (e.d > 0 ? '+' : '') + esc(rpShort(e.d)) : ''}</span></div>`).join('')}</div>`;
}
function pendingModal() {
  const g = S.g, it = g.q[0], cur = curId(), mine = cur === S.me, p = g.ps[cur];
  let cc = 'var(--yellow)', ic = '🎲', cat = '', title = '', desc = '', extra = '';
  if (it.k === 'buy') { const s = BOARD[it.i]; cc = bandColor(s); ic = SPACE_TYPES[s.t].ic; cat = 'For sale'; title = s.n; desc = `${mine ? 'You have' : `${nameOf(g, cur)} has`} ${rp(p.cash)} cash.`; extra = tileCard(g, it.i, false); }
  else if (it.k === 'takeover') { const s = BOARD[it.i]; cc = bandColor(s); ic = '🤝'; cat = 'Takeover offer'; title = `Take over ${s.n}?`; desc = `After paying rent, you may buy ${s.n} from ${nameOf(g, g.props[it.i].o)} for ${Math.round(it.price / s.price * 100)}% of its price.`; extra = tileCard(g, it.i, false); }
  else if (it.k === 'card') { const c = CARDS[it.id], m = cardMeta(c); cc = c.deck === 'event' ? '#5CC07A' : '#E9566B'; ic = c.deck === 'event' ? '🍀' : '📰'; cat = c.deck === 'event' ? 'Life Event' : 'Indonesia Reality'; title = c.title; desc = c.desc;
    extra = `<div class="row" style="gap:6px"><span class="chip scope-${m.scope}">${{ you: '👤 Affects you', some: '👥 Affects some players', all: '🌏 Affects everyone' }[m.scope]}</span><span class="chip tone-${m.tone}">${{ good: '▲ Good news', bad: '▼ Bad news', mixed: '◆ Mixed', choice: '? Your choice' }[m.tone]}</span></div>`; }
  else if (it.k === 'debt') { cc = 'var(--t-darurat)'; ic = '💸'; cat = 'Payment due'; title = 'Not Enough Cash'; desc = `You owe ${rp(it.amt)} for ${it.why} and have ${rp(p.cash)}. Mortgage properties or sell buildings to raise cash.`; }
  const opts = optionsFor(JSON.parse(JSON.stringify(g)), cur, JSON.parse(JSON.stringify(it)));
  const btns = opts.map((o, i) => `<button class="opt" data-act="${o.bk ? 'bkAsk' : 'resolve'}" data-v="${i}" ${!mine || !o.ok || isBusy() ? 'disabled' : ''} ${o.bk ? 'style="border-style:dashed"' : ''}>${esc(o.l)}${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</button>`).join('');
  return `<div class="scrim" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="card" style="--cc:${cc}">
    <div class="band" style="${light(cc.startsWith('#') ? cc : '#FFBE1A') ? '' : 'color:#fff'}"><span class="ic">${ic}</span><span class="cat">${esc(cat)}</span><span style="flex:1"></span>${!mine ? `<button class="btn sm" data-act="minimize" style="background:#fff;color:#17201B">Close</button>` : ''}</div>
    <div class="body"><h2>${esc(title)}</h2><div class="desc">${esc(desc)}</div>${extra}
      ${mine ? '' : `<div class="banner info">${p.bot ? '🤖 ' : ''}${esc(nameOf(g, cur))} is deciding…</div>`}
      <div class="opts">${btns}</div>
      ${g.q.length > 1 ? `<div class="small muted">${g.q.length - 1} more after this.</div>` : ''}</div></div></div>`;
}
function confirmModal(t, d, act) { return `<div class="scrim" role="dialog" aria-modal="true"><div class="card"><div class="body"><h2>${t}</h2><div class="desc">${d}</div><div class="row"><button class="btn pink" data-act="${act}">Yes, continue</button><button class="btn ghost" data-act="closeModal">Cancel</button></div></div></div></div>`; }
function rulesModal() {
  const groups = Object.entries(GROUPS).map(([k, gr]) => `<div><i style="background:${gr.color}"></i>${esc(gr.name)}: ${BOARD.filter(s => s.g === k).map(s => esc(s.n)).join(', ')}</div>`).join('');
  return `<div class="scrim" role="dialog" aria-modal="true" aria-label="Rules"><div class="card" style="width:min(660px,100%)"><div class="band" style="--cc:var(--yellow)"><span class="ic">📖</span><span class="cat">How to play</span><span style="flex:1"></span><button class="btn sm" data-act="closeModal" style="background:#fff;color:#17201B">Close</button></div>
  <div class="body rules" style="max-height:72vh;overflow-y:auto">
    <h3>Goal</h3><p>Be the richest player when the last round ends, or the last one standing. Net worth = cash + property prices (half if mortgaged) + buildings − unpaid loans.</p>
    <h3>Board</h3><p>A hexagon of 36 spaces with a special corner at each of its six points: Payday, Traffic Jam, Night Market (draw an Indonesia Reality card), Rest Area (collect the Community Fund), Wrong Turn! (go to the Traffic Jam) and Arisan Night (collect Rp100K from every player).</p>
    <h3>Jobs</h3><p>When the host starts, every player is offered ${'3–4'} jobs (3 at tables of 5–6) and must pick one. Your job sets your salary at every Payday and gives you a perk and a drawback. Bots pick their own.</p>
    <div class="jobgrid">${Object.values(JOBS).map(j => `<div><b>${j.ic} ${esc(j.name)}</b> <span class="muted">${esc(rpShort(j.sal * U))}${j.var ? ' (varies)' : ''}</span><div class="small pos">${j.pros.map(esc).join(' · ')}</div><div class="small neg">${j.cons.map(esc).join(' · ')}</div></div>`).join('')}</div>
    <h3>Start</h3><p>Everyone starts at Payday with Rp10M (some jobs adjust this).</p>
    <h3>Your turn</h3><ul><li>Roll two dice and move. Doubles roll again; three doubles in a row sends you to the Traffic Jam.</li><li>Unowned city, transport or utility: buy it or pass.</li><li>Someone else’s property: pay rent. Mortgaged properties charge no rent.</li><li>Life Event and Indonesia Reality spaces draw a card. Each card says whom it affects: just you, some players (by job or by region) or everyone, and whether it’s good or bad news.</li></ul>
    <h3>Rent</h3><ul><li>Cities: base rent, doubled when the owner has the whole color group. Houses and towers raise it a lot.</li><li>Transport: Rp250K, Rp500K or Rp1M for owning 1, 2 or 3.</li><li>Utilities: dice total × Rp40K, or × Rp100K with both.</li></ul>
    <h3>Takeovers</h3><p>After paying rent on a city whose owner hasn’t built in that color group, you may buy the city from them for 150% of its price (125% for Lawyers). Lawyers’ cities can’t be taken over.</p>
    <h3>Building</h3><p>Own two cities of a color group to build houses on them, evenly (one at a time across the cities you own). A tower needs the whole group and four houses on that city. Build on your turn from “My cities”.</p>
    <h3>Traffic Jam</h3><p>Sent there by Wrong Turn!, a card or three doubles: you’re stuck for up to three turns. Roll doubles to leave, pay Rp500K, or use a Shortcut Card. After three failed tries you pay and move. Ojol Drivers are only held one turn and never pay.</p>
    <h3>Community Fund</h3><p>Card payments and Traffic Jam fees go into the fund. Land exactly on the Rest Area to collect all of it.</p>
    <h3>Can’t pay?</h3><p>Mortgage properties (get half their price, 60% for Bankers) or sell buildings (half their cost). If that still isn’t enough, you’re bankrupt: your assets go to the player you owe, or back to the bank.</p>
    <h3>Bots</h3><p>The host can add bots in the lobby, or pick “Play against bots”. The host’s page plays their turns.</p>
    <h3>Color groups</h3><div class="legend" style="grid-template-columns:1fr">${groups}</div>
    <h3>Controls</h3><p>Drag to rotate the 3D board, pinch or scroll to zoom, tap any space to see its details. Switch to 2D any time.</p>
  </div></div></div>`;
}
function resultsView() {
  const g = S.g; if (!g.ps) return `<div class="empty">Loading results…</div>`;
  const rows = computeResults(g);
  const list = rows.map((r, i) => { const T = TITLES[r.title]; return `<div class="rank ${i === 0 ? 'first' : ''}"><div class="no">${i + 1}</div>
    <div style="min-width:0"><div class="row" style="gap:8px;flex-wrap:nowrap">${avHtml(r.p.av, 's', pCol(g, r.id))}<b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.p.bot ? '🤖 ' : ''}${esc(nameOf(g, r.id))}${r.id === S.me ? ' (you)' : ''}</b></div><div class="ttl">${esc(T[0])}</div><div class="small muted">${jobOf(g, r.id) ? `${jobOf(g, r.id).ic} ${esc(jobOf(g, r.id).name)} · ` : ''}${esc(T[1])}</div></div>
    <div class="score" style="font-size:18px">${r.p.out ? 'OUT' : esc(rpShort(r.nw))}</div>
    <div class="brk"><div>Cash<br><b>${esc(rpShort(r.cash))}</b></div><div>Properties (${r.propsN})<br><b>${esc(rpShort(r.propsV))}</b></div><div>Buildings<br><b>${r.buildings}</b></div><div>Rent collected<br><b>${esc(rpShort(r.p.st.rentIn))}</b></div><div>Rent paid<br><b>${esc(rpShort(r.p.st.rentOut))}</b></div><div>Traffic jams<br><b>${r.p.st.jams}</b></div></div></div>`; }).join('');
  return `<div class="stack" style="max-width:760px;margin:0 auto">
    <section class="hero" style="padding-block:6px"><h1 style="font-size:clamp(34px,9vw,64px)"><span class="l1">FINAL</span><span class="l2">FORTUNES</span></h1><span class="tag" style="justify-self:start">${esc(nameOf(g, rows[0].id))} conquered Indonesia</span></section>
    <div class="small muted">${g.endReason === 'last' ? 'Everyone else went bankrupt.' : g.endReason === 'host' ? 'The host ended the game early.' : `After ${g.cfg.rounds} rounds.`}</div>
    <div class="podium">${list}</div>
    <div class="row">${isHost() ? `<button class="btn pri big" data-act="rematch" ${isBusy() ? 'disabled' : ''}>Play again</button>` : `<span class="muted">Waiting for the host to start a rematch…</span>`}<button class="btn ghost" data-act="home">Back to menu</button></div>
    <details class="collap panel" style="padding:12px"><summary class="label">Full log ▾</summary><div style="margin-top:8px">${logTab(g)}</div></details>
  </div>`;
}

// ---------- job draft ----------
function jobsView() {
  const g = S.g, me = g.ps?.[S.me], offers = g.offers?.[S.me] || [];
  const status = g.order.map(id => `<div class="pitem">${avHtml(g.ps[id].av, 's', pCol(g, id))}<div class="grow"><div class="nm">${g.ps[id].bot ? '🤖 ' : ''}${esc(nameOf(g, id))}${id === S.me ? ' (you)' : ''}</div></div>${g.ps[id].job ? `<span class="chip">✓ ${JOBS[g.ps[id].job].ic} ${esc(JOBS[g.ps[id].job].name)}</span>` : '<span class="chip">Choosing…</span>'}</div>`).join('');
  const cards = offers.map(k => { const j = JOBS[k], picked = me?.job === k; return `<div class="jobcard ${picked ? 'picked' : ''}">
      <div class="jh"><span class="ji">${j.ic}</span><div><div class="jn">${esc(j.name)}</div><div class="js">${esc(rpShort(j.sal * U))} per Payday${j.var ? ` · varies ${j.var[0]}–${j.var[1]}%` : ''}</div></div></div>
      <ul class="pros">${j.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul><ul class="cons">${j.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${me && !me.job ? `<button class="btn pri block" data-act="pickJob" data-v="${k}" ${isBusy() ? 'disabled' : ''}>Take this job</button>` : picked ? '<div class="chip" style="justify-self:start">✓ Your job</div>' : ''}</div>`; }).join('');
  return `<div class="stack" style="max-width:1000px;margin:0 auto">
    <section class="hero" style="padding-block:6px"><h1 style="font-size:clamp(30px,8vw,56px)"><span class="l1">CHOOSE</span><span class="l2">YOUR JOB</span></h1><span class="tag" style="justify-self:start">Your salary, perk and weakness for the whole game</span></section>
    ${me ? (me.job ? `<div class="banner info">You’re a ${esc(JOBS[me.job].name)}. Waiting for the others to choose…</div>` : `<p style="margin:0">Pick one of these ${offers.length} offers. Everyone gets different offers.</p>`) : '<div class="banner info">You’re watching. Players are choosing their jobs.</div>'}
    <div class="jobgrid2">${cards}</div>
    <div class="panel" style="padding:14px"><div class="label" style="margin-bottom:8px">Table</div><div class="plist">${status}</div>
      ${isHost() ? '<button class="btn sm ghost" data-act="hostSkip" style="margin-top:10px">Assign jobs to anyone still choosing</button>' : ''}</div>
  </div>`;
}

// ---------- events ----------
document.addEventListener('input', e => {
  if (e.target.id === 'nick') S.nick = e.target.value;
  if (e.target.id === 'joincode') { S.joinCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (e.target.value !== S.joinCode) e.target.value = S.joinCode; }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'joincode') doJoin(); if (e.key === 'Escape' && S.modal) { S.modal = null; renderOverlays(); } });
const cleanNick = () => (S.nick || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
async function doCreate(bots = 0) {
  const nick = cleanNick(); if (!nick) { toast('Enter a nickname first.'); document.getElementById('nick')?.focus(); return; }
  S.nick = nick; await saveProfile();
  if (await commit('create', [nick, S.av, bots], { code: null })) enterRoom(S.lastResult.code);
}
async function doJoin(codeArg) {
  const nick = cleanNick(); if (!nick) { toast('Enter a nickname first.'); document.getElementById('nick')?.focus(); return; }
  const code = (codeArg || S.joinCode || '').toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(code)) { toast('Room codes are 5 letters or numbers.'); return; }
  S.nick = nick; await saveProfile();
  if (await commit('join', [nick, S.av], { code })) enterRoom(code);
}
async function copyText(t, done) { try { await navigator.clipboard.writeText(t); toast(done); } catch (e) { toast('Couldn’t copy automatically. The code is ' + S.g.code); } }
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act, v = b.dataset.v;
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  switch (act) {
    case 'sound': S.sound = !S.sound; ls.set('hdi.sound', S.sound ? '1' : '0'); renderParts(); break;
    case 'rules': S.modal = 'rules'; renderOverlays(); break;
    case 'closeModal': S.modal = null; renderOverlays(); break;
    case 'homeBtn': if (S.code && S.g?.status === 'playing') break; leaveLocal(); break;
    case 'av': S.av = +v; document.querySelectorAll('#avpick button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === v)); ls.set('hdi.av', v); break;
    case 'create': await doCreate(); break;
    case 'createBots': await doCreate(3); break;
    case 'join': await doJoin(); break;
    case 'joinThis': await doJoin(S.code); break;
    case 'resume': enterRoom(S.lastRoom); break;
    case 'home': leaveLocal(); break;
    case 'copyCode': copyText(S.g.code, 'Room code copied.'); break;
    case 'copyInvite': { const text = BE.inviteText(S.g.code); if (navigator.share && BE.kind === 'web') { try { await navigator.share({ title: 'Hidup di Indonesia', text }); break; } catch (e) {} } copyText(text, 'Invite copied. Paste it in WhatsApp!'); break; }
    case 'ready': { const me = S.g.players.find(p => p.id === S.me); await commit('ready', [!me.ready]); break; }
    case 'kick': await commit('kick', [v]); break;
    case 'addBot': await commit('addBot'); break;
    case 'rounds': await commit('rounds', [+v]); break;
    case 'start': await commit('start'); break;
    case 'leave': if (await commit('leave')) { await saveProfile({ lastCity: null }); S.lastRoom = null; leaveLocal(); } break;
    case 'chat': await commit('chat', [+v]); break;
    case 'tab': S.tab = v; renderGameParts(); break;
    case 'tile': { const i = +v; S.tileSel = S.tileSel === i ? null : i; if (S.mounted3d) Board3D.select(S.tileSel); renderGameParts(); break; }
    case 'resetView': Board3D.resetView(); break;
    case 'toggleView': S.view = use3d() ? '2d' : '3d'; ls.set('hdi.view', S.view); S.forceFull = true; if (S.mounted3d) { Board3D.destroy(); S.mounted3d = false; } render(); break;
    case 'roll': await commit('roll'); break;
    case 'pickJob': await commit('pickJob', [v]); break;
    case 'jamPay': await commit('jamPay'); break;
    case 'jamCard': await commit('jamCard'); break;
    case 'openPending': S.minimized = false; renderOverlays(); break;
    case 'minimize': S.minimized = true; renderOverlays(); renderGameParts(); break;
    case 'resolve': await commit('resolve', [+v]); break;
    case 'bkAsk': S.modal = 'confirmBk'; S.bkIdx = +v; renderOverlays(); break;
    case 'bkYes': S.modal = null; await commit('resolve', [S.bkIdx]); break;
    case 'end': await commit('end'); break;
    case 'build': await commit('build', [+v]); break;
    case 'sellHouse': await commit('sellHouse', [+v]); break;
    case 'mortgage': await commit('mortgage', [+v]); break;
    case 'unmortgage': await commit('unmortgage', [+v]); break;
    case 'hostSkip': if (S.g?.status === 'jobs') { await commit('hostSkip'); break; } S.modal = 'confirmSkip'; renderOverlays(); break;
    case 'hostSkipYes': S.modal = null; await commit('hostSkip'); break;
    case 'hostEnd': S.modal = 'confirmEnd'; renderOverlays(); break;
    case 'hostEndYes': S.modal = null; await commit('hostEnd'); break;
    case 'rematch': await commit('rematch'); break;
    case 'resetLegacy': await commit('resetLegacy'); break;
  }
});

