// @ts-self-types="./engine.d.ts"
// ================= HIDUP DI INDONESIA · City Edition — rules engine =================
// Pure functions over a plain-JSON game object. Money is integer rupiah. Randomness: crypto.getRandomValues.
const JT = 1000000, RB = 1000;
const MAX_LOG = 140, MAX_CHAT = 30;
const START_CASH = 100 * JT, JAM_FEE = 5 * JT, MAX_JAM_TURNS = 3;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function rnd(n) { const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mkId(n = 10) { let s = ''; const c = 'abcdefghijkmnpqrstuvwxyz23456789'; for (let i = 0; i < n; i++) s += c[rnd(c.length)]; return s; }
function mkCode() { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[rnd(CODE_CHARS.length)]; return s; }
const ce1k = x => Math.ceil(x / 1000) * 1000;
function rp(n) { const s = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '−Rp' : 'Rp') + s; }
function rpShort(n) { const a = Math.abs(n), sg = n < 0 ? '−' : ''; if (a >= 1e9) return sg + 'Rp' + (a / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'; if (a >= JT) { const v = a / JT; return sg + 'Rp' + (Number.isInteger(v) ? v : v.toFixed(1)) + 'M'; } if (a >= RB) return sg + 'Rp' + Math.round(a / RB) + 'K'; return sg + 'Rp' + a; }
class GameError extends Error {}
const fail = m => { throw new GameError(m); };

// ---------- board: a hexagon, 6 sides × 6 spaces, a special corner at every vertex ----------
const GROUPS = {
  brown:  { name: 'Java North Coast', color: '#8B5A3C' },
  sky:    { name: 'Sumatra', color: '#43B0E0' },
  pink:   { name: 'Kalimantan', color: '#E2559A' },
  orange: { name: 'Sulawesi', color: '#F08A24' },
  red:    { name: 'Eastern Islands', color: '#DB3A34' },
  yellow: { name: 'Central Java', color: '#F2C230' },
  green:  { name: 'West & East Java', color: '#2E9E5B' },
  navy:   { name: 'Prime Cities', color: '#2B3A8C' },
};
const C = (n, g, price, note) => ({ n, t: 'city', g, price: price * JT, note });
const BOARD = [
  { n: 'Payday', t: 'start', note: 'Collect your job’s salary every time you pass.' },
  C('Cirebon', 'brown', 6, 'Empal gentong and megamendung batik.'),
  { n: 'Life Event', t: 'event' },
  C('Tegal', 'brown', 7, 'Hometown of the warteg.'),
  { n: 'Merak Ferry Port', t: 'transport', price: 20 * JT, note: 'Java to Sumatra, if the queue allows.' },
  C('Padang', 'sky', 10, 'The hometown of rendang.'),
  { n: 'Traffic Jam', t: 'jam', note: 'Just passing? You’re fine. Sent here? You’re stuck.' },
  C('Pekanbaru', 'sky', 10, 'Riau river city.'),
  C('Palembang', 'sky', 12, 'Pempek and the Ampera Bridge.'),
  { n: 'Power Company', t: 'utility', price: 15 * JT, note: 'Rent = dice × Rp400K, or × Rp1M if you own both companies.' },
  C('Pontianak', 'pink', 14, 'The city on the equator.'),
  C('Balikpapan', 'pink', 14, 'Oil town by the bay.'),
  { n: 'Night Market', t: 'market', note: 'Street food and rumors. Draw an Indonesia Reality card.' },
  C('Samarinda', 'pink', 16, 'Mahakam riverfront.'),
  { n: 'Indonesia Reality', t: 'reality' },
  C('Makassar', 'orange', 18, 'Sunsets at Losari Beach.'),
  { n: 'Commuter Line', t: 'transport', price: 20 * JT, note: 'Packed at 7 a.m., packed at 6 p.m.' },
  C('Manado', 'orange', 18, 'Bunaken reefs and tinutuan.'),
  { n: 'Rest Area', t: 'rest', note: 'Land here to collect the Community Fund.' },
  C('Palu', 'orange', 20, 'Bay city of Central Sulawesi.'),
  C('Labuan Bajo', 'red', 22, 'Gateway to the Komodo dragons.'),
  { n: 'Life Event', t: 'event' },
  C('Ambon', 'red', 22, 'The City of Music.'),
  C('Jayapura', 'red', 24, 'Hills over Yos Sudarso Bay.'),
  { n: 'Wrong Turn!', t: 'gojam', note: 'Toll exit closed. Go straight to the Traffic Jam.' },
  C('Semarang', 'yellow', 26, 'Lumpia and Lawang Sewu.'),
  C('Solo', 'yellow', 26, 'Batik and night markets.'),
  { n: 'Airport', t: 'transport', price: 20 * JT, note: 'Promo tickets, real delays.' },
  C('Yogyakarta', 'yellow', 28, 'Gudeg, students and Malioboro.'),
  { n: 'Water Company', t: 'utility', price: 15 * JT, note: 'Rent = dice × Rp400K, or × Rp1M if you own both companies.' },
  { n: 'Arisan Night', t: 'arisan', note: 'Your name is drawn! Collect Rp1M from every player.' },
  C('Bandung', 'green', 30, 'Cool air and factory outlets.'),
  C('Surabaya', 'green', 30, 'The City of Heroes.'),
  C('Malang', 'green', 32, 'Apples and mountain views.'),
  C('Bali', 'navy', 35, 'Beach clubs and traffic in Canggu.'),
  C('Jakarta', 'navy', 40, 'The capital. Bring patience.'),
];
const SIDES = 6, PER_SIDE = 6;
const POS = Object.fromEntries(BOARD.map((s, i) => [s.n, i])); // first index for each name
const JAM_POS = POS['Traffic Jam'];
const BUYABLE = BOARD.map((s, i) => ['city', 'transport', 'utility'].includes(s.t) ? i : -1).filter(i => i >= 0);
const RENT_MULT = [1, 5, 14, 30, 38, 45]; // 0 houses … 4 houses, 5 = tower
const sideOf = i => Math.floor(i / PER_SIDE);
const houseCost = i => [5, 7, 9, 12, 15, 20][sideOf(i)] * JT;
const baseRent = i => Math.round(BOARD[i].price * 10 / 100 / (100 * RB)) * 100 * RB;
const rentTable = i => RENT_MULT.map(m => baseRent(i) * m);
const groupOf = g => BOARD.map((s, i) => s.g === g ? i : -1).filter(i => i >= 0);
const TOURIST = ['Bali', 'Labuan Bajo'];

const SPACE_TYPES = {
  start: { lab: 'Payday', ic: '💰' }, city: { lab: 'City', ic: '🏙️' }, event: { lab: 'Life Event', ic: '🍀' }, reality: { lab: 'Indonesia Reality', ic: '📰' },
  transport: { lab: 'Transport', ic: '🚆' }, utility: { lab: 'Utility', ic: '💡' }, jam: { lab: 'Traffic Jam', ic: '🚗' },
  rest: { lab: 'Rest Area', ic: '🌴' }, gojam: { lab: 'Wrong Turn', ic: '🚧' }, market: { lab: 'Night Market', ic: '🏮' }, arisan: { lab: 'Arisan Night', ic: '🎉' },
};

// ---------- jobs: picked from 3–4 offers at the start; each changes how money flows ----------
// sal: salary per Payday (M). Optional: var [min%,max%], life (M per Payday), start (M), owe (M due at 1st Payday), grow (M per Payday),
// buy/build (% discount), rentPay (% extra rent paid), tourism (% extra rent on tourist cities + transport), perProp (M per property per Payday),
// tutor (M from each player per Payday), cardSpace (M when landing on a card space), cardPos/cardNeg (% on card cash), repairs (% extra repair fines),
// mortgage (% of price), take (% takeover price), protect, safe (no layoffs), quickJam, immune [tags], union (+M on bonus cards), tags.
const JOBS = {
  pns:        { name: 'Civil Servant', ic: '🗂️', sal: 14, safe: true, cardNeg: -50, tags: ['gov'], pros: ['Can’t be laid off', 'Card fines cost you half'], cons: ['Modest salary'] },
  startup:    { name: 'Startup Engineer', ic: '🚀', sal: 18, life: 4, tags: ['tech'], pros: ['High salary'], cons: ['Tech-layoff cards hit you', 'Living costs Rp4M each Payday'] },
  ojol:       { name: 'Ojol Driver', ic: '🛵', sal: 13, quickJam: true, tags: ['gig'], pros: ['Traffic Jam holds you 1 turn, no fee', 'Surge-pricing cards pay you'], cons: ['Low salary'] },
  creator:    { name: 'Content Creator', ic: '🎥', sal: 11, var: [0, 250], cardPos: 50, tags: ['creative'], pros: ['Card income +50%', 'Salary can reach Rp27M'], cons: ['Salary can be Rp0', 'Algorithm cards hurt'] },
  seller:     { name: 'Online Seller', ic: '📦', sal: 10, perProp: 1, tags: ['seller'], pros: ['+Rp1M per property you own each Payday', 'Shopping-day cards pay you'], cons: ['Low base salary'] },
  agent:      { name: 'Property Agent', ic: '🏘️', sal: 12, buy: 10, rentPay: 20, tags: ['biz'], pros: ['Buy from the bank 10% cheaper'], cons: ['Pay 20% more rent (always out viewing)'] },
  contractor: { name: 'Contractor', ic: '👷', sal: 11, build: 25, repairs: 100, tags: ['biz'], pros: ['Houses and towers 25% cheaper'], cons: ['Repair and flood fines doubled'] },
  manager:    { name: 'Corporate Manager', ic: '👔', sal: 23, owe: 25, tags: ['office'], pros: ['Top salary'], cons: ['Car loan: repay Rp25M at your first Payday', 'Mass-layoff cards hit you'] },
  grad:       { name: 'Fresh Graduate', ic: '🎓', sal: 8, grow: 2, start: 15, tags: ['office'], pros: ['Salary grows Rp2M every Payday', 'Parents chip in Rp15M at the start'], cons: ['Starts at only Rp8M'] },
  warung:     { name: 'Warung Owner', ic: '🍛', sal: 11, cardSpace: 5, tags: ['biz'], pros: ['+Rp5M whenever you land on a card space or the Night Market'], cons: ['Average salary'] },
  doctor:     { name: 'Doctor', ic: '🩺', sal: 19, life: 4, immune: ['health'], tags: ['health'], pros: ['High salary', 'Immune to illness cards'], cons: ['Living costs Rp4M each Payday'] },
  teacher:    { name: 'Teacher', ic: '📚', sal: 9, tutor: 1, tags: ['gov'], pros: ['Private tutoring: collect Rp1M from every player each Payday'], cons: ['Low salary'] },
  guide:      { name: 'Tour Guide', ic: '🧭', sal: 12, tourism: 75, tags: ['tourism'], pros: ['+75% rent on Bali, Labuan Bajo and transport', 'Tourism-boom cards pay you'], cons: ['Tourism-slump cards hurt'] },
  banker:     { name: 'Banker', ic: '🏦', sal: 16, life: 2, mortgage: 60, tags: ['office'], pros: ['Mortgages pay 60% and redeem without the 10% fee'], cons: ['Living costs Rp2M each Payday', 'Mass-layoff cards hit you'] },
  lawyer:     { name: 'Lawyer', ic: '⚖️', sal: 17, life: 3, take: 125, protect: true, tags: ['office'], pros: ['Take over cities at 125% instead of 150%', 'Nobody can take over your cities'], cons: ['Living costs Rp3M each Payday'] },
  factory:    { name: 'Factory Worker', ic: '🏭', sal: 13, safe: true, union: 3, tags: ['union'], pros: ['Union: can’t be laid off', 'Bonus cards pay you Rp3M extra'], cons: ['Average salary'] },
  farmer:     { name: 'Coffee Farmer', ic: '☕', sal: 9, var: [60, 230], tags: ['farm'], pros: ['Harvest pays 60–230% of Rp9M', 'Commodity-boom cards pay you'], cons: ['Drought cards hurt'] },
};
const J = (g, pid) => JOBS[g.ps[pid].job] || {};

// ---------- cards ----------
// Every card is written for the player who draws it; “all” and job/region cards reach other players too.
const CARDS = {};
function K(id, deck, title, desc, fx, ch) { CARDS[id] = { id, deck, title, desc, fx: fx || [], ch: ch || null }; }
const O = (l, fx, m) => ({ l, fx, m });
// Life Event — mostly personal
K('E01', 'event', 'Year-End Bonus', 'Your boss finally remembered you still work here.', [['cash', 10 * JT, 'bonus']]);
K('E02', 'event', 'Holiday Bonus Lands', 'The THR hits your account. Your balance smiles for three days.', [['cash', 15 * JT, 'bonus']]);
K('E03', 'event', 'Side Project', 'A college friend needs a logo. Decent pay, infinite revisions.', [['cash', 6 * JT]]);
K('E04', 'event', 'Fun Run Door Prize', 'You came for the free T-shirt and went home with a fridge.', [['cash', 5 * JT]]);
K('E05', 'event', 'Phone Takes a Dive', 'The screen now looks like a map of shortcut alleys.', [['pay', 3 * JT]]);
K('E06', 'event', 'Motorbike Breaks Down', 'It stalls exactly when you’re in a hurry.', null, [O('Official workshop', [['pay', 2500 * RB]]), O('Roadside mechanic', [['pay', 1 * JT], ['back', 3]], 'It ran… for three blocks.')]);
K('E07', 'event', 'Midnight Flash Sale', '50% off! Things you don’t need suddenly feel essential.', null, [O('Check out and resell', [['gamble', 3 * JT, 7 * JT, 50]]), O('Close the app', [])]);
K('E08', 'event', 'Dog-Logo Crypto Coin', 'Up 300% this week. Your friends won’t stop posting screenshots.', null, [O('FOMO in Rp5M', [['gamble', 5 * JT, 14 * JT, 35]]), O('Pretend you didn’t see it', [])]);
K('E09', 'event', 'Instant Loan SMS', '“Funds in 5 minutes!” The interest rate is not mentioned.', null, [O('Take Rp10M now', [['loan', 10 * JT, 13 * JT]], 'You must repay Rp13M at your next Payday.'), O('Block the number', [])]);
K('E10', 'event', 'Going Home for Lebaran', 'Pricey tickets, endless traffic, but home is home. Advance to Payday.', [['goto', POS['Payday']]]);
K('E11', 'event', 'Concert in the Capital', 'Ticket war at noon. Your fingers are fast today.', null, [O('Buy a ticket (Rp2M) and go', [['pay', 2 * JT], ['goto', POS['Jakarta']]]), O('Watch the livestream', [])]);
K('E12', 'event', 'Promo Flight', 'A cheap ticket pops up in a friend’s story.', null, [O('Fly (Rp2M) to the Airport', [['pay', 2 * JT], ['goto', POS['Airport']]]), O('Stay home', [])]);
K('E13', 'event', 'Promotion!', 'The long meetings paid off. Your name came up.', [['cash', 12 * JT, 'bonus']]);
K('E14', 'event', 'Restructuring', 'A more polite word for layoffs. You keep your job, not your bonus.', [['pay', 8 * JT, 'layoff']]);
K('E15', 'event', 'Wedding Season', 'Three invitations, one weekend. Pay Rp1M to every other player.', [['each', 1 * JT]]);
K('E16', 'event', 'Your Birthday', 'Social media reminded everyone. Collect Rp1M from every player.', [['collect', 1 * JT]]);
K('E17', 'event', 'Arisan Jackpot', 'Your name came out first at the office arisan. Collect Rp1.5M from every player.', [['collect', 1500 * RB]]);
K('E18', 'event', 'Typo Transfer', 'One wrong digit and your money moved to a stranger.', [['pay', 2 * JT]]);
K('E19', 'event', 'Online Shopping Scam', 'You ordered sneakers. A neatly wrapped brick arrived.', [['pay', 2500 * RB]]);
K('E20', 'event', 'Freelance Translation', '40 pages due tomorrow morning.', [['cash', 4 * JT]]);
K('E21', 'event', 'Viral for a Day', 'A million views of you falling off a bicycle.', [['cash', 3 * JT]]);
K('E22', 'event', 'Dengue Fever', 'Three days in hospital. Mosquitoes don’t discriminate.', [['pay', 6 * JT, 'health']]);
K('E23', 'event', 'Shortcut Card', 'A friend shares a secret back road. Keep this card to escape the Traffic Jam once.', [['jamcard']]);
K('E24', 'event', 'Daytime Headlight Ticket', 'You forgot. The officer didn’t.', [['pay', 1 * JT]]);
K('E25', 'event', 'Cousin’s Mega Wedding', 'Everyone is invited and everyone brings an envelope. Collect Rp2M from every player.', [['collect', 2 * JT]]);
K('E26', 'event', 'Viral Fundraiser', 'The internet chips in for whoever is struggling most. The poorest player receives Rp8M.', [['poorgift', 8 * JT]]);
K('E27', 'event', 'Gotong Royong', 'Neighbors help neighbors. The richest player gives Rp6M to the poorest.', [['richtax', 6 * JT]]);
K('E28', 'event', 'Office Potluck', 'Everyone brings food, everyone gets a little bonus. Every player receives Rp1M.', [['allcash', 1 * JT]]);
K('E29', 'event', 'Food Poisoning', 'The night-market sate was suspicious. Pay Rp2M for medicine.', [['pay', 2 * JT, 'health']]);
K('E30', 'event', 'Lucky Lottery Ticket', 'A scratch card from the minimarket actually won.', [['cash', 7 * JT]]);
// Indonesia Reality — the country happens to everyone
K('R01', 'reality', 'Wedding Invitation', 'An old classmate is getting married. You’re not close, but the envelope is mandatory.', null, [O('Thick envelope', [['pay', 2 * JT]]), O('Standard envelope', [['pay', 1 * JT]]), O('“I’m out of town”', [['jam']], 'Hiding at home turned into a three-day jam.')]);
K('R02', 'reality', 'Independence Day Dues', 'The neighborhood committee arrives with a notebook and a hopeful smile.', [['pay', 500 * RB]]);
K('R03', 'reality', 'Vehicle Tax Due', 'Your registration reminds you the state has needs too.', [['pay', 2 * JT]]);
K('R04', 'reality', 'Fuel Price Hike', 'Petrol goes up. Everything else follows. Every player pays Rp2M to the Community Fund.', [['allpay', 2 * JT]]);
K('R05', 'reality', 'New Toll Road Opens', 'Everything is connected now. Advance to the nearest transport space; pay double rent if it’s owned.', [['nearest']]);
K('R06', 'reality', 'Monsoon Floods', 'Streets became rivers. Every player pays Rp500K per house and Rp2M per tower they own.', [['allrepairs', 500 * RB, 2 * JT]]);
K('R07', 'reality', 'Building Inspection', 'An inspector finds your buildings need “adjustments”. Pay Rp1M per house and Rp4M per tower.', [['repairs', 1 * JT, 4 * JT]]);
K('R08', 'reality', 'Police Checkpoint', 'Papers, please. Go to the Traffic Jam.', [['jam']]);
K('R09', 'reality', 'Rush Hour Commute', 'Packed carriage, mystery aromas, feet not touching the floor.', [['goto', POS['Commuter Line']]]);
K('R10', 'reality', 'Rupiah Slides', 'Imported things get pricier overnight. Every player pays Rp1M to the Community Fund.', [['allpay', 1 * JT]]);
K('R11', 'reality', 'Land Values Rise', 'A new mall is planned nearby. Collect Rp1M for each property you own.', [['perprop', 1 * JT]]);
K('R12', 'reality', 'Tax Refund', 'You overpaid last year. The money comes home.', [['cash', 3 * JT]]);
K('R13', 'reality', 'Car Free Day', 'A slow walk and a bag of cilok. Move back 3 spaces.', [['back', 3]]);
K('R14', 'reality', 'Blackout', 'The power cut out right before your deadline. Advance to the Power Company.', [['goto', POS['Power Company']]]);
K('R15', 'reality', 'Small Business Grant', 'Your side business gets a government grant.', [['cash', 5 * JT]]);
K('R16', 'reality', 'Long Weekend', 'Three holidays in a row. Advance to the Rest Area.', [['goto', POS['Rest Area']]]);
K('R17', 'reality', 'Mystery Parking Attendant', 'Invisible when you arrive, right there when you leave.', [['pay', 200 * RB]]);
K('R18', 'reality', 'Government Cash Aid', 'Direct cash assistance is disbursed. Every player receives Rp3M.', [['allcash', 3 * JT]]);
K('R19', 'reality', 'Collective Leave Day', 'A surprise cuti bersama. Every player gets Rp2M in holiday pay.', [['allcash', 2 * JT, 'bonus']]);
K('R20', 'reality', 'Bali Tourism Boom', 'Flights are full. Owners of Bali and Jakarta collect Rp3M per city; Tour Guides get Rp4M.', [['regionbonus', 'navy', 3 * JT], ['jobcash', ['tourism'], 4 * JT]]);
K('R21', 'reality', 'Nickel Boom', 'Smelters everywhere. Owners of Sulawesi cities collect Rp3M per city.', [['regionbonus', 'orange', 3 * JT]]);
K('R22', 'reality', 'New Capital Hype', 'Everyone wants land near the new capital. Owners of Kalimantan cities collect Rp3M per city.', [['regionbonus', 'pink', 3 * JT]]);
K('R23', 'reality', 'Coffee Export Boom', 'Indonesian beans are trending abroad. Coffee Farmers get Rp7M; Warung Owners get Rp2M.', [['jobcash', ['farm'], 7 * JT], ['jobcash', ['biz'], 2 * JT]]);
K('R24', 'reality', 'Ojol Surge Pricing', 'It’s raining at 5 p.m. Ojol Drivers earn Rp5M; everyone else pays Rp500K for rides.', [['jobcash', ['gig'], 5 * JT], ['jobpay', ['gig'], 500 * RB]]);
K('R25', 'reality', 'Civil Servant Pay Raise', 'Government salaries go up. Civil Servants and Teachers get Rp4M.', [['jobcash', ['gov'], 4 * JT]]);
K('R26', 'reality', 'Tech Winter', 'Startups cut staff to “extend runway”. Startup Engineers lose Rp7M.', [['jobcash', ['tech'], -7 * JT, 'layoff']]);
K('R27', 'reality', 'Algorithm Change', 'Reach drops 80% overnight. Content Creators lose Rp4M.', [['jobcash', ['creative'], -4 * JT]]);
K('R28', 'reality', 'El Niño Drought', 'The rains don’t come. Coffee Farmers lose Rp5M.', [['jobcash', ['farm'], -5 * JT]]);
K('R29', 'reality', 'Jakarta Floods', 'The capital is underwater again. Owners of Bali and Jakarta pay Rp2M per city.', [['regionpay', 'navy', 2 * JT]]);
K('R30', 'reality', 'Port Strike', 'Ships wait offshore. Every transport owner pays Rp2M per transport space.', [['typepay', 'transport', 2 * JT]]);
K('R31', 'reality', 'Interest Rate Hike', 'The central bank raises rates. Every player pays Rp1M per mortgaged property.', [['mortpay', 1 * JT]]);
K('R32', 'reality', 'Rice Price Spike', 'Nasi is life, and life got pricier. Every player pays Rp1M to the Community Fund.', [['allpay', 1 * JT]]);
K('R33', 'reality', 'Mass Layoffs', 'Corporate “efficiency”. Office workers (managers, bankers, lawyers, graduates) lose Rp5M.', [['jobcash', ['office'], -5 * JT, 'layoff']]);
K('R34', 'reality', 'National Shopping Day', 'Online Sellers earn Rp6M and Content Creators Rp3M. Everyone else spends Rp1M.', [['jobcash', ['seller'], 6 * JT], ['jobcash', ['creative'], 3 * JT], ['jobpay', ['seller', 'creative'], 1 * JT]]);
K('R35', 'reality', 'Volcano Ash Cloud', 'Flights grounded across the islands. Tour Guides lose Rp4M; the Airport owner pays Rp3M.', [['jobcash', ['tourism'], -4 * JT], ['ownerpay', POS['Airport'], 3 * JT]]);
K('R36', 'reality', 'Union Wage Deal', 'Factory unions win a raise. Factory Workers get Rp5M.', [['jobcash', ['union'], 5 * JT]]);

const CHAT_PRESETS = ['Hi everyone! 👋', 'Let’s go! 🔥', 'Hold on, thinking 🤔', 'LOL 😂', 'End of the month… 😭', 'Cuan! 💸', 'Ouch… 🌧️', 'GG! 🤝', 'Get ready!', 'Bad signal 📶'];
const AVATARS = ['🐱', '🦊', '🐸', '🐼', '🦉', '🐯', '🐨', '🐵', '🐔', '🦆', '🐙', '🐌'];
const PCOLORS = ['#FFBE1A', '#2FB3A3', '#F07EB0', '#6C8EEA', '#F28A45', '#9B6BD6'];
const BOTS = [['Pak RT', 8], ['Mbak Kasir', 2], ['Bang Ojol', 5], ['Tante Arisan', 11], ['Om Startup', 4], ['Dek Magang', 1]];

// How a card reaches players, for the badge on the card: 'you' | 'some' | 'all', and 'good' | 'bad' | 'mixed' | 'choice'.
function cardMeta(c) {
  if (c.ch) return { scope: 'you', tone: 'choice' };
  let scope = 'you', pos = false, neg = false;
  for (const [op, a, b] of c.fx) {
    if (['allcash', 'allpay', 'allrepairs', 'mortpay', 'poorgift', 'richtax', 'each', 'collect'].includes(op)) scope = 'all';
    else if (['jobcash', 'jobpay', 'regionbonus', 'regionpay', 'typepay', 'ownerpay'].includes(op) && scope !== 'all') scope = 'some';
    if (['cash', 'allcash', 'perprop', 'regionbonus', 'collect', 'poorgift'].includes(op) || (op === 'jobcash' && b > 0)) pos = true;
    if (['pay', 'allpay', 'allrepairs', 'repairs', 'mortpay', 'regionpay', 'typepay', 'ownerpay', 'jobpay', 'each', 'jam', 'back'].includes(op) || (op === 'jobcash' && b < 0)) neg = true;
    if (op === 'richtax') { pos = true; neg = true; }
  }
  return { scope, tone: pos && neg ? 'mixed' : pos ? 'good' : neg ? 'bad' : 'mixed' };
}

// ================= helpers =================
function log(g, pid, t, d) { g.log.push({ n: g.turnNo || 0, p: pid || null, t, d: d || 0 }); if (g.log.length > MAX_LOG) g.log.splice(0, g.log.length - MAX_LOG); }
const nameOf = (g, pid) => (g.players?.find(x => x.id === pid)?.nick) || g.ps?.[pid]?.nick || 'Player';
const avOf = (g, pid) => AVATARS[g.players?.find(x => x.id === pid)?.av ?? g.ps?.[pid]?.av ?? 0] || AVATARS[0];
const activeIds = g => g.order.filter(id => !g.ps[id].out);
const owned = (g, pid) => BUYABLE.filter(i => g.props[i].o === pid);
const ownsGroup = (g, pid, grp) => groupOf(grp).every(i => g.props[i].o === pid);
const mineIn = (g, pid, grp) => groupOf(grp).filter(j => g.props[j].o === pid);
const hasTag = (g, pid, tags) => (J(g, pid).tags || []).some(t => tags.includes(t));
function propValue(g, i) { const pr = g.props[i]; return (pr.m ? BOARD[i].price - (pr.mv || BOARD[i].price / 2) : BOARD[i].price) + (BOARD[i].t === 'city' ? pr.h * houseCost(i) : 0); }
function netWorth(g, pid) { const p = g.ps[pid]; return p.cash + owned(g, pid).reduce((s, i) => s + propValue(g, i), 0) - (p.owe || 0); }
function rentFor(g, i, dice) {
  const s = BOARD[i], pr = g.props[i]; if (!pr.o || pr.m) return 0;
  if (s.t === 'city') return pr.h ? rentTable(i)[pr.h] : baseRent(i) * (ownsGroup(g, pr.o, s.g) ? 2 : 1);
  if (s.t === 'transport') { const n = BUYABLE.filter(j => BOARD[j].t === 'transport' && g.props[j].o === pr.o).length; return 2500 * RB * 2 ** (n - 1); }
  if (s.t === 'utility') { const n = BUYABLE.filter(j => BOARD[j].t === 'utility' && g.props[j].o === pr.o).length; return (dice || 7) * (n === 2 ? 1 * JT : 400 * RB); }
  return 0;
}
// job-adjusted prices
const buyPrice = (g, pid, i) => ce1k(BOARD[i].price * (100 - (J(g, pid).buy || 0)) / 100);
const buildCost = (g, pid, i) => ce1k(houseCost(i) * (100 - (J(g, pid).build || 0)) / 100);
const mortValueFor = (g, pid, i) => ce1k(BOARD[i].price * (J(g, pid).mortgage || 50) / 100);
const unmortCost = (g, pid, i) => { const pr = g.props[i], v = pr.mv || BOARD[i].price / 2; return J(g, pid).mortgage ? v : ce1k(v * 1.1); };
const takeoverPrice = (g, pid, i) => ce1k(BOARD[i].price * (J(g, pid).take || 150) / 100);
function rentDue(g, payer, i, dice) {
  const s = BOARD[i], owner = g.props[i].o; let r = rentFor(g, i, dice);
  const oj = J(g, owner), pj = J(g, payer);
  if (oj.tourism && (TOURIST.includes(s.n) || s.t === 'transport')) r = r * (100 + oj.tourism) / 100;
  if (pj.rentPay) r = r * (100 + pj.rentPay) / 100;
  return ce1k(r);
}

// money moves
function transfer(g, from, to, amt, why) {
  const p = g.ps[from]; p.cash -= amt;
  if (to === 'fund') { g.fund += amt; log(g, from, `Paid ${why} (to the Community Fund)`, -amt); }
  else if (to && g.ps[to]) { g.ps[to].cash += amt; log(g, from, `Paid ${why} to ${nameOf(g, to)}`, -amt); }
  else log(g, from, `Paid ${why}`, -amt);
}
// Mandatory payment by the active player: pays now, or queues a debt the player must settle.
function charge(g, pid, amt, why, to, rent) {
  amt = Math.trunc(amt); if (amt <= 0) return;
  const p = g.ps[pid];
  if (p.cash >= amt) { transfer(g, pid, to, amt, why); if (rent) { p.st.rentOut += amt; g.ps[to].st.rentIn += amt; } return; }
  g.q.unshift({ k: 'debt', amt, why, to: to || 'bank', rent: !!rent });
}
// A payment by any player: the active player may go into debt; others pay what they can.
function payBy(g, actor, id, amt, why, to = 'fund') {
  amt = ce1k(amt); if (amt <= 0) return;
  if (id === actor) { charge(g, id, amt, why, to); return; }
  const n = Math.min(amt, g.ps[id].cash); if (n <= 0) return;
  g.ps[id].cash -= n; if (to === 'fund') g.fund += n; else if (g.ps[to]) g.ps[to].cash += n;
  log(g, id, `Paid ${why}`, -n);
}
function gain(g, pid, amt, why) { amt = Math.trunc(amt); if (amt > 0) { g.ps[pid].cash += amt; log(g, pid, why, amt); } }

// One move record per action: the token's start tile and every tile it then visits (teleports listed in jumps).
function track(g, pid, tile, jump) {
  if (!g.move || g.move.a !== g.actN || g.move.p !== pid) g.move = { p: pid, from: g.ps[pid].pos, path: [], jumps: [], a: g.actN, k: mkId(6) };
  if (tile === undefined) return;
  if (jump) g.move.jumps.push(g.move.path.length);
  g.move.path.push(tile);
}
const jamFee = (g, pid) => J(g, pid).quickJam ? 0 : JAM_FEE;
function goJam(g, pid, why) {
  const p = g.ps[pid]; track(g, pid, JAM_POS, true);
  p.pos = JAM_POS; p.jam = J(g, pid).quickJam ? 1 : MAX_JAM_TURNS; p.doubles = 0; p.st.jams++; g.extra = false;
  log(g, pid, `${why}: stuck in the Traffic Jam`);
}
function passPayday(g, pid) {
  const p = g.ps[pid], job = J(g, pid); p.laps++;
  let sal = p.sal; if (job.var) sal = ce1k(sal * (job.var[0] + rnd(job.var[1] - job.var[0] + 1)) / 100);
  if (sal > 0) gain(g, pid, sal, `PAYDAY! ${job.name || 'Salary'}`); else log(g, pid, `PAYDAY… but ${job.name || 'the job'} paid nothing this month`);
  if (job.perProp) gain(g, pid, owned(g, pid).length * job.perProp * JT, 'Shop sales from your properties');
  if (job.tutor) { let tot = 0; for (const id of activeIds(g)) { if (id === pid) continue; const n = Math.min(job.tutor * JT, g.ps[id].cash); g.ps[id].cash -= n; tot += n; } if (tot) { p.cash += tot; log(g, pid, 'Private tutoring fees from every player', tot); } }
  if (job.grow) { p.sal += job.grow * JT; log(g, pid, `Career growth: salary is now ${rpShort(p.sal)}`); }
  if (job.life) charge(g, pid, job.life * JT, 'living costs', 'bank');
  if (p.owe) { const o = p.owe; p.owe = 0; charge(g, pid, o, 'loan repayment', 'bank'); }
}
function walk(g, pid, steps) { // forward (steps > 0) or back
  const p = g.ps[pid]; let pos = p.pos; track(g, pid);
  const dir = steps > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i++) { pos = (pos + dir + BOARD.length) % BOARD.length; track(g, pid, pos); if (pos === 0 && dir > 0) passPayday(g, pid); }
  p.pos = pos;
  log(g, pid, `${steps > 0 ? 'Moved' : 'Moved back'} ${Math.abs(steps)} to ${BOARD[pos].n}`);
  land(g, pid);
}
function advanceTo(g, pid, idx) { const p = g.ps[pid]; const steps = (idx - p.pos + BOARD.length) % BOARD.length || BOARD.length; walk(g, pid, steps); }
function land(g, pid) {
  const p = g.ps[pid], i = p.pos, s = BOARD[i];
  if (['city', 'transport', 'utility'].includes(s.t)) {
    const pr = g.props[i];
    if (!pr.o) { g.q.push({ k: 'buy', i }); return; }
    if (pr.o === pid) { log(g, pid, `Visited own property ${s.n}`); return; }
    if (pr.m) { log(g, pid, `${s.n} is mortgaged: no rent`); return; }
    const r = rentDue(g, pid, i, g.dice ? g.dice[0] + g.dice[1] : 7) * (g.doubleRent ? 2 : 1);
    g.doubleRent = false;
    charge(g, pid, r, `rent for ${s.n}`, pr.o, true);
    if (s.t === 'city' && !J(g, pr.o).protect && mineIn(g, pr.o, s.g).every(j => g.props[j].h === 0)) g.q.push({ k: 'takeover', i, price: takeoverPrice(g, pid, i) }); // optional, after the rent
    return;
  }
  if (['event', 'reality', 'market'].includes(s.t) && J(g, pid).cardSpace) gain(g, pid, J(g, pid).cardSpace * JT, 'Warung customers at the card space');
  if (s.t === 'event' || s.t === 'reality') { g.q.push({ k: 'card', id: draw(g, s.t) }); return; }
  if (s.t === 'market') { log(g, pid, 'Night Market: hearing the latest news'); g.q.push({ k: 'card', id: draw(g, 'reality') }); return; }
  if (s.t === 'arisan') { let tot = 0; for (const id of activeIds(g)) { if (id === pid) continue; const n = Math.min(1 * JT, g.ps[id].cash); g.ps[id].cash -= n; tot += n; } p.cash += tot; log(g, pid, 'Arisan Night: your name was drawn', tot); return; }
  if (s.t === 'gojam') { goJam(g, pid, 'Wrong turn'); return; }
  if (s.t === 'rest') { const f = g.fund; g.fund = 0; if (f > 0) gain(g, pid, f, 'Rest Area: collected the Community Fund'); else log(g, pid, 'Rest Area: the Community Fund is empty'); return; }
  if (s.t === 'jam') { log(g, pid, 'Just passing the Traffic Jam'); return; }
}
function draw(g, deck) {
  let d = g.decks[deck]; const ids = Object.keys(CARDS).filter(k => CARDS[k].deck === deck);
  if (!d || d.i >= d.o.length) d = g.decks[deck] = { o: shuffle(ids), i: 0 };
  return d.o[d.i++];
}

function runFx(g, pid, fx, title) {
  const p = g.ps[pid], job = J(g, pid);
  const cardCash = (amt, tag) => { let n = amt * (100 + (job.cardPos || 0)) / 100; if (tag === 'bonus' && job.union) n += job.union * JT; return ce1k(n); };
  const cardPay = (id, amt, tag, extraPct = 0) => { const jj = J(g, id); if (tag && (jj.immune || []).includes(tag)) return 0; if (tag === 'layoff' && jj.safe) return 0; return ce1k(amt * (100 + (jj.cardNeg || 0) + extraPct) / 100); };
  for (const [op, a, b, c] of fx) {
    switch (op) {
      case 'cash': gain(g, pid, cardCash(a, b), title); break;
      case 'pay': { const n = cardPay(pid, a, b); if (n) charge(g, pid, n, title, 'fund'); else log(g, pid, `${job.name}: not affected by ${title}`); break; }
      case 'each': for (const id of activeIds(g)) if (id !== pid) charge(g, pid, a, title, id); break;
      case 'collect': { let tot = 0; for (const id of activeIds(g)) { if (id === pid) continue; const n = Math.min(a, g.ps[id].cash); g.ps[id].cash -= n; tot += n; } p.cash += tot; log(g, pid, `${title}: collected from every player`, tot); break; }
      case 'allcash': for (const id of activeIds(g)) { const jj = J(g, id); gain(g, id, a + (b === 'bonus' && jj.union ? jj.union * JT : 0), title); } break;
      case 'allpay': { log(g, null, `${title}: every player pays ${rpShort(a)}`); for (const id of activeIds(g)) payBy(g, pid, id, cardPay(id, a), title); break; }
      case 'allrepairs': for (const id of activeIds(g)) { const n = owned(g, id).filter(i => BOARD[i].t === 'city').reduce((s, i) => s + (g.props[i].h === 5 ? b : g.props[i].h * a), 0); if (n) payBy(g, pid, id, cardPay(id, n, null, J(g, id).repairs || 0), title); } break;
      case 'perprop': gain(g, pid, a * owned(g, pid).length, title); if (!owned(g, pid).length) log(g, pid, 'No properties yet, so nothing to collect'); break;
      case 'repairs': { const n = owned(g, pid).filter(i => BOARD[i].t === 'city').reduce((s, i) => s + (g.props[i].h === 5 ? b : g.props[i].h * a), 0); if (n) charge(g, pid, cardPay(pid, n, null, job.repairs || 0), title, 'fund'); else log(g, pid, 'No buildings, nothing to fix'); break; }
      case 'jobcash': for (const id of activeIds(g)) { if (!hasTag(g, id, a)) continue; if (b > 0) gain(g, id, b, `${title} (${J(g, id).name})`); else { const n = cardPay(id, -b, c); if (n) payBy(g, pid, id, n, `${title} (${J(g, id).name})`); else log(g, id, `${J(g, id).name}: protected from ${title}`); } } break;
      case 'jobpay': for (const id of activeIds(g)) if (!hasTag(g, id, a)) payBy(g, pid, id, cardPay(id, b), title); break;
      case 'regionbonus': for (const id of activeIds(g)) { const n = mineIn(g, id, a).filter(i => !g.props[i].m).length; if (n) gain(g, id, n * b, title); } break;
      case 'regionpay': for (const id of activeIds(g)) { const n = mineIn(g, id, a).length; if (n) payBy(g, pid, id, cardPay(id, n * b), title); } break;
      case 'typepay': for (const id of activeIds(g)) { const n = owned(g, id).filter(i => BOARD[i].t === a).length; if (n) payBy(g, pid, id, cardPay(id, n * b), title); } break;
      case 'ownerpay': { const o = g.props[a]?.o; if (o && !g.ps[o].out) payBy(g, pid, o, cardPay(o, b), title); else log(g, null, `${BOARD[a].n} has no owner, nobody pays`); break; }
      case 'mortpay': for (const id of activeIds(g)) { const n = owned(g, id).filter(i => g.props[i].m).length; if (n) payBy(g, pid, id, cardPay(id, n * a), title); } break;
      case 'poorgift': { const ids = activeIds(g).sort((x, y) => netWorth(g, x) - netWorth(g, y)); gain(g, ids[0], a, `${title}: poorest player`); break; }
      case 'richtax': { const ids = activeIds(g).sort((x, y) => netWorth(g, y) - netWorth(g, x)), rich = ids[0], poor = ids[ids.length - 1]; if (rich === poor) break; payBy(g, pid, rich, a, `${title} to ${nameOf(g, poor)}`, poor); if (rich !== pid) log(g, poor, `${title}: received help from ${nameOf(g, rich)}`); break; }
      case 'goto': advanceTo(g, pid, a); break;
      case 'back': walk(g, pid, -a); break;
      case 'nearest': { let i = p.pos; do { i = (i + 1) % BOARD.length; } while (BOARD[i].t !== 'transport'); g.doubleRent = true; advanceTo(g, pid, i); g.doubleRent = false; break; }
      case 'jam': goJam(g, pid, title); break;
      case 'jamcard': p.cards++; log(g, pid, 'Kept a Shortcut Card'); break;
      case 'loan': p.cash += a; p.owe = (p.owe || 0) + b; log(g, pid, `Loan received; repay ${rpShort(b)} at next Payday`, a); break;
      case 'gamble': { if (p.cash < a) fail('Not enough cash.'); p.cash -= a; log(g, pid, title, -a); if (rnd(100) < c) gain(g, pid, b, 'It paid off! Cashed out'); else log(g, pid, 'It flopped. The money is gone.'); break; }
      default: fail('Unknown card effect: ' + op);
    }
  }
}
function optNeed(fx) { let n = 0; for (const f of fx) if (f[0] === 'gamble') n += f[1]; return n; }

// Options for the decision at the front of the queue. Drives both the UI and validation.
function optionsFor(g, pid, it) {
  const p = g.ps[pid], out = [];
  if (it.k === 'buy') {
    const s = BOARD[it.i], price = buyPrice(g, pid, it.i);
    out.push({ l: `Buy ${s.n}`, sub: price !== s.price ? `${rp(price)} (agent discount)` : rp(price), ok: p.cash >= price, run: () => { p.cash -= price; g.props[it.i].o = pid; log(g, pid, `Bought ${s.n}`, -price); } });
    out.push({ l: 'Not now', sub: 'Leave it for someone else', ok: true, def: true, run: () => log(g, pid, `Passed on ${s.n}`) });
    return out;
  }
  if (it.k === 'takeover') {
    const s = BOARD[it.i], pr = g.props[it.i], owner = pr.o;
    const valid = owner && owner !== pid && !g.ps[owner].out && !pr.m && !J(g, owner).protect && mineIn(g, owner, s.g).every(j => g.props[j].h === 0);
    out.push({ kind: 'take', l: `Take over ${s.n}`, sub: valid ? `Pay ${rp(it.price)} to ${nameOf(g, owner)}` : 'No longer available', ok: valid && p.cash >= it.price, run: () => { transfer(g, pid, owner, it.price, `takeover of ${s.n}`); pr.o = pid; log(g, pid, `Took over ${s.n} from ${nameOf(g, owner)}`); } });
    out.push({ l: 'No thanks', sub: 'Keep your cash', ok: true, def: true, run: () => {} });
    return out;
  }
  if (it.k === 'card') {
    const c = CARDS[it.id];
    if (!c.ch) { out.push({ l: 'OK', ok: true, def: true, run: () => runFx(g, pid, c.fx, c.title) }); return out; }
    c.ch.forEach((o, idx) => { const need = optNeed(o.fx); out.push({ l: o.l, sub: need > p.cash ? `Needs ${rp(need)} cash` : fxSummary(o.fx), ok: p.cash >= need, def: idx === c.ch.length - 1, run: () => { log(g, pid, `${c.title}: ${o.l}`); runFx(g, pid, o.fx, c.title); if (o.m) log(g, pid, o.m); } }); });
    return out;
  }
  if (it.k === 'debt') {
    const short = it.amt - p.cash;
    out.push({ kind: 'pay', l: `Pay ${rp(it.amt)}`, sub: short > 0 ? `Short by ${rp(short)}: raise cash below` : 'You have enough now', ok: short <= 0, run: () => { transfer(g, pid, it.to === 'bank' ? null : it.to, it.amt, it.why); if (it.rent) { p.st.rentOut += it.amt; g.ps[it.to].st.rentIn += it.amt; } } });
    for (const i of owned(g, pid)) {
      const s = BOARD[i], pr = g.props[i];
      if (s.t === 'city' && pr.h > 0 && canSellHouse(g, pid, i)) out.push({ kind: 'sell', i, l: `Sell ${pr.h === 5 ? 'tower' : 'a house'} on ${s.n}`, sub: `+${rp(houseCost(i) / 2)}`, ok: true, run: () => { sellHouse(g, pid, i); return 'keep'; } });
      else if (!pr.m && canMortgage(g, pid, i)) out.push({ kind: 'mort', i, l: `Mortgage ${s.n}`, sub: `+${rp(mortValueFor(g, pid, i))}`, ok: true, run: () => { mortgage(g, pid, i); return 'keep'; } });
    }
    out.push({ kind: 'bk', l: 'Declare bankruptcy', sub: it.to !== 'bank' && it.to !== 'fund' ? `Everything goes to ${nameOf(g, it.to)}` : 'Your properties return to the bank', ok: true, bk: true, run: () => bankrupt(g, pid, it.to) });
    return out;
  }
  return out;
}
function fxSummary(fx) {
  const parts = [];
  for (const [op, a, b, c] of fx) {
    if (op === 'pay') parts.push(`−${rpShort(a)}`);
    else if (op === 'cash') parts.push(`+${rpShort(a)}`);
    else if (op === 'gamble') parts.push(`−${rpShort(a)}, ${c}% chance of ${rpShort(b)}`);
    else if (op === 'loan') parts.push(`+${rpShort(a)} now, −${rpShort(b)} at Payday`);
    else if (op === 'goto') parts.push(`go to ${BOARD[a].n}`);
    else if (op === 'back') parts.push(`back ${a} spaces`);
    else if (op === 'jam') parts.push('go to the Traffic Jam');
  }
  return parts.join(' · ');
}

// ---------- property management ----------
// Houses: own at least two cities of the color group; build evenly across the ones you own.
// Apartment tower (5th level): own the whole group. Mortgaged cities can't be built on.
function canBuild(g, pid, i) {
  const s = BOARD[i], pr = g.props[i]; if (s.t !== 'city' || pr.o !== pid || pr.h >= 5 || pr.m) return false;
  const mine = mineIn(g, pid, s.g); if (mine.length < 2 || mine.some(j => g.props[j].m)) return false;
  if (pr.h === 4 && !ownsGroup(g, pid, s.g)) return false;
  return pr.h <= Math.min(...mine.map(j => g.props[j].h));
}
function canSellHouse(g, pid, i) { const s = BOARD[i], pr = g.props[i]; if (s.t !== 'city' || pr.o !== pid || pr.h === 0) return false; return pr.h >= Math.max(...mineIn(g, pid, s.g).map(j => g.props[j].h)); }
function canMortgage(g, pid, i) { const s = BOARD[i], pr = g.props[i]; if (pr.o !== pid || pr.m) return false; return s.t !== 'city' || mineIn(g, pid, s.g).every(j => g.props[j].h === 0); }
function sellHouse(g, pid, i) { const pr = g.props[i], v = houseCost(i) / 2; pr.h--; g.ps[pid].cash += v; log(g, pid, `Sold a building on ${BOARD[i].n}`, v); }
function mortgage(g, pid, i) { const v = mortValueFor(g, pid, i); g.props[i].m = true; g.props[i].mv = v; g.ps[pid].cash += v; log(g, pid, `Mortgaged ${BOARD[i].n}`, v); }
function bankrupt(g, pid, to) {
  const p = g.ps[pid];
  for (const i of owned(g, pid)) { const pr = g.props[i]; if (pr.h) { p.cash += pr.h * houseCost(i) / 2; pr.h = 0; } }
  const props = owned(g, pid), heir = to && g.ps[to] && !g.ps[to].out ? to : null;
  if (heir) { g.ps[heir].cash += p.cash; for (const i of props) g.props[i].o = heir; log(g, pid, `BANKRUPT! Everything goes to ${nameOf(g, heir)}`, -p.cash); }
  else { for (const i of props) g.props[i] = { o: null, h: 0, m: false }; log(g, pid, 'BANKRUPT! Properties return to the bank', -p.cash); }
  p.cash = 0; p.out = true; p.outAt = g.turnNo; p.owe = 0; g.q = []; g.extra = false;
  if (activeIds(g).length <= 1) endGame(g, 'last');
}

// ================= turn flow =================
function assertTurn(g, pid) { if (g.status !== 'playing') fail('The game is not running.'); if (g.order[g.turnIdx] !== pid) fail('It’s not your turn.'); }
function assertManage(g, pid) { assertTurn(g, pid); if (!['roll', 'end'].includes(g.phase) || g.q.length) fail('Finish the current decision first.'); }
function advance(g) {
  g.q = []; g.doubleRent = false;
  if (g.status !== 'playing') return;
  const cur = g.ps[g.order[g.turnIdx]];
  if (g.extra && !cur.out) { g.extra = false; g.phase = 'roll'; g.turnNo++; log(g, g.order[g.turnIdx], 'Doubles! Roll again'); return; }
  g.extra = false;
  for (let guard = 0; guard < 20; guard++) {
    let idx = g.turnIdx + 1;
    if (idx >= g.order.length) { idx = 0; g.round++; if (g.round > g.cfg.rounds) { endGame(g, 'rounds'); return; } }
    g.turnIdx = idx;
    if (g.ps[g.order[idx]].out) continue;
    g.turnNo++; g.phase = 'roll'; g.ps[g.order[idx]].doubles = 0; g.dice = null;
    return;
  }
}
function endGame(g, reason) { g.status = 'ended'; g.phase = null; g.q = []; g.endReason = reason; g.round = Math.min(g.round, g.cfg.rounds); log(g, null, reason === 'last' ? 'Only one player is left standing. Game over!' : 'Final round complete. Counting the fortunes!'); }
function applyJob(g, pid, key) {
  const p = g.ps[pid], j = JOBS[key];
  p.job = key; p.sal = j.sal * JT;
  if (j.start) p.cash += j.start * JT;
  if (j.owe) p.owe += j.owe * JT;
  log(g, pid, `Chose ${j.name} (${rpShort(p.sal)} salary)`);
}
function botJob(g, id) { const offers = g.offers[id]; return offers.map(k => [k, JOBS[k].sal - (JOBS[k].life || 0) + (JOBS[k].perProp ? 3 : 0) + (JOBS[k].tutor ? 4 : 0) + (JOBS[k].build ? 3 : 0) + rnd(5)]).sort((a, b) => b[1] - a[1])[0][0]; }
function maybeBegin(g) {
  if (g.order.some(id => !g.ps[id].job)) return;
  Object.assign(g, { status: 'playing', phase: 'roll', turnIdx: 0, round: 1, turnNo: 1 });
  log(g, null, `Jobs are set. Game on! ${g.cfg.rounds} rounds. ${nameOf(g, g.order[0])} goes first.`);
}

// Games started on the earlier square board (no jobs) can't continue under these rules.
const isLegacy = g => !!g.ps && (g.status === 'playing' || g.status === 'ended') && Object.values(g.ps).some(p => p.job === undefined);
const A = {
  resetLegacy(g, me) {
    if (g.hostId !== me) fail('Only the host can do that.'); if (!isLegacy(g)) fail('This game is up to date.');
    for (const k of ['order', 'ps', 'props', 'offers', 'fund', 'decks', 'turnIdx', 'round', 'turnNo', 'phase', 'q', 'dice', 'move', 'extra', 'doubleRent', 'startedAt', 'endReason', 'rollK', 'actN']) delete g[k];
    g.status = 'lobby'; g.log = []; g.gameId = mkId(); g.players.forEach(p => p.ready = !!p.bot);
  },
  create(g, me, nick, av, code, bots) { Object.assign(g, { code, hostId: me, status: 'lobby', cfg: { rounds: 20 }, players: [{ id: me, nick, av, ready: false }], chat: [], log: [], v: 0, gameId: mkId() }); for (let i = 0; i < Math.min(5, bots || 0); i++) A.addBot(g, me); },
  addBot(g, me) {
    if (g.hostId !== me) fail('Only the host can add bots.'); if (g.status !== 'lobby') fail('Bots can only join in the lobby.');
    if (g.players.length >= 6) fail('The room is full (6 players).');
    const used = new Set(g.players.map(p => p.nick)), free = BOTS.filter(b => !used.has(b[0])), [nick, av] = free[rnd(free.length)];
    g.players.push({ id: 'bot-' + mkId(8), nick, av, ready: true, bot: true });
  },
  join(g, me, nick, av) {
    const ex = g.players.find(p => p.id === me); if (ex) { ex.nick = nick; ex.av = av; return; }
    if (g.status !== 'lobby') fail('This game has already started. Wait for the next one.');
    if (g.players.length >= 6) fail('The room is full (6 players).');
    g.players.push({ id: me, nick, av, ready: false });
  },
  leave(g, me) {
    if (g.status === 'playing' || g.status === 'jobs') fail('The game is running.');
    g.players = g.players.filter(p => p.id !== me);
    const humans = g.players.filter(p => !p.bot);
    if (g.hostId === me) g.hostId = humans[0]?.id || null;
    if (!humans.length) { g.players = []; g.status = 'closed'; }
  },
  ready(g, me, val) { if (g.status !== 'lobby') fail('The game has started.'); const p = g.players.find(p => p.id === me); if (!p) fail('You are not in this room.'); p.ready = !!val; },
  kick(g, me, who) { if (g.hostId !== me) fail('Only the host can do that.'); if (g.status !== 'lobby') fail('Only in the lobby.'); if (who === me) fail('You can’t remove yourself.'); g.players = g.players.filter(p => p.id !== who); },
  rounds(g, me, n) { if (g.hostId !== me) fail('Only the host can do that.'); if (g.status !== 'lobby') fail('Only in the lobby.'); if (![10, 15, 20, 30].includes(n)) fail('Invalid number of rounds.'); g.cfg.rounds = n; },
  chat(g, me, i) { if (!g.players.some(p => p.id === me)) fail('You are not in this room.'); if (!(i >= 0 && i < CHAT_PRESETS.length)) fail('Invalid message.'); g.chat.push({ p: me, i, t: Date.now() }); if (g.chat.length > MAX_CHAT) g.chat.splice(0, g.chat.length - MAX_CHAT); },
  start(g, me) {
    if (g.hostId !== me) fail('Only the host can start.'); if (g.status !== 'lobby') fail('The game has already started.');
    if (g.players.length < 2) fail('You need at least 2 players.'); if (!g.players.every(p => p.ready)) fail('Everyone must be ready.');
    g.order = shuffle(g.players.map(p => p.id)); g.ps = {};
    g.order.forEach((id, k) => { const pl = g.players.find(x => x.id === id); g.ps[id] = { nick: pl.nick, av: pl.av, bot: !!pl.bot, col: k, pos: 0, cash: START_CASH, job: null, sal: 0, jam: 0, cards: 0, doubles: 0, owe: 0, out: false, laps: 0, st: { rentIn: 0, rentOut: 0, jams: 0, builds: 0 } }; });
    g.props = {}; for (const i of BUYABLE) g.props[i] = { o: null, h: 0, m: false };
    // Job draft: 4 offers each when it fits, 3 for bigger tables; spread the pool so offers rarely repeat.
    const per = g.order.length <= 4 ? 4 : 3, keys = Object.keys(JOBS); let pool = shuffle(keys); g.offers = {};
    for (const id of g.order) { const pick = []; while (pick.length < per) { if (!pool.length) pool = shuffle(keys); const k = pool.pop(); if (!pick.includes(k)) pick.push(k); } g.offers[id] = pick; }
    Object.assign(g, { fund: 0, decks: {}, turnIdx: 0, round: 1, turnNo: 0, phase: null, q: [], dice: null, move: null, extra: false, doubleRent: false, status: 'jobs', gameId: mkId(), log: [], startedAt: Date.now(), endReason: null });
    log(g, null, 'Choose your job! Each player picks one of the offers.');
    for (const id of g.order) if (g.ps[id].bot) applyJob(g, id, botJob(g, id));
    maybeBegin(g);
  },
  pickJob(g, me, key) {
    if (g.status !== 'jobs') fail('Jobs are already chosen.'); const p = g.ps?.[me]; if (!p) fail('You are not in this game.');
    if (p.job) fail('You already chose a job.'); if (!g.offers[me].includes(key)) fail('That job wasn’t offered to you.');
    applyJob(g, me, key); maybeBegin(g);
  },
  roll(g, me) {
    assertTurn(g, me); if (g.phase !== 'roll') fail('You already rolled this turn.');
    g.actN = (g.actN || 0) + 1;
    const p = g.ps[me], d = [1 + rnd(6), 1 + rnd(6)], dbl = d[0] === d[1]; g.dice = d; g.q = []; g.rollK = mkId(6);
    log(g, me, `Rolled ${d[0]} + ${d[1]}${dbl ? ' (doubles)' : ''}`);
    if (p.jam > 0) {
      if (dbl) { p.jam = 0; log(g, me, 'Doubles! Escaped the Traffic Jam'); walk(g, me, d[0] + d[1]); }
      else { p.jam--; if (p.jam === 0) { const fee = jamFee(g, me); log(g, me, fee ? 'Out of tries: paying the fee to get out' : 'The ojol shortcut gets you out'); if (fee) charge(g, me, fee, 'Traffic Jam fee', 'fund'); walk(g, me, d[0] + d[1]); } else { log(g, me, `Still stuck (${p.jam} ${p.jam === 1 ? 'try' : 'tries'} left)`); track(g, me); } }
    } else {
      if (dbl) { p.doubles++; if (p.doubles >= 3) { goJam(g, me, 'Three doubles in a row, caught speeding'); g.phase = 'end'; return; } g.extra = true; }
      walk(g, me, d[0] + d[1]);
    }
    if (p.out) return;
    g.phase = g.q.length ? 'act' : 'end';
  },
  jamPay(g, me) { assertManage(g, me); const p = g.ps[me]; if (!p.jam) fail('You are not stuck.'); if (g.phase !== 'roll') fail('Pay before rolling.'); const fee = jamFee(g, me); if (p.cash < fee) fail('Not enough cash.'); if (fee) transfer(g, me, 'fund', fee, 'Traffic Jam fee'); p.jam = 0; },
  jamCard(g, me) { assertManage(g, me); const p = g.ps[me]; if (!p.jam) fail('You are not stuck.'); if (g.phase !== 'roll') fail('Use it before rolling.'); if (!p.cards) fail('You have no Shortcut Card.'); p.cards--; p.jam = 0; log(g, me, 'Used a Shortcut Card to escape the Traffic Jam'); },
  resolve(g, me, idx) {
    assertTurn(g, me); if (g.phase !== 'act' || !g.q.length) fail('There is no decision waiting.');
    const it = g.q[0], o = optionsFor(g, me, it)[idx];
    g.actN = (g.actN || 0) + 1;
    if (!o) fail('Invalid choice.'); if (!o.ok) fail(o.sub || 'That choice isn’t available.');
    g.q.shift(); const keep = o.run(); if (keep === 'keep') g.q.unshift(it);
    if (g.status !== 'playing') return;
    if (g.ps[me].out) { g.phase = 'end'; return; }
    g.phase = g.q.length ? 'act' : 'end';
  },
  end(g, me) { assertTurn(g, me); if (g.phase !== 'end') fail('Finish the decision first.'); advance(g); },
  build(g, me, i) {
    assertManage(g, me); if (!g.props[i]) fail('Invalid property.'); if (!canBuild(g, me, i)) fail('You can’t build there yet. Own two cities of the group (the whole group for a tower) and build evenly.');
    const cost = buildCost(g, me, i); if (g.ps[me].cash < cost) fail('Not enough cash.');
    g.ps[me].cash -= cost; g.props[i].h++; g.ps[me].st.builds++; log(g, me, `Built ${g.props[i].h === 5 ? 'an apartment tower' : `house #${g.props[i].h}`} on ${BOARD[i].n}`, -cost);
  },
  sellHouse(g, me, i) { assertManage(g, me); if (!g.props[i] || !canSellHouse(g, me, i)) fail('You can’t sell a building there. Sell evenly across the group.'); sellHouse(g, me, i); },
  mortgage(g, me, i) { assertManage(g, me); if (!g.props[i] || !canMortgage(g, me, i)) fail('You can’t mortgage that. Sell the group’s buildings first.'); mortgage(g, me, i); },
  unmortgage(g, me, i) { assertManage(g, me); const pr = g.props[i]; if (!pr || pr.o !== me || !pr.m) fail('That property isn’t mortgaged.'); const c = unmortCost(g, me, i); if (g.ps[me].cash < c) fail('Not enough cash.'); g.ps[me].cash -= c; pr.m = false; delete pr.mv; log(g, me, `Paid off the mortgage on ${BOARD[i].n}`, -c); },
  hostSkip(g, me) {
    if (g.hostId !== me) fail('Only the host can do that.');
    if (g.status === 'jobs') { for (const id of g.order) if (!g.ps[id].job) { applyJob(g, id, g.offers[id][0]); log(g, id, 'Job assigned by the host'); } maybeBegin(g); return; }
    if (g.status !== 'playing') fail('The game is not running.');
    const cur = g.order[g.turnIdx];
    if (g.phase === 'roll') { log(g, cur, 'Turn skipped by the host'); advance(g); return; }
    for (let i = 0; i < 60 && g.q.length && g.status === 'playing'; i++) { const it = g.q[0], idx = botChoose(g, cur, true); g.q.shift(); const keep = optionsFor(g, cur, it)[idx].run(); if (keep === 'keep') g.q.unshift(it); }
    if (g.status !== 'playing') return;
    log(g, cur, 'Decisions resolved automatically by the host'); advance(g);
  },
  hostEnd(g, me) { if (g.hostId !== me) fail('Only the host can do that.'); if (g.status !== 'playing') fail('The game is not running.'); endGame(g, 'host'); },
  rematch(g, me) {
    if (g.hostId !== me) fail('Only the host can do that.'); if (g.status !== 'ended') fail('The game hasn’t ended.');
    for (const k of ['order', 'ps', 'props', 'offers', 'fund', 'decks', 'turnIdx', 'round', 'turnNo', 'phase', 'q', 'dice', 'move', 'extra', 'doubleRent', 'startedAt', 'endReason']) delete g[k];
    g.status = 'lobby'; g.log = []; g.gameId = mkId(); g.players.forEach(p => p.ready = !!p.bot);
  },
  botStep(g, me) {
    if (g.status !== 'playing') fail('The game is not running.');
    const caller = g.players.find(p => p.id === me); if (!caller || caller.bot) fail('You are not a player in this room.');
    const cur = g.order[g.turnIdx], p = g.ps[cur]; if (!p.bot) fail('It’s not a bot’s turn.');
    if (g.phase === 'roll') {
      botManage(g, cur);
      if (p.jam) { if (p.cards) A.jamCard(g, cur); else if (p.cash > 60 * JT && g.round < g.cfg.rounds * 0.6 && p.cash >= jamFee(g, cur)) A.jamPay(g, cur); }
      A.roll(g, cur);
    } else if (g.phase === 'act') A.resolve(g, cur, botChoose(g, cur));
    else if (g.phase === 'end') { botManage(g, cur); A.end(g, cur); }
  },
};

// ================= bot brain =================
const RESERVE = 15 * JT;
function botManage(g, id) {
  const p = g.ps[id];
  for (let k = 0; k < 4; k++) { const m = owned(g, id).filter(i => g.props[i].m).sort((a, b) => unmortCost(g, id, a) - unmortCost(g, id, b))[0]; if (m === undefined || p.cash - unmortCost(g, id, m) < RESERVE * 2) break; const c = unmortCost(g, id, m); p.cash -= c; g.props[m].m = false; delete g.props[m].mv; log(g, id, `Paid off the mortgage on ${BOARD[m].n}`, -c); }
  for (let k = 0; k < 15; k++) {
    const cand = owned(g, id).filter(i => canBuild(g, id, i) && p.cash - buildCost(g, id, i) >= RESERVE).sort((a, b) => g.props[a].h - g.props[b].h || houseCost(a) - houseCost(b))[0];
    if (cand === undefined) break;
    const cost = buildCost(g, id, cand); p.cash -= cost; g.props[cand].h++; p.st.builds++; log(g, id, `Built ${g.props[cand].h === 5 ? 'an apartment tower' : `house #${g.props[cand].h}`} on ${BOARD[cand].n}`, -cost);
  }
}
function botChoose(g, id, safe) {
  const it = g.q[0], p = g.ps[id], opts = optionsFor(g, id, it);
  if (it.k === 'buy') {
    const s = BOARD[it.i], price = buyPrice(g, id, it.i), completes = s.g && groupOf(s.g).every(j => j === it.i || g.props[j].o === id);
    const want = !safe && opts[0].ok && (completes || p.cash - price >= RESERVE || (p.cash - price >= 5 * JT && g.round <= 6));
    return want ? 0 : 1;
  }
  if (it.k === 'takeover') {
    if (safe || !opts[0].ok) return 1;
    const s = BOARD[it.i], grp = groupOf(s.g), mine = grp.filter(j => g.props[j].o === id).length;
    const completes = mine === grp.length - 1;
    return (completes && p.cash - it.price >= 5 * JT) || (mine >= 1 && p.cash - it.price >= RESERVE) ? 0 : 1;
  }
  if (it.k === 'debt') {
    if (opts[0].ok) return 0;
    const inSet = i => !!BOARD[i].g && ownsGroup(g, id, BOARD[i].g);
    const morts = opts.map((o, k) => [o, k]).filter(([o]) => o.kind === 'mort').sort(([a], [b]) => (inSet(a.i) ? 1 : 0) - (inSet(b.i) ? 1 : 0) || BOARD[a.i].price - BOARD[b.i].price);
    if (morts.length) return morts[0][1];
    const sell = opts.findIndex(o => o.kind === 'sell'); if (sell >= 0) return sell;
    return opts.findIndex(o => o.kind === 'bk');
  }
  // card choice: try each option on a copy and keep the best outcome
  let best = -1, bestV = -Infinity;
  opts.forEach((o, i) => {
    if (!o.ok) return; let v;
    try { const t = JSON.parse(JSON.stringify(g)); A.resolve(t, id, i); v = netWorth(t, id) + Math.min(t.ps[id].cash, 40 * JT) * 0.3 - (t.ps[id].jam ? 6 * JT : 0) - (t.q.length && t.q[0].k === 'debt' ? 20 * JT : 0) - (t.ps[id].out ? 1e9 : 0); }
    catch (e) { return; }
    if (!safe) v += rnd(2 * JT);
    if (v > bestV) { bestV = v; best = i; }
  });
  if (best < 0) best = Math.max(0, opts.findIndex(o => o.def && o.ok));
  return best;
}

// ================= scoring =================
const TITLES = {
  sultan: ['Property Sultan', 'Biggest fortune on the board.'],
  landlord: ['Rent Collector', 'Collected the most rent.'],
  tenant: ['Everyone’s Favorite Tenant', 'Paid the most rent.'],
  tower: ['Tower Tycoon', 'Built the most houses and towers.'],
  jam: ['Traffic Jam Regular', 'Spent the most time stuck.'],
  broke: ['Broke but Smiling', 'Went bankrupt, kept the vibes.'],
  warga: ['Average Warga +62', 'Salary in, trouble out.'],
};
function computeResults(g) {
  const rows = g.order.map(id => { const p = g.ps[id], props = owned(g, id); return { id, p, nw: p.out ? 0 : netWorth(g, id), cash: p.cash, propsN: props.length, propsV: props.reduce((s, i) => s + propValue(g, i), 0), buildings: props.reduce((s, i) => s + (g.props[i].h || 0), 0) }; });
  rows.sort((a, b) => (a.p.out ? 1 : 0) - (b.p.out ? 1 : 0) || (a.p.out ? (b.p.outAt || 0) - (a.p.outAt || 0) : b.nw - a.nw));
  const taken = new Set(), give = (key, r) => { if (r && !taken.has(r.id)) { r.title = key; taken.add(r.id); } };
  const pick = (f, s) => rows.filter(r => !taken.has(r.id) && f(r)).sort(s)[0];
  give('sultan', rows[0]?.p.out ? null : rows[0]);
  give('broke', pick(r => r.p.out, () => 0));
  give('landlord', pick(r => r.p.st.rentIn > 0, (a, b) => b.p.st.rentIn - a.p.st.rentIn));
  give('tower', pick(r => r.p.st.builds >= 3, (a, b) => b.p.st.builds - a.p.st.builds));
  give('tenant', pick(r => r.p.st.rentOut > 0, (a, b) => b.p.st.rentOut - a.p.st.rentOut));
  give('jam', pick(r => r.p.st.jams >= 2, (a, b) => b.p.st.jams - a.p.st.jams));
  rows.forEach(r => { if (!r.title) r.title = 'warga'; });
  return rows;
}

export {
  A, GameError, BOARD, GROUPS, SPACE_TYPES, CARDS, JOBS, BUYABLE, POS, TITLES, BOTS, CHAT_PRESETS, AVATARS, PCOLORS, JT, START_CASH,
  optionsFor, computeResults, netWorth, rentFor, rentDue, rentTable, baseRent, houseCost, buildCost, buyPrice, takeoverPrice, jamFee,
  canBuild, canSellHouse, canMortgage, unmortCost, mortValueFor, owned, groupOf, ownsGroup, cardMeta, isLegacy, nameOf, avOf,
  rnd, mkId, mkCode, rp, rpShort, botChoose,
};
