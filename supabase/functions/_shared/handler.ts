// Authoritative action handler. Runtime-agnostic: the Deno edge function and the Node tests both call it
// with a Store implementation. Nothing a browser sends is trusted beyond the action name and its validated arguments.
import { A, GameError, JOBS, mkCode } from './engine.js';
import type { Game } from './engine.js';

export interface RoomRow { code: string; version: number; state: Game; priv: Record<string, unknown> }
export interface SecretRow { game_id: string; player_id: string; user_id: string | null; goal: string }
export interface CommitInput {
  code: string; expected: number; state: Game; priv: Record<string, unknown>; status: string; host: string | null;
  user: string; request: string; action: string; args: unknown[]; add: string[]; remove: string[]; secrets: SecretRow[] | null;
}
export type StoreErrorKind = 'conflict' | 'duplicate' | 'exists';
export class StoreError extends Error { constructor(public kind: StoreErrorKind, msg?: string) { super(msg || kind); } }
export interface Store {
  loadRoom(code: string): Promise<RoomRow | null>;
  findAction(user: string, request: string): Promise<{ room_code: string; version_after: number | null } | null>;
  commit(c: CommitInput): Promise<number>;
}
export type Reply =
  | { ok: true; code: string; version: number; state: Game; duplicate?: boolean }
  | { ok: false; error: string; kind: 'rule' | 'input' | 'stale' | 'busy' | 'missing' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z0-9]{5}$/;
const PLAYER_ID = /^(bot-[a-z0-9]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
class InputError extends Error {}
const bad = (m: string): never => { throw new InputError(m); };
const int = (v: unknown, lo: number, hi: number, name: string) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi) ? v as number : bad(`Invalid ${name}.`);
function nick(v: unknown): string {
  if (typeof v !== 'string') bad('Invalid nickname.');
  const n = (v as string).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  const chars = [...n];
  if (!chars.length) bad('Enter a nickname first.');
  return chars.slice(0, 16).join('');
}
const none = (a: unknown[]) => { if (a.length) bad('This action takes no arguments.'); return []; };

// Allowed actions and their argument validators. Anything else is refused.
const space = (a: unknown[]) => [int(a[0], 0, 35, 'space')];
const ACTIONS: Record<string, (a: unknown[]) => unknown[]> = {
  create: a => [nick(a[0]), int(a[1] ?? 0, 0, 11, 'avatar'), int(a[2] ?? 0, 0, 5, 'number of bots')],
  join: a => [nick(a[0]), int(a[1] ?? 0, 0, 11, 'avatar')],
  leave: none, start: none, roll: none, end: none, hostSkip: none, hostEnd: none, rematch: none, addBot: none, botStep: none, jamPay: none, jamCard: none,
  ready: a => [typeof a[0] === 'boolean' ? a[0] : bad('Invalid ready status.')],
  kick: a => [typeof a[0] === 'string' && PLAYER_ID.test(a[0]) ? a[0] : bad('Invalid player.')],
  rounds: a => [[10, 15, 20, 30].includes(a[0] as number) ? a[0] : bad('Invalid number of rounds.')],
  chat: a => [int(a[0], 0, 9, 'message')],
  resolve: a => [int(a[0], 0, 40, 'choice')],
  pickJob: a => [typeof a[0] === 'string' && Object.hasOwn(JOBS, a[0]) ? a[0] : bad('Invalid job.')],
  build: space, sellHouse: space, mortgage: space, unmortgage: space,
};

const humans = (g: Game) => new Set((g.players || []).filter(p => !p.bot).map(p => p.id));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const publicState = (g: Game) => { const s = clone(g); delete s.decks; return s; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function handleAction(store: Store, userId: string, body: unknown): Promise<Reply> {
  // ── input ──
  let action: string, args: unknown[], code = '', request: string, expect: number | undefined;
  try {
    if (!body || typeof body !== 'object') bad('Invalid request.');
    const b = body as Record<string, unknown>;
    action = typeof b.action === 'string' && Object.hasOwn(ACTIONS, b.action) ? b.action : bad('Unknown action.');
    request = typeof b.requestId === 'string' && UUID.test(b.requestId) ? b.requestId.toLowerCase() : bad('Invalid requestId.');
    if (action !== 'create') code = typeof b.code === 'string' && CODE.test(b.code) ? b.code : bad('Invalid room code.');
    const raw = b.args === undefined ? [] : Array.isArray(b.args) && b.args.length <= 4 ? b.args : bad('Invalid arguments.');
    args = ACTIONS[action](raw);
    if (b.expect !== undefined) expect = int(b.expect, 1, 1e9, 'version');
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message, kind: 'input' };
    throw e;
  }

  // ── idempotency: a request that was already applied returns the current state, unchanged ──
  const dup = async (): Promise<Reply> => {
    const prev = await store.findAction(userId, request);
    const room = prev ? await store.loadRoom(prev.room_code) : null;
    if (!room) return { ok: false, error: 'This request was already processed.', kind: 'stale' };
    return { ok: true, code: room.code, version: room.version, state: publicState(room.state), duplicate: true };
  };
  if (await store.findAction(userId, request)) return dup();

  // ── create: the server picks an unused code ──
  if (action === 'create') {
    for (let i = 0; i < 8; i++) {
      const c = mkCode(), g = {} as Game;
      try { A.create(g, userId, args[0], args[1], c, args[2]); } catch (e) { if (e instanceof GameError) return { ok: false, error: e.message, kind: 'rule' }; throw e; }
      g.v = 1; g.at = Date.now(); g.by = userId;
      try {
        const v = await store.commit({ code: c, expected: 0, state: g, priv: {}, status: g.status, host: userId, user: userId, request, action, args, add: [userId], remove: [], secrets: null });
        return { ok: true, code: c, version: v, state: g };
      } catch (e) {
        if (e instanceof StoreError && e.kind === 'exists') continue;
        if (e instanceof StoreError && e.kind === 'duplicate') return dup();
        throw e;
      }
    }
    return { ok: false, error: 'Couldn’t create a unique room code. Try again.', kind: 'busy' };
  }

  // ── everything else: read → apply rules → write if unchanged, else retry ──
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0 && await store.findAction(userId, request)) return dup(); // our own twin request won the race
    const room = await store.loadRoom(code);
    if (!room || room.state.status === 'closed') return { ok: false, error: 'Room not found.', kind: 'missing' };
    if (expect !== undefined && room.version !== expect) return { ok: false, error: 'The game has moved on.', kind: 'stale' };
    const before = room.state;
    if (action !== 'join' && !(before.players || []).some(p => p.id === userId)) return { ok: false, error: 'You’re not in this room.', kind: 'rule' };

    const g = clone(before);
    if (room.priv && room.priv.decks) g.decks = clone(room.priv.decks) as Game['decks'];
    try { A[action](g, userId, ...args); }
    catch (e) { if (e instanceof GameError) return { ok: false, error: e.message, kind: 'rule' }; throw e; }

    const h0 = humans(before), h1 = humans(g);
    const add = [...h1].filter(id => !h0.has(id)), remove = [...h0].filter(id => !h1.has(id));
    const priv = { decks: g.decks || {} };
    delete g.decks;
    g.v = room.version + 1; g.at = Date.now(); g.by = userId;
    try {
      const v = await store.commit({ code, expected: room.version, state: g, priv, status: g.status, host: g.hostId, user: userId, request, action, args, add, remove, secrets: null });
      return { ok: true, code, version: v, state: g };
    } catch (e) {
      if (e instanceof StoreError && e.kind === 'conflict') {
        if (expect !== undefined) return { ok: false, error: 'The game has moved on.', kind: 'stale' };
        await sleep(15 + Math.floor(Math.random() * 60 * (attempt + 1)));
        continue;
      }
      if (e instanceof StoreError && e.kind === 'duplicate') return dup();
      throw e;
    }
  }
  return { ok: false, error: 'The server is busy. Try again.', kind: 'busy' };
}
