// Plays many random games (humans + bots) through the rules engine and checks money, property and turn invariants.
import * as E from '../supabase/functions/_shared/engine.js';
const { A, optionsFor, computeResults, rnd, GameError, BUYABLE } = E;
const clone = o => JSON.parse(JSON.stringify(o));
let errs = 0, games = 0, turns = 0, endLast = 0, bk = 0, players = 0, rejects = 0, botWins = 0, mixed = 0;
const chk = (c, m) => { if (!c) { errs++; if (errs < 8) console.log('FAIL', m); } };
const N = +process.argv[2] || 1000;
for (let gi = 0; gi < N; gi++) {
  const g = {}; const humans = 1 + rnd(3), bots = gi % 3 === 0 ? 0 : 1 + rnd(3);
  A.create(g, 'h0', 'Host', 0, 'ABCDE', 0);
  for (let i = 1; i < humans; i++) A.join(g, 'h' + i, 'P' + i, i);
  for (let i = 0; i < bots && g.players.length < 6; i++) A.addBot(g, 'h0');
  if (g.players.length < 2) A.addBot(g, 'h0');
  A.rounds(g, 'h0', [10, 15, 20, 30][rnd(4)]);
  g.players.forEach(p => { if (!p.bot) A.ready(g, p.id, true); });
  A.start(g, 'h0');
  chk(g.status === 'jobs' || g.order.every(id => g.ps[id].bot), 'job phase');
  for (const id of g.order) if (!g.ps[id].job) {
    try { A.pickJob(clone(g), id, Object.keys(E.JOBS).find(k => !g.offers[id].includes(k))); chk(false, 'unoffered job'); } catch (e) { rejects++; }
    try { A.roll(clone(g), id); chk(false, 'roll during jobs'); } catch (e) { rejects++; }
    if (rnd(30) === 0) A.hostSkip(g, 'h0'); else A.pickJob(g, id, g.offers[id][rnd(g.offers[id].length)]);
    if (g.ps[id].job) { try { A.pickJob(clone(g), id, g.offers[id][0]); chk(false, 'picked twice'); } catch (e) { rejects++; } }
  }
  chk(g.status === 'playing' && g.order.every(id => g.ps[id].job), 'all jobs chosen');
  const ofs = g.order.map(id => g.offers[id].length); chk(ofs.every(n => n === (g.order.length <= 4 ? 4 : 3)), 'offer count');
  try { A.join(clone(g), 'late', 'x', 0); chk(false, 'late join'); } catch (e) { rejects++; }
  let s = 0;
  while (g.status === 'playing' && s++ < 20000) {
    const c = g.order[g.turnIdx], p = g.ps[c];
    const other = g.order.find(x => x !== c && !g.ps[x].bot);
    if (other && rnd(20) === 0) { try { A.roll(clone(g), other); chk(false, 'other rolled'); } catch (e) { chk(e instanceof GameError, 'bad err ' + e); rejects++; } }
    if (p.bot) { A.botStep(g, 'h0'); }
    else if (g.phase === 'roll') {
      if (rnd(4) === 0) { const b = E.owned(g, c).find(i => E.canBuild(g, c, i)); if (b !== undefined && p.cash >= E.houseCost(b)) A.build(g, c, b); }
      if (p.jam && rnd(2) && p.cash >= 5e6) A.jamPay(g, c);
      A.roll(g, c);
      try { A.roll(clone(g), c); chk(false, 'double roll'); } catch (e) { rejects++; }
    } else if (g.phase === 'act') {
      try { A.end(clone(g), c); chk(false, 'end with pending'); } catch (e) { rejects++; }
      const opts = optionsFor(g, c, g.q[0]); const ok = opts.map((o, i) => [o, i]).filter(([o]) => o.ok && !o.bk);
      const bad = opts.findIndex(o => !o.ok); if (bad >= 0) { try { A.resolve(clone(g), c, bad); chk(false, 'disabled accepted'); } catch (e) { rejects++; } }
      const pickI = ok.length ? ok[rnd(ok.length)][1] : opts.findIndex(o => o.bk);
      if (rnd(60) === 0) A.hostSkip(g, 'h0'); else A.resolve(g, c, pickI);
    } else A.end(g, c);
    if (g.ps) for (const id of g.order) { const q = g.ps[id]; chk(Number.isInteger(q.cash) && q.cash >= 0, 'cash ' + q.cash); chk(Number.isInteger(q.owe), 'owe'); }
    chk(Number.isInteger(g.fund) && g.fund >= 0, 'fund');
    for (const i of BUYABLE) { const pr = g.props[i]; chk(pr.h >= 0 && pr.h <= 5 && (!pr.o || !g.ps[pr.o].out) && !(pr.m && pr.h), 'prop state ' + JSON.stringify(pr)); }
  }
  chk(g.status === 'ended', 'not ended ' + s);
  games++; turns += g.turnNo; if (g.endReason === 'last') endLast++;
  for (const id of g.order) { players++; if (g.ps[id].out) bk++; }
  const r = computeResults(g); chk(r.every(x => x.title), 'titles');
  if (g.order.some(id => g.ps[id].bot) && g.order.some(id => !g.ps[id].bot)) { mixed++; if (g.ps[r[0].id].bot) botWins++; }
  A.rematch(g, 'h0'); chk(g.status === 'lobby' && !g.ps && !g.props, 'rematch');
}
const jobs = {}; console.log({ games, errs, rejects, avgTurns: (turns / games).toFixed(0), endedByLastStanding: (100 * endLast / games).toFixed(0) + '%', bankruptPlayers: (100 * bk / players).toFixed(0) + '%', botWinInMixed: (100 * botWins / mixed).toFixed(0) + '%' });
process.exit(errs ? 1 : 0);
