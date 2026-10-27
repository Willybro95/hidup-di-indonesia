import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ASSETS, BOARD, CARDS, CAREERS, CATS, GOALS, SPACE_TYPES,
  assetValue, avOf, creditLimit, nameOf, netWorth, optionsFor, rp, rpShort,
} from '../../supabase/functions/_shared/engine.js';
import type { Game as G, QueueItem } from '../../supabase/functions/_shared/engine.js';
import { Avatar, Confirm, Die, Dot, Modal, PCOL, typeColor, useApp } from './ui';
import { Chat } from './Chat';
import { beep } from '../lib/sound';

export type Act = (a: string, args?: unknown[], opts?: { expect?: number; silent?: boolean }) => Promise<boolean>;
interface Props { g: G; version: number; online: Set<string>; busy: boolean; act: Act; goal: string | null }
interface Anim { p: string; from: number; steps: number; cur: number; phase: 'dice' | 'move'; dice: [number, number]; landed?: number }

const CORNERS = [0, 9, 18, 27];
function tileRC(i: number): [number, number] { if (i <= 9) return [10, 10 - i]; if (i <= 18) return [10 - (i - 9), 1]; if (i <= 27) return [1, 1 + (i - 18)]; return [1 + (i - 27), 10]; }
const TILE_DESC: Record<string, string> = {
  start: 'Lewat atau mendarat: terima gaji, bayar biaya hidup dan cicilan. Mendarat tepat dapat bonus Rp500 ribu.',
  kerja: 'Pilih lembur, kerja santai, atau kejar promosi.', invest: 'Tiga tawaran aset. Beli tunai atau KPR untuk properti.',
  rehat: 'Kebahagiaan +10, bayar Rp200 ribu kalau ada.', fixed: 'Desak-desakan atau bayar ojol.',
  peluang: 'Ambil kartu Peluang.', apes: 'Ambil kartu Apes.', realita: 'Ambil kartu Realita Indonesia.', gaya: 'Ambil kartu Gaya Hidup.',
  keuangan: 'Ambil kartu Keputusan Keuangan.', keluarga: 'Ambil kartu Kewajiban Keluarga.', admin: 'Ambil kartu Birokrasi.',
  darurat: 'Ambil kartu Darurat. Dana darurat dan asuransi membantu di sini.', spesial: 'Event spesial yang bisa memengaruhi semua pemain.',
};

export function Game({ g, version, online, busy, act, goal }: Props) {
  const { me, toast } = useApp();
  const order = g.order!, ps = g.ps!, cur = order[g.turnIdx!], mine = cur === me;
  const pColor = (id: string) => PCOL[Math.max(0, order.indexOf(id)) % PCOL.length];
  const isOn = (id: string) => ps[id]?.bot ? true : online.has(id);

  const [anim, setAnim] = useState<Anim | null>(null);
  const [tab, setTab] = useState<'pemain' | 'dompet' | 'riwayat' | 'chat'>('pemain');
  const [tile, setTile] = useState<number | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [confirm, setConfirm] = useState<'skip' | 'end' | null>(null);
  const timers = useRef<number[]>([]);
  const lastMove = useRef<string | null | undefined>(undefined);
  const lastTurn = useRef<string | null>(null);

  // Animate each newly committed move (not the one already on screen when the page loads).
  useEffect(() => {
    const k = g.move?.k ?? null;
    if (lastMove.current === undefined) { lastMove.current = k; return; }
    if (!k || k === lastMove.current || !g.move) return;
    lastMove.current = k;
    const mv = g.move, dice = (g.dice || [1, 1]) as [number, number];
    timers.current.forEach(clearTimeout); timers.current = [];
    setAnim({ p: mv.p, from: mv.from, steps: mv.steps, cur: mv.from, phase: 'dice', dice });
    beep(300, 0.05);
    const t0 = window.setTimeout(() => {
      for (let n = 1; n <= mv.steps; n++) {
        timers.current.push(window.setTimeout(() => {
          beep(520 + n * 25, 0.03, 'square', 0.03);
          setAnim(a => a && { ...a, phase: 'move', cur: (mv.from + n) % BOARD.length, landed: n === mv.steps ? (mv.from + n) % BOARD.length : undefined });
        }, n * 150));
      }
      timers.current.push(window.setTimeout(() => setAnim(null), mv.steps * 150 + 420));
    }, 750);
    timers.current.push(t0);
  }, [g.move?.k]); // runs once per committed move
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Tell the player when it becomes their turn.
  useEffect(() => {
    const key = `${g.turnNo}:${cur}`;
    if (lastTurn.current && key !== lastTurn.current && cur === me) { beep(523, 0.1); window.setTimeout(() => beep(784, 0.15), 110); toast('Giliranmu!'); }
    if (key !== lastTurn.current) setMinimized(false);
    lastTurn.current = key;
  }, [g.turnNo, cur, me, toast]);

  // Bot turns: the host's page plays them; if the host is offline, the first online human takes over.
  const humans = order.filter(id => !ps[id].bot);
  const driver = g.hostId && online.has(g.hostId) ? g.hostId : humans.filter(id => online.has(id)).sort()[0];
  const botTurn = !!ps[cur]?.bot;
  useEffect(() => {
    if (!botTurn || anim || busy || driver !== me) return;
    const t = window.setTimeout(() => { act('botStep', [], { expect: version, silent: true }); }, g.phase === 'act' ? 1500 : 900);
    return () => clearTimeout(t);
  }, [version, botTurn, anim, busy, driver, me, g.phase, act]);

  const shownPos = (id: string) => anim && anim.p === id ? (anim.phase === 'move' ? anim.cur : anim.from) : ps[id].pos;
  const pending = g.status === 'playing' && !anim && (g.q?.length || 0) > 0 && !minimized;

  return (
    <div className="wrap">
      <div className="game">
        <div className="stack">
          <Board g={g} cur={cur} anim={anim} tile={tile} setTile={setTile} shownPos={shownPos} pColor={pColor} />
          <ActionBar g={g} cur={cur} mine={mine} busy={busy} anim={!!anim} act={act} pColor={pColor} isOn={isOn}
            minimized={minimized} openPending={() => setMinimized(false)} onSkip={() => setConfirm('skip')} onEnd={() => setConfirm('end')} />
        </div>
        <aside className="side panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tabs" role="tablist">
            {([['pemain', 'Pemain'], ['dompet', 'Dompetku'], ['riwayat', 'Riwayat'], ['chat', 'Chat']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div className="tabbody">
            {tab === 'pemain' && <Players g={g} cur={cur} pColor={pColor} isOn={isOn} />}
            {tab === 'dompet' && <Wallet g={g} busy={busy} act={act} goal={goal} canManage={mine && (g.phase === 'roll' || g.phase === 'end') && !busy && !anim} />}
            {tab === 'riwayat' && <Log g={g} pColor={pColor} />}
            {tab === 'chat' && <Chat g={g} bare onSend={i => act('chat', [i])} />}
          </div>
        </aside>
      </div>
      {pending && <Pending g={g} cur={cur} mine={mine} busy={busy} act={act} onMinimize={() => setMinimized(true)} />}
      {confirm === 'skip' && <Confirm title={`Lewati giliran ${nameOf(g, cur)}?`} text="Keputusan yang menunggu akan diambil otomatis dengan pilihan paling aman. Pembayaran wajib tetap ditagih."
        onNo={() => setConfirm(null)} onYes={() => { setConfirm(null); act('hostSkip'); }} />}
      {confirm === 'end' && <Confirm title="Akhiri game sekarang?" text="Skor dihitung dari kondisi saat ini untuk semua pemain."
        onNo={() => setConfirm(null)} onYes={() => { setConfirm(null); act('hostEnd'); }} />}
    </div>
  );
}

function Board({ g, cur, anim, tile, setTile, shownPos, pColor }: {
  g: G; cur: string; anim: Anim | null; tile: number | null; setTile: (n: number | null) => void; shownPos: (id: string) => number; pColor: (id: string) => string;
}) {
  const { me } = useApp();
  const dice = anim ? anim.dice : (g.dice || [1, 1]);
  const last = [...g.log].reverse().find(e => e.t && !e.t.startsWith('Kocok'));
  return (
    <div className="boardbox">
      <div className="board">
        {BOARD.map((s, i) => {
          const [r, c] = tileRC(i), T = SPACE_TYPES[s.t];
          const here = g.order!.filter(id => shownPos(id) === i);
          return (
            <button key={i} className={`tile ${CORNERS.includes(i) ? 'corner' : ''} ${tile === i ? 'sel' : ''} ${anim?.landed === i ? 'hit' : ''}`}
              style={{ gridRow: r, gridColumn: c, ['--tc' as string]: typeColor(s.t) }} onClick={() => setTile(tile === i ? null : i)} aria-label={`Petak ${i}: ${s.n} (${T.lab})`}>
              <span className="ic">{T.ic}</span><span className="nm">{s.n}</span>
              <span className="toks">{here.map(id => (
                <span key={id} className={`tok ${id === me ? 'me' : ''} ${id === cur ? 'act' : ''}`} style={id === me ? undefined : { background: pColor(id) }} title={nameOf(g, id)}>{avOf(g, id)}</span>
              ))}</span>
            </button>
          );
        })}
        <div className="center">
          <div className="logo">HIDUP DI<br /><b>INDONESIA</b></div>
          <div className="dice"><Die n={dice[0]} spin={anim?.phase === 'dice'} /><Die n={dice[1]} spin={anim?.phase === 'dice'} red /></div>
          <div className="turn">{cur === me ? 'Giliranmu!' : `Giliran ${nameOf(g, cur)}`}</div>
          {tile !== null ? (
            <div className="tileinfo"><b>{SPACE_TYPES[BOARD[tile].t].ic} {BOARD[tile].n}</b><br />{TILE_DESC[BOARD[tile].t]}</div>
          ) : last ? (
            <div className="last">{last.p && <b>{nameOf(g, last.p)}: </b>}{last.t}{last.d ? <> <b className={last.d > 0 ? 'pos' : 'neg'}>{last.d > 0 ? '+' : ''}{rpShort(last.d)}</b></> : null}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionBar({ g, cur, mine, busy, anim, act, pColor, isOn, minimized, openPending, onSkip, onEnd }: {
  g: G; cur: string; mine: boolean; busy: boolean; anim: boolean; act: Act; pColor: (id: string) => string; isOn: (id: string) => boolean;
  minimized: boolean; openPending: () => void; onSkip: () => void; onEnd: () => void;
}) {
  const { me } = useApp();
  const p = g.ps![cur], c = CAREERS[p.career];
  if (!g.ps![me]) return <div className="actionbar"><div className="turnbar">Kamu menonton game ini.</div></div>;
  let main = null, note = '';
  if (mine) {
    if (g.phase === 'roll') { main = <button className="btn pri big block" onClick={() => act('roll')} disabled={busy || anim}>🎲 Kocok dadu</button>; note = 'Kocok sekali, lalu selesaikan kejadian di petak tujuan.'; }
    else if (g.phase === 'act') { main = <button className="btn pink big block" onClick={openPending} disabled={anim}>Lihat keputusan ({g.q!.length})</button>; note = 'Ada keputusan yang wajib diselesaikan sebelum giliran berakhir.'; }
    else if (g.phase === 'end') { main = <button className="btn teal big block" onClick={() => act('end')} disabled={busy || anim}>Selesai giliran ➜</button>; note = 'Mau bayar utang atau jual aset dulu? Buka tab Dompetku.'; }
  } else if (g.phase === 'act' && minimized && !anim) {
    main = <button className="btn block" onClick={openPending}>Lihat kartu {nameOf(g, cur)}</button>;
  }
  if (p.bot) note = '🤖 Bot sedang jalan. Gilirannya dimainkan otomatis.';
  const host = g.hostId === me;
  return (
    <div className="actionbar">
      <div className={`turnbar ${mine ? 'mine' : ''}`}>
        <Avatar av={p.av} bg={pColor(cur)} />
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{mine ? 'Giliranmu' : `Giliran ${nameOf(g, cur)}`}</div>
          <div className="small muted">{c.ic} {c.name} · {rpShort(p.cash)} · 😊{p.hap}{!isOn(cur) && <> · <span className="neg">offline</span></>}</div>
        </div>
        {!mine && <span className="chip">{p.bot ? '🤖 ' : ''}{g.phase === 'roll' ? 'Mau kocok' : g.phase === 'act' ? 'Sedang memutuskan' : 'Hampir selesai'}</span>}
      </div>
      {main}
      {note && <div className="small muted" style={{ textAlign: 'center' }}>{note}</div>}
      {host && (
        <details className="collap">
          <summary className="small muted" style={{ fontWeight: 700, padding: '4px 0' }}>Kontrol host ▾</summary>
          <div className="row" style={{ marginTop: 6 }}>
            {!mine && !p.bot && <button className="btn sm" onClick={onSkip} disabled={busy}>Lewati giliran {nameOf(g, cur)}</button>}
            <button className="btn sm ghost" onClick={onEnd} disabled={busy}>Akhiri game sekarang</button>
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>Gunakan "Lewati giliran" bila pemain aktif terputus terlalu lama.</p>
        </details>
      )}
    </div>
  );
}

function Players({ g, cur, pColor, isOn }: { g: G; cur: string; pColor: (id: string) => string; isOn: (id: string) => boolean }) {
  const { me } = useApp();
  return <>{g.order!.map(id => {
    const p = g.ps![id], c = CAREERS[p.career];
    return (
      <div key={id} className={`pcard ${id === cur ? 'act' : ''}`}>
        <div className="hd"><Avatar av={p.av} small bg={pColor(id)} /><span className="nm">{p.bot ? '🤖 ' : ''}{nameOf(g, id)}{id === me ? ' (kamu)' : ''}</span><Dot on={isOn(id)} />{id === g.hostId ? '👑' : ''}</div>
        <div className="small">{c.ic} {c.name}{p.skip ? <> · <span className="neg">lewati giliran</span></> : null}{p.bk ? <> · <span className="neg">bangkrut ×{p.bk}</span></> : null}</div>
        <div className="kv"><div>Tunai<b>{rpShort(p.cash)}</b></div><div>Utang<b className={p.debt ? 'neg' : ''}>{rpShort(p.debt)}</b></div><div>Aset<b>{p.assets.length}</b></div></div>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className="small">😊</span><div className="bar" style={{ flex: 1 }}><i style={{ width: `${p.hap}%` }} /></div><span className="small num" style={{ fontWeight: 800 }}>{p.hap}</span></div>
      </div>
    );
  })}</>;
}

function Wallet({ g, busy, act, goal, canManage }: { g: G; busy: boolean; act: Act; goal: string | null; canManage: boolean }) {
  const { me } = useApp();
  const p = g.ps![me];
  if (!p) return <div className="empty">Kamu tidak ikut game ini.</div>;
  const c = CAREERS[p.career], liv = Math.floor(p.liv * (10000 + (g.infl || 0)) / 10000 / 1000) * 1000, nw = netWorth(g, p), gd = goal ? GOALS[goal] : null;
  return (
    <>
      <div className="stat">
        <div><div className="label">Tunai</div><div className="v">{rp(p.cash)}</div></div>
        <div><div className="label">Dana darurat</div><div className="v">{rp(p.sav)}</div></div>
        <div><div className="label">Utang</div><div className={`v ${p.debt ? 'neg' : ''}`}>{rp(p.debt)}</div></div>
        <div><div className="label">Kekayaan bersih</div><div className={`v ${nw < 0 ? 'neg' : ''}`}>{rp(nw)}</div></div>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className="label" style={{ flex: 'none' }}>Kebahagiaan</span><div className="bar" style={{ flex: 1 }}><i style={{ width: `${p.hap}%` }} /></div><b className="num">{p.hap}/100</b></div>
      <div className="pcard">
        <div style={{ fontWeight: 800 }}>{c.ic} {c.name}</div>
        <div className="kv"><div>Gaji pokok<b>{rpShort(p.sal)}</b></div><div>Biaya hidup<b>{rpShort(liv)}</b></div><div>Promosi<b>{p.promos}×</b></div></div>
        <div className="small muted">{c.var ? `Pendapatan bervariasi ${c.var[0]}–${c.var[1]}% tiap gajian. ` : ''}{c.note || ''}{p.ins ? ' Punya asuransi kesehatan.' : ''} Batas utang {rpShort(creditLimit(p))}.</div>
      </div>
      <div className="goal">
        <div className="label" style={{ color: 'var(--violet)' }}>Tujuan rahasia · hanya kamu yang lihat</div>
        {gd ? <><div style={{ fontWeight: 800 }}>{gd.name}</div><div className="small">{gd.desc} Bernilai +250 poin di akhir.</div></> : <div className="small muted">Mengambil tujuanmu…</div>}
      </div>
      <div>
        <div className="label" style={{ marginBottom: 6 }}>Aset</div>
        <div className="assets">
          {p.assets.length ? p.assets.map(a => {
            const v = assetValue(g, a.k), A0 = ASSETS[a.k];
            return (
              <div className="asset" key={a.id}><span>{A0.ic}</span>
                <div className="grow"><b>{A0.name}</b><div className="small muted">Nilai {rp(v)}{A0.inc ? ` · +${rpShort(A0.inc)}/gajian` : ''}</div></div>
                <button className="btn sm" disabled={!canManage || busy} onClick={() => act('sell', [a.id])}>Jual {rpShort(Math.floor(v * 85 / 100 / 1000) * 1000)}</button>
              </div>
            );
          }) : <div className="empty" style={{ padding: 10 }}>Belum punya aset. Mampir ke petak Investasi.</div>}
        </div>
      </div>
      <div className="row">
        <button className="btn sm" disabled={!canManage || !p.debt || !p.cash} onClick={() => act('repay', [1])}>Bayar utang Rp1jt</button>
        <button className="btn sm" disabled={!canManage || !p.debt || !p.cash} onClick={() => act('repay', ['all'])}>Lunasi semampunya</button>
      </div>
      {!canManage && <div className="small muted">Bayar utang dan jual aset bisa dilakukan di giliranmu, sebelum kocok dadu atau sebelum selesai giliran.</div>}
      <details className="collap">
        <summary className="label">Harga pasar aset ▾</summary>
        <div className="assets" style={{ marginTop: 6 }}>
          {Object.keys(ASSETS).map(k => <div className="asset" key={k}><span>{ASSETS[k].ic}</span><div className="grow">{ASSETS[k].name}</div><b className={`num ${(g.market?.[k] ?? 10000) >= 10000 ? 'pos' : 'neg'}`}>{rpShort(assetValue(g, k))}</b></div>)}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>Inflasi biaya hidup: +{((g.infl || 0) / 100).toFixed(0)}% sejak awal game.</div>
      </details>
    </>
  );
}

export function Log({ g, pColor }: { g: G; pColor: (id: string) => string }) {
  if (!g.log.length) return <div className="empty">Belum ada kejadian.</div>;
  return (
    <div className="log">
      {[...g.log].reverse().map((e, i) => (
        <div className="e" key={i}>
          {e.p ? <Avatar av={g.ps?.[e.p]?.av ?? 0} small bg={pColor(e.p)} /> : <span className="av s">🎲</span>}
          <div>{e.p && <><b>{nameOf(g, e.p)}</b> · </>}{e.t}</div>
          <span className={`d ${e.d > 0 ? 'pos' : e.d < 0 ? 'neg' : ''}`}>{e.d ? (e.d > 0 ? '+' : '') + rp(e.d) : ''}</span>
        </div>
      ))}
    </div>
  );
}

function Pending({ g, cur, mine, busy, act, onMinimize }: { g: G; cur: string; mine: boolean; busy: boolean; act: Act; onMinimize: () => void }) {
  const it = g.q![0] as QueueItem, p = g.ps![cur];
  const view = useMemo(() => {
    let cc = 'var(--yellow)', ic = '🎲', cat = '', title = '', desc = '';
    if (it.k === 'card') { const c = CARDS[it.id], t = c.cat; cc = typeColor(t); ic = SPACE_TYPES[t].ic; cat = CATS[c.cat]; title = c.title; desc = c.desc; }
    else if (it.k === 'pay') { cc = 'var(--t-darurat)'; ic = '💸'; cat = 'Tagihan wajib'; title = 'Uang Tidak Cukup'; desc = `Tagihan ${it.why} sebesar ${rp(it.amt)}, uang tunai ${rp(p.cash)}. Pilih cara menutupnya.`; }
    else if (it.k === 'invest') { cc = 'var(--t-invest)'; ic = '📈'; cat = 'Investasi'; title = BOARD[p.pos].n; desc = 'Tiga tawaran hari ini. Harga mengikuti pasar.'; }
    else { const c = CAREERS[p.career]; cc = 'var(--t-kerja)'; ic = c.ic; cat = 'Kerja & Karier'; title = BOARD[p.pos].n; desc = `Sebagai ${c.name}, apa rencanamu hari ini?`; }
    const opts = optionsFor(JSON.parse(JSON.stringify(g)), cur, JSON.parse(JSON.stringify(it)));
    return { cc, ic, cat, title, desc, opts };
  }, [g, cur, it, p]);
  return (
    <Modal label={view.title}>
      <div className="band" style={{ ['--cc' as string]: view.cc }}>
        <span className="ic">{view.ic}</span><span className="cat">{view.cat}</span><span style={{ flex: 1 }} />
        {!mine && <button className="btn sm" onClick={onMinimize} style={{ background: '#fff', color: '#17201B' }}>Tutup</button>}
      </div>
      <div className="body">
        <h2>{view.title}</h2>
        <div className="desc">{view.desc}</div>
        {!mine && <div className="banner info">{p.bot ? '🤖 Bot ' : ''}{nameOf(g, cur)} sedang memutuskan…</div>}
        <div className="opts">
          {view.opts.map((o, i) => (
            <button key={i} className="opt" disabled={!mine || !o.ok || busy} onClick={() => act('resolve', [i])}>{o.l}{o.sub && <span>{o.sub}</span>}</button>
          ))}
        </div>
        {g.q!.length > 1 && <div className="small muted">Masih ada {g.q!.length - 1} kejadian lagi setelah ini.</div>}
      </div>
    </Modal>
  );
}
