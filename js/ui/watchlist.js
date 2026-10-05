import { el, movieRow } from './dom.js';
import { openDetail } from './detail.js';

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
  const items = ctx.storage.getList('watchlist');
  root.replaceChildren(
    el('h1', {}, '待看'),
    items.length
      ? el('ul', { class: 'movie-list' }, items.map((m) => {
          const actions = [
            { label: '看完了', class: 'primary', onClick: () => finish(m) },
            { label: '移除', onClick: () => remove(m) },
          ];
          return movieRow(m, actions, () => openDetail(ctx, m, actions));
        }))
      : el('p', { class: 'empty' }, '還沒有待看的片，去抽一部吧！'),
  );
}

function finish(movie) {
  ctx.storage.moveToList('watchlist', 'watched', movie.id);
  ctx.toast(`「${movie.title}」已移到已看過`);
  render();
}

function remove(movie) {
  ctx.storage.removeFromList('watchlist', movie.id);
  render();
}
