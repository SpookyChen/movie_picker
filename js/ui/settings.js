import { el } from './dom.js';
import { createTmdb, describeError } from '../tmdb.js';

let root;
let ctx;

export function mount(element, context) {
  root = element;
  ctx = context;
}

export function onShow() {
  render();
}

function render() {
  root.replaceChildren(
    el('h1', {}, '設定'),
    apiKeySection(),
    presetSection(),
    backupSection(),
    el('p', { class: 'muted' }, 'This product uses the TMDB API but is not endorsed or certified by TMDB.'),
  );
}

function apiKeySection() {
  const input = el('input', {
    type: 'text',
    value: ctx.storage.getApiKey(),
    placeholder: '貼上 TMDB API key',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const status = el('p', { class: 'muted' });
  const saveButton = el('button', {
    class: 'primary',
    onclick: async () => {
      const key = input.value.trim();
      if (!key) {
        status.textContent = '請輸入 API key';
        return;
      }
      saveButton.disabled = true;
      status.textContent = '驗證中…';
      try {
        await createTmdb(key).validateKey();
        ctx.storage.setApiKey(key);
        ctx.toast('API key 已儲存');
        ctx.goTo('pick');
      } catch (err) {
        status.textContent = describeError(err);
      } finally {
        saveButton.disabled = false;
      }
    },
  }, '驗證並儲存');

  return el('section', { class: 'card' },
    el('h2', {}, 'TMDB API key'),
    el('p', { class: 'muted' },
      '到 ',
      el('a', { href: 'https://www.themoviedb.org/settings/api', target: '_blank', rel: 'noopener' }, 'TMDB 的 API 設定頁'),
      ' 註冊並申請（免費），複製「API Key」或「API Read Access Token」貼到下面。key 只會存在這個瀏覽器。'),
    input,
    saveButton,
    status);
}

function presetSection() {
  const presets = ctx.storage.getPresets();
  const body = presets.length
    ? el('ul', { class: 'plain-list' }, presets.map((p) => el('li', { class: 'preset-row' },
        el('span', {}, p.name),
        el('button', {
          onclick: () => {
            const name = prompt('新的名稱', p.name);
            if (name && name.trim()) {
              ctx.storage.renamePreset(p.id, name);
              render();
            }
          },
        }, '改名'),
        el('button', {
          class: 'danger',
          onclick: () => {
            if (confirm(`刪除「${p.name}」？`)) {
              ctx.storage.deletePreset(p.id);
              render();
            }
          },
        }, '刪除'))))
    : el('p', { class: 'muted' }, '還沒有預設組合，可以在抽片頁把條件存起來。');
  return el('section', { class: 'card' }, el('h2', {}, '預設組合'), body);
}

function backupSection() {
  const status = el('p', { class: 'muted' });
  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        ctx.storage.importJson(await file.text());
        ctx.toast('匯入完成');
        render();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        fileInput.value = '';
      }
    },
  });

  return el('section', { class: 'card' },
    el('h2', {}, '備份'),
    el('p', { class: 'muted' }, '清單只存在這個瀏覽器，建議定期匯出備份。匯出檔不含 API key。'),
    el('div', { class: 'button-row' },
      el('button', { onclick: exportBackup }, '匯出 JSON'),
      el('button', { onclick: () => fileInput.click() }, '匯入 JSON')),
    fileInput,
    status);
}

function exportBackup() {
  const blob = new Blob([ctx.storage.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const link = el('a', { href: url, download: `movie-picker-backup-${stamp}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
