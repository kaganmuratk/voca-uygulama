// Çekimli sözcük → sözlük başlığı adayları (H5c, Kağan 2026-10-25): "going → go", "ran → run", "stopped → stop", "children → child".
// Sıra önemli: önce düzensiz tablo, sonra kural. Tüketen taraf adaylardan SÖZLÜKTE olan ilkini alır; sözlükte olmayan aday zararsızdır.
// Düzensiz biçimler ortak İngilizce bilgisidir (kök: çekimleri); sözlük verisine dokunmaz.
const DUZENSIZ_FIIL = {
  be: 'am is are was were been being', have: 'has had having', do: 'does did done doing', go: 'goes went gone going',
  say: 'said', make: 'made', take: 'took taken', come: 'came', see: 'saw seen', know: 'knew known', get: 'got gotten',
  give: 'gave given', find: 'found', think: 'thought', tell: 'told', become: 'became', leave: 'left', feel: 'felt',
  bring: 'brought', begin: 'began begun', keep: 'kept', hold: 'held', write: 'wrote written', stand: 'stood',
  hear: 'heard', let: 'lets', mean: 'meant', set: 'sets', meet: 'met', run: 'ran', pay: 'paid', sit: 'sat', speak: 'spoke spoken',
  lie: 'lay lain', lead: 'led', read: 'reads', grow: 'grew grown', lose: 'lost', fall: 'fell fallen', send: 'sent',
  build: 'built', understand: 'understood', draw: 'drew drawn', break: 'broke broken', spend: 'spent', cut: 'cuts',
  rise: 'rose risen', drive: 'drove driven', buy: 'bought', wear: 'wore worn', choose: 'chose chosen', eat: 'ate eaten',
  fly: 'flew flown', forget: 'forgot forgotten', sell: 'sold', win: 'won', throw: 'threw thrown', catch: 'caught',
  teach: 'taught', fight: 'fought', hide: 'hid hidden', shake: 'shook shaken', steal: 'stole stolen', swim: 'swam swum',
  sing: 'sang sung', drink: 'drank drunk', ring: 'rang rung', sink: 'sank sunk', shoot: 'shot', shut: 'shuts',
  sleep: 'slept', sweep: 'swept', swear: 'swore sworn', tear: 'tore torn', wake: 'woke woken', bite: 'bit bitten',
  blow: 'blew blown', bend: 'bent', bet: 'bets', bind: 'bound', bleed: 'bled', breed: 'bred', burn: 'burnt',
  burst: 'bursts', cast: 'casts', cling: 'clung', creep: 'crept', deal: 'dealt', dig: 'dug', dream: 'dreamt',
  feed: 'fed', flee: 'fled', forbid: 'forbade forbidden', forgive: 'forgave forgiven', freeze: 'froze frozen',
  hang: 'hung', hit: 'hits', hurt: 'hurts', kneel: 'knelt', lay: 'laid', lend: 'lent', light: 'lit', mistake: 'mistook mistaken',
  overcome: 'overcame', prove: 'proven', put: 'puts', quit: 'quits', ride: 'rode ridden', seek: 'sought', shine: 'shone',
  shrink: 'shrank shrunk', slide: 'slid', spin: 'spun', split: 'splits', spread: 'spreads', spring: 'sprang sprung',
  stick: 'stuck', sting: 'stung', strike: 'struck stricken', swing: 'swung', undergo: 'underwent undergone', undo: 'undid undone',
  upset: 'upsets', weave: 'wove woven', weep: 'wept', withdraw: 'withdrew withdrawn', wind: 'wound', wring: 'wrung',
};
const DUZENSIZ_ISIM = {
  child: 'children', man: 'men', woman: 'women', person: 'people', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese',
  life: 'lives', wife: 'wives', knife: 'knives', leaf: 'leaves', half: 'halves', wolf: 'wolves', shelf: 'shelves', thief: 'thieves',
  analysis: 'analyses', crisis: 'crises', thesis: 'theses', phenomenon: 'phenomena', criterion: 'criteria', datum: 'data', bacterium: 'bacteria',
};
const DUZENSIZ_SIFAT = { good: 'better best', bad: 'worse worst', far: 'further furthest farther farthest', little: 'less least', much: 'more most', many: 'more most', old: 'elder eldest' };

const TERS = new Map();
for (const tablo of [DUZENSIZ_FIIL, DUZENSIZ_ISIM, DUZENSIZ_SIFAT]) {
  for (const [kok, bicimler] of Object.entries(tablo)) for (const b of bicimler.split(' ')) { if (!TERS.has(b)) TERS.set(b, []); TERS.get(b).push(kok); }
}

const CUC = /[^aeiou][aeiou][^aeiouwxy]$/;   // tek ünsüz+ünlü+ünsüz biten gövde: hop|ing → önce 'hope' (hopping ikizlenir, hoping ikizlenmez)
// Kural dışı aday sırası: önce en olası. (-ing/-ed sonrası ünsüz ikizlenmesi: running → run, stopped → stop.)
export function kokAdaylari(sozcuk) {
  const w = String(sozcuk || '').toLowerCase().replace(/[’']s$/, '').replace(/n[’']t$/, '').replace(/[^a-z-]/g, '');
  if (!w) return [];
  const o = [w];
  const ekle = (x) => { if (x && x.length >= 2 && !o.includes(x)) o.push(x); };
  for (const k of TERS.get(w) || []) ekle(k);
  if (w.endsWith('ies')) { ekle(w.slice(0, -3) + 'y'); }
  if (w.endsWith('ied')) { ekle(w.slice(0, -3) + 'y'); }
  if (w.endsWith('ier')) { ekle(w.slice(0, -3) + 'y'); }
  if (w.endsWith('iest')) { ekle(w.slice(0, -4) + 'y'); }
  if (w.endsWith('ves')) { ekle(w.slice(0, -3) + 'f'); ekle(w.slice(0, -3) + 'fe'); }
  if (w.endsWith('ses')) { ekle(w.slice(0, -2) + 'is'); ekle(w.slice(0, -3) + 'sis'); }
  if (w.endsWith('ing')) { const g = w.slice(0, -3); if (CUC.test(g)) ekle(g + 'e'); ekle(g); ekle(g + 'e'); if (/(.)\1$/.test(g)) ekle(g.slice(0, -1)); if (g.endsWith('y')) ekle(g.slice(0, -1) + 'ie'); }   // lying → lie
  if (w.endsWith('ed')) { const g = w.slice(0, -2); if (CUC.test(g)) ekle(g + 'e'); ekle(g); ekle(g + 'e'); ekle(w.slice(0, -1)); if (/(.)\1$/.test(g)) ekle(g.slice(0, -1)); }
  if (w.endsWith('es')) { ekle(w.slice(0, -2)); ekle(w.slice(0, -1)); }
  if (w.endsWith('s') && !w.endsWith('ss')) ekle(w.slice(0, -1));
  if (w.endsWith('er')) { const g = w.slice(0, -2); ekle(g); ekle(g + 'e'); if (/(.)\1$/.test(g)) ekle(g.slice(0, -1)); }
  if (w.endsWith('est')) { const g = w.slice(0, -3); ekle(g); ekle(g + 'e'); if (/(.)\1$/.test(g)) ekle(g.slice(0, -1)); }
  if (w.endsWith('ly')) { ekle(w.slice(0, -2)); if (w.endsWith('ily')) ekle(w.slice(0, -3) + 'y'); }
  if (w.endsWith('d')) ekle(w.slice(0, -1));
  return o;
}
