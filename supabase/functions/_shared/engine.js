// @ts-self-types="./engine.d.ts"
// ================= HIDUP DI INDONESIA — game engine =================
// Shared by the browser (display only) and the game-action server function (authoritative).
// Pure functions over a plain-JSON game object. All money is integer rupiah. Randomness uses crypto.getRandomValues.
const JT = 1000000, RB = 1000;
const START_CASH = 10 * JT;
const MAX_LOG = 90, MAX_CHAT = 30;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function rnd(n) { // uniform integer in [0, n) from crypto
  const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mkId(n = 10) { let s = ''; const c = 'abcdefghijkmnpqrstuvwxyz23456789'; for (let i = 0; i < n; i++) s += c[rnd(c.length)]; return s; }
function mkCode() { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[rnd(CODE_CHARS.length)]; return s; }
const fl1k = x => Math.floor(x / 1000) * 1000;
const ce1k = x => Math.ceil(x / 1000) * 1000;
function rp(n) { const s = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '−Rp' : 'Rp') + s; }
function rpShort(n) { const a = Math.abs(n), sg = n < 0 ? '−' : ''; if (a >= JT) { const v = a / JT; return sg + 'Rp' + (Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')) + 'jt'; } if (a >= RB) return sg + 'Rp' + Math.round(a / RB) + 'rb'; return sg + 'Rp' + a; }
class GameError extends Error {}
const fail = m => { throw new GameError(m); };

// ---------- careers ----------
const CAREERS = {
  freshgrad: { name: 'Fresh Graduate', ic: '🎓', sal: 4500 * RB, liv: 3000 * RB, debt: 3 * JT, promo: 'kantor', chance: 50, note: 'Cicilan laptop kuliah masih jalan.' },
  kantor:   { name: 'Karyawan Kantoran', ic: '🏢', sal: 8 * JT, liv: 5 * JT, promo: 'manajer', chance: 35 },
  pns:      { name: 'PNS', ic: '🗂️', sal: 7 * JT, liv: 4300 * RB, up: 12, chance: 30, safe: true, note: 'Kebal PHK, naik pangkat pelan.' },
  startup:  { name: 'Karyawan Startup', ic: '🚀', sal: 11 * JT, liv: 6800 * RB, debt: 1 * JT, up: 15, chance: 40, note: 'Gaji besar, risiko layoff besar.' },
  freelancer:{ name: 'Freelancer', ic: '💻', sal: 7500 * RB, liv: 4500 * RB, var: [40, 160], up: 15, chance: 40, note: 'Pendapatan naik-turun tiap gajian.' },
  pengusaha:{ name: 'Pengusaha', ic: '📈', sal: 10 * JT, liv: 6500 * RB, var: [0, 220], up: 20, chance: 35, note: 'Bisa nol, bisa dobel.' },
  warung:   { name: 'Pemilik Warung Makan', ic: '🍛', sal: 6 * JT, liv: 3500 * RB, var: [60, 140], up: 15, chance: 40 },
  seller:   { name: 'Online Seller', ic: '📦', sal: 7 * JT, liv: 4200 * RB, var: [50, 170], up: 15, chance: 40, note: 'Panen saat Harbolnas.' },
  ojol:     { name: 'Driver Ojol', ic: '🛵', sal: 5 * JT, liv: 3200 * RB, var: [70, 130], up: 10, chance: 45 },
  kreator:  { name: 'Content Creator', ic: '🎥', sal: 6 * JT, liv: 4000 * RB, var: [0, 260], up: 25, chance: 35, note: 'Algoritma menentukan nasib.' },
  manajer:  { name: 'Manajer Korporat', ic: '👔', sal: 15 * JT, liv: 9500 * RB, up: 10, chance: 30 },
  pencari:  { name: 'Pencari Kerja', ic: '🔎', sal: 1500 * RB, liv: 2800 * RB, chance: 55, note: 'Serabutan sambil kirim CV.' },
};
const STARTER_CAREERS = ['freshgrad', 'kantor', 'pns', 'startup', 'freelancer', 'pengusaha', 'warung', 'seller', 'ojol', 'kreator'];
const OFFICE = ['freshgrad', 'kantor', 'pns', 'startup', 'manajer'];

// ---------- assets ----------
const ASSETS = {
  reksadana: { name: 'Reksa Dana', ic: '📊', price: 2 * JT, inc: 0 },
  saham:     { name: 'Saham Blue Chip', ic: '📉', price: 3 * JT, inc: 60 * RB },
  emas:      { name: 'Emas Batangan', ic: '🥇', price: 4 * JT, inc: 0 },
  warung:    { name: 'Franchise Warung', ic: '🏪', price: 8 * JT, inc: 450 * RB },
  tanah:     { name: 'Tanah Kavling', ic: '🌱', price: 15 * JT, inc: 0 },
  rumah:     { name: 'Rumah Subsidi', ic: '🏠', price: 25 * JT, inc: 0, kpr: 20 },
  kos:       { name: 'Kos-kosan 6 Kamar', ic: '🏘️', price: 30 * JT, inc: 1500 * RB, kpr: 30 },
};
const DRIFT = { reksadana: 60, saham: 0, emas: 80, warung: 0, tanah: 150, rumah: 100, kos: 80 };
const assetValue = (g, k) => fl1k(ASSETS[k].price * (g.market?.[k] ?? 10000) / 10000);

// ---------- board (36 spaces, index 0 = bottom-right corner, counter-clockwise) ----------
const SPACE_TYPES = {
  start:   { lab: 'Gajian', ic: '💰' },
  peluang: { lab: 'Peluang', ic: '🍀' },
  apes:    { lab: 'Apes', ic: '🌧️' },
  realita: { lab: 'Realita', ic: '🇮🇩' },
  gaya:    { lab: 'Gaya Hidup', ic: '🛍️' },
  keuangan:{ lab: 'Keuangan', ic: '🧮' },
  keluarga:{ lab: 'Keluarga', ic: '👪' },
  admin:   { lab: 'Birokrasi', ic: '📝' },
  invest:  { lab: 'Investasi', ic: '📈' },
  darurat: { lab: 'Darurat', ic: '🚑' },
  rehat:   { lab: 'Rehat', ic: '🌳' },
  kerja:   { lab: 'Kerja', ic: '💼' },
  spesial: { lab: 'Event', ic: '🎪' },
  fixed:   { lab: 'Event', ic: '🚆' },
};
const BOARD = [
  { n: 'GAJIAN!', t: 'start' },
  { n: 'Warung Bu Tini', t: 'gaya' },
  { n: 'Grup WA Alumni', t: 'peluang' },
  { n: 'Kantor', t: 'kerja' },
  { n: 'Kelurahan', t: 'admin' },
  { n: 'Lampu Merah', t: 'apes' },
  { n: 'Arisan RT', t: 'keluarga' },
  { n: 'Aplikasi Investasi', t: 'invest' },
  { n: 'Pos Ronda', t: 'realita' },
  { n: 'KRL Jam Sibuk', t: 'fixed', card: 'X01' },
  { n: 'Mal', t: 'gaya' },
  { n: 'Bank', t: 'keuangan' },
  { n: 'Lembur', t: 'kerja' },
  { n: 'Jalan Berlubang', t: 'apes' },
  { n: 'Rumah Mertua', t: 'keluarga' },
  { n: 'Koneksi Lama', t: 'peluang' },
  { n: 'Pameran Properti', t: 'invest' },
  { n: 'Puskesmas', t: 'darurat' },
  { n: 'Taman Kota', t: 'rehat' },
  { n: 'Pasar Pagi', t: 'realita' },
  { n: 'Coworking', t: 'kerja' },
  { n: 'Samsat', t: 'admin' },
  { n: 'Kedai Kopi', t: 'gaya' },
  { n: 'Banjir Kiriman', t: 'apes' },
  { n: 'Konsultan Keuangan', t: 'keuangan' },
  { n: 'Bursa Saham', t: 'invest' },
  { n: 'Seminar Bisnis', t: 'peluang' },
  { n: 'Panggung 17-an', t: 'spesial' },
  { n: 'Lebaran Keluarga', t: 'keluarga' },
  { n: 'Antrean Panjang', t: 'realita' },
  { n: 'Bengkel', t: 'darurat' },
  { n: 'Ruang Meeting', t: 'kerja' },
  { n: 'Flash Sale', t: 'gaya' },
  { n: 'Peluang Usaha', t: 'peluang' },
  { n: 'Kantor Pajak', t: 'admin' },
  { n: 'Pijat Refleksi', t: 'rehat' },
];

// ---------- cards ----------
// fx ops: cash(+/-) pay payE hap sal% paysal% spend save debt loan skip again promo layoff newjob
//          market infl salup livup asset buy repay ins savint gamble allhap collect pbb msg careerbonus
const CARDS = {};
const CATS = { peluang: 'Peluang', apes: 'Apes', realita: 'Realita Indonesia', gaya: 'Gaya Hidup', keuangan: 'Keputusan Keuangan', keluarga: 'Kewajiban Keluarga', admin: 'Birokrasi', darurat: 'Darurat', spesial: 'Event Spesial', fixed: 'Event' };
function C(id, cat, title, desc, fx, ch) { CARDS[id] = { id, cat, title, desc, fx: fx || [], ch: ch || null }; }
const O = (l, fx, m) => ({ l, fx, m });

// PELUANG
C('P01','peluang','Bonus Akhir Tahun','Bos akhirnya ingat kalau kamu masih bekerja di sini.',[['cash',3*JT]]);
C('P02','peluang','THR Cair','Tanggal merah datang, THR mendarat. Saldo tersenyum sebentar.',[['sal%',100]]);
C('P03','peluang','Proyek Sampingan','Teman kuliah butuh logo. Bayarannya lumayan, revisinya tak terbatas.',null,[O('Ambil proyeknya',[['cash',2*JT],['hap',-6]]),O('Tolak halus',[['hap',3]])]);
C('P04','peluang','Doorprize Jalan Sehat','Datang cuma buat kupon. Pulang bawa kulkas dua pintu.',[['cash',1500*RB],['hap',5]]);
C('P05','peluang','Cashback Nyangkut','Cashback bulan lalu ternyata masih bisa dicairkan.',[['cash',350*RB]]);
C('P06','peluang','Dapat Referral','Kenalan merekomendasikan kamu ke HRD perusahaan lain.',null,[O('Coba melamar',[['newjob']]),O('Bertahan di sini',[['hap',2]])]);
C('P07','peluang','Naik Jabatan','Rapat panjang ternyata ada gunanya. Namamu disebut atasan.',[['promo']]);
C('P08','peluang','Jualan Preloved','Lemari penuh baju yang dipakai sekali. Saatnya cuan.',[['cash',800*RB],['hap',3]]);
C('P09','peluang','Endorse Kecil-kecilan','Brand skincare lokal kirim paket plus sedikit fee.',[['cash',1200*RB]]);
C('P10','peluang','Komisi Makelar','Kamu kenalkan tetangga ke agen rumah. Deal! Kamu kebagian komisi.',[['cash',2500*RB]]);
C('P11','peluang','Undian Tabungan','Rekening yang hampir terlupa ternyata ikut undian.',[['cash',5*JT],['hap',6]]);
C('P12','peluang','Titipan Nenek','Nenek menitipkan sebatang emas kecil "buat masa depan".',[['asset','emas']]);
C('P13','peluang','Lembur Dibayar','Lembur yang dihitung lembur. Langka, tapi nyata.',[['sal%',30],['hap',-3]]);
C('P14','peluang','Saham Terbang','Saham yang kamu dengar dari tukang parkir ternyata benar.',[['market','saham',2500],['hap',2]]);
C('P15','peluang','Investor Grup Alumni','Ide usahamu dilirik kakak tingkat yang sudah sukses.',null,[O('Terima modal kerja sama',[['cash',4*JT],['hap',-4]],'Modal masuk, rapat mingguan juga.'),O('Fokus kerja dulu',[['hap',2]])]);
C('P16','peluang','Freelance Terjemahan','Dokumen 40 halaman, tenggatnya besok pagi.',[['cash',1*JT],['hap',-4]]);
C('P17','peluang','Beasiswa Sertifikasi','Kantor membiayai sertifikasi. Kelasnya tiap Sabtu.',null,[O('Ambil sertifikasinya',[['salup',10],['hap',-5]]),O('Lewatkan',[])]);
C('P18','peluang','Arisan Narik Duluan','Namamu keluar pertama di arisan kantor.',[['cash',2*JT],['hap',2]]);
C('P19','peluang','Utang Lama Dibayar','Utang teman lima tahun lalu tiba-tiba dilunasi. Keajaiban kecil.',[['cash',1*JT],['hap',4]]);
C('P20','peluang','Viral Sesaat','Videomu jatuh dari sepeda ditonton sejuta orang.',[['cash',700*RB],['hap',-2],['careerbonus','kreator',2500*RB]]);
C('P21','peluang','Kenaikan Gaji Tahunan','Naik sesuai inflasi. Setidaknya naik.',[['salup',8]]);
C('P22','peluang','Ngopi Jadi Bisnis','Ngopi santai berujung tawaran kolaborasi.',null,[O('Gas kolaborasi',[['cash',1500*RB],['hap',-2]]),O('Santai saja',[['hap',3]])]);

// APES
C('A01','apes','Motor Minta Perhatian','Motor mogok tepat ketika kamu sedang buru-buru.',null,[O('Servis di bengkel resmi',[['pay',750*RB]]),O('Bengkel pinggir jalan',[['pay',300*RB],['hap',-6]],'Mesinnya jalan, hatimu tidak tenang.')]);
C('A02','apes','HP Jatuh','Layar retak seperti peta jalan tikus.',null,[O('Ganti LCD',[['pay',1200*RB]]),O('Pakai apa adanya',[['hap',-8]])]);
C('A03','apes','Kena Tilang','Lupa nyalakan lampu siang hari. Petugas tidak lupa.',[['pay',250*RB],['hap',-3]]);
C('A04','apes','Restrukturisasi','Kata yang terdengar lebih sopan daripada PHK.',[['layoff',['startup','kantor','freshgrad','manajer'],-3]]);
C('A05','apes','Banjir Masuk Rumah','Hujan semalam, karpet berubah jadi kolam.',[['payE',1500*RB],['hap',-5]]);
C('A06','apes','Kena Tipu Online','Beli sepatu, yang datang batu bata dibungkus rapi.',[['pay',600*RB],['hap',-6]]);
C('A07','apes','Laptop Mati Total','Tepat sebelum presentasi. Tentu saja.',[['payE',2500*RB]]);
C('A08','apes','Startup Gulung Tikar','Kantor tutup setelah "efisiensi" ketiga tahun ini.',[['layoff',['startup'],-2]]);
C('A09','apes','Teman Pinjam Uang','"Cuma sampai gajian kok." Gajian yang mana, tidak disebut.',null,[O('Pinjamkan Rp1 juta',[['spend',1*JT],['hap',3]],'Uangnya pergi, pertemanan aman.'),O('Tolak halus',[['hap',-4]])]);
C('A10','apes','Atap Bocor','Musim hujan datang, ember-ember mulai bertugas.',[['payE',900*RB]]);
C('A11','apes','Dompet Hilang di KRL','Jam pulang kerja. Selamat tinggal, KTP dan kartu ATM.',[['pay',400*RB],['hap',-5]]);
C('A12','apes','Saham Gorengan Gosong','Saham yang katanya "pasti naik" ternyata tidak.',[['market','saham',-3000],['hap',-2]]);
C('A13','apes','Reksa Dana Lesu','Pasar lagi galau, portofolio ikut galau.',[['market','reksadana',-1500]]);
C('A14','apes','Tipes Kambuh','Kebanyakan begadang, kurang istirahat.',[['payE',2*JT],['skip',1]]);
C('A15','apes','Ban Bocor Kena Paku','Paku di jalan selalu menemukan jalannya ke ban kamu.',[['pay',150*RB],['hap',-2]]);
C('A16','apes','Klien Revisi Lagi','Revisi ke-12: "lebih ngejreng tapi tetap elegan."',[['hap',-8]]);
C('A17','apes','Langganan Lupa Dicabut','Tiga aplikasi streaming memotong saldo diam-diam.',[['pay',450*RB]]);
C('A18','apes','Gaji Telat','HR bilang sistem lagi error. Ibu kos tidak mau tahu.',[['hap',-6],['debt',500*RB],['msg','Ngutang dulu ke warung sebelah.']]);
C('A19','apes','Mertua Menginap Seminggu','Kulkas mendadak kosong, jadwal mendadak penuh.',[['pay',800*RB],['hap',-4]]);
C('A20','apes','Salah Transfer','Typo satu digit, uang melayang ke rekening orang lain.',[['pay',500*RB],['hap',-5]]);
C('A21','apes','Si Oyen Sakit','Kucing oren tidak mau makan. Dokter hewan menunggu.',[['payE',700*RB],['hap',-2]]);
C('A22','apes','Kemalingan','Helm dan sandal hilang. Malingnya ternyata selektif.',[['pay',350*RB],['hap',-6]]);

// REALITA INDONESIA
C('R01','realita','Undangan Kondangan','Teman lama menikah. Belum tentu dekat, tapi amplop tetap harus disiapkan.',null,[O('Amplop tebal',[['pay',500*RB],['hap',4]]),O('Amplop standar',[['pay',200*RB]]),O('Pura-pura dinas luar kota',[['hap',-6]])]);
C('R02','realita','Iuran 17-an','Panitia RT keliling membawa buku catatan dan senyum penuh harap.',[['pay',100*RB],['hap',3]]);
C('R03','realita','Pajak Kendaraan','STNK mengingatkan bahwa negara juga punya kebutuhan.',[['pay',600*RB]]);
C('R04','realita','Antre Faskes','Nomor antreanmu 187. Yang dipanggil baru 42.',[['hap',-5]]);
C('R05','realita','Harga Cabai Naik','Sambal adalah kebutuhan pokok. Inflasi setuju.',[['infl',300],['hap',-2]]);
C('R06','realita','Ditanya "Kapan Nikah?"','Lebaran, ruang tamu, dan tante yang penuh perhatian.',[['hap',-7]]);
C('R07','realita','Mudik Lebaran','Tiket mahal, macet panjang, tapi rindu tidak bisa ditawar.',null,[O('Mudik',[['pay',2*JT],['hap',12]]),O('Lebaran di kota',[['hap',-6]])]);
C('R08','realita','Tarif Ojol Naik','Hujan turun, tarif naik, saldo turun.',[['pay',120*RB]]);
C('R09','realita','Tukang Parkir Gaib','Tidak terlihat saat datang, muncul saat kamu mau pergi.',[['pay',5*RB],['hap',-1]]);
C('R10','realita','BBM Naik','Harga bensin naik. Harga lain ikut menyesuaikan diri.',[['infl',500],['hap',-3]]);
C('R11','realita','Pesan Berantai Keluarga','Grup WA keluarga kirim tips kesehatan yang meragukan.',[['hap',-3]]);
C('R12','realita','Gapura Dicat Ulang','Gapura RT akan dicat ulang. Lagi.',[['pay',150*RB]]);
C('R13','realita','Jalan Utama Banjir','Jalan ke kantor berubah jadi sungai. Kamu ikut arus.',[['skip',1],['hap',-3]]);
C('R14','realita','Hajatan Tetangga','Sound system 3000 watt sampai jam dua pagi.',[['hap',-5]]);
C('R15','realita','Sales Kartu Kredit','Ditawari dengan ramah, gigih, dan berulang.',null,[O('Terima limit Rp5 juta',[['loan',5*JT,5500*RB],['hap',2]],'Saldo terasa lega. Untuk sekarang.'),O('Tolak tegas',[['hap',2]])]);
C('R16','realita','Uang Makan Naik','Tunjangan makan akhirnya naik Rp5.000.',[['salup',2],['hap',2]]);
C('R17','realita','Pemadaman Listrik','Mati lampu pas tenggat. Warung kopi ber-colokan jadi kantor.',[['pay',75*RB],['hap',-3]]);
C('R18','realita','Antre Minyak Goreng','Antrean panjang demi dua liter.',[['pay',60*RB],['hap',-4]]);
C('R19','realita','Kontrakan Naik','Pemilik kontrakan bilang semua harga naik, termasuk kontrakan.',[['livup',8]]);
C('R20','realita','Giliran Ronda','Kopi gratis, kantuk berbayar.',null,[O('Ikut ronda',[['hap',3]]),O('Bayar pengganti',[['pay',50*RB]])]);
C('R21','realita','Kerja Bakti','Minggu pagi, cangkul, dan gosip tetangga.',[['hap',4]]);
C('R22','realita','Salam Tempel Keponakan','Para keponakan berbaris rapi dengan tangan terbuka.',[['pay',750*RB],['hap',5]]);

// GAYA HIDUP
C('G01','gaya','Flash Sale Tengah Malam','Diskon 50%! Barang yang tidak kamu butuhkan kini terasa wajib dimiliki.',null,[O('Checkout',[['spend',900*RB],['hap',6]]),O('Tutup aplikasi',[['hap',-2]])]);
C('G02','gaya','Es Kopi Susu Gula Aren','Gelas ketiga hari ini.',null,[O('Beli satu lagi',[['spend',60*RB],['hap',2]]),O('Bawa tumbler',[])]);
C('G03','gaya','Staycation','Butuh healing. Hotel di kota sendiri pun terasa liburan.',null,[O('Gas staycation',[['spend',1500*RB],['hap',12]]),O('Healing di kasur',[['hap',4]])]);
C('G04','gaya','War Tiket Konser','Tiket dijual jam 12 siang. Jari harus cepat.',null,[O('Beli tiket',[['spend',1800*RB],['hap',14]]),O('Nonton live teman',[['hap',-3]])]);
C('G05','gaya','Gym Baru Buka','Promo member tahunan. Motivasi bertahan dua minggu.',null,[O('Daftar member',[['spend',1200*RB],['hap',6]]),O('Lari keliling komplek',[['hap',3]])]);
C('G06','gaya','HP Baru','HP lama masih bisa, tapi kamera teman lebih bagus.',null,[O('Bayar tunai',[['spend',6*JT],['hap',10]]),O('Paylater 12x',[['debt',7200*RB],['hap',10]],'Cicilan dimulai bulan depan.'),O('Tahan dulu',[['hap',-3]])]);
C('G07','gaya','Nongkrong "Sebentar"','Ajakan "sebentar aja" biasanya selesai jam satu pagi.',null,[O('Ikut',[['spend',350*RB],['hap',6]]),O('Rebahan',[['hap',2]])]);
C('G08','gaya','Tiket Promo ke Bali','Tiket murah muncul di story teman.',null,[O('Berangkat',[['spend',4500*RB],['hap',18]]),O('Lihat-lihat saja',[['hap',-4]])]);
C('G09','gaya','Skincare Sepuluh Langkah','Rutinitas wajah lebih panjang dari rutinitas kerja.',null,[O('Beli satu set',[['spend',700*RB],['hap',5]]),O('Sabun cuci muka saja',[])]);
C('G10','gaya','Lari 10K','Fotografer di garis finis adalah motivasi utama.',null,[O('Daftar',[['spend',450*RB],['hap',7]]),O('Jadi suporter',[['hap',2]])]);
C('G11','gaya','Makan Omakase','Sepotong ikan, harganya sepotong motor.',null,[O('Coba sekali seumur hidup',[['spend',2*JT],['hap',9]]),O('Nasi padang saja',[['hap',4]])]);
C('G12','gaya','Tanaman Hias Mahal','Katanya daun belang itu investasi.',null,[O('Beli',[['spend',1500*RB],['hap',5]]),O('Tanam cabai di pot',[['hap',3]])]);
C('G13','gaya','Serial Baru Rilis','Semua orang spoiler di grup.',null,[O('Langganan streaming',[['spend',150*RB],['hap',4]]),O('Keluar grup sementara',[['hap',-2]])]);
C('G14','gaya','Kucing Depan Rumah','Kucing kampung menatapmu penuh harap.',null,[O('Adopsi',[['spend',200*RB],['hap',8]]),O('Beli kucing ras',[['spend',3*JT],['hap',9]]),O('Belum siap',[])]);
C('G15','gaya','Sepatu Lari Karbon','Katanya bikin lari lebih cepat. Dompet lebih cepat habis.',null,[O('Beli',[['spend',2200*RB],['hap',5]]),O('Sepatu lama masih kuat',[])]);
C('G16','gaya','Kerja dari Kafe','Produktivitas naik, saldo turun.',null,[O('Pesan dua menu',[['spend',250*RB],['hap',3]]),O('Kerja di kosan',[])]);
C('G17','gaya','Ulang Tahun Pasangan','Ekspektasi tinggi, anggaran menengah.',null,[O('Kejutan mewah',[['spend',1500*RB],['hap',8]]),O('Makan malam sederhana',[['spend',300*RB],['hap',3]]),O('Ucapan tulus',[['hap',-3]])]);
C('G18','gaya','Main Padel','Olahraga baru, raket baru, grup WA baru.',null,[O('Ikut main',[['spend',1*JT],['hap',7]]),O('Nanti saja',[['hap',-1]])]);
C('G19','gaya','Cat Rambut','Warna baru, kepercayaan diri baru.',null,[O('Ke salon',[['spend',500*RB],['hap',5]]),O('Tidak dulu',[])]);
C('G20','gaya','Pameran Seni','Lukisan kecil di pojok galeri memanggil namamu.',null,[O('Beli lukisan',[['spend',800*RB],['hap',4]]),O('Foto saja',[['hap',1]])]);
C('G21','gaya','Detoks Digital','Semua media sosial dihapus selama seminggu.',[['hap',8]]);
C('G22','gaya','Belanja Bulanan Kalap','Niatnya beli sabun, pulang bawa troli penuh.',[['pay',600*RB],['hap',2]]);

// KEPUTUSAN KEUANGAN
C('K01','keuangan','Dana Darurat','Kesempatan menyiapkan tabungan sebelum masalah berikutnya datang.',null,[O('Tabung Rp2 juta',[['save',2*JT]]),O('Tabung Rp1 juta',[['save',1*JT]]),O('Nanti saja',[])]);
C('K02','keuangan','Promo Reksa Dana','Aplikasi investasi memberi promo pembelian pertama.',null,[O('Beli reksa dana',[['buy','reksadana']]),O('Lewat',[])]);
C('K03','keuangan','Diskon Pelunasan','Bank menawarkan potongan kalau kamu bayar utang sekarang.',null,[O('Bayar utang Rp3 juta',[['repay',3*JT]]),O('Tidak sekarang',[])]);
C('K04','keuangan','SMS Pinjol','"Dana cair 5 menit tanpa ribet!" Bunganya tidak disebut.',null,[O('Ambil Rp3 juta',[['loan',3*JT,3900*RB],['hap',-2]]),O('Blokir nomornya',[['hap',2]])]);
C('K05','keuangan','Asuransi Kesehatan','Agen asuransi datang di waktu yang, kebetulan, tepat.',null,[O('Ambil polis (Rp1 juta)',[['spend',1*JT],['ins']],'Biaya darurat berikutnya ditanggung separuh.'),O('Nanti dulu',[])]);
C('K06','keuangan','Emas Lagi Turun','Harga emas sedang turun. Katanya ini saatnya.',null,[O('Beli emas',[['market','emas',-500],['buy','emas']]),O('Lewat',[['market','emas',-500]])]);
C('K07','keuangan','KPR Rumah Subsidi','Bank menawarkan rumah subsidi dengan DP 20%.',null,[O('Ambil KPR',[['kpr','rumah']]),O('Ngontrak dulu',[])]);
C('K08','keuangan','Investasi "Pasti Untung"','Teman SMA menawarkan profit 10% per minggu, katanya aman.',null,[O('Ikut Rp2 juta',[['spend',2*JT],['hap',-8]],'Akun pengelolanya hilang seminggu kemudian.'),O('Tolak',[['hap',4]],'Firasatmu benar.')]);
C('K09','keuangan','Aplikasi Budgeting','Akhirnya tahu uang habis ke mana. Rasanya campur aduk.',[['livup',-5],['hap',2]]);
C('K10','keuangan','Saham Blue Chip','Analis di televisi bilang ini momen bagus.',null,[O('Beli saham',[['buy','saham']]),O('Lewat',[])]);
C('K11','keuangan','Cicil Lebih Awal','Uang sedang ada. Godaan belanja juga ada.',null,[O('Bayar utang Rp2 juta',[['repay',2*JT]]),O('Simpan saja',[])]);
C('K12','keuangan','Bunga Tabungan','Dana daruratmu berbunga. Sedikit, tapi pasti.',[['savint',6]]);
C('K13','keuangan','Tabungan Masa Depan','Rencana jangka panjang yang selalu ditunda.',null,[O('Sisihkan Rp1,5 juta',[['save',1500*RB],['hap',2]]),O('Tunda lagi',[])]);
C('K14','keuangan','Tawaran Franchise','Waralaba warung modal kecil, katanya balik modal cepat.',null,[O('Beli franchise',[['buy','warung']]),O('Lewat',[])]);
C('K15','keuangan','Kos-kosan Dijual','Pemilik kos dekat kampus pindah ke luar kota.',null,[O('Beli tunai',[['buy','kos']]),O('Ambil KPR',[['kpr','kos']]),O('Lewat',[])]);
C('K16','keuangan','Tanah Kavling','Lokasinya "dekat rencana tol".',null,[O('Beli tanah',[['buy','tanah']]),O('Lewat',[])]);
C('K17','keuangan','Tagihan Paylater','Tagihan belanja yang sudah kamu lupakan.',[['pay',800*RB],['hap',-2]]);
C('K18','keuangan','Restitusi Pajak','Lebih bayar pajak tahun lalu dikembalikan.',[['cash',900*RB],['hap',2]]);
C('K19','keuangan','Pasar Optimis','Kamu membaca satu artikel dan merasa jadi analis.',[['market','*',800]]);
C('K20','keuangan','Koin Kripto Viral','Koin bergambar hewan naik 300%. Teman-teman pamer.',null,[O('FOMO Rp1,5 juta',[['gamble',1500*RB,4*JT]]),O('Pura-pura tidak lihat',[['hap',1]])]);
C('K21','keuangan','Kelas Literasi Keuangan','Gratis materi, berbayar penyesalan masa lalu.',null,[O('Ikut kelas (Rp500 ribu)',[['spend',500*RB],['livup',-6],['hap',2]]),O('Lewat',[])]);
C('K22','keuangan','Celengan Ayam','Celengan dipecahkan. Isinya receh dan kenangan.',[['cash',250*RB],['hap',3]]);

// KELUARGA
C('F01','keluarga','Kiriman untuk Orang Tua','Orang tua tidak minta, tapi kamu tahu.',null,[O('Kirim 10% gaji',[['paysal%',10],['hap',6]]),O('Kirim doa dulu',[['hap',-6]])]);
C('F02','keluarga','Adik Masuk Kuliah','UKT semester pertama sudah keluar.',null,[O('Bantu bayar',[['pay',2*JT],['hap',6]]),O('Suruh cari beasiswa',[['hap',-5]])]);
C('F03','keluarga','Arisan Keluarga Besar','Giliranmu jadi tuan rumah.',[['pay',300*RB],['hap',2]]);
C('F04','keluarga','Sepupu Menikah','Seragam keluarga wajib dijahit.',[['pay',500*RB],['hap',3]]);
C('F05','keluarga','Ponakan Ulang Tahun','Mainan yang diminta ternyata edisi terbatas.',[['pay',250*RB],['hap',3]]);
C('F06','keluarga','Orang Tua Sakit','Kamu pulang dan menanggung biaya rumah sakit.',[['payE',1500*RB],['hap',-3]]);
C('F07','keluarga','Pinjam Mobil Om','Mobilnya gratis, bensinnya tidak.',[['pay',200*RB],['hap',4]]);
C('F08','keluarga','Makan Malam Keluarga','Semua menunggu kamu bayar karena "sudah kerja di kota".',[['pay',700*RB],['hap',2]]);

// BIROKRASI
C('D01','admin','Perpanjang SIM','Tes ujian praktik zig-zag, lagi.',[['pay',250*RB],['hap',-3]]);
C('D02','admin','KTP Hilang','Fotokopinya ada di mana-mana, aslinya entah di mana.',null,[O('Urus lewat calo',[['pay',300*RB]]),O('Urus sendiri',[['skip',1],['hap',-2]],'Bolak-balik kelurahan, giliran berikutnya hilang.')]);
C('D03','admin','Lapor SPT','Formulir pajak tahunan menantimu.',null,[O('Lapor tepat waktu',[['hap',-2]]),O('Telat, bayar denda',[['pay',100*RB]])]);
C('D04','admin','Iuran BPJS','Iuran bulanan, demi ketenangan.',[['pay',150*RB],['hap',1]]);
C('D05','admin','Balik Nama Motor','Motor bekas, dokumen penuh kejutan.',[['pay',400*RB]]);
C('D06','admin','Surat Domisili','Butuh tiga tanda tangan dan satu Pak RT yang sedang mudik.',[['hap',-4]]);
C('D07','admin','Bikin Paspor','Siapa tahu tahun ini benar-benar ke luar negeri.',null,[O('Bikin paspor',[['pay',650*RB],['hap',3]]),O('Nanti saja',[])]);
C('D08','admin','Pajak Bumi dan Bangunan','Surat PBB datang untuk semua properti milikmu.',[['pbb']]);

// DARURAT
C('E01','darurat','Sakit Gigi','Gigi geraham protes setelah es teh setiap hari.',[['payE',1200*RB],['hap',-3]]);
C('E02','darurat','Demam Berdarah','Opname tiga hari. Nyamuk tidak pilih-pilih.',[['payE',4*JT],['skip',1]]);
C('E03','darurat','Kecelakaan Kecil','Spion patah, lutut lecet, dompet ikut terluka.',[['payE',2500*RB],['hap',-5]]);
C('E04','darurat','Kompor Meledak','Dapur gosong, tidak ada yang terluka. Untung.',[['payE',3*JT]]);
C('E05','darurat','Motor Dicuri','Dikunci ganda, tetap hilang.',[['payE',3500*RB],['hap',-8]]);
C('E06','darurat','Kulkas Mati','Stok makanan sebulan harus habis malam ini.',[['payE',2*JT]]);

// SPESIAL
C('S01','spesial','Harbolnas','Hari belanja nasional. Semua orang mendadak hemat... besok.',null,[O('Ikut belanja',[['spend',800*RB],['hap',6],['careerbonus','seller',3*JT]]),O('Tahan diri',[['careerbonus','seller',3*JT]])]);
C('S02','spesial','Musim Hujan','Semua pemain basah kuyup di jalan pulang.',[['allhap',-3]]);
C('S03','spesial','Lomba 17-an','Panjat pinang, balap karung, dan tawa satu kampung.',[['allhap',5],['hap',3]]);
C('S04','spesial','Rupiah Melemah','Kurs naik, harga barang ikut menyesuaikan.',[['market','*',-1500],['infl',300]]);
C('S05','spesial','Pasar Bullish','Semua grafik hijau. Semua orang tiba-tiba jadi investor.',[['market','*',1800]]);
C('S06','spesial','Car Free Day','Jalan kaki santai, jajan cilok dan es doger.',[['hap',6],['pay',50*RB]]);
C('S07','spesial','Arisan RT Jackpot','Kamu menang arisan. Setiap pemain lain menyetor Rp300 ribu.',[['collect',300*RB]]);
C('S08','spesial','Tanggal Muda','Semua merasa kaya untuk tiga hari.',[['allhap',4],['again']],null);
C('X01','fixed','KRL Jam Sibuk','Gerbong penuh, aroma campur aduk, kaki tidak menapak lantai.',null,[O('Desak-desakan',[['hap',-6]]),O('Naik ojol saja',[['pay',150*RB]])]);

const DECK_CATS = ['peluang', 'apes', 'realita', 'gaya', 'keuangan', 'keluarga', 'admin', 'darurat', 'spesial'];

// ---------- secret goals ----------
const GOALS = {
  bebasutang: { name: 'Bebas Utang', desc: 'Selesai tanpa utang sepeser pun.', test: (p, nw) => p.debt === 0 },
  juragan:    { name: 'Juragan Properti', desc: 'Punya kos-kosan, rumah, atau tanah di akhir game.', test: p => p.assets.some(a => ['kos', 'rumah', 'tanah'].includes(a.k)) },
  darurat:    { name: 'Dana Darurat Aman', desc: 'Dana darurat minimal Rp8 juta.', test: p => p.sav >= 8 * JT },
  bahagia:    { name: 'Hidup Bahagia', desc: 'Kebahagiaan minimal 80.', test: p => p.hap >= 80 },
  naik:       { name: 'Naik Jabatan', desc: 'Dapat promosi minimal sekali.', test: p => p.promos >= 1 },
  kolektor:   { name: 'Kolektor Aset', desc: 'Punya minimal 3 aset.', test: p => p.assets.length >= 3 },
  sultan:     { name: 'Sultan Muda', desc: 'Kekayaan bersih minimal Rp30 juta.', test: (p, nw) => nw >= 30 * JT },
  hemat:      { name: 'Anti Ribet', desc: 'Uang tunai + tabungan minimal Rp20 juta.', test: p => p.cash + p.sav >= 20 * JT },
};

const BOTS = [['Pak RT', 8], ['Mbak Kasir', 2], ['Bang Ojol', 5], ['Tante Arisan', 11], ['Om Startup', 4], ['Dek Magang', 1]];
const CHAT_PRESETS = ['Halo semua! 👋', 'Gas! 🔥', 'Sabar ya, lagi mikir 🤔', 'Wkwkwk 😂', 'Tanggal tua nih 😭', 'Cuan! 💸', 'Yah apes… 🌧️', 'GG! 🤝', 'Ayo siap-siap!', 'Bentar, sinyal jelek 📶'];
const AVATARS = ['🐱', '🦊', '🐸', '🐼', '🦉', '🐯', '🐨', '🐵', '🐔', '🦆', '🐙', '🐌'];

// ================= state helpers =================
function log(g, pid, t, d) { g.log.push({ n: g.turnNo || 0, p: pid || null, t, d: d || 0 }); if (g.log.length > MAX_LOG) g.log.splice(0, g.log.length - MAX_LOG); }
function P(g, pid) { const p = g.ps?.[pid]; if (!p) fail('Pemain tidak ditemukan.'); return p; }
const nameOf = (g, pid) => (g.players?.find(x => x.id === pid)?.nick) || g.ps?.[pid]?.nick || 'Pemain';
const avOf = (g, pid) => { const v = g.players?.find(x => x.id === pid)?.av ?? g.ps?.[pid]?.av ?? 0; return AVATARS[v] || AVATARS[0]; };
function hapAdd(g, pid, n) { const p = g.ps[pid]; const b = p.hap; p.hap = Math.max(0, Math.min(100, p.hap + n)); return p.hap - b; }
function creditLimit(p) { return Math.max(20 * JT, p.sal * 4); }
function netWorth(g, p) { return p.cash + p.sav + p.assets.reduce((s, a) => s + assetValue(g, a.k), 0) - p.debt; }
function gain(g, pid, amt, why) { if (amt <= 0) return; g.ps[pid].cash += amt; log(g, pid, why, amt); }

// Mandatory charge. Pays now if possible; otherwise queues a payment the player must settle.
function charge(g, pid, amt, why, emerg) {
  const p = g.ps[pid]; amt = Math.trunc(amt); if (amt <= 0) return;
  if (emerg && p.ins) { const cut = fl1k(amt / 2); amt -= cut; log(g, pid, `Asuransi menanggung ${rp(cut)}`); }
  if (emerg && p.sav > 0) { const s = Math.min(p.sav, amt); p.sav -= s; amt -= s; log(g, pid, `Dana darurat dipakai ${rp(s)} (${why})`); if (amt <= 0) return; }
  if (p.cash >= amt) { p.cash -= amt; log(g, pid, `Bayar ${why}`, -amt); return; }
  g.q.unshift({ k: 'pay', amt, why });
}

function setCareer(p, key) { const c = CAREERS[key]; p.career = key; p.sal = c.sal; p.liv = c.liv; }
function promote(g, pid) {
  const p = g.ps[pid], c = CAREERS[p.career];
  if (p.career === 'pencari') { newJob(g, pid); return; }
  if (c.promo) { const old = c.name; setCareer(p, c.promo); p.promos++; hapAdd(g, pid, 6); log(g, pid, `Promosi! ${old} → ${CAREERS[p.career].name}`); return; }
  if (c.up) { const inc = fl1k(p.sal * c.up / 100); p.sal += inc; p.promos++; hapAdd(g, pid, 5); log(g, pid, `Naik level! Gaji pokok +${rp(inc)}`); return; }
}
function newJob(g, pid) {
  const p = g.ps[pid];
  const pool = STARTER_CAREERS.filter(k => k !== p.career);
  const k = pool[rnd(pool.length)]; setCareer(p, k); hapAdd(g, pid, 4);
  log(g, pid, `Pindah kerja jadi ${CAREERS[k].name}`);
}
function layoff(g, pid, list, elseHap) {
  const p = g.ps[pid];
  if (list.includes(p.career) && !CAREERS[p.career].safe) {
    const pes = p.sal; const old = CAREERS[p.career].name; setCareer(p, 'pencari'); hapAdd(g, pid, -10);
    gain(g, pid, pes, `Kena PHK dari ${old}. Pesangon`);
  } else { if (elseHap) hapAdd(g, pid, elseHap); log(g, pid, 'Aman dari PHK, tapi ikut deg-degan.'); }
}
function addAsset(g, pid, k, how) { g.ps[pid].assets.push({ k, id: mkId(6) }); log(g, pid, `${how} ${ASSETS[k].name}`); }

function optNeed(fx) { let n = 0; for (const f of fx) { if (f[0] === 'spend' || f[0] === 'save' || f[0] === 'gamble') n += f[1]; } return n; }

function runFx(g, pid, fx, title) {
  const p = g.ps[pid];
  for (const f of fx) {
    const [op, a, b] = f;
    switch (op) {
      case 'cash': if (a > 0) gain(g, pid, a, title); else charge(g, pid, -a, title); break;
      case 'pay': charge(g, pid, a, title); break;
      case 'payE': charge(g, pid, a, title, true); break;
      case 'hap': hapAdd(g, pid, a); break;
      case 'sal%': gain(g, pid, fl1k(p.sal * a / 100), title); break;
      case 'paysal%': charge(g, pid, Math.max(100 * RB, fl1k(p.sal * a / 100)), title); break;
      case 'spend': if (p.cash < a) fail('Uang tunai tidak cukup.'); p.cash -= a; log(g, pid, title, -a); break;
      case 'save': if (p.cash < a) fail('Uang tunai tidak cukup.'); p.cash -= a; p.sav += a; log(g, pid, `Menabung ${rp(a)} ke dana darurat`); break;
      case 'debt': p.debt += a; log(g, pid, `Utang bertambah ${rp(a)} (${title})`); break;
      case 'loan': p.cash += a; p.debt += b; log(g, pid, `Pinjaman cair ${rp(a)}, utang +${rp(b)}`, a); break;
      case 'skip': p.skip += a; log(g, pid, `Harus melewati ${a} giliran`); break;
      case 'again': g.extra = true; break;
      case 'promo': promote(g, pid); break;
      case 'layoff': layoff(g, pid, a, b); break;
      case 'newjob': newJob(g, pid); break;
      case 'market': for (const k of (a === '*' ? Object.keys(ASSETS) : [a])) g.market[k] = Math.max(3000, Math.min(30000, g.market[k] + b)); break;
      case 'infl': g.infl = Math.min(4000, g.infl + a); log(g, pid, `Inflasi naik. Biaya hidup semua pemain +${(g.infl / 100).toFixed(0)}% dari awal`); break;
      case 'salup': { const inc = fl1k(p.sal * a / 100); p.sal += inc; log(g, pid, `Gaji pokok +${rp(inc)}`); break; }
      case 'livup': { const inc = fl1k(p.liv * a / 100); p.liv = Math.max(1 * JT, p.liv + inc); log(g, pid, `Biaya hidup ${inc >= 0 ? '+' : ''}${rp(inc)} per gajian`); break; }
      case 'asset': addAsset(g, pid, a, 'Dapat'); break;
      case 'buy': { const v = assetValue(g, a); if (p.cash < v) fail('Uang tunai tidak cukup.'); p.cash -= v; log(g, pid, `Beli ${ASSETS[a].name}`, -v); addAsset(g, pid, a, 'Aset baru:'); break; }
      case 'kpr': { const v = assetValue(g, a), dp = ce1k(v * ASSETS[a].kpr / 100); if (p.cash < dp) fail('DP tidak cukup.'); if (p.debt > creditLimit(p) / 2) fail('Bank menolak: utangmu terlalu besar.'); p.cash -= dp; p.debt += v - dp; log(g, pid, `KPR ${ASSETS[a].name}: DP dibayar, sisa jadi utang ${rp(v - dp)}`, -dp); addAsset(g, pid, a, 'Aset baru:'); if (a === 'rumah') hapAdd(g, pid, 10); break; }
      case 'repay': { const n = Math.min(a, p.cash, p.debt); if (n > 0) { p.cash -= n; p.debt -= n; log(g, pid, 'Bayar utang', -n); } else log(g, pid, 'Tidak ada utang yang bisa dibayar.'); break; }
      case 'ins': p.ins = true; break;
      case 'savint': { const n = fl1k(p.sav * a / 100); if (n > 0) { p.sav += n; log(g, pid, `Bunga tabungan +${rp(n)}`); } else log(g, pid, 'Tabunganmu kosong, bunganya juga.'); break; }
      case 'gamble': { if (p.cash < a) fail('Uang tunai tidak cukup.'); p.cash -= a; log(g, pid, title, -a); if (rnd(100) < 40) { gain(g, pid, b, 'Koinnya meroket! Jual di puncak'); hapAdd(g, pid, 6); } else { hapAdd(g, pid, -8); log(g, pid, 'Koinnya anjlok 90%. Uangnya tinggal kenangan.'); } break; }
      case 'allhap': for (const id of g.order) hapAdd(g, id, a); log(g, pid, `Semua pemain: kebahagiaan ${a > 0 ? '+' : ''}${a}`); break;
      case 'collect': { let tot = 0; for (const id of g.order) { if (id === pid) continue; const o = g.ps[id]; const n = Math.min(a, o.cash); o.cash -= n; tot += n; } p.cash += tot; log(g, pid, 'Terima setoran arisan dari pemain lain', tot); break; }
      case 'pbb': { const tot = p.assets.filter(x => ['rumah', 'kos', 'tanah'].includes(x.k)).reduce((s, x) => s + assetValue(g, x.k), 0); const n = ce1k(tot / 200); if (n > 0) charge(g, pid, n, 'PBB'); else { log(g, pid, 'Belum punya properti. PBB-nya nol, harga dirinya juga.'); } break; }
      case 'msg': log(g, pid, a); break;
      case 'careerbonus': if (p.career === a) gain(g, pid, b, `Bonus ${CAREERS[a].name}`); break;
      default: fail('Efek kartu tidak dikenal: ' + op);
    }
  }
}

// ================= turn flow =================
function drawCard(g, cat) {
  const ids = Object.keys(CARDS).filter(k => CARDS[k].cat === cat);
  let d = g.decks[cat]; if (!d || d.i >= d.o.length) { d = g.decks[cat] = { o: shuffle(ids), i: 0 }; }
  return d.o[d.i++];
}
function payday(g, pid) {
  const p = g.ps[pid], c = CAREERS[p.career]; p.laps++;
  let sal = p.sal;
  if (c.var) { const pct = c.var[0] + rnd(c.var[1] - c.var[0] + 1); sal = fl1k(p.sal * pct / 100); }
  const inc = p.assets.reduce((s, a) => s + ASSETS[a.k].inc, 0);
  p.cash += sal + inc; hapAdd(g, pid, 4);
  log(g, pid, `GAJIAN! Gaji ${rp(sal)}${inc ? ` + pendapatan aset ${rp(inc)}` : ''}`, sal + inc);
  if (p.debt > 0) {
    const bunga = ce1k(p.debt * 3 / 100); p.debt += bunga;
    const cic = Math.min(p.debt, Math.max(500 * RB, ce1k(p.debt / 10)));
    if (p.cash >= cic) { p.cash -= cic; p.debt -= cic; log(g, pid, `Bunga utang ${rp(bunga)}; cicilan dibayar`, -cic); }
    else { const den = ce1k(p.debt * 2 / 100); p.debt += den; hapAdd(g, pid, -5); log(g, pid, `Cicilan nunggak! Bunga ${rp(bunga)} + denda ${rp(den)} masuk utang`); }
  }
  if (p.debt > creditLimit(p)) bankrupt(g, pid);
  const liv = fl1k(p.liv * (10000 + g.infl) / 10000);
  charge(g, pid, liv, 'biaya hidup bulanan');
}
function bankrupt(g, pid) {
  const p = g.ps[pid]; let got = 0;
  for (const a of p.assets) got += fl1k(assetValue(g, a.k) * 70 / 100);
  p.assets = []; p.cash += got; const pay = Math.min(p.cash, p.debt); p.cash -= pay; p.debt -= pay;
  const lim = creditLimit(p); if (p.debt > lim) p.debt = lim;
  p.bk++; p.skip += 1; hapAdd(g, pid, -15);
  log(g, pid, `BANGKRUT! Utang melewati batas. Semua aset dilelang (${rp(got)}), satu giliran hilang.`);
}
function moveSteps(g, pid, steps) {
  const p = g.ps[pid], from = p.pos; let passes = 0, pos = from;
  for (let i = 0; i < steps; i++) { pos = (pos + 1) % BOARD.length; if (pos === 0) passes++; }
  p.pos = pos; g.move = { p: pid, from, to: pos, steps, k: mkId(6) };
  log(g, pid, `Maju ${steps} langkah ke ${BOARD[pos].n}`);
  for (let i = 0; i < passes; i++) payday(g, pid);
  resolveSpace(g, pid, pos);
}
function resolveSpace(g, pid, pos) {
  const s = BOARD[pos];
  if (s.t === 'start') { gain(g, pid, 500 * RB, 'Mendarat tepat di GAJIAN: bonus kehadiran'); return; }
  if (s.t === 'kerja') { g.q.push({ k: 'career' }); return; }
  if (s.t === 'invest') { const ks = shuffle(Object.keys(ASSETS)).slice(0, 3); g.q.push({ k: 'invest', offers: ks }); return; }
  if (s.t === 'rehat') { const h = hapAdd(g, pid, 10); const p = g.ps[pid]; if (p.cash >= 200 * RB) { p.cash -= 200 * RB; log(g, pid, `${s.n}: istirahat sejenak, kebahagiaan +${h}`, -200 * RB); } else log(g, pid, `${s.n}: istirahat gratis, kebahagiaan +${h}`); return; }
  if (s.t === 'fixed') { g.q.push({ k: 'card', id: s.card }); return; }
  g.q.push({ k: 'card', id: drawCard(g, s.t) });
}

// Options for the item at the front of the queue. Same function drives UI and validation.
function optionsFor(g, pid, it) {
  const p = g.ps[pid], out = [];
  if (it.k === 'card') {
    const c = CARDS[it.id];
    if (!c.ch) { out.push({ l: 'Oke', ok: true, run: () => runFx(g, pid, c.fx, c.title) }); return out; }
    c.ch.forEach(o => {
      const need = optNeed(o.fx);
      let ok = p.cash >= need, why = ok ? '' : `Butuh ${rp(need)} tunai`;
      for (const f of o.fx) {
        if (f[0] === 'buy') { const v = assetValue(g, f[1]); if (p.cash < v) { ok = false; why = `Butuh ${rp(v)} tunai`; } }
        if (f[0] === 'kpr') { const v = assetValue(g, f[1]), dp = ce1k(v * ASSETS[f[1]].kpr / 100); if (p.cash < dp) { ok = false; why = `DP ${rp(dp)}`; } else if (p.debt > creditLimit(p) / 2) { ok = false; why = 'Bank menolak: utang terlalu besar'; } }
        if (f[0] === 'repay' && p.debt === 0) { ok = false; why = 'Kamu tidak punya utang'; }
        if (f[0] === 'loan' && p.debt + f[2] > creditLimit(p)) { ok = false; why = 'Melebihi batas utang'; }
      }
      out.push({ l: o.l, sub: why || fxSummary(g, pid, o.fx), ok, run: () => { log(g, pid, `${c.title}: ${o.l}`); runFx(g, pid, o.fx, c.title); if (o.m) log(g, pid, o.m); } });
    });
    return out;
  }
  if (it.k === 'pay') {
    const short = it.amt - p.cash;
    out.push({ l: `Bayar ${rp(it.amt)}`, ok: short <= 0, sub: short > 0 ? `Kurang ${rp(short)}` : 'Uang cukup', run: () => { p.cash -= it.amt; log(g, pid, `Bayar ${it.why}`, -it.amt); } });
    if (short > 0) {
      const fee = ce1k(short / 10), lim = creditLimit(p);
      out.push({ l: `Pinjam ${rp(short)}`, ok: p.debt + short + fee <= lim, sub: p.debt + short + fee <= lim ? `Utang +${rp(short + fee)} (biaya 10%)` : 'Melebihi batas utang', run: () => { p.debt += short + fee; p.cash += short; log(g, pid, `Pinjaman darurat ${rp(short)} (utang +${rp(short + fee)})`, short); p.cash -= it.amt; log(g, pid, `Bayar ${it.why}`, -it.amt); } });
      p.assets.forEach((a, i) => { const v = fl1k(assetValue(g, a.k) * 80 / 100); out.push({ l: `Jual ${ASSETS[a.k].name}`, ok: true, sub: `Dapat ${rp(v)} (80% nilai)`, run: () => { p.assets.splice(i, 1); gain(g, pid, v, `Jual cepat ${ASSETS[a.k].name}`); return 'keep'; } }); });
      const pen = Math.max(5, Math.min(30, Math.ceil(short / (250 * RB))));
      out.push({ l: 'Bayar semampunya', ok: true, def: true, sub: `Uang habis, kebahagiaan −${pen}`, run: () => { const c = p.cash; p.cash = 0; hapAdd(g, pid, -pen); log(g, pid, `Tak sanggup bayar ${it.why}. Bayar ${rp(c)} saja, sisanya ditanggung batin`, -c); } });
    }
    return out;
  }
  if (it.k === 'invest') {
    it.offers.forEach(k => {
      const v = assetValue(g, k), A = ASSETS[k];
      out.push({ l: `Beli ${A.name}`, ok: p.cash >= v, sub: `${rp(v)}${A.inc ? ` · +${rpShort(A.inc)}/gajian` : ''}`, run: () => runFx(g, pid, [['buy', k]], A.name) });
      if (A.kpr) { const dp = ce1k(v * A.kpr / 100); out.push({ l: `KPR ${A.name}`, ok: p.cash >= dp && p.debt <= creditLimit(p) / 2, sub: `DP ${rp(dp)}, sisa jadi utang`, run: () => runFx(g, pid, [['kpr', k]], A.name) }); }
    });
    out.push({ l: 'Lihat-lihat saja', ok: true, def: true, sub: 'Tidak membeli apa pun', run: () => log(g, pid, 'Cuma lihat-lihat investasi.') });
    return out;
  }
  if (it.k === 'career') {
    const c = CAREERS[p.career];
    if (p.career === 'pencari') {
      out.push({ l: 'Lamar kerja', ok: true, sub: `${c.chance}% peluang diterima`, run: () => { if (rnd(100) < c.chance) newJob(g, pid); else { hapAdd(g, pid, -5); log(g, pid, 'Lamaran ditolak. "Kami akan menghubungi Anda."'); } } });
      out.push({ l: 'Kerja serabutan', ok: true, def: true, sub: '+Rp1jt, kebahagiaan −3', run: () => { gain(g, pid, 1 * JT, 'Kerja serabutan'); hapAdd(g, pid, -3); } });
      return out;
    }
    const lembur = fl1k(p.sal * 25 / 100);
    out.push({ l: 'Lembur', ok: true, sub: `+${rp(lembur)}, kebahagiaan −6`, run: () => { gain(g, pid, lembur, 'Uang lembur'); hapAdd(g, pid, -6); } });
    out.push({ l: 'Kerja santai', ok: true, def: true, sub: 'Kebahagiaan +4', run: () => { hapAdd(g, pid, 4); log(g, pid, 'Kerja secukupnya, pulang tepat waktu.'); } });
    if (c.promo || c.up) out.push({ l: 'Kejar promosi', ok: true, sub: `${c.chance}% berhasil, kebahagiaan −4`, run: () => { hapAdd(g, pid, -4); if (rnd(100) < c.chance) promote(g, pid); else log(g, pid, 'Promosi belum rezeki. Atasan bilang "tahun depan ya".'); } });
    return out;
  }
  return out;
}
function fxSummary(g, pid, fx) {
  const parts = [];
  for (const [op, a, b] of fx) {
    if (op === 'spend' || op === 'pay') parts.push(`−${rpShort(a)}`);
    else if (op === 'cash') parts.push(a > 0 ? `+${rpShort(a)}` : `−${rpShort(-a)}`);
    else if (op === 'hap') parts.push(`😊${a > 0 ? '+' : ''}${a}`);
    else if (op === 'save') parts.push(`Tabung ${rpShort(a)}`);
    else if (op === 'debt') parts.push(`Utang +${rpShort(a)}`);
    else if (op === 'loan') parts.push(`+${rpShort(a)}, utang +${rpShort(b)}`);
    else if (op === 'buy') parts.push(rp(assetValue(g, a)));
    else if (op === 'kpr') parts.push(`DP ${rpShort(ce1k(assetValue(g, a) * ASSETS[a].kpr / 100))}`);
    else if (op === 'repay') parts.push(`Utang −${rpShort(Math.min(a, g.ps[pid].debt))}`);
    else if (op === 'skip') parts.push('Lewati giliran');
    else if (op === 'salup') parts.push(`Gaji +${a}%`);
    else if (op === 'livup') parts.push(`Biaya hidup ${a > 0 ? '+' : ''}${a}%`);
    else if (op === 'paysal%') parts.push(`−${a}% gaji`);
    else if (op === 'newjob') parts.push('Ganti karier');
    else if (op === 'gamble') parts.push(`−${rpShort(a)}, 40% jadi ${rpShort(b)}`);
  }
  return parts.join(' · ');
}

function assertTurn(g, pid) {
  if (g.status !== 'playing') fail('Game belum atau sudah tidak berjalan.');
  if (g.order[g.turnIdx] !== pid) fail('Bukan giliranmu.');
}
function advance(g) {
  g.q = []; g.dice = null;
  if (g.extra) { g.extra = false; g.phase = 'roll'; g.turnNo++; log(g, g.order[g.turnIdx], 'Dapat giliran bonus!'); return; }
  for (let guard = 0; guard < 50; guard++) {
    let idx = g.turnIdx + 1;
    if (idx >= g.order.length) { idx = 0; g.round++; drift(g); if (g.round > g.cfg.rounds) { endGame(g); return; } }
    g.turnIdx = idx; g.turnNo++; g.phase = 'roll';
    const p = g.ps[g.order[idx]];
    if (p.skip > 0) { p.skip--; log(g, g.order[idx], 'Melewati giliran ini.'); continue; }
    return;
  }
}
function drift(g) { for (const k in DRIFT) { let d = DRIFT[k]; if (k === 'saham') d = -400 + rnd(1001); if (k === 'warung') d = -200 + rnd(301); g.market[k] = Math.max(3000, Math.min(30000, g.market[k] + d)); } }
function endGame(g) { g.reveals = g.reveals || {}; g.status = 'ended'; g.phase = null; g.q = []; g.round = Math.min(g.round, g.cfg.rounds); log(g, null, 'Game selesai! Saatnya menghitung nasib.'); }

// ================= actions (validated mutators) =================
const A = {
  create(g, me, nick, av, code, bots) { Object.assign(g, { code, hostId: me, status: 'lobby', cfg: { rounds: 12 }, players: [{ id: me, nick, av, ready: false }], chat: [], log: [], done: [], v: 0, gameId: mkId() }); for (let i = 0; i < Math.min(5, bots || 0); i++) A.addBot(g, me); },
  addBot(g, me) {
    if (g.hostId !== me) fail('Hanya host yang bisa menambah bot.'); if (g.status !== 'lobby') fail('Bot hanya bisa ditambah di lobby.');
    if (g.players.length >= 6) fail('Room sudah penuh (6 pemain).');
    const used = new Set(g.players.map(p => p.nick)); const free = BOTS.filter(b => !used.has(b[0]));
    const [nick, av] = free[rnd(free.length)];
    g.players.push({ id: 'bot-' + mkId(8), nick, av, ready: true, bot: true });
  },
  botStep(g, me) {
    if (g.status !== 'playing') fail('Game tidak berjalan.');
    const caller = g.players.find(p => p.id === me); if (!caller || caller.bot) fail('Kamu bukan pemain di room ini.');
    const cur = g.order[g.turnIdx], p = g.ps[cur]; if (!p.bot) fail('Bukan giliran bot.');
    if (g.phase === 'roll') { if (p.debt > 0 && p.cash > p.liv * 2 + 2 * JT) A.repay(g, cur, 'all'); A.roll(g, cur); }
    else if (g.phase === 'act') A.resolve(g, cur, botChoose(g, cur));
    else if (g.phase === 'end') A.end(g, cur);
  },
  join(g, me, nick, av) {
    if (g.players.some(p => p.id === me)) { const p = g.players.find(p => p.id === me); p.nick = nick; p.av = av; return; }
    if (g.status !== 'lobby') fail('Game di room ini sudah berjalan. Tunggu sampai selesai.');
    if (g.players.length >= 6) fail('Room sudah penuh (6 pemain).');
    g.players.push({ id: me, nick, av, ready: false });
  },
  leave(g, me) {
    if (g.status === 'playing') fail('Game sedang berjalan.');
    g.players = g.players.filter(p => p.id !== me);
    const humans = g.players.filter(p => !p.bot);
    if (g.hostId === me) g.hostId = humans[0]?.id || null;
    if (!humans.length) { g.players = []; g.status = 'closed'; }
  },
  ready(g, me, val) { if (g.status !== 'lobby') fail('Game sudah dimulai.'); const p = g.players.find(p => p.id === me); if (!p) fail('Kamu belum masuk room.'); p.ready = !!val; },
  kick(g, me, who) { if (g.hostId !== me) fail('Hanya host.'); if (g.status !== 'lobby') fail('Hanya di lobby.'); if (who === me) fail('Tidak bisa mengeluarkan diri sendiri.'); g.players = g.players.filter(p => p.id !== who); },
  rounds(g, me, n) { if (g.hostId !== me) fail('Hanya host.'); if (g.status !== 'lobby') fail('Hanya di lobby.'); if (![8, 12, 16, 20].includes(n)) fail('Pilihan ronde tidak valid.'); g.cfg.rounds = n; },
  chat(g, me, i) { if (!g.players.some(p => p.id === me)) fail('Kamu bukan anggota room.'); if (!(i >= 0 && i < CHAT_PRESETS.length)) fail('Pesan tidak valid.'); g.chat.push({ p: me, i, t: Date.now() }); if (g.chat.length > MAX_CHAT) g.chat.splice(0, g.chat.length - MAX_CHAT); },
  start(g, me) {
    if (g.hostId !== me) fail('Hanya host yang bisa memulai.');
    if (g.status !== 'lobby') fail('Game sudah dimulai.');
    if (g.players.length < 2) fail('Butuh minimal 2 pemain.');
    if (!g.players.every(p => p.ready)) fail('Semua pemain harus siap.');
    g.order = shuffle(g.players.map(p => p.id)); g.ps = {};
    for (const id of g.order) { const k = STARTER_CAREERS[rnd(STARTER_CAREERS.length)], c = CAREERS[k], pl = g.players.find(x => x.id === id); g.ps[id] = { nick: pl.nick, av: pl.av, bot: !!pl.bot, pos: 0, cash: START_CASH, sav: 0, debt: c.debt || 0, hap: 50, career: k, sal: c.sal, liv: c.liv, promos: 0, assets: [], skip: 0, bk: 0, laps: 0, ins: false }; }
    g.market = {}; for (const k in ASSETS) g.market[k] = 10000;
    Object.assign(g, { infl: 0, decks: {}, turnIdx: 0, round: 1, turnNo: 1, phase: 'roll', q: [], dice: null, move: null, extra: false, status: 'playing', gameId: mkId(), reveals: {}, log: [], startedAt: Date.now() });
    log(g, null, `Game dimulai! ${g.cfg.rounds} ronde. Giliran pertama: ${nameOf(g, g.order[0])}`);
    for (const id of g.order) log(g, id, `Karier awal: ${CAREERS[g.ps[id].career].name}`);
  },
  roll(g, me) {
    assertTurn(g, me); if (g.phase !== 'roll') fail('Dadu sudah dikocok giliran ini.');
    const d = [1 + rnd(6), 1 + rnd(6)]; g.dice = d; g.q = [];
    log(g, me, `Kocok dadu: ${d[0]} + ${d[1]}`);
    moveSteps(g, me, d[0] + d[1]);
    g.phase = g.q.length ? 'act' : 'end';
  },
  resolve(g, me, idx) {
    assertTurn(g, me); if (g.phase !== 'act' || !g.q.length) fail('Tidak ada keputusan yang menunggu.');
    const it = g.q[0], opts = optionsFor(g, me, it), o = opts[idx];
    if (!o) fail('Pilihan tidak valid.'); if (!o.ok) fail(o.sub || 'Pilihan ini belum bisa diambil.');
    g.q.shift(); const keep = o.run(); if (keep === 'keep') g.q.unshift(it);
    g.phase = g.q.length ? 'act' : 'end';
  },
  end(g, me) { assertTurn(g, me); if (g.phase !== 'end') fail('Selesaikan dulu keputusan yang menunggu.'); advance(g); },
  repay(g, me, amt) {
    assertTurn(g, me); if (!['roll', 'end'].includes(g.phase)) fail('Selesaikan dulu keputusan yang menunggu.');
    const p = P(g, me); const n = Math.min(amt === 'all' ? p.debt : 1 * JT, p.cash, p.debt); if (n <= 0) fail('Tidak ada utang atau uang tunai.');
    p.cash -= n; p.debt -= n; log(g, me, 'Bayar utang sukarela', -n);
  },
  sell(g, me, assetId) {
    assertTurn(g, me); if (!['roll', 'end'].includes(g.phase)) fail('Selesaikan dulu keputusan yang menunggu.');
    const p = P(g, me); const i = p.assets.findIndex(a => a.id === assetId); if (i < 0) fail('Aset tidak ditemukan.');
    const a = p.assets[i], v = fl1k(assetValue(g, a.k) * 85 / 100); p.assets.splice(i, 1); gain(g, me, v, `Jual ${ASSETS[a.k].name} (85% nilai)`);
  },
  hostSkip(g, me) {
    if (g.hostId !== me) fail('Hanya host.'); if (g.status !== 'playing') fail('Game tidak berjalan.');
    const cur = g.order[g.turnIdx];
    if (g.phase === 'roll') { log(g, cur, 'Giliran dilewati oleh host.'); advance(g); return; }
    for (let i = 0; i < 30 && g.q.length; i++) {
      const it = g.q[0], opts = optionsFor(g, cur, it);
      let o = opts.find(x => x.def && x.ok) || [...opts].reverse().find(x => x.ok);
      g.q.shift(); const keep = o.run(); if (keep === 'keep') g.q.unshift(it);
    }
    log(g, cur, 'Keputusan diselesaikan otomatis oleh host.'); advance(g);
  },
  hostEnd(g, me) { if (g.hostId !== me) fail('Hanya host.'); if (g.status !== 'playing') fail('Game tidak berjalan.'); endGame(g); },
  reveal(g, me, key) { if (g.status !== 'ended') fail('Game belum selesai.'); if (!g.ps?.[me]) fail('Kamu tidak ikut game ini.'); if (!GOALS[key]) fail('Tujuan tidak valid.'); g.reveals[me] = key; },
  rematch(g, me) {
    if (g.hostId !== me) fail('Hanya host.'); if (g.status !== 'ended') fail('Game belum selesai.');
    for (const k of ['botGoals', 'order', 'ps', 'market', 'infl', 'decks', 'turnIdx', 'round', 'turnNo', 'phase', 'q', 'dice', 'move', 'extra', 'reveals', 'startedAt']) delete g[k];
    g.status = 'lobby'; g.log = []; g.gameId = mkId(); g.players.forEach(p => p.ready = !!p.bot);
  },
};

// ================= bot brain =================
// Tries each allowed option on a copy of the game and keeps the one that best improves the bot's life score.
function botValue(g, id) {
  const p = g.ps[id], nw = netWorth(g, p), W = Math.floor(nw / (100 * RB));
  let v = (W <= 400 ? W : 400 + (W - 400) / 3) + p.hap * 5 + p.promos * 60;
  v += p.assets.reduce((s, a) => s + 12 + ASSETS[a.k].inc / (40 * RB), 0);
  const liv = p.liv * (10000 + g.infl) / 10000; if (p.cash < liv) v -= 70; if (p.cash < liv / 2) v -= 60;
  if (p.debt > creditLimit(p) * 0.6) v -= 90; if (p.career === 'pencari') v -= 60; v -= p.skip * 25 + p.bk * 200;
  if (g.q.length && g.q[0].k === 'pay') v -= 40;
  return v;
}
function botChoose(g, id) {
  const opts = optionsFor(g, id, g.q[0]); let best = -1, bestV = -Infinity;
  opts.forEach((o, i) => {
    if (!o.ok) return; let v;
    try { const t = JSON.parse(JSON.stringify(g)); A.resolve(t, id, i); v = botValue(t, id); } catch (e) { return; }
    v += rnd(12);
    if (v > bestV) { bestV = v; best = i; }
  });
  if (best < 0) { best = opts.findIndex(o => o.def && o.ok); if (best < 0) best = opts.findIndex(o => o.ok); }
  return best;
}

// ================= scoring =================
const TITLES = {
  sultan: ['Sultan Akhir Bulan', 'Kekayaan bersih tertinggi di meja.'],
  cicilan: ['Raja Cicilan', 'Utang terbesar, tetap percaya diri.'],
  korporat: ['Budak Korporat Paling Bahagia', 'Kerja kantoran, tetap tersenyum.'],
  investor: ['Investor Dadakan', 'Aset paling banyak, entah dari mana.'],
  healing: ['Healing Terus, Saldo Tipis', 'Bahagia maksimal, dompet minimal.'],
  hemat: ['Si Paling Dana Darurat', 'Tabungan darurat paling tebal.'],
  pinjol: ['Penyintas Pinjol', 'Pernah bangkrut, masih berdiri.'],
  tuatua: ['Pejuang Tanggal Tua', 'Uang tunai paling tipis di akhir game.'],
  biasa: ['Warga +62 Biasa Saja', 'Hidup jalan, cicilan jalan, kopi jalan.'],
};
function computeResults(g) {
  const rows = g.order.map(id => {
    const p = g.ps[id], nw = netWorth(g, p), W = Math.floor(nw / (100 * RB));
    const wealth = W <= 400 ? W : 400 + Math.floor((W - 400) / 3);
    const hap = p.hap * 5;
    const career = p.promos * 60 + (p.career === 'manajer' ? 40 : 0) + (p.career === 'pencari' ? -60 : 0);
    const gk = g.reveals?.[id]; const goalMet = gk ? GOALS[gk].test(p, nw) : false;
    const goal = goalMet ? 250 : 0, debtFree = p.debt === 0 ? 80 : 0, bk = -200 * p.bk;
    return { id, p, nw, assetsV: nw - p.cash - p.sav + p.debt, parts: { wealth, hap, career, goal, debtFree, bk }, total: wealth + hap + career + goal + debtFree + bk, goalKey: gk || null, goalMet };
  });
  rows.sort((a, b) => b.total - a.total || b.nw - a.nw);
  // titles: each rule picks the best-fitting player not yet titled
  const taken = new Set(); const by = (arr, f) => arr.filter(r => !taken.has(r.id)).sort(f)[0];
  const give = (key, r) => { if (r) { r.title = key; taken.add(r.id); } };
  give('sultan', by(rows.filter(r => r.nw >= 20 * JT), (a, b) => b.nw - a.nw));
  give('pinjol', by(rows.filter(r => r.p.bk > 0), (a, b) => b.p.bk - a.p.bk));
  give('cicilan', by(rows.filter(r => r.p.debt >= 5 * JT), (a, b) => b.p.debt - a.p.debt));
  give('korporat', by(rows.filter(r => OFFICE.includes(r.p.career) && r.p.hap >= 70), (a, b) => b.p.hap - a.p.hap));
  give('investor', by(rows.filter(r => r.p.assets.length >= 2), (a, b) => b.p.assets.length - a.p.assets.length));
  give('healing', by(rows.filter(r => r.p.hap >= 75 && r.nw < 15 * JT), (a, b) => b.p.hap - a.p.hap));
  give('hemat', by(rows.filter(r => r.p.sav >= 4 * JT), (a, b) => b.p.sav - a.p.sav));
  give('tuatua', by(rows.filter(r => r.p.cash < 3 * JT), (a, b) => a.p.cash - b.p.cash));
  rows.forEach(r => { if (!r.title) r.title = 'biasa'; });
  return rows;
}

// Secret goals are dealt by the server and stored outside the public game state.
function dealGoals(g) { const ks = Object.keys(GOALS), out = {}; for (const id of g.order) out[id] = ks[rnd(ks.length)]; return out; }

export {
  A, GameError, BOARD, SPACE_TYPES, CARDS, CATS, CAREERS, ASSETS, GOALS, TITLES, BOTS, CHAT_PRESETS, AVATARS, DECK_CATS,
  START_CASH, computeResults, optionsFor, netWorth, assetValue, creditLimit, nameOf, avOf, rp, rpShort, rnd, mkCode, mkId, dealGoals, botChoose,
};
