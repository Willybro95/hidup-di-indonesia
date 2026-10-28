// Embedded Postgres (PGlite) with Supabase's roles, auth schema and auth.uid() emulated, plus the
// same Store the edge function uses. Shared by the server tests and the browser end-to-end test.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { StoreError } from '../supabase/functions/_shared/handler.ts';
import type { Store } from '../supabase/functions/_shared/handler.ts';

export const db = new PGlite();

export async function setup() {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
}
export const users: string[] = [];
export async function newUser() { const id = randomUUID(); await exclusive(() => db.query('insert into auth.users (id) values ($1)', [id])); users.push(id); return id; }
// Run a query as a signed-in browser user (role authenticated, RLS on).
export async function asUser<T = any>(uid: string, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  return exclusive(async () => { try {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
    const r = await db.query<T>(sql, params);
    return { rows: r.rows };
  } catch (e: any) { return { rows: [], error: e.message }; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } });
}

// Runs one database session at a time (PGlite has a single connection; role switches must not interleave).
let chain: Promise<unknown> = Promise.resolve();
export function exclusive<T>(fn: () => Promise<T>): Promise<T> { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }

// A Store with the same behaviour as the edge function's, running as the service role.
export const store: Store = {
  async loadRoom(code) {
    const r = await exclusive(() => db.query<any>('select r.code, r.version, r.state, p.data as priv from public.game_rooms r left join public.game_private p on p.room_code = r.code where r.code = $1', [code]));
    const row = r.rows[0]; return row ? { code: row.code, version: row.version, state: row.state, priv: row.priv || {} } : null;
  },
  async findAction(user, request) {
    const r = await exclusive(() => db.query<any>('select room_code, version_after from public.game_actions where user_id = $1 and request_id = $2', [user, request]));
    return r.rows[0] || null;
  },
  async commit(c) {
    // PGlite has one connection; serialize calls the way Postgres serializes the row lock.
    const run = async () => {
      try {
        await db.exec('set role service_role');
        const r = await db.query<any>(`select public.apply_game_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[],$12::uuid[],$13) as v`,
          [c.code, c.expected, JSON.stringify(c.state), JSON.stringify(c.priv), c.status, c.host, c.user, c.request, c.action, JSON.stringify(c.args), c.add, c.remove, c.secrets === null ? null : JSON.stringify(c.secrets)]);
        return r.rows[0].v as number;
      } catch (e: any) {
        const t = `${e.message} ${e.detail || ''} ${e.constraint || ''}`;
        if (e.code === '40001' || t.includes('version_conflict')) throw new StoreError('conflict');
        if (e.code === '23505' && t.includes('game_actions')) throw new StoreError('duplicate');
        if (e.code === '23505') throw new StoreError('exists');
        throw e;
      } finally { await db.exec('reset role'); }
    };
    return exclusive(run);
  },
};
