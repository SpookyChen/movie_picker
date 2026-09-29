import { el, movieRow } from './dom.js';

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
      ? el('ul', { class: 'movie-list' }, items.map((m) => movieRow(m, [
          {
            label: '看完了',
            class: 'primary',
            onClick: () => {
              ctx.storage.moveToList('watchlist', 'watched', m.id);
              ctx.toast(`「${m.title}」已移到已看過`);
              render();
            },
          },
          {
            label: '移除',
            onClick: () => {
              ctx.storage.removeFromList('watchlist', m.id);
              render();
            },
          },
        ])))
      : el('p', { class: 'empty' }, '還沒有待看的片，去抽一部吧！'),
  );
}
