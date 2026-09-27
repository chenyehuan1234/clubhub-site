/* ============================================================================
 *  store.js — 全局状态：登录者、权限、站点设置、关联下拉、主题
 * ==========================================================================*/

import { api } from './api.js';

export const store = {
  user: null,
  permissions: [],
  settings: {},
  counts: {},
  departments: [],
  lookups: {},
  meta: { resources: {}, groupOrder: [], lookupKeys: [] },
  lookupsLoaded: false,
  metaLoaded: false
};

/* ------------------------------------------------------------------ 权限 */

export function has(perm) {
  if (!perm) return true;
  if (!store.user) return false;
  const set = store.permissions;
  if (set.includes(perm)) return true;
  const prefix = perm.split('.')[0];
  return set.includes(`${prefix}.*`);
}

export function isAdmin() {
  return !!store.user && ['superadmin', 'admin'].includes(store.user.role);
}

export function isStaff() {
  return !!store.user && ['superadmin', 'admin', 'leader'].includes(store.user.role);
}

export const ROLE_LABEL = {
  superadmin: '超级管理员',
  admin: '管理员',
  leader: '部门负责人',
  member: '社员'
};

/* ------------------------------------------------------------------ 加载 */

export async function loadMe() {
  try {
    const r = await api.get('/auth/me');
    store.user = r.user || null;
    store.permissions = r.permissions || [];
  } catch {
    store.user = null;
    store.permissions = [];
  }
  return store.user;
}

export async function loadSite() {
  const r = await api.get('/site');
  store.settings = r.data.settings || {};
  store.counts = r.data.counts || {};
  store.departments = r.data.departments || [];
  applyBrandColor(store.settings.theme_color);
  return r.data;
}

export async function loadMeta() {
  if (store.metaLoaded) return store.meta;
  const r = await api.get('/meta');
  store.meta = r.data || store.meta;
  store.metaLoaded = true;
  return store.meta;
}

export async function loadLookups(force = false) {
  if (store.lookupsLoaded && !force) return store.lookups;
  try {
    const r = await api.get('/meta/lookups');
    store.lookups = r.data || {};
    store.lookupsLoaded = true;
  } catch {
    store.lookups = {};
  }
  return store.lookups;
}

export function lookupName(key, id) {
  if (id === null || id === undefined || id === '') return '';
  const list = store.lookups[key] || [];
  const item = list.find((x) => Number(x.id) === Number(id));
  if (!item) return `#${id}`;
  return item.name || item.title || item.original_name || `#${id}`;
}

/* ------------------------------------------------------------------ 主题 */

const THEME_KEY = 'clubhub.theme';

export function applyTheme(theme) {
  const t = theme || localStorage.getItem(THEME_KEY)
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    b.textContent = t === 'dark' ? '☀' : '☾';
    b.setAttribute('aria-label', t === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  });
  return t;
}

export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  return applyTheme(cur === 'dark' ? 'light' : 'dark');
}

/** 传入 defaultTheme 可让某个页面拥有自己的默认主题（宣传页默认深色） */
export function initTheme(defaultTheme) {
  applyTheme(localStorage.getItem(THEME_KEY) || defaultTheme || undefined);
}

/* ------------------------------------------------------------- 品牌主色 */

export function applyBrandColor(color) {
  if (!color || !/^#[0-9a-f]{3,8}$/i.test(color)) return;
  document.documentElement.style.setProperty('--brand', color);
}

/* ------------------------------------------------------------- 本地偏好 */

export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`clubhub.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`clubhub.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  }
};

/* ------------------------------------------------------------------ 格式化 */

export const fmt = {
  date(v) {
    if (!v) return '—';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
    if (isNaN(d)) return s;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  time(v) {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
    if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
    return '';
  },
  dt(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  /** 活动时间：8月12日 19:00 */
  when(start, end) {
    if (!start) return '待定';
    const d = new Date(start);
    if (isNaN(d)) return String(start);
    const p = (n) => String(n).padStart(2, '0');
    let out = `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
    if (end) {
      const e = new Date(end);
      if (!isNaN(e) && e.getDate() === d.getDate()) out += ` – ${p(e.getHours())}:${p(e.getMinutes())}`;
    }
    return out;
  },
  rel(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    const diff = (d.getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    const units = [[86400 * 365, '年'], [86400 * 30, '个月'], [86400, '天'], [3600, '小时'], [60, '分钟']];
    for (const [sec, label] of units) {
      if (abs >= sec) {
        const n = Math.floor(abs / sec);
        return diff < 0 ? `${n}${label}前` : `${n}${label}后`;
      }
    }
    return diff < 0 ? '刚刚' : '即将';
  },
  money(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  num(v) {
    return (Number(v) || 0).toLocaleString('zh-CN');
  },
  size(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  },
  /** 倒计时文案 */
  countdown(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return '';
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return '已开始';
    const days = Math.floor(diff / 86400000);
    if (days >= 1) return `${days} 天后`;
    const hours = Math.floor(diff / 3600000);
    if (hours >= 1) return `${hours} 小时后`;
    return `${Math.max(1, Math.floor(diff / 60000))} 分钟后`;
  }
};
