// Plays many random games through the rules engine and checks money and turn invariants.
import * as E from '../supabase/functions/_shared/engine.js';
const { A, CARDS, computeResults, optionsFor, GameError, rnd } = E;
const clone = o => JSON.parse(JSON.stringify(o));
let errors = 0, games = 0, turnsTotal = 0, winsByCareer = {}, rejectsOk = 0;
const check = (cond, msg, g) => { if (!cond) { errors++; if (errors < 10) console.log('INVARIANT FAIL:', msg); } };
function invariants(g) {
  for (const id of g.order) { const p = g.ps[id];
    for (const k of ['cash', 'sav', 'debt', 'sal', 'liv', 'hap']) { check(Number.isInteger(p[k]), `${k} not integer: ${p[k]}`); }
    check(p.cash >= 0, 'negative cash ' + p.cash); check(p.sav >= 0, 'neg sav'); check(p.debt >= 0, 'neg debt'); check(p.hap >= 0 && p.hap <= 100, 'hap range');
    check(p.pos >= 0 && p.pos < 36, 'pos');
  }
}
const N = +process.argv[2] || 1000;
for (let gi = 0; gi < N; gi++) {
  let g = {}; const ids = Array.from({ length: 2 + rnd(5) }, (_, i) => 'u' + i);
  A.create(g, ids[0], 'Host', 0, 'ABCDE');
  for (const id of ids.slice(1)) A.join(g, id, 'P' + id, 1);
  // start before ready must fail
  try { A.start(clone(g), ids[0]); check(false, 'start without ready'); } catch (e) { check(e instanceof GameError, 'wrong err'); }
  for (const id of ids) A.ready(g, id, true);
  try { A.join(clone(g), 'zz', 'x', 0); } catch (e) {}
  A.start(g, ids[0]);
  try { A.join(clone(g), 'late', 'x', 0); check(false, 'late join allowed'); } catch (e) { rejectsOk++; }
  let steps = 0;
  while (g.status === 'playing' && steps < 5000) {
    steps++;
    const cur = g.order[g.turnIdx];
    const other = g.order.find(x => x !== cur);
    // non-active player can't act
    try { const t = clone(g); A.roll(t, other); check(false, 'other rolled'); } catch (e) { check(e instanceof GameError, 'bad error type ' + e); }
    const before = clone(g);
    if (g.phase === 'roll') {
      if (rnd(10) === 0 && g.ps[cur].debt > 0 && g.ps[cur].cash > 0) A.repay(g, cur, 'all');
      A.roll(g, cur);
      // double roll must fail
      try { const t = clone(g); A.roll(t, cur); check(false, 'double roll'); } catch (e) { rejectsOk++; }
    } else if (g.phase === 'act') {
      try { const t = clone(g); A.end(t, cur); check(false, 'ended with pending'); } catch (e) { rejectsOk++; }
      const opts = optionsFor(g, cur, g.q[0]);
      const ok = opts.map((o, i) => [o, i]).filter(([o]) => o.ok);
      check(ok.length > 0, 'no valid option for ' + JSON.stringify(g.q[0]));
      if (!ok.length) break;
      // disabled options must be rejected
      const bad = opts.findIndex(o => !o.ok);
      if (bad >= 0) { try { const t = clone(g); A.resolve(t, cur, bad); check(false, 'disabled option accepted'); } catch (e) { rejectsOk++; } }
      const [, i] = ok[rnd(ok.length)];
      if (rnd(40) === 0) A.hostSkip(g, g.hostId); else A.resolve(g, cur, i);
    } else if (g.phase === 'end') {
      A.end(g, cur);
    }
    if (g.ps) invariants(g);
  }
  check(g.status === 'ended', 'game did not end in ' + steps);
  turnsTotal += g.turnNo;
  // reveal + results
  g.reveals = E.dealGoals(g);
  const r = computeResults(g);
  check(r.every(x => Number.isFinite(x.total)), 'nan total');
  winsByCareer[g.ps[r[0].id].career] = (winsByCareer[g.ps[r[0].id].career] || 0) + 1;
  // rematch resets
  A.rematch(g, g.hostId); check(g.status === 'lobby' && !g.ps && g.players.every(p => !p.ready), 'rematch reset');
  games++;
}
console.log({ games, errors, rejectsOk, avgTurns: (turnsTotal / games).toFixed(1), cards: Object.keys(CARDS).length, winsByFinalCareer: winsByCareer });
if (errors) process.exit(1);
