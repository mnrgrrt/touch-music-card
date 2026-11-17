// Builds touch-music-card.js (the file HACS installs) from src/ and translations/.
//
//   node build.mjs           write touch-music-card.js
//   node build.mjs --check   only check: fail if a translation file is broken
//                            or the committed touch-music-card.js is out of date
//
// No dependencies, plain Node 18+. A GitHub Action runs this on every push to
// main, so contributors only need to add or edit a file in translations/.
import fs from 'fs';

const SRC = 'src/touch-music-card.js';
const OUT = 'touch-music-card.js';
const DIR = 'translations';
const check = process.argv.includes('--check');

// English is the base. Any string a language does not have yet falls back to it.
const merge = (base, over) => {
  const r = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    r[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v;
  }
  return r;
};
const missing = (base, over, pad = '') => Object.entries(base).flatMap(([k, v]) => (
  v && typeof v === 'object'
    ? missing(v, (over || {})[k], `${pad}${k}.`)
    : ((over || {})[k] == null ? [pad + k] : [])));

let fout = false;
const lees = (f) => {
  try { return JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); } catch (e) {
    console.error(`::error file=${DIR}/${f}::${e.message}`); fout = true; return null;
  }
};

const en = lees('en.json');
if (!en) process.exit(1);
const talen = { en };
const codes = fs.readdirSync(DIR).filter((f) => /^[a-z]{2}\.json$/.test(f) && f !== 'en.json').sort();
for (const f of codes) {
  const t = lees(f);
  if (!t) continue;
  const code = f.slice(0, 2);
  const mis = missing(en, t);
  if (mis.length) console.log(`::warning file=${DIR}/${f}::${code}: ${mis.length} string(s) still in English: ${mis.join(', ')}`);
  talen[code] = merge(en, t);
}
if (fout) process.exit(1);

const src = fs.readFileSync(SRC, 'utf8');
if (!src.includes('__TRANSLATIONS__')) { console.error(`${SRC} has no __TRANSLATIONS__ placeholder`); process.exit(1); }
const kop = '// GENERATED FILE - do not edit. Edit src/touch-music-card.js and translations/*.json,\n'
  + '// then run `node build.mjs` (a GitHub Action does this on every push to main).\n\n';
const uit = kop + src.replace('__TRANSLATIONS__', JSON.stringify(talen, null, 2));

if (check) {
  const nu = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (nu !== uit) { console.log(`::warning::${OUT} is not up to date; the Action rebuilds it after merge.`); }
  console.log(`OK: ${Object.keys(talen).join(', ')}`);
} else {
  fs.writeFileSync(OUT, uit);
  console.log(`Wrote ${OUT} with ${Object.keys(talen).join(', ')}`);
}
