import { el } from './dom.js';

export function mount(element) {
  element.replaceChildren(el('p', { class: 'empty' }, '抽片頁將在下一個步驟完成'));
}

export function onShow() {}
