import { SPACE_TYPES } from '../../supabase/functions/_shared/engine.js';
import { Modal, typeColor } from './ui';

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Aturan main" wide onClose={onClose}>
      <div className="band" style={{ ['--cc' as string]: 'var(--yellow)' }}>
        <span className="ic">📖</span><span className="cat">Aturan main</span><span style={{ flex: 1 }} />
        <button className="btn sm" onClick={onClose} style={{ background: '#fff', color: '#17201B' }}>Tutup</button>
      </div>
      <div className="body rules" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
        <h3>Tujuan</h3>
        <p>Bertahan hidup selama beberapa ronde (8–20, dipilih host) dan kumpulkan Skor Hidup tertinggi. Uang penting, tapi bukan segalanya.</p>
        <h3>Mulai</h3>
        <ul>
          <li>Setiap pemain mulai dengan Rp10.000.000, kebahagiaan 50/100, karier acak, dan satu tujuan rahasia.</li>
          <li>Beberapa karier membawa utang kecil sejak awal (cicilan laptop, paylater).</li>
        </ul>
        <h3>Giliranmu</h3>
        <ul>
          <li>Kocok dua dadu sekali. Dadu dikocok di server, token maju otomatis.</li>
          <li>Selesaikan kejadian di petak tujuan. Keputusan wajib tidak bisa dilewati.</li>
          <li>Sebelum kocok atau sebelum selesai giliran, kamu boleh bayar utang atau jual aset (85% nilai).</li>
          <li>Tekan Selesai giliran. Giliran bonus hanya dari kartu tertentu.</li>
        </ul>
        <h3>Gajian</h3>
        <ul>
          <li>Setiap melewati atau mendarat di GAJIAN: terima gaji (+pendapatan aset), kebahagiaan +4, lalu bayar biaya hidup.</li>
          <li>Kalau punya utang: bunga 3% ditambahkan, lalu cicilan 10% (min. Rp500 ribu) dipotong otomatis. Tidak sanggup bayar cicilan berarti denda 2% dan kebahagiaan −5.</li>
          <li>Freelancer, pengusaha, seller, ojol, warung, dan kreator punya gaji yang naik-turun.</li>
        </ul>
        <h3>Kalau uang kurang</h3>
        <p>Tagihan wajib yang tak tertutup uang tunai memberimu pilihan: pinjam (biaya 10%, selama di bawah batas utang), jual aset cepat (80% nilai), atau bayar semampunya dengan potongan kebahagiaan. Pengeluaran sukarela hanya bisa dipilih jika uang tunai cukup.</p>
        <h3>Bangkrut</h3>
        <p>Jika utang melewati batas (4× gaji, minimal Rp20 juta) saat gajian, semua aset dilelang 70%, utang dipangkas sampai batas, kebahagiaan −15, dan satu giliran hilang. Kamu tetap bermain, tapi skor −200 per kebangkrutan.</p>
        <h3>Dana darurat &amp; asuransi</h3>
        <p>Tabungan dana darurat otomatis menutup biaya Darurat lebih dulu. Asuransi kesehatan menanggung separuh biaya darurat.</p>
        <h3>Bot</h3>
        <p>Host bisa menambah bot di lobby, atau langsung pilih Main lawan bot. Bot memilih langkah yang paling menaikkan Skor Hidup-nya. Halaman host menjalankan giliran bot; jika host offline, pemain lain mengambil alih.</p>
        <h3>Akhir game &amp; Skor Hidup</h3>
        <ul>
          <li>Kekayaan bersih (tunai + tabungan + aset − utang): 1 poin per Rp100 ribu; di atas Rp40 juta nilainya sepertiga.</li>
          <li>Kebahagiaan: ×5 (maks. 500).</li>
          <li>Karier: +60 per promosi; Manajer +40; Pencari Kerja −60.</li>
          <li>Tujuan rahasia tercapai: +250. Bebas utang: +80. Bangkrut: −200.</li>
        </ul>
        <p>Setiap pemain mendapat gelar dari hasil akhirnya, misalnya Sultan Akhir Bulan atau Raja Cicilan.</p>
        <h3>Jenis petak</h3>
        <div className="legend">
          {Object.entries(SPACE_TYPES).filter(([k]) => k !== 'fixed').map(([k, T]) => <div key={k}><i style={{ background: typeColor(k) }} />{T.ic} {T.lab}</div>)}
        </div>
        <h3>Tutorial singkat</h3>
        <ol>
          <li>Masuk sebagai tamu, isi nama panggilan dan avatar.</li>
          <li>Buat room, lalu bagikan link undangan atau kodenya. Atau tekan Tambah bot.</li>
          <li>Semua pemain menekan Saya siap, lalu host menekan Mulai game.</li>
          <li>Ikuti tombol besar di bawah papan. Ketuk petak untuk melihat artinya. Tujuan rahasiamu ada di tab Dompetku.</li>
        </ol>
      </div>
    </Modal>
  );
}
