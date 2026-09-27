/* ============================================================================
 *  auth.js — 登录 / 注册页
 * ==========================================================================*/

import { api } from './api.js';
import { store, loadMe, initTheme, toggleTheme, fmt } from './store.js';
import { $, $$, toastOk, toastErr, esc } from './ui.js';

const nextUrl = () => {
  const n = new URLSearchParams(location.search).get('next');
  if (n && n.startsWith('/')) return n;
  return '/member.html';
};

function setErr(id, msg) {
  const node = $(id);
  if (node) node.textContent = msg || '';
}

async function afterLogin(user) {
  toastOk(`欢迎回来，${user.name || user.username}`);
  const target = nextUrl();
  setTimeout(() => { location.href = target; }, 500);
}

function bindTabs() {
  const tl = $('#tab-login'); const tr = $('#tab-register');
  const fl = $('#form-login'); const fr = $('#form-register');
  const set = (mode) => {
    const login = mode === 'login';
    tl.setAttribute('aria-pressed', String(login));
    tr.setAttribute('aria-pressed', String(!login));
    fl.classList.toggle('hide', !login);
    fr.classList.toggle('hide', login);
    setErr('#l-err', ''); setErr('#r-err', '');
  };
  tl.addEventListener('click', () => set('login'));
  tr.addEventListener('click', () => set('register'));
  return set;
}

async function boot() {
  initTheme();

  // 品牌信息
  try {
    const r = await api.get('/site');
    const st = r.data.settings || {};
    if (st.site_name) {
      document.title = `社内入口 · ${st.site_name}`;
      $('#aside-name').textContent = st.site_name;
      $('#logo-name').textContent = st.site_name;
      $('#aside-mark').textContent = st.logo_text || st.site_name.slice(0, 1);
      $('#logo-mark').textContent = st.logo_text || st.site_name.slice(0, 1);
    }
    if (st.site_slogan) $('#aside-en').textContent = st.site_slogan;
    if (String(st.open_register) === '0') {
      $('#tab-register').classList.add('hide');
    }
  } catch { /* 忽略 */ }

  const setTab = bindTabs();

  // 已登录直接跳走
  const me = await loadMe();
  if (me) { location.href = nextUrl(); return; }

  // 演示账号一键填充
  $$('[data-fill="user"]').forEach((c) => c.addEventListener('click', () => {
    $('#l-user').value = c.dataset.v || c.textContent.trim();
    $('#l-pass').value = 'club1234';
    setTab('login');
    $('#l-pass').focus();
  }));
  $$('[data-fill="pass"]').forEach((c) => c.addEventListener('click', () => {
    $('#l-pass').value = 'club1234';
  }));

  // 登录
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#l-submit');
    const username = $('#l-user').value.trim();
    const password = $('#l-pass').value;
    if (!username || !password) return setErr('#l-err', '请输入账号与密码');
    setErr('#l-err', '');
    try {
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 登录中…';
      const r = await api.post('/auth/login', { username, password });
      await afterLogin(r.user);
    } catch (err) {
      setErr('#l-err', err.message);
      btn.disabled = false; btn.textContent = '登录';
      $('#l-pass').select();
    }
  });

  // 注册
  $('#form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#r-submit');
    const username = $('#r-user').value.trim();
    const name = $('#r-name').value.trim();
    const pw = $('#r-pass').value;
    const pw2 = $('#r-pass2').value;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return setErr('#r-err', '账号需为 3-20 位字母、数字或下划线');
    if (pw.length < 6) return setErr('#r-err', '密码至少 6 位');
    if (pw !== pw2) return setErr('#r-err', '两次输入的密码不一致');
    setErr('#r-err', '');
    try {
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 注册中…';
      const r = await api.post('/auth/register', { username, name, password: pw, phone: $('#r-phone').value.trim() });
      if (r.data.status === 'pending') {
        toastOk('注册成功，账号正在等待管理员审核');
        btn.disabled = false; btn.textContent = '注册并登录';
        setTab('login');
        $('#l-user').value = username;
      } else {
        const meNow = await loadMe();
        await afterLogin(meNow || { name });
      }
    } catch (err) {
      setErr('#r-err', err.message);
      btn.disabled = false; btn.textContent = '注册并登录';
    }
  });

  $('#l-user').focus();
}

boot();
