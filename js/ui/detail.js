import { el, poster, metaText } from './dom.js';
import { PROVIDERS } from '../filters.js';

// 從畫面下方滑出電影資訊卡；先顯示已有的資料，再向 TMDB 補上詳細資訊
// actions: Array<{label, onClick, class?, disabled?}>，點按後會關閉資訊卡
// options.tag：標在片名下方的小標籤（例如「已看過」）
export function openDetail(ctx, movie, actions, options = {}) {
  const title = el('h2', {}, movie.title);
  const tag = options.tag ? el('span', { class: 'chip list-tag' }, options.tag) : null;
  const original = el('p', { class: 'muted' });
  const meta = el('p', { class: 'muted' }, metaText(movie));
  const platforms = el('div', { class: 'chips' });
  const overview = el('p', { class: 'overview muted' }, '載入中…');

  let posterEl = poster(movie.poster);
  const sheet = el('article', { class: 'card movie-card sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': movie.title },
    posterEl,
    title,
    tag,
    original,
    meta,
    platforms,
    overview,
    el('div', { class: 'actions' },
      actions.map((a) => el('button', { class: a.class ?? '', disabled: a.disabled, onclick: () => { close(); a.onClick(); } }, a.label)),
      el('button', { onclick: close }, '關閉')));
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, sheet);

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  }

  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  loadDetails();

  async function loadDetails() {
    try {
      const details = await ctx.tmdb().movie(movie.id);
      if (!movie.poster && details.poster) {
        const fresh = poster(details.poster);
        posterEl.replaceWith(fresh);
        posterEl = fresh;
      }
      title.textContent = details.title;
      original.textContent = details.originalTitle !== details.title ? details.originalTitle : '';
      meta.textContent = metaText(details, details.runtime);
      platforms.replaceChildren(...PROVIDERS
        .filter((p) => details.providers.includes(p.id))
        .map((p) => el('span', { class: 'chip' }, p.name)));
      overview.textContent = details.overview || '（沒有中文簡介）';
      overview.classList.remove('muted');
    } catch {
      overview.textContent = '無法載入詳細資訊';
    }
  }
}
