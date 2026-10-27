import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Hero({ small }: { small?: boolean }) {
  return (
    <section className="hero" style={small ? { paddingBlock: 6 } : undefined}>
      <h1 style={small ? { fontSize: 'clamp(34px,9vw,64px)' } : undefined}><span className="l1">HIDUP DI</span><span className="l2">INDONESIA</span></h1>
      <span className="tag" style={{ justifySelf: 'start' }}>Gaji Masuk, Masalah Datang.</span>
    </section>
  );
}

export function SetupNeeded() {
  return (
    <div className="wrap">
      <Hero />
      <div className="panel" style={{ padding: 18, maxWidth: 620 }}>
        <h2 className="disp" style={{ fontSize: 20 }}>Server belum tersambung</h2>
        <p>Situs ini belum diberi alamat server Supabase. Isi <code className="k">VITE_SUPABASE_URL</code> dan <code className="k">VITE_SUPABASE_ANON_KEY</code> (lihat README, langkah 4), lalu deploy ulang.</p>
      </div>
    </div>
  );
}

export function SignIn({ onRules }: { onRules: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function guest() {
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) setErr(/anonymous/i.test(error.message) ? 'Login tamu belum diaktifkan di server. Pemilik situs: aktifkan "Anonymous sign-ins" di Supabase (README langkah 3).' : error.message);
  }
  async function magic(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Alamat email belum benar.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + location.search } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }

  return (
    <div className="wrap">
      <Hero />
      <p style={{ maxWidth: '58ch', margin: '0 0 16px', fontSize: 16 }}>Board game online 2–6 pemain tentang gajian, cicilan, kondangan, dan flash sale tengah malam. Yang paling kaya belum tentu menang: kebahagiaan dan tujuan hidup rahasiamu ikut dihitung.</p>
      <div className="home-grid">
        <div className="panel" style={{ padding: 18 }}>
          <div className="stack">
            <div className="label">Masuk untuk bermain</div>
            <button className="btn pri big block" onClick={guest} disabled={busy}>{busy ? <span className="spinner" /> : null}Main sebagai tamu</button>
            <p className="small muted" style={{ margin: 0 }}>Tanpa daftar. Progres tersimpan di browser ini.</p>
            <div className="label" style={{ marginTop: 6 }}>Atau masuk dengan email</div>
            {sent ? (
              <div className="banner info">Link masuk sudah dikirim ke <b>{email}</b>. Buka email itu di perangkat ini.</div>
            ) : (
              <form onSubmit={magic} className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="field" id="email" type="email" autoComplete="email" placeholder="nama@email.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
                <button className="btn" type="submit" disabled={busy} style={{ flex: 'none' }}>Kirim link</button>
              </form>
            )}
            {err && <div className="banner err">{err}</div>}
          </div>
        </div>
        <div className="stack">
          <div className="feat">
            <div><b>36 petak kehidupan</b>Kantor, kelurahan, KRL jam sibuk, rumah mertua, sampai pijat refleksi.</div>
            <div><b>141 kartu kejadian</b>Peluang, apes, realita, gaya hidup, keputusan keuangan.</div>
            <div><b>12 karier</b>Dari fresh graduate sampai content creator, dengan risiko PHK masing-masing.</div>
            <div><b>Bisa lawan bot</b>Main sendiri atau isi kursi kosong dengan bot.</div>
          </div>
          <button className="btn" onClick={onRules}>Aturan main &amp; tutorial</button>
        </div>
      </div>
    </div>
  );
}
