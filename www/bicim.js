// Kelimenin çekimli biçimleri: boşluk doldurma ve örnek vurgusu için (issue → issues, issued, issuing).
const DUZENSIZ = { take: ['took', 'taken', 'takes', 'taking'], figure: [], carry: ['carried', 'carries', 'carrying'] };
export function bicimler(w) {
  const k = w.toLowerCase();
  const b = new Set([k, k + 's', k + 'es', k + 'd', k + 'ed', k + 'ing']);
  if (k.endsWith('e')) { b.add(k.slice(0, -1) + 'ing'); b.add(k + 'd'); }
  if (k.endsWith('y')) { b.add(k.slice(0, -1) + 'ies'); b.add(k.slice(0, -1) + 'ied'); }
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(k) && k.length <= 4) { b.add(k + k.at(-1) + 'ed'); b.add(k + k.at(-1) + 'ing'); }
  if (k.endsWith('sis')) b.add(k.slice(0, -3) + 'ses'); // thesis → theses
  for (const x of DUZENSIZ[k] || []) b.add(x);
  return [...b].sort((x, y) => y.length - x.length);
}
export const kacis = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function bicimRegex(kelime) {
  const p = kelime.toLowerCase().split(/\s+/);
  const ilk = '(?:' + bicimler(p[0]).map(kacis).join('|') + ')';
  const kalan = p.slice(1).map(kacis).join('\\s+');
  return new RegExp(`\\b${ilk}${kalan ? '\\s+' + kalan : ''}\\b`, 'i');
}
