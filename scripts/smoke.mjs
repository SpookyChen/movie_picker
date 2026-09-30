// 用真實 TMDB API 驗證整條抽片流程：TMDB_KEY=你的key npm run smoke
import { createTmdb } from '../js/tmdb.js';
import { createPicker } from '../js/picker.js';
import { DEFAULT_FILTERS, PROVIDERS } from '../js/filters.js';

const key = process.env.TMDB_KEY;
if (!key) {
  console.error('請設定環境變數 TMDB_KEY');
  process.exit(1);
}

const tmdb = createTmdb(key);
await tmdb.validateKey();
console.log('API key 驗證成功');

const genres = await tmdb.genres();
console.log(`類型 ${genres.length} 種：${genres.slice(0, 5).map((g) => g.name).join('、')}…`);

const picker = createPicker({ discover: tmdb.discover, isExcluded: () => false });
const cases = [
  ['Netflix + Disney+', DEFAULT_FILTERS],
  ['只有 Disney+、2010 年後', { ...DEFAULT_FILTERS, providers: [337], yearFrom: 2010 }],
  ['Netflix、日語、評分 7 以上', { ...DEFAULT_FILTERS, providers: [8], language: 'ja', minRating: 7 }],
  ['Apple TV（租/買）、2020 年後', { ...DEFAULT_FILTERS, providers: [2], yearFrom: 2020 }],
];
for (const [label, filters] of cases) {
  const result = await picker.pick(filters);
  if (result.status !== 'ok') {
    console.log(`${label}：${result.status}`);
    continue;
  }
  const details = await tmdb.movie(result.movie.id);
  const names = PROVIDERS.filter((p) => details.providers.includes(p.id)).map((p) => p.name).join('、') || '（無台灣上架資料）';
  console.log(`${label}：${result.movie.title}（${result.movie.year ?? '?'}）${details.runtime ?? '?'} 分鐘，${names}`);
}

const [person] = await tmdb.searchPerson('Tom Hanks');
console.log(`搜尋 Tom Hanks：${person?.name}（id ${person?.id}）`);
