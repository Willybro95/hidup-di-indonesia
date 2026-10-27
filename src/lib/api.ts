// Every game action goes to the server function. The same requestId is reused on retry,
// so a request that reached the server before the connection dropped is never applied twice.
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import type { Game } from '../../supabase/functions/_shared/engine.js';

export type ActionReply =
  | { ok: true; code: string; version: number; state: Game; duplicate?: boolean }
  | { ok: false; error: string; kind: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function callAction(action: string, code: string | null, args: unknown[] = [], expect?: number): Promise<ActionReply> {
  const requestId = crypto.randomUUID();
  let lastErr = 'Gagal tersambung ke server.';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { ok: false, error: 'Sesi berakhir. Muat ulang halaman.', kind: 'auth' };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/game-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ action, code: code ?? undefined, args, requestId, expect }),
      });
      const body = await res.json().catch(() => null);
      if (body && typeof body.ok === 'boolean') return body as ActionReply;
      lastErr = `Server menjawab ${res.status}.`;
      if (res.status < 500) break;
    } catch {
      lastErr = 'Koneksi terputus. Mencoba lagi…';
    }
    await sleep(400 * (attempt + 1));
  }
  return { ok: false, error: lastErr, kind: 'network' };
}
