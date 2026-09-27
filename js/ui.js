/* ============================================================================
 *  ui.js — DOM 工具与通用组件
 *  toast / modal / drawer / confirm / 表格 / 分页 / 表单渲染 / 封面生成 / 徽章
 * ==========================================================================*/

import { store, lookupName, fmt } from './store.js';
import { esc, mdToHtml } from './markdown.js';

/* ------------------------------------------------------------------ DOM */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const frag = (html) => {
  const t = document.createElement('template');
  t.innerHTML = String(html || '').trim();
  return t.content;
};

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** 全局点击外部关闭：给 .dd 菜单用 */
document.addEventListener('click', (e) => {
  $$('.dd-menu').forEach((m) => {
    const host = m.closest('.dd');
    if (host && !host.contains(e.target)) m.remove();
  });
});

/* ------------------------------------------------------------------ toast */

function toastHost() {
  let host = $('.toasts');
  if (!host) {
    host = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  return host;
}

export function toast(message, type = 'info', ms = 3200) {
  const icons = { ok: '✓', err: '✕', warn: '!', info: 'i' };
  const node = el('div', { class: `toast ${type}` }, [
    el('span', { class: 'ti', text: icons[type] || 'i' }),
    el('div', { class: 'grow', text: message })
  ]);
  toastHost().append(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  }, ms);
  return node;
}

export const toastOk = (m) => toast(m, 'ok');
export const toastErr = (m) => toast(m, 'err', 4600);
export const toastWarn = (m) => toast(m, 'warn', 4000);

/* --------------------------------------------------------- modal / drawer */

/* 层叠栈：后打开的浮层必须盖在先生打开的上层。
 * 之前 .modal-mask / .drawer-mask 都写死 z-index:900，而 .drawer 是 901、
 * 并且抽屉的 mask 与 box 是 body 的两个兄弟节点 —— 于是「在抽屉/弹窗里点
 * 『素材库』」时，新弹窗的 mask 停在 900，被抽屉的 901 盖住，选不中图片。
 * 这里改成按打开顺序动态发号：每层 +10，抽屉再比自己的遮罩高 1。 */
const LAYERS = [];
const Z_BASE = 900;
const Z_STEP = 10;

function restack() {
  LAYERS.forEach((l, i) => {
    l.mask.style.zIndex = String(Z_BASE + i * Z_STEP);
    if (l.box) l.box.style.zIndex = String(Z_BASE + i * Z_STEP + 1);
  });
}

function pushLayer(record) {
  LAYERS.push(record);
  restack();
  return () => {
    const i = LAYERS.indexOf(record);
    if (i >= 0) LAYERS.splice(i, 1);
    restack();
  };
}

/* 多个浮层同时开着时，关掉最上面那层不能把底下的滚动锁一起解开 */
let scrollLocks = 0;
function lockScroll(on) {
  scrollLocks = Math.max(0, scrollLocks + (on ? 1 : -1));
  document.body.style.overflow = scrollLocks ? 'hidden' : '';
}

export function modal({ title, body, footer, size = '', onClose, closeOnMask = true }) {
  const mask = el('div', { class: 'modal-mask' });
  const box = el('div', { class: `modal ${size}`.trim(), role: 'dialog', 'aria-modal': 'true' });
  const hd = el('div', { class: 'modal-hd' }, [
    el('h3', { text: title || '' }),
    el('button', { class: 'modal-close', type: 'button', 'aria-label': '关闭', html: '&times;' })
  ]);
  const bd = el('div', { class: 'modal-bd' });
  if (body instanceof Node) bd.append(body);
  else bd.innerHTML = String(body || '');

  box.append(hd, bd);
  if (footer) {
    const ft = el('div', { class: 'modal-ft' });
    if (footer instanceof Node) ft.append(footer);
    else ft.innerHTML = String(footer);
    box.append(ft);
  }
  mask.append(box);

  const dropLayer = pushLayer({ mask });

  const close = () => {
    mask.remove();
    dropLayer();
    lockScroll(false);
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  hd.querySelector('.modal-close').addEventListener('click', close);
  if (closeOnMask) mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
  document.addEventListener('keydown', onKey);

  document.body.append(mask);
  lockScroll(true);
  setTimeout(() => {
    const first = box.querySelector('input:not([type=hidden]), select, textarea, button.btn-primary');
    if (first) first.focus();
  }, 40);

  return { root: box, body: bd, close };
}

export function confirmDialog(message, { title = '请确认', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const { root, close } = modal({
      title,
      size: 'narrow',
      body: `<p style="margin:0;color:var(--ink-2)">${esc(message)}</p>`,
      footer: ''
    });
    const ft = el('div', { class: 'modal-ft' });
    const cancel = el('button', { class: 'btn', type: 'button', text: cancelText });
    const okBtn = el('button', { class: `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`, type: 'button', text: okText });
    cancel.addEventListener('click', () => { close(); resolve(false); });
    okBtn.addEventListener('click', () => { close(); resolve(true); });
    ft.append(cancel, okBtn);
    root.append(ft);
    setTimeout(() => okBtn.focus(), 40);
  });
}

export function promptDialog(message, { title = '请输入', value = '', placeholder = '', okText = '确定' } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', value, placeholder });
    const { root, close } = modal({
      title, size: 'narrow',
      body: el('div', { class: 'field' }, [el('label', { text: message }), input]),
      footer: ''
    });
    const ft = el('div', { class: 'modal-ft' });
    const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
    const okBtn = el('button', { class: 'btn btn-primary', type: 'button', text: okText });
    cancel.addEventListener('click', () => { close(); resolve(null); });
    okBtn.addEventListener('click', () => { close(); resolve(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { close(); resolve(input.value); } });
    ft.append(cancel, okBtn);
    root.append(ft);
    setTimeout(() => input.focus(), 40);
  });
}

/* ------------------------------------------------------------ 素材库选择器 */

/**
 * 从已上传的素材库中挑图片。
 * 返回选中的 URL（multiple 时返回数组），取消返回 null。
 */
export async function pickMedia({ multiple = false, title = '选择图片' } = {}) {
  let rows = store.lookups.uploads || [];
  if (!store.lookupsLoaded || !rows.length) {
    try {
      const { api } = await import('./api.js');
      const r = await api.get('/meta/lookups');
      store.lookups = r.data || {};
      store.lookupsLoaded = true;
      rows = store.lookups.uploads || [];
    } catch { /* 用已有缓存 */ }
  }
  rows = rows.filter((u) => u && u.url && !/\.(pdf|docx?|pptx?|xlsx?|zip)$/i.test(u.url));

  return new Promise((resolve) => {
    const picked = new Set();
    const grid = el('div', { class: 'media-grid' });
    const search = el('input', { class: 'input', type: 'search', placeholder: '按文件名筛选…' });
    const status = el('div', { class: 'small muted' });

    const paint = (kw = '') => {
      grid.innerHTML = '';
      const list = rows.filter((u) => !kw || String(u.original_name || '').toLowerCase().includes(kw.toLowerCase()) || String(u.url).toLowerCase().includes(kw.toLowerCase()));
      if (!list.length) {
        grid.append(el('div', { class: 'muted small', style: { padding: '18px' }, text: rows.length ? '没有匹配的图片' : '素材库还是空的，先用「上传图片」传几张吧' }));
      }
      for (const u of list) {
        const card = el('button', { class: `media-item ${picked.has(u.url) ? 'on' : ''}`, type: 'button', title: u.original_name || u.url });
        card.innerHTML = `<img src="${esc(u.url)}" alt="" loading="lazy"><span>${esc(u.original_name || u.url)}</span>`;
        card.addEventListener('click', () => {
          if (multiple) {
            if (picked.has(u.url)) picked.delete(u.url); else picked.add(u.url);
            card.classList.toggle('on', picked.has(u.url));
          } else {
            picked.clear(); picked.add(u.url);
            $$('.media-item', grid).forEach((n) => n.classList.remove('on'));
            card.classList.add('on');
          }
          status.textContent = picked.size ? `已选 ${picked.size} 张` : '';
        });
        card.addEventListener('dblclick', () => { picked.clear(); picked.add(u.url); close(); resolve(multiple ? [...picked] : u.url); });
        grid.append(card);
      }
    };
    paint();
    search.addEventListener('input', () => paint(search.value));

    const { root, close } = modal({
      title, size: 'wide',
      body: el('div', { class: 'col', style: { gap: '10px' } }, [
        el('div', { class: 'row' }, [search, el('span', { class: 'small muted', style: { flex: 'none', whiteSpace: 'nowrap' }, text: `${rows.length} 张素材` })]),
        grid, status
      ]),
      footer: ''
    });
    const ft = el('div', { class: 'modal-ft' });
    const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
    const okBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '确定' });
    cancel.addEventListener('click', () => { close(); resolve(null); });
    okBtn.addEventListener('click', () => {
      if (!picked.size) { toastWarn('还没有选图片'); return; }
      const out = multiple ? [...picked] : [...picked][0];
      close(); resolve(out);
    });
    ft.append(cancel, okBtn);
    root.append(ft);
  });
}

export function drawer({ title, body, footer, size = '', onClose }) {
  const mask = el('div', { class: 'drawer-mask' });
  const box = el('div', { class: `drawer ${size}`.trim(), role: 'dialog', 'aria-modal': 'true' });
  const hd = el('div', { class: 'drawer-hd' }, [
    el('h3', { style: { fontSize: 'var(--fs-lg)' }, text: title || '' }),
    el('button', { class: 'modal-close', type: 'button', 'aria-label': '关闭', html: '&times;' })
  ]);
  const bd = el('div', { class: 'drawer-bd' });
  if (body instanceof Node) bd.append(body);
  else bd.innerHTML = String(body || '');
  box.append(hd, bd);
  if (footer) {
    const ft = el('div', { class: 'drawer-ft' });
    if (footer instanceof Node) ft.append(footer);
    else ft.innerHTML = String(footer);
    box.append(ft);
  }
  mask.append(box);

  const dropLayer = pushLayer({ mask, box });

  const close = () => {
    mask.remove(); box.remove();
    dropLayer();
    lockScroll(false);
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-mask')) close(); };
  hd.querySelector('.modal-close').addEventListener('click', close);
  mask.addEventListener('mousedown', close);
  document.addEventListener('keydown', onKey);
  document.body.append(mask, box);
  lockScroll(true);
  return { root: box, body: bd, close };
}

/* ------------------------------------------------------------------ 封面 */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 克制的深色双色调色板：低饱和、有层次，用于生成抽象封面 */
const ART_PALETTES = [
  ['#0d1119', '#1d2739', '#3b4c6b'], // 石墨蓝
  ['#101309', '#232a1c', '#3f4d31'], // 苔原
  ['#130e14', '#2a1f28', '#4b3541'], // 绛紫
  ['#0b1418', '#192b32', '#2f4f58'], // 钢青
  ['#150f07', '#2d2314', '#4f3d21'], // 陶土
  ['#0c1020', '#1c2442', '#39426f'], // 靛蓝
  ['#120e18', '#282030', '#463a55'], // 藕荷
  ['#0a130f', '#182b22', '#2f4c3d']  // 松绿
];

/**
 * 抽象封面：底色渐变 + 极细线稿 + 柔光 + 暗角 + 颗粒
 * 不含任何文字与巨大字形，用作图集 / 卡片 / 首屏底图
 */
export function cover(title, seedExtra = '', ratio = '16/10') {
  const seed = hash(String(title || '?') + String(seedExtra));
  const pal = ART_PALETTES[seed % ART_PALETTES.length];
  const [rw, rh] = ratio.split('/').map(Number);
  const W = 1200;
  const H = Math.max(140, Math.round(W * ((rh || 10) / (rw || 16))));
  const variant = (seed >> 5) % 4;
  const angle = 16 + (seed % 44);

  let art = '';
  if (variant === 0) {
    // 同心弧
    const cx = W * (0.16 + ((seed >> 7) % 44) / 100);
    const cy = H * (0.80 - ((seed >> 9) % 32) / 100);
    for (let i = 1; i <= 11; i++) {
      art += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(H * 0.14 * i).toFixed(1)}"
        fill="none" stroke="rgba(255,255,255,${(0.20 - i * 0.013).toFixed(3)})" stroke-width="1.2"/>`;
    }
  } else if (variant === 1) {
    // 斜向细线
    const gap = 13 + (seed % 14);
    for (let x = -H; x < W + H; x += gap) {
      art += `<line x1="${x}" y1="0" x2="${x + H}" y2="${H}" stroke="rgba(255,255,255,0.11)" stroke-width="1.1"/>`;
    }
  } else if (variant === 2) {
    // 交错圆环 + 地平线
    const n = 3 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const cx = W * (0.22 + i * 0.24);
      const cy = H * (0.32 + ((seed >> (i + 3)) % 36) / 100);
      const r = H * (0.32 + ((seed >> (i + 6)) % 22) / 100);
      art += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"
        fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.2"/>`;
    }
    art += `<line x1="0" y1="${(H * 0.74).toFixed(1)}" x2="${W}" y2="${(H * 0.74).toFixed(1)}" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>`;
  } else {
    // 细网格 + 斜切高光
    for (let x = 0; x <= W; x += 30) art += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(255,255,255,0.075)" stroke-width="1"/>`;
    for (let y = 0; y <= H; y += 30) art += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,255,255,0.075)" stroke-width="1"/>`;
    art += `<path d="M0,${H} L${W * 0.40},0 L${W * 0.70},0 L0,${H} Z" fill="rgba(255,255,255,0.055)"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" gradientTransform="rotate(${angle} 0.5 0.5)">
    <stop offset="0" stop-color="${pal[0]}"/>
    <stop offset="0.52" stop-color="${pal[1]}"/>
    <stop offset="1" stop-color="${pal[2]}"/>
  </linearGradient>
  <radialGradient id="glow" cx="${18 + (seed % 52)}%" cy="${8 + (seed % 32)}%" r="78%">
    <stop offset="0" stop-color="rgba(255,255,255,0.26)"/>
    <stop offset="0.55" stop-color="rgba(255,255,255,0.06)"/>
    <stop offset="1" stop-color="rgba(255,255,255,0)"/>
  </radialGradient>
  <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.45" stop-color="rgba(0,0,0,0)"/>
    <stop offset="1" stop-color="rgba(0,0,0,0.42)"/>
  </linearGradient>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${art}
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.11"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 头像：图片或首字 */
export function avatarHtml(name, url, cls = '') {
  const ch = esc(String(name || '?').trim().slice(0, 1) || '?');
  if (url) return `<span class="avatar ${cls}"><img src="${esc(url)}" alt="${esc(name || '')}" loading="lazy"></span>`;
  return `<span class="avatar ${cls}" aria-hidden="true">${ch}</span>`;
}

/* ------------------------------------------------------------------ 徽章 */

const BADGE_MAP = {
  // 状态类
  published: ['badge-ok', '已发布'], draft: ['badge', '草稿'], archived: ['badge', '已归档'],
  pending: ['badge-warn', '待处理'], approved: ['badge-ok', '已通过'], rejected: ['badge-danger', '未通过'],
  cancelled: ['badge', '已取消'], active: ['badge-ok', '正常'], disabled: ['badge-danger', '已停用'],
  open: ['badge-ok', '进行中'], ongoing: ['badge-info', '进行中'], finished: ['badge', '已结束'],
  attended: ['badge-ok', '已参与'], withdrawn: ['badge', '已退课'],
  scheduled: ['badge-info', '待上课'], rescheduled: ['badge-warn', '已调课'],
  present: ['badge-ok', '到课'], late: ['badge-warn', '迟到'], absent: ['badge-danger', '缺席'], leave: ['badge-info', '请假'],
  planned: ['badge-info', '待开始'], done: ['badge-ok', '已完成'],
  todo: ['badge', '待办'], doing: ['badge-info', '进行中'], review: ['badge-warn', '待审核'],
  low: ['badge', '低'], normal: ['badge', '普通'], high: ['badge-warn', '高'], urgent: ['badge-danger', '紧急'],
  available: ['badge-ok', '在库'], borrowed: ['badge-warn', '已借出'], maintenance: ['badge-info', '维修中'], scrapped: ['badge', '已报废'],
  returned: ['badge-ok', '已归还'], new: ['badge-warn', '待处理'], replied: ['badge-ok', '已回复'], closed: ['badge', '已关闭'],
  income: ['badge-ok', '收入'], expense: ['badge-danger', '支出'],
  normal_lv: ['badge', '普通'], important: ['badge-warn', '重要'],
  public: ['badge-ok', '公开'], member: ['badge-info', '社员可见'], leader: ['badge-warn', '管理层'],
  admin: ['badge-danger', '仅管理员'],
  superadmin: ['badge-danger', '超级管理员'], member_role: ['badge', '社员'],
  single: ['badge', '单选'], multi: ['badge-info', '多选'],
  swapped: ['badge-warn', '已换班'], // 值班
  internal: ['badge', '内部'], // 备用
};

const VALUE_LABELS = {
  all: '全体社员', role: '按角色', department: '按部门', users: '指定成员',
  income: '收入', expense: '支出',
  low: '低', normal: '普通', high: '高', urgent: '紧急',
  // 宣传图栏排版
  wide: '横向长条', tall: '竖向长图', large: '大图', offset: '下移错位', 'offset-up': '上移错位',
};

export function badge(value, labelOverride) {
  if (value === null || value === undefined || value === '') return '<span class="muted">—</span>';
  const key = String(value);
  const m = BADGE_MAP[key];
  const cls = m ? m[0] : 'badge';
  let label = labelOverride || (m ? m[1] : null) || VALUE_LABELS[key] || key;
  if (key === 'admin') label = labelOverride || '管理员';
  if (key === 'member' && !labelOverride) label = '社员可见';
  if (key === 'normal' && !labelOverride) label = '普通';
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

export function yesNo(v) {
  return Number(v) ? '<span class="badge badge-ok">是</span>' : '<span class="muted">—</span>';
}

/* ------------------------------------------------------------------ 空态 */

export function emptyHtml(title = '暂无数据', desc = '', icon = '🗂') {
  return `<div class="empty"><div class="icon">${icon}</div>
    <div class="title">${esc(title)}</div>
    ${desc ? `<div class="small">${esc(desc)}</div>` : ''}</div>`;
}

export function skeletonHtml(lines = 5) {
  let h = '<div style="padding:var(--sp-4)">';
  for (let i = 0; i < lines; i++) {
    h += `<div class="skeleton sk-line ${['w80', 'w60', 'w40'][i % 3]}"></div>`;
  }
  return h + '</div>';
}

export function loadingHtml(text = '加载中…') {
  return `<div class="loading-mask"><div class="row"><span class="spinner"></span><span class="muted">${esc(text)}</span></div></div>`;
}

/* ------------------------------------------------------------------ 值渲染 */

/** 依据字段类型渲染只读单元格 */
export function cellValue(field, value, row) {
  if (!field) return esc(value ?? '');
  switch (field.type) {
    case 'bool': return yesNo(value);
    case 'datetime': return value ? `<span class="nowrap small">${fmt.dt(value)}</span>` : '<span class="muted">—</span>';
    case 'date': return value ? `<span class="nowrap">${fmt.date(value)}</span>` : '<span class="muted">—</span>';
    case 'money': return `<span class="mono">¥${fmt.money(value)}</span>`;
    case 'number': return `<span class="mono">${fmt.num(value)}</span>`;
    case 'ref': return value ? esc(lookupName(field.ref, value)) : '<span class="muted">—</span>';
    case 'image': return value ? `<img src="${esc(value)}" alt="" style="width:52px;height:38px;object-fit:cover;border-radius:6px">` : '<span class="muted">—</span>';
    case 'select': return badge(value);
    case 'tags': {
      let arr = [];
      try { arr = JSON.parse(value || '[]'); } catch { arr = []; }
      if (!arr.length) return '<span class="muted">—</span>';
      return arr.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');
    }
    case 'textarea':
    case 'richtext': {
      const t = String(value || '');
      return `<span class="clamp2" style="max-width:340px;display:inline-block">${esc(t.slice(0, 160))}</span>`;
    }
    default: {
      const t = String(value ?? '');
      if (!t) return '<span class="muted">—</span>';
      return `<span class="clamp" style="max-width:280px;display:inline-block;vertical-align:bottom" title="${esc(t)}">${esc(t)}</span>`;
    }
  }
}

/* ------------------------------------------------------------------ 表格 */

/**
 * 渲染一个数据表格
 * @param {object} opt {columns:[{key,label,render,width,align}], rows, selectable, onRow, actions}
 */
export function renderTable(opt) {
  const { columns, rows, selectable = false, onRow, actions, empty = '暂无数据', emptyDesc = '', compact = false } = opt;
  const wrap = el('div', { class: 'table-wrap' });

  if (!rows || !rows.length) {
    wrap.innerHTML = emptyHtml(empty, emptyDesc);
    return wrap;
  }

  const table = el('table', { class: `tbl ${compact ? 'compact' : ''}`.trim() });
  const thead = el('thead');
  const tr = el('tr');
  if (selectable) tr.append(el('th', { class: 'col-check' }, [el('input', { type: 'checkbox', class: 'sel-all', 'aria-label': '全选' })]));
  for (const c of columns) {
    tr.append(el('th', { style: c.width ? { width: typeof c.width === 'number' ? `${c.width}px` : c.width } : {}, text: c.label }));
  }
  if (actions) tr.append(el('th', { style: { textAlign: 'right' }, text: '操作' }));
  thead.append(tr);
  table.append(thead);

  const tbody = el('tbody');
  rows.forEach((row, idx) => {
    const r = el('tr');
    r.dataset.id = row.id;
    if (selectable) {
      const td = el('td', { class: 'col-check' });
      td.append(el('input', { type: 'checkbox', class: 'sel-row', value: String(row.id), 'aria-label': '选择该行' }));
      r.append(td);
    }
    for (const c of columns) {
      const td = el('td');
      if (c.align === 'right') td.classList.add('num');
      const v = c.render ? c.render(row[c.key], row, idx) : cellValue(c.field, row[c.key], row);
      if (v instanceof Node) td.append(v); else td.innerHTML = v;
      r.append(td);
    }
    if (actions) {
      const td = el('td', { class: 'actions' });
      const frag_ = actions(row);
      if (frag_ instanceof Node) td.append(frag_);
      else td.innerHTML = frag_;
      r.append(td);
    }
    if (onRow) {
      r.style.cursor = 'pointer';
      r.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select')) return;
        onRow(row);
      });
    }
    tbody.append(r);
  });
  table.append(tbody);
  wrap.append(table);

  if (selectable) {
    const all = wrap.querySelector('.sel-all');
    all.addEventListener('change', () => {
      $$('.sel-row', wrap).forEach((cb) => {
        cb.checked = all.checked;
        cb.closest('tr').classList.toggle('selected', all.checked);
      });
      wrap.dispatchEvent(new CustomEvent('selectionchange', { detail: selectedIds(wrap) }));
    });
    wrap.addEventListener('change', (e) => {
      if (e.target.classList.contains('sel-row')) {
        e.target.closest('tr').classList.toggle('selected', e.target.checked);
        wrap.dispatchEvent(new CustomEvent('selectionchange', { detail: selectedIds(wrap) }));
      }
    });
  }
  return wrap;
}

export function selectedIds(wrap) {
  return $$('.sel-row:checked', wrap).map((cb) => Number(cb.value));
}

export function setAllSelected(wrap, checked) {
  const all = wrap.querySelector('.sel-all');
  if (all) all.checked = checked;
  $$('.sel-row', wrap).forEach((cb) => {
    cb.checked = checked;
    cb.closest('tr').classList.toggle('selected', checked);
  });
  wrap.dispatchEvent(new CustomEvent('selectionchange', { detail: selectedIds(wrap) }));
}

/* ------------------------------------------------------------------ 分页 */

export function renderPager({ page, pages, total, pageSize, onGo, onChangeSize }) {
  const wrap = el('div', { class: 'pager' });
  const left = el('div', { class: 'small muted' }, [`共 ${fmt.num(total)} 条 · 第 ${page}/${pages || 1} 页`]);
  const right = el('div', { class: 'row', style: { gap: '10px' } });

  if (onChangeSize) {
    const sel = el('select', { class: 'select', style: { width: 'auto', padding: '5px 26px 5px 9px', fontSize: 'var(--fs-xs)' } });
    for (const n of [10, 20, 50, 100]) {
      sel.append(el('option', { value: String(n), text: `${n} 条/页`, selected: n === pageSize }));
    }
    sel.addEventListener('change', () => onChangeSize(Number(sel.value)));
    right.append(sel);
  }

  const pagesBox = el('div', { class: 'pages' });
  const mk = (label, p, disabled, current) => {
    const b = el('button', { class: 'pg', type: 'button', text: label, disabled: !!disabled });
    if (current) b.setAttribute('aria-current', 'true');
    if (!disabled && !current) b.addEventListener('click', () => onGo(p));
    return b;
  };
  pagesBox.append(mk('‹', page - 1, page <= 1));
  const nums = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2]);
  const list = [...nums].filter((n) => n >= 1 && n <= (pages || 1)).sort((a, b) => a - b);
  let prev = 0;
  for (const n of list) {
    if (prev && n - prev > 1) pagesBox.append(el('span', { class: 'muted', style: { padding: '0 2px' }, text: '…' }));
    pagesBox.append(mk(String(n), n, false, n === page));
    prev = n;
  }
  pagesBox.append(mk('›', page + 1, page >= (pages || 1)));
  right.append(pagesBox);
  wrap.append(left, right);
  return wrap;
}

/* ------------------------------------------------------------------ 表单 */

const UPLOAD_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.rar,.7z,.mp3,.mp4,.wav';

/**
 * 依据资源元数据渲染表单
 * @returns {{node: HTMLElement, read: () => object, setError: (k,msg)=>void}}
 */
export function renderForm(fields, values = {}, { cols = 2, only = null, exclude = [] } = {}) {
  const form = el('div', { class: 'form-grid', style: cols === 1 ? { gridTemplateColumns: '1fr' } : {} });
  const inputs = {};

  const keys = only || Object.keys(fields);
  for (const key of keys) {
    const f = fields[key];
    if (!f || exclude.includes(key)) continue;
    if (f.type === 'image' && f.readonly) continue;

    const span2 = ['textarea', 'richtext', 'json', 'images'].includes(f.type) || f.span2;
    const wrapEl = el('div', { class: `field ${span2 ? 'span2' : ''}`.trim() });
    const label = el('label', { for: `f-${key}` });
    label.innerHTML = `${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}`;
    wrapEl.append(label);

    const val = values[key];
    let input;

    switch (f.type) {
      case 'textarea':
      case 'richtext': {
        const box = el('div');
        if (f.type === 'richtext') {
          const ta = el('textarea', { class: 'textarea', id: `f-${key}`, rows: 10 });
          ta.value = val ?? '';
          const preview = el('div', { class: 'preview md hide' });
          const btn = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '预览' });
          btn.addEventListener('click', () => {
            const show = preview.classList.contains('hide');
            preview.classList.toggle('hide', !show);
            btn.textContent = show ? '继续编辑' : '预览';
            if (show) preview.innerHTML = mdToHtml(ta.value);
            ta.classList.toggle('hide', show);
          });
          // 在光标处插入一段 markdown 图片，正文里就能配图了
          const insImg = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '🖼 插入图片' });
          insImg.addEventListener('click', async () => {
            const url = await pickMedia({ title: '选择要插入正文的图片' });
            if (!url) return;
            const snippet = `\n\n![图片](${url})\n\n`;
            const p = ta.selectionStart ?? ta.value.length;
            ta.value = ta.value.slice(0, p) + snippet + ta.value.slice(ta.selectionEnd ?? p);
            ta.selectionStart = ta.selectionEnd = p + snippet.length;
            ta.focus();
            toastOk('图片已插入，保存后正文即可显示');
          });
          box.append(ta, el('div', { class: 'row', style: { marginTop: '6px' } }, [btn, insImg]), preview);
          box.style.marginTop = '0';
          input = ta;
        } else {
          input = el('textarea', { class: 'textarea', id: `f-${key}` });
          input.value = val ?? '';
          box.append(input);
        }
        if (f.help) box.append(el('div', { class: 'help', text: f.help }));
        wrapEl.append(box);
        break;
      }
      case 'select': {
        input = el('select', { class: 'select', id: `f-${key}` });
        const opts = f.options || [];
        if (!f.required) input.append(el('option', { value: '', text: '— 请选择 —' }));
        for (const [k, l] of opts) {
          input.append(el('option', { value: String(k), text: l, selected: String(val ?? '') === String(k) }));
        }
        if (val === undefined && f.default !== undefined && f.default !== null) input.value = String(f.default);
        wrapEl.append(input);
        if (f.help) wrapEl.append(el('div', { class: 'help', text: f.help }));
        break;
      }
      case 'ref': {
        input = el('select', { class: 'select', id: `f-${key}` });
        const list = store.lookups[f.ref] || [];
        input.append(el('option', { value: '', text: '— 请选择 —' }));
        for (const item of list) {
          const label2 = item.name || item.title || item.original_name || `#${item.id}`;
          const extra = f.ref === 'users' && item.username ? `（${item.username}）` : '';
          input.append(el('option', { value: String(item.id), text: label2 + extra, selected: Number(val) === Number(item.id) }));
        }
        if (store.lookupsLoaded && !list.length) {
          input.append(el('option', { value: '', text: '（暂无可选项）', disabled: true }));
        }
        wrapEl.append(input);
        break;
      }
      case 'bool': {
        const sw = el('label', { class: 'switch' });
        input = el('input', { type: 'checkbox', id: `f-${key}` });
        input.checked = Number(val) === 1 || val === true;
        sw.append(input, el('span', { class: 'slider' }));
        wrapEl.append(el('div', { class: 'row' }, [sw, el('span', { class: 'small muted', text: input.checked ? '开启' : '关闭' })]));
        input.addEventListener('change', () => { sw.nextElementSibling; wrapEl.querySelector('.small.muted').textContent = input.checked ? '开启' : '关闭'; });
        break;
      }
      case 'tags': {
        let arr = [];
        try { arr = Array.isArray(val) ? val : JSON.parse(val || '[]'); } catch { arr = []; }
        const box = el('div', { class: 'chips' });
        const textInput = el('input', { type: 'text', placeholder: '输入后回车添加' });
        const add = (t) => {
          const v = String(t || '').trim();
          if (!v || arr.includes(v)) return;
          arr.push(v);
          box.insertBefore(el('span', { class: 'chip' }, [v, el('button', { type: 'button', html: '&times;', onclick: () => { arr.splice(arr.indexOf(v), 1); render(); } })]), textInput);
        };
        const render = () => {
          $$('.chip', box).forEach((c) => c.remove());
          for (const t of arr) {
            box.insertBefore(el('span', { class: 'chip' }, [t, el('button', { type: 'button', html: '&times;', onclick: () => { arr.splice(arr.indexOf(t), 1); render(); } })]), textInput);
          }
        };
        textInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); add(textInput.value); textInput.value = ''; }
          if (e.key === 'Backspace' && !textInput.value && arr.length) { arr.pop(); render(); }
        });
        textInput.addEventListener('blur', () => { add(textInput.value); textInput.value = ''; });
        box.append(textInput);
        render();
        wrapEl.append(box);
        input = { get value() { return arr.slice(); }, set value(v) { arr = v || []; render(); }, isChips: true };
        break;
      }
      case 'json': {
        input = el('textarea', { class: 'textarea mono', id: `f-${key}`, rows: 5 });
        let v = val;
        if (typeof v === 'string') { try { v = JSON.stringify(JSON.parse(v), null, 2); } catch { /* keep */ } }
        else if (v !== undefined && v !== null) v = JSON.stringify(v, null, 2);
        input.value = v ?? '';
        wrapEl.append(input);
        if (f.help) wrapEl.append(el('div', { class: 'help', text: f.help }));
        else wrapEl.append(el('div', { class: 'help', text: 'JSON 格式，留空表示无' }));
        break;
      }
      case 'image': {
        const box = el('div', { class: 'img-picker' });
        const thumb = el('div', { class: 'thumb' });
        const setThumb = (url) => {
          thumb.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '🖼';
        };
        setThumb(val);
        const file = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        const btn = el('button', { class: 'btn btn-sm', type: 'button', text: '上传图片' });
        const lib = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '素材库' });
        const clr = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '清除' });
        const hidden = el('input', { type: 'hidden', id: `f-${key}` });
        hidden.value = val || '';
        btn.addEventListener('click', () => file.click());
        lib.addEventListener('click', async () => {
          const url = await pickMedia({ title: '从素材库选择图片' });
          if (!url) return;
          hidden.value = url;
          setThumb(url);
          toastOk('已选择素材库图片');
        });
        file.addEventListener('change', async () => {
          if (!file.files.length) return;
          try {
            btn.disabled = true; btn.textContent = '上传中…';
            const { api } = await import('./api.js');
            const r = await api.upload(file.files[0], 'public');
            const rec = Array.isArray(r.data) ? r.data[0] : r.data;
            hidden.value = rec.url;
            setThumb(rec.url);
            toastOk('图片已上传');
          } catch (e) { toastErr(e.message); }
          finally { btn.disabled = false; btn.textContent = '上传图片'; file.value = ''; }
        });
        clr.addEventListener('click', () => { hidden.value = ''; setThumb(''); });
        box.append(thumb, btn, lib, clr, file, hidden);
        input = hidden;
        wrapEl.append(box);
        break;
      }
      case 'images': {
        let arr = [];
        try { arr = Array.isArray(val) ? val : JSON.parse(val || '[]'); } catch { arr = []; }
        const box = el('div', { class: 'col' });
        const list = el('div', { class: 'row-wrap' });
        const render = () => {
          list.innerHTML = '';
          arr.forEach((url, i) => {
            const t = el('div', { class: 'thumb', style: { position: 'relative' } });
            t.innerHTML = `<img src="${esc(url)}" alt="">`;
            t.append(el('button', {
              class: 'btn btn-sm btn-icon', type: 'button', html: '&times;',
              style: { position: 'absolute', top: '2px', right: '2px', background: 'var(--surface)' },
              onclick: () => { arr.splice(i, 1); render(); }
            }));
            list.append(t);
          });
          if (!arr.length) list.innerHTML = '<span class="muted small">还没有图片</span>';
        };
        const file = el('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
        const btn = el('button', { class: 'btn btn-sm', type: 'button', text: '＋ 上传图片' });
        btn.addEventListener('click', () => file.click());
        const lib = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '素材库' });
        lib.addEventListener('click', async () => {
          const urls = await pickMedia({ multiple: true, title: '从素材库选择图片（可多选）' });
          if (!urls || !urls.length) return;
          for (const u of urls) if (!arr.includes(u)) arr.push(u);
          render();
          toastOk(`已添加 ${urls.length} 张`);
        });
        file.addEventListener('change', async () => {
          if (!file.files.length) return;
          try {
            btn.disabled = true; btn.textContent = '上传中…';
            const { api } = await import('./api.js');
            const r = await api.upload([...file.files], 'public');
            for (const rec of (r.files || [r.data])) arr.push(rec.url);
            render();
            toastOk('已上传');
          } catch (e) { toastErr(e.message); }
          finally { btn.disabled = false; btn.textContent = '＋ 上传图片'; file.value = ''; }
        });
        render();
        box.append(list, el('div', { class: 'row' }, [btn, lib, file]));
        input = { get value() { return arr.slice(); }, isImages: true };
        wrapEl.append(box);
        break;
      }
      case 'number':
      case 'money': {
        input = el('input', { class: 'input', type: 'number', id: `f-${key}`, step: f.type === 'money' ? '0.01' : '1' });
        if (f.min !== undefined) input.min = f.min;
        if (f.max !== undefined) input.max = f.max;
        input.value = val ?? (f.default ?? '');
        wrapEl.append(input);
        break;
      }
      case 'date': input = el('input', { class: 'input', type: 'date', id: `f-${key}`, value: (val || '').slice(0, 10) }); wrapEl.append(input); break;
      case 'time': input = el('input', { class: 'input', type: 'time', id: `f-${key}`, value: (val || '').slice(0, 5) }); wrapEl.append(input); break;
      case 'datetime': {
        const v = val ? String(val).replace('Z', '').slice(0, 16) : '';
        input = el('input', { class: 'input', type: 'datetime-local', id: `f-${key}`, value: v });
        wrapEl.append(input);
        break;
      }
      default: {
        input = el('input', { class: 'input', type: 'text', id: `f-${key}` });
        input.value = val ?? (f.default ?? '');
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.readonly) input.readOnly = true;
        wrapEl.append(input);
      }
    }

    if (f.help && !['textarea', 'richtext', 'json'].includes(f.type)) {
      wrapEl.append(el('div', { class: 'help', text: f.help }));
    }
    const errEl = el('div', { class: 'err hide' });
    wrapEl.append(errEl);
    inputs[key] = { field: f, input, errEl };
    form.append(wrapEl);
  }

  function read() {
    const out = {};
    for (const [key, { field, input }] of Object.entries(inputs)) {
      if (input.isChips) { out[key] = input.value; continue; }
      if (input.isImages) { out[key] = input.value; continue; }
      const v = input.value;
      switch (field.type) {
        case 'bool': out[key] = input.checked ? 1 : 0; break;
        case 'number': out[key] = v === '' ? 0 : Number(v); break;
        case 'money': out[key] = v === '' ? 0 : Number(v); break;
        case 'ref': out[key] = v === '' ? null : Number(v); break;
        case 'json': {
          if (!v.trim()) { out[key] = null; break; }
          try { out[key] = JSON.parse(v); } catch { throw new Error(`「${field.label}」不是合法的 JSON`); }
          break;
        }
        case 'datetime': out[key] = v ? new Date(v).toISOString() : ''; break;
        default: out[key] = v;
      }
    }
    return out;
  }

  function setError(key, msg) {
    const rec = inputs[key];
    if (!rec) return;
    rec.errEl.textContent = msg;
    rec.errEl.classList.toggle('hide', !msg);
    if (rec.input && rec.input.classList) rec.input.classList.toggle('bad', !!msg);
  }

  return { node: form, read, setError, inputs };
}

/* ------------------------------------------------------------------ 其他 */

/** 让一段 HTML 里的图片点击放大 */
export function bindImageZoom(root) {
  root.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-zoom]');
    if (!img) return;
    const box = el('div', { style: { textAlign: 'center' } });
    box.append(el('img', { src: img.src, alt: '', style: { maxWidth: '100%', maxHeight: '76vh', borderRadius: '10px' } }));
    modal({ title: img.alt || '查看图片', body: box, size: 'wide' });
  });
}

/** 简易确认 + 执行 + toast 的封装 */
export async function guard(fn, { okMsg = '操作成功', errPrefix = '' } = {}) {
  try {
    const r = await fn();
    if (okMsg) toastOk(okMsg);
    return r;
  } catch (e) {
    toastErr(errPrefix ? `${errPrefix}：${e.message}` : e.message);
    throw e;
  }
}

export function download(name, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function qs(name, fallback = '') {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}

export function hashPath() {
  const h = location.hash.replace(/^#\/?/, '');
  return h || '';
}

/* 便于其它模块从本模块统一取用（避免重复 import 路径） */
export { esc, mdToHtml };
