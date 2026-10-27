// Supabase Edge Function: POST /functions/v1/game-action
// Body: { action, code?, args?, requestId, expect? }  →  { ok, code, version, state } | { ok: false, error, kind }
// The caller is identified from their Supabase session token; dice, cards and money are computed here only.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handleAction, StoreError } from '../_shared/handler.ts';
import type { Store, CommitInput } from '../_shared/handler.ts';
import type { Game } from '../_shared/engine.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map(s => s.trim()).filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const store: Store = {
  async loadRoom(code) {
    const { data, error } = await admin.from('game_rooms').select('code, version, state, game_private(data)').eq('code', code).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const p = (data as Record<string, unknown>).game_private as { data?: Record<string, unknown> } | { data?: Record<string, unknown> }[] | null;
    const priv = Array.isArray(p) ? p[0]?.data : p?.data;
    return { code: data.code, version: data.version, state: data.state as Game, priv: priv || {} };
  },
  async findAction(user, request) {
    const { data, error } = await admin.from('game_actions').select('room_code, version_after').eq('user_id', user).eq('request_id', request).maybeSingle();
    if (error) throw error;
    return data;
  },
  async loadSecrets(code, gameId) {
    const { data, error } = await admin.from('player_secrets').select('player_id, goal_key').eq('room_code', code).eq('game_id', gameId);
    if (error) throw error;
    return Object.fromEntries((data || []).map(r => [r.player_id, r.goal_key]));
  },
  async commit(c: CommitInput) {
    const { data, error } = await admin.rpc('apply_game_action', {
      p_code: c.code, p_expected: c.expected, p_state: c.state, p_private: c.priv, p_status: c.status, p_host: c.host,
      p_user: c.user, p_request: c.request, p_action: c.action, p_args: c.args, p_add: c.add, p_remove: c.remove, p_secrets: c.secrets,
    });
    if (error) {
      const text = `${error.message} ${error.details || ''}`;
      if (error.code === '40001' || text.includes('version_conflict')) throw new StoreError('conflict');
      if (error.code === '23505' && text.includes('game_actions')) throw new StoreError('duplicate');
      if (error.code === '23505') throw new StoreError('exists');
      throw error;
    }
    return data as number;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { ok: false, error: 'Gunakan POST.', kind: 'input' });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(req, 401, { ok: false, error: 'Masuk dulu untuk bermain.', kind: 'input' });
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json(req, 401, { ok: false, error: 'Sesi berakhir. Muat ulang halaman.', kind: 'input' });

  const raw = await req.text();
  if (raw.length > 4096) return json(req, 413, { ok: false, error: 'Permintaan terlalu besar.', kind: 'input' });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json(req, 400, { ok: false, error: 'Format permintaan salah.', kind: 'input' }); }

  try {
    const reply = await handleAction(store, auth.user.id, body);
    return json(req, 200, reply);
  } catch (e) {
    console.error('game-action failed', e);
    return json(req, 500, { ok: false, error: 'Server error. Coba lagi sebentar.', kind: 'busy' });
  }
});
