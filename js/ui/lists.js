import { el, movieRow } from './dom.js';

const LABELS = { watched: '已看過', notInterested: '沒興趣' };

let root;
let ctx;
let current = 'watched';

export function mount(element, context) {
  root = element;
  ctx = context;
}

export function onShow() {
  render();
}

function render() {
  const items = ctx.storage.getList(current);
  root.replaceChildren(
    el('h1', {}, '清單'),
    el('div', { class: 'segmented' }, Object.entries(LABELS).map(([name, label]) =>
      el('button', {
        class: name === current ? 'active' : '',
        onclick: () => {
          current = name;
          render();
        },
      }, `${label}（${ctx.storage.getList(name).length}）`))),
    items.length
      ? el('ul', { class: 'movie-list' }, items.map((m) => movieRow(m, [{
          label: '移除',
          onClick: () => {
            ctx.storage.removeFromList(current, m.id);
            render();
          },
        }])))
      : el('p', { class: 'empty' }, `「${LABELS[current]}」清單是空的`),
  );
}
