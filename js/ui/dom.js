import { posterUrl } from '../tmdb.js';

// 建立 DOM 元素；文字一律以 text node 加入，不使用 innerHTML
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  node.append(
    ...children
      .flat(Infinity)
      .filter((c) => c != null && c !== false)
      .map((c) => (c instanceof Node ? c : String(c))),
  );
  // 子元素先加入，select 的 value 才設得上去
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value' || typeof value === 'boolean') node[key] = value;
    else node.setAttribute(key, value);
  }
  return node;
}

export function poster(path, size = 'w500', cls = 'poster') {
  const url = posterUrl(path, size);
  return url
    ? el('img', { class: cls, src: url, alt: '', loading: 'lazy' })
    : el('div', { class: `${cls} poster-empty` }, '🎬');
}

export function movieRow(movie, actions) {
  return el('li', { class: 'movie-row' },
    poster(movie.poster, 'w185', 'thumb'),
    el('div', { class: 'movie-row-info' },
      el('div', { class: 'movie-row-title' }, movie.title),
      el('div', { class: 'muted' }, movie.year ?? '年份不明')),
    el('div', { class: 'movie-row-actions' },
      actions.map((a) => el('button', { class: a.class ?? '', onclick: a.onClick }, a.label))));
}
