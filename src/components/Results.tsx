import { CAREERS, GOALS, TITLES, computeResults, nameOf, rp, rpShort } from '../../supabase/functions/_shared/engine.js';
import type { Game } from '../../supabase/functions/_shared/engine.js';
import { Avatar, PCOL, useApp } from './ui';
import { Hero } from './Welcome';
import { Log } from './Game';
import type { Act } from './Game';

export function Results({ g, busy, act, onHome }: { g: Game; busy: boolean; act: Act; onHome: () => void }) {
  const { me } = useApp();
  if (!g.ps || !g.order) return <div className="wrap"><div className="empty">Memuat hasil…</div></div>;
  const rows = computeResults(g);
  const pColor = (id: string) => PCOL[Math.max(0, g.order!.indexOf(id)) % PCOL.length];
  return (
    <div className="wrap">
      <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
        <Hero small />
        <div className="banner info"><b>{nameOf(g, rows[0].id)}</b> paling berhasil hidup di Indonesia.</div>
        <div className="podium">
          {rows.map((r, i) => {
            const T = TITLES[r.title], gk = r.goalKey ? GOALS[r.goalKey] : null, x = r.parts;
            return (
              <div key={r.id} className={`rank ${i === 0 ? 'first' : ''}`}>
                <div className="no">{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar av={r.p.av} small bg={pColor(r.id)} /><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.p.bot ? '🤖 ' : ''}{nameOf(g, r.id)}{r.id === me ? ' (kamu)' : ''}</b></div>
                  <div className="ttl">{T[0]}</div><div className="small muted">{T[1]}</div>
                </div>
                <div className="score">{r.total}</div>
                <div className="brk">
                  <div>Kekayaan bersih<br /><b>{rp(r.nw)}</b> → {x.wealth}</div>
                  <div>Kebahagiaan {r.p.hap}<br /><b>{x.hap}</b></div>
                  <div>Karier ({CAREERS[r.p.career].name})<br /><b>{x.career}</b></div>
                  <div>Tujuan: {gk ? gk.name : '—'}<br /><b>{gk ? (r.goalMet ? '✓ +250' : '✗ 0') : '—'}</b></div>
                  <div>Bebas utang<br /><b>{x.debtFree ? '+80' : `utang ${rpShort(r.p.debt)}`}</b></div>
                  {x.bk ? <div>Bangkrut<br /><b className="neg">{x.bk}</b></div> : null}
                  <div>Tunai / tabungan<br /><b>{rpShort(r.p.cash)} / {rpShort(r.p.sav)}</b></div>
                  <div>Aset ({r.p.assets.length})<br /><b>{rpShort(r.assetsV)}</b></div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row">
          {g.hostId === me ? <button className="btn pri big" onClick={() => act('rematch')} disabled={busy}>Main lagi (rematch)</button> : <span className="muted">Menunggu host memulai rematch…</span>}
          <button className="btn ghost" onClick={onHome}>Kembali ke menu</button>
        </div>
        <details className="collap panel" style={{ padding: 12 }}>
          <summary className="label">Riwayat lengkap ▾</summary>
          <div style={{ marginTop: 8 }}><Log g={g} pColor={pColor} /></div>
        </details>
      </div>
    </div>
  );
}
