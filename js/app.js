import { createStorage } from './storage.js';
import { createTmdb } from './tmdb.js';
import * as pickTab from './ui/pick.js';
import * as watchlistTab from './ui/watchlist.js';
import * as listsTab from './ui/lists.js';
import * as settingsTab from './ui/settings.js';

// 私密瀏覽等情況下存取 localStorage 可能直接丟錯
function localStorageOrNull() {
  try {
    const store = window.localStorage;
    store.getItem('__probe__');
    return store;
  } catch {
    return null;
  }
}

const storage = createStorage(localStorageOrNull());
const tabs = { pick: pickTab, watchlist: watchlistTab, lists: listsTab, settings: settingsTab };
let tmdb = null;
let tmdbKey = null;
let toastTimer;

const ctx = {
  storage,

  tmdb() {
    const key = storage.getApiKey();
    if (!key) return null;
    if (key !== tmdbKey) {
      tmdb = createTmdb(key);
      tmdbKey = key;
    }
    return tmdb;
  },

  toast(message) {
    const box = document.getElementById('toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2000);
  },

  goTo(name) {
    for (const tab of Object.keys(tabs)) {
      document.getElementById(`tab-${tab}`).hidden = tab !== name;
    }
    for (const button of document.querySelectorAll('.tabbar button')) {
      button.classList.toggle('active', button.dataset.tab === name);
    }
    tabs[name].onShow();
    window.scrollTo(0, 0);
  },
};

for (const [name, tab] of Object.entries(tabs)) {
  tab.mount(document.getElementById(`tab-${name}`), ctx);
}
for (const button of document.querySelectorAll('.tabbar button')) {
  button.addEventListener('click', () => ctx.goTo(button.dataset.tab));
}
ctx.goTo(storage.getApiKey() ? 'pick' : 'settings');
