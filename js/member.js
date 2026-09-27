/* ============================================================================
 *  member.js — 社内会员中心
 *  17 个标签页：概览 / 我的课表 / 选课 / 签到 / 请假 / 我的活动 / 我的作品 /
 *  我的任务 / 资料库 / 收藏 / 借用 / 投票 / 积分 / 公告 / 会议 / 值班 / 个人资料
 * ==========================================================================*/

import { api } from './api.js';
import { store, loadMe, loadSite, loadMeta, loadLookups, initTheme, toggleTheme, fmt, has, ROLE_LABEL, lookupName } from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, toastWarn, modal, drawer, confirmDialog,
  badge, emptyHtml, loadingHtml, esc, avatarHtml, renderForm, renderTable, renderPager,
  cellValue, cover, promptDialog, yesNo
} from './ui.js';
import { renderWeek, openSession } from './schedule-ui.js';
import { renderDocBrowser } from './docs-ui.js';

const content = $('#content');
let CURRENT = 'overview';

/* ------------------------------------------------------------------ 菜单 */

const MENU = [
  { group: '我的' },
  { key: 'overview', ic: '🏠', label: '概览' },
  { key: 'schedule', ic: '🗓️', label: '我的课表' },
  { key: 'courses', ic: '📚', label: '选课报名' },
  { key: 'attendance', ic: '✅', label: '签到记录' },
  { key: 'leaves', ic: '🏷️', label: '我的请假' },
  { group: '参与' },
  { key: 'signups', ic: '🎪', label: '我的活动' },
  { key: 'projects', ic: '🎨', label: '我的作品' },
  { key: 'tasks', ic: '📌', label: '我的任务' },
  { key: 'polls', ic: '🗳️', label: '投票' },
  { key: 'duty', ic: '🕐', label: '值班' },
  { key: 'meetings', ic: '🧾', label: '会议' },
  { group: '资源' },
  { key: 'documents', ic: '🗂️', label: '资料库' },
  { key: 'favorites', ic: '★', label: '我的收藏' },
  { key: 'points', ic: '⭐', label: '我的积分' },
  { group: '消息与账号' },
  { key: 'notifications', ic: '🔔', label: '通知中心' },
  { key: 'announcements', ic: '📢', label: '公告' },
  { key: 'loans', ic: '📦', label: '物资借用' },
  { key: 'profile', ic: '⚙️', label: '个人资料' }
];

const TITLES = {
  overview: ['概览', '你的社团活动一览'],
  schedule: ['我的课表', '已选课程与授课安排，可自助签到'],
  courses: ['选课报名', '选择你想参加的课程与培训'],
  attendance: ['签到记录', '每一次课的出勤情况'],
  leaves: ['我的请假', '提交与查看请假申请'],
  signups: ['我的活动', '你报名的活动与参与记录'],
  projects: ['我的作品', '提交作品，审核通过后会展示在宣传页'],
  tasks: ['我的任务', '指派给你的事情，按截止时间排序'],
  documents: ['资料库', '讲义、制度、模板与会议纪要'],
  favorites: ['我的收藏', '你收藏的资料'],
  points: ['我的积分', '参与活动、完成任务与上传资料都会得分'],
  notifications: ['通知中心', '系统、审核、排课与任务提醒'],
  announcements: ['公告', '社内公告，需要你确认已读'],
  loans: ['物资借用', '申请借用社团物资并查看归还时间'],
  polls: ['投票', '参与社团决策'],
  meetings: ['会议', '你参与的会议与纪要'],
  duty: ['值班', '你的值班安排']
};

/* ------------------------------------------------------------------ 启动 */

function buildMenu() {
  const box = $('#side-menu');
  box.innerHTML = MENU.map((m) => {
    if (m.group) return `<div class="side-group">${esc(m.group)}</div>`;
    return `<a class="side-item" data-key="${m.key}" href="#${m.key}">
      <span class="ic">${m.ic}</span><span class="nm">${esc(m.label)}</span>
      <span class="cnt hide" data-cnt="${m.key}"></span></a>`;
  }).join('');
  box.addEventListener('click', () => {
    $('#side')?.classList.remove('open');
    $('.side-mask')?.remove();
  });
}

function setActive(key) {
  CURRENT = key;
  $$('#side-menu .side-item').forEach((a) => a.classList.toggle('on', a.dataset.key === key));
  const t = TITLES[key] || [key, ''];
  $('#page-title').textContent = t[0];
  $('#page-sub').textContent = t[1] || '';
  document.title = `${t[0]} · 会员中心`;
}

async function badgeCounts() {
  try {
    const r = api.get ? await fetch('/api/notifications/unread-count', { credentials: 'same-origin' }).then((x) => x.json()) : null;
    const n = r?.data?.total || 0;
    const bell = $('#bell-count');
    bell.textContent = n > 99 ? '99+' : String(n);
    bell.classList.toggle('hide', !n);
    const c = $(`[data-cnt="notifications"]`);
    if (c) { c.textContent = n ? String(n) : ''; c.classList.toggle('hide', !n); c.classList.toggle('alert', n > 0); }
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ 路由 */

async function route() {
  const key = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'overview';
  const fn = VIEWS[key] || VIEWS.overview;
  setActive(key in VIEWS ? key : 'overview');
  content.innerHTML = loadingHtml();
  try {
    await fn();
  } catch (e) {
    content.innerHTML = `<div class="card card-pad">${emptyHtml('加载失败', e.message, '⚠')}</div>`;
  }
  badgeCounts();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ 概览 */

const VIEWS = {};

VIEWS.overview = async function () {
  const d = (await api.get('/me/overview')).data;
  const p = d.profile;
  const st = d.attendance;
  content.innerHTML = `
  <div class="me-grid">
    <div class="col" style="gap:var(--sp-4)">
      <div class="card profile-card">
        ${avatarHtml(p.name, p.avatar, 'avatar-xl')}
        <div class="nm">${esc(p.name)}</div>
        <div class="pos">${esc(p.position || ROLE_LABEL[p.role] || '')} · ${esc(p.department_name || '未分配部门')}</div>
        <div class="row-wrap" style="justify-content:center;gap:6px;margin-top:10px">
          <span class="badge badge-brand">${esc(ROLE_LABEL[p.role] || p.role)}</span>
          ${p.student_no ? `<span class="badge">${esc(p.student_no)}</span>` : ''}
          ${p.grade ? `<span class="badge">${esc(p.grade)} 级</span>` : ''}
        </div>
        <div class="me-stats">
          <div><b>${d.counts.courses}</b><span>在选课程</span></div>
          <div><b>${d.counts.signups}</b><span>报名活动</span></div>
          <div><b>${d.points}</b><span>积分</span></div>
        </div>
        <div class="row-wrap" style="justify-content:center;gap:6px;margin-top:12px">
          <a class="btn btn-sm" href="#schedule">看课表</a>
          <a class="btn btn-sm" href="#profile">编辑资料</a>
        </div>
      </div>

      <div class="card card-pad">
        <h4 style="margin-bottom:10px">出勤</h4>
        <div class="row-between small" style="margin-bottom:6px">
          <span class="muted">出勤率</span><b>${st.rate}%</b>
        </div>
        <div class="bar ${st.rate >= 80 ? 'ok' : st.rate >= 60 ? 'warn' : 'danger'}"><i style="width:${st.rate}%"></i></div>
        <div class="row-wrap small muted" style="gap:14px;margin-top:10px">
          <span>应出勤 ${st.total} 次</span><span>缺勤 ${st.absent || 0} 次</span>
        </div>
      </div>

      <div class="card card-pad">
        <h4 style="margin-bottom:10px">待办</h4>
        <div class="col" style="gap:8px">
          ${todoRow('#tasks', d.counts.tasks, '未完成任务', '📌')}
          ${todoRow('#leaves', d.counts.leaves, '待审批请假', '🏷️')}
          ${todoRow('#loans', d.counts.loans, '借用中的物资', '📦')}
          ${todoRow('#favorites', d.counts.favorites, '收藏的资料', '★')}
        </div>
      </div>
    </div>

    <div class="col" style="gap:var(--sp-4)">
      <div class="card">
        <div class="card-hd"><h4>接下来要上的课</h4><a class="btn btn-sm" href="#schedule">全部 →</a></div>
        <div class="card-bd" style="padding-top:var(--sp-3)">
          ${d.upcoming.length ? `<div class="col" style="gap:10px">${d.upcoming.map((s) => `
            <div class="row" style="gap:12px">
              <div class="center" style="width:52px;flex:0 0 auto">
                <div class="tiny muted">${esc(s.date.slice(5))}</div>
                <div class="bold small">${esc(s.start_time)}</div>
              </div>
              <div class="grow" style="min-width:0">
                <div class="small bold clip">${esc(s.course_title || '')}</div>
                <div class="tiny muted clip">${esc(s.topic || '')} · ${esc(s.venue_name || '待定')}</div>
              </div>
              ${badge(s.status)}
            </div>`).join('')}</div>` : emptyHtml('近期没有排课', '去看看有哪些课可以选', '🗓')}
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h4>我报名的活动</h4><a class="btn btn-sm" href="#signups">全部 →</a></div>
        <div class="card-bd" style="padding-top:var(--sp-3)">
          ${d.nextEvents.length ? `<div class="col" style="gap:10px">${d.nextEvents.map((e) => `
            <a class="row" href="/index.html#/events/${e.id}" style="gap:10px;color:inherit;text-decoration:none">
              <span class="grow" style="min-width:0">
                <span class="small bold clip" style="display:block">${esc(e.title)}</span>
                <span class="tiny muted">${esc(fmt.when(e.start_at))} · ${esc(e.location || '待定')}</span>
              </span>
              <span class="small muted nowrap">${esc(fmt.countdown(e.start_at))}</span>
            </a>`).join('')}</div>` : emptyHtml('还没有报名活动', '去活动页看看', '🎪')}
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h4>我的任务</h4><a class="btn btn-sm" href="#tasks">全部 →</a></div>
        <div class="card-bd" style="padding-top:var(--sp-3)">
          ${d.myTasks.length ? `<div class="col" style="gap:8px">${d.myTasks.map((t) => `
            <div class="row-between" style="gap:10px">
              <span class="small clip">${esc(t.title)}</span>
              <span class="row" style="gap:6px">${badge(t.priority)}<span class="tiny muted nowrap">${t.due_at ? esc(t.due_at) : ''}</span></span>
            </div>`).join('')}</div>` : emptyHtml('暂无待办任务', '', '✅')}
        </div>
      </div>
    </div>
  </div>`;

  function todoRow(href, n, label, ic) {
    return `<a class="todo-item ${n ? 'warn' : ''}" href="${href}">
      <span class="n">${ic}</span><span class="grow small">${esc(label)}</span>
      <b class="${n ? '' : 'muted'}">${n}</b></a>`;
  }
};

/* ------------------------------------------------------------------ 课表 */

VIEWS.schedule = async function () {
  content.innerHTML = `
    <div class="card card-pad" style="margin-bottom:var(--sp-4)">
      <div class="row-between" style="flex-wrap:wrap;gap:10px">
        <div>
          <b>周课表</b>
          <div class="small muted">点击课次可以查看详情并自助签到</div>
        </div>
        <div class="row" style="gap:8px">
          <a class="btn btn-sm" href="#courses">去选课</a>
          <button class="btn btn-sm" id="btn-checkin">输入签到码</button>
        </div>
      </div>
    </div>
    <div id="week-host"></div>`;
  const apiRef = await renderWeek($('#week-host'), { mine: 1, filters: false, params: { mine: 1 } });
  $('#btn-checkin').addEventListener('click', openCheckin);
};

async function openCheckin() {
  const code = await promptDialog('输入讲师给出的 4 位签到码', { title: '自助签到', placeholder: '如 1234' });
  if (!code) return;
  try {
    const mine = (await api.get('/schedule/mine', { days: 1 })).data;
    const today = new Date().toISOString().slice(0, 10);
    const sess = (mine.sessions || []).filter((s) => s.date === today && s.status !== 'cancelled');
    if (!sess.length) return toastWarn('今天没有你的课');
    let ok = 0; let err = '';
    for (const s of sess) {
      try { await api.post(`/sessions/${s.id}/checkin`, { code }); ok += 1; }
      catch (e) { err = e.message; }
    }
    if (ok) { toastOk(`签到成功（${ok} 次课）`); route(); }
    else toastErr(err || '签到失败');
  } catch (e) { toastErr(e.message); }
}

/* ------------------------------------------------------------------ 选课 */

VIEWS.courses = async function () {
  const all = (await api.get('/courses')).data || [];
  const my = (await api.get('/me/overview')).data;
  const enrolledIds = new Set();
  try {
    const mine = (await api.get('/schedule/mine', { days: 180 })).data;
    for (const c of mine.enrolled || []) enrolledIds.add(c.id);
  } catch { /* ignore */ }

  content.innerHTML = `
  <div class="page-head">
    <div><h2>可选课程</h2><p>共 ${all.length} 门课程，选课后会出现在你的课表里</p></div>
  </div>
  <div class="grid g3">
    ${all.map((c) => {
    const mineEnrolled = enrolledIds.has(c.id);
    const full = c.capacity > 0 && c.enrolled >= c.capacity;
    return `<article class="card card-hover ev-card">
        <div class="cover"><img src="${esc(c.cover || cover(c.title, c.id))}" alt="">
          <span class="flag"><span class="badge badge-line">${esc(c.category)}</span>${badge(c.status)}</span></div>
        <div class="bd">
          <h3 style="font-size:var(--fs-md)">${esc(c.title)}</h3>
          <p class="small muted clamp2" style="margin:0">${esc(c.summary || '')}</p>
          <div class="meta">
            <span>👤 ${esc(c.teacher_name || '待定')}</span>
            <span>🗂 ${c.session_count} 次</span>
            <span>👥 ${c.enrolled}${c.capacity ? '/' + c.capacity : ''}</span>
          </div>
          <div class="row" style="gap:8px;margin-top:10px">
            <button class="btn btn-sm ${mineEnrolled ? 'btn-danger' : 'btn-primary'} grow" data-enroll="${c.id}" data-on="${mineEnrolled ? 1 : 0}"
              ${!mineEnrolled && (full || !['open', 'ongoing'].includes(c.status)) ? 'disabled' : ''}>
              ${mineEnrolled ? '已选上 · 退课' : full ? '名额已满' : '选择这门课'}
            </button>
            <a class="btn btn-sm" href="/index.html#/courses/${c.id}">详情</a>
          </div>
        </div>
      </article>`;
  }).join('') || emptyHtml('暂时没有可选课程')}
  </div>`;

  content.querySelectorAll('[data-enroll]').forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.dataset.enroll);
    const on = b.dataset.on === '1';
    if (on && !(await confirmDialog('确定退掉这门课吗？', { okText: '退课', danger: true }))) return;
    try {
      b.disabled = true;
      if (on) await api.del(`/courses/${id}/enroll`);
      else await api.post(`/courses/${id}/enroll`, {});
      toastOk(on ? '已退课' : '选课成功');
      route();
    } catch (e) { toastErr(e.message); b.disabled = false; }
  }));
};

/* ------------------------------------------------------------------ 签到 */

VIEWS.attendance = async function () {
  const d = (await api.get('/me/attendance')).data;
  const s = d.stats;
  content.innerHTML = `
  <div class="dash-grid" style="margin-bottom:var(--sp-4)">
    <div class="card stat"><div class="stat-k">记录总数</div><div class="stat-v">${s.total || 0}</div></div>
    <div class="card stat"><div class="stat-k">到课 / 迟到</div><div class="stat-v">${s.present || 0} / ${s.late || 0}</div></div>
    <div class="card stat"><div class="stat-k">缺席 / 请假</div><div class="stat-v">${s.absent || 0} / ${s.leave_cnt || 0}</div></div>
    <div class="card stat"><div class="stat-k">出勤率</div><div class="stat-v" style="color:${s.rate >= 80 ? 'var(--ok)' : s.rate >= 60 ? 'var(--warn)' : 'var(--danger)'}">${s.rate}%</div></div>
  </div>
  <div class="card"><div id="att-table"></div></div>`;

  $('#att-table').append(renderTable({
    columns: [
      { key: 'date', label: '日期', width: 110 },
      { key: 'course_title', label: '课程' },
      { key: 'topic', label: '课次主题' },
      { key: 'start_time', label: '时间', render: (v, r) => `${esc(v)}–${esc(r.end_time || '')}` },
      { key: 'status', label: '状态', field: { type: 'select' } },
      { key: 'checked_in_at', label: '签到时间', field: { type: 'datetime' } }
    ],
    rows: d.rows, compact: true, empty: '还没有签到记录'
  }));
};

/* ------------------------------------------------------------------ 请假 */

VIEWS.leaves = async function () {
  const [leaves, mine] = await Promise.all([
    api.get('/me/leaves').then((r) => r.data),
    api.get('/schedule/mine', { days: 60 }).then((r) => r.data)
  ]);
  content.innerHTML = `
  <div class="page-head">
    <div><h2>我的请假</h2><p>提交后会通知讲师与部门负责人审批</p></div>
    <button class="btn btn-primary" id="btn-new-leave">＋ 提交请假</button>
  </div>
  <div class="card" style="margin-bottom:var(--sp-4)"><div id="leave-table"></div></div>`;

  $('#leave-table').append(renderTable({
    columns: [
      { key: 'created_at', label: '提交时间', field: { type: 'datetime' } },
      { key: 'course_title', label: '课程', render: (v, r) => esc(v || '—') },
      { key: 'session_date', label: '课次', render: (v, r) => v ? `${esc(v)} ${esc(r.start_time || '')}` : '—' },
      { key: 'type', label: '假别' },
      { key: 'reason', label: '事由', render: (v) => `<span class="clamp" style="max-width:260px;display:inline-block">${esc(v)}</span>` },
      { key: 'status', label: '状态', field: { type: 'select' } },
      { key: 'reviewer_name', label: '审批人', render: (v) => esc(v || '—') }
    ],
    rows: leaves, compact: true, empty: '还没有请假记录',
    actions: (r) => r.status === 'pending'
      ? `<button class="btn btn-sm btn-danger" data-cancel="${r.id}">撤回</button>` : ''
  }));

  content.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('撤回这条请假申请？', { okText: '撤回', danger: true }))) return;
    try { await api.del(`/me/leaves/${b.dataset.cancel}`); toastOk('已撤回'); route(); }
    catch (e) { toastErr(e.message); }
  }));

  $('#btn-new-leave').addEventListener('click', () => {
    const sessions = (mine.sessions || []).filter((s) => s.date >= new Date().toISOString().slice(0, 10) && s.status !== 'cancelled');
    const opts = sessions.map((s) => [String(s.id), `${s.date} ${s.start_time} ${s.course_title || ''}${s.topic ? ' · ' + s.topic : ''}`]);
    const courses = (mine.enrolled || []).map((c) => [String(c.id), c.title]);
    const fields = {
      session_id: { type: 'select', label: '选择课次', options: opts, required: false, help: '不选课次也可以按整门课程请假' },
      course_id: { type: 'select', label: '或按课程请假', options: courses },
      type: { type: 'select', label: '假别', options: [['事假', '事假'], ['病假', '病假'], ['公假', '公假']], default: '事假', required: true },
      reason: { type: 'textarea', label: '请假事由', required: true }
    };
    const form = renderForm(fields, {}, { cols: 2 });
    const { root, close } = modal({ title: '提交请假', body: form.node, size: 'wide', footer: '' });
    const ft = el('div', { class: 'modal-ft' });
    const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '提交' });
    c1.addEventListener('click', close);
    ok.addEventListener('click', async () => {
      const body = form.read();
      if (!body.session_id && !body.course_id) return toastErr('请选择要请假的课次或课程');
      if (!body.reason || body.reason.length < 2) return toastErr('请填写请假事由');
      try {
        await api.post('/leaves', {
          session_id: body.session_id || null,
          course_id: body.course_id || null,
          type: body.type, reason: body.reason
        });
        toastOk('请假申请已提交');
        close(); route();
      } catch (e) { toastErr(e.message); }
    });
    ft.append(c1, ok); root.append(ft);
  });
};

/* ------------------------------------------------------------------ 活动 */

VIEWS.signups = async function () {
  const rows = (await api.get('/me/signups')).data || [];
  content.innerHTML = `
  <div class="page-head"><div><h2>我的活动</h2><p>共 ${rows.length} 条报名记录</p></div>
    <a class="btn" href="/index.html#/events">去发现活动 →</a></div>
  <div class="card"><div id="t"></div></div>`;
  $('#t').append(renderTable({
    columns: [
      { key: 'title', label: '活动' },
      { key: 'start_at', label: '开始时间', field: { type: 'datetime' } },
      { key: 'location', label: '地点' },
      { key: 'status', label: '报名状态', field: { type: 'select' } },
      { key: 'created_at', label: '报名时间', field: { type: 'datetime' } }
    ],
    rows, compact: true, empty: '还没有报名任何活动',
    actions: (r) => ['pending', 'approved'].includes(r.status)
      ? `<button class="btn btn-sm btn-danger" data-cancel="${r.id}">取消报名</button>` : ''
  }));
  $('#t').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    if (!(await confirmDialog('取消这次报名？', { okText: '取消报名', danger: true }))) return;
    try { await api.del(`/me/signups/${b.dataset.cancel}`); toastOk('已取消'); route(); }
    catch (err) { toastErr(err.message); }
  });
};

/* ------------------------------------------------------------------ 作品 */

VIEWS.projects = async function () {
  const rows = (await api.get('/me/projects')).data || [];
  content.innerHTML = `
  <div class="page-head"><div><h2>我的作品</h2><p>提交后由管理员审核，通过后会出现在对外宣传页</p></div>
    <button class="btn btn-primary" id="btn-new-proj">＋ 提交作品</button></div>
  <div class="grid g3" id="pj">
    ${rows.map((p) => `
      <article class="card proj-card">
        <div class="cover"><img src="${esc(p.cover || cover(p.title, p.id, '4/3'))}" alt=""></div>
        <div class="bd">
          <div class="row-between" style="gap:8px">
            <h4 class="clip" style="margin:0">${esc(p.title)}</h4>${badge(p.status)}
          </div>
          <div class="row-wrap tiny muted" style="gap:10px;margin-top:6px">
            <span>${esc(p.category)}</span><span>${esc(fmt.date(p.created_at))}</span>
            ${p.status === 'published' ? `<span>👁 ${p.view_count}</span>` : ''}
          </div>
          ${p.review_note ? `<div class="alert alert-warn small" style="margin-top:10px;padding:8px 11px">审核意见：${esc(p.review_note)}</div>` : ''}
          <div class="row" style="gap:7px;margin-top:10px">
            ${p.status === 'published' ? `<a class="btn btn-sm" href="/index.html#/projects/${p.id}">查看</a>` : ''}
            <button class="btn btn-sm" data-edit="${p.id}">编辑</button>
            <button class="btn btn-sm btn-danger" data-del="${p.id}">删除</button>
          </div>
        </div>
      </article>`).join('') || emptyHtml('还没有提交过作品', '把你的作品发上来吧', '🎨')}
  </div>`;

  $('#btn-new-proj').addEventListener('click', () => openProjectForm(null));
  content.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return openProjectForm(rows.find((x) => x.id === Number(ed.dataset.edit)));
    const dl = e.target.closest('[data-del]');
    if (dl) {
      if (!(await confirmDialog('删除这件作品？不可恢复。', { danger: true, okText: '删除' }))) return;
      try { await api.del(`/me/projects/${dl.dataset.del}`); toastOk('已删除'); route(); }
      catch (err) { toastErr(err.message); }
    }
  });
};

function openProjectForm(p) {
  const fields = {
    title: { type: 'text', label: '作品名称', required: true },
    category: {
      type: 'select', label: '分类',
      options: [['摄影', '摄影'], ['绘画', '绘画'], ['设计', '设计'], ['视频', '视频'], ['文字', '文字'], ['音乐', '音乐'], ['编程', '编程'], ['其他', '其他']],
      default: '摄影'
    },
    cover: { type: 'image', label: '封面图' },
    images: { type: 'images', label: '作品图片' },
    tags: { type: 'tags', label: '标签' },
    summary: { type: 'textarea', label: '一句话简介' },
    author_name: { type: 'text', label: '署名', default: store.user?.name || '' },
    description: { type: 'richtext', label: '作品说明' }
  };
  const form = renderForm(fields, p || {}, { cols: 2 });
  const { root, close } = modal({ title: p ? '编辑作品' : '提交作品', body: form.node, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: p ? '保存' : '提交审核' });
  c1.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    let body;
    try { body = form.read(); } catch (e) { return toastErr(e.message); }
    if (!body.title) return toastErr('请填写作品名称');
    try {
      ok.disabled = true;
      if (p) await api.patch(`/me/projects/${p.id}`, body);
      else await api.post('/me/projects', body);
      toastOk(p ? '已保存，等待重新审核' : '已提交，等待审核');
      close(); route();
    } catch (e) { toastErr(e.message); ok.disabled = false; }
  });
  ft.append(c1, ok); root.append(ft);
}

/* ------------------------------------------------------------------ 任务 */

VIEWS.tasks = async function () {
  const rows = (await api.get('/me/tasks')).data || [];
  const open = rows.filter((r) => r.status !== 'done');
  const done = rows.filter((r) => r.status === 'done');
  content.innerHTML = `
  <div class="page-head"><div><h2>我的任务</h2><p>共 ${open.length} 项进行中${rows.filter((r) => r.overdue).length ? ` · ${rows.filter((r) => r.overdue).length} 项已逾期` : ''}</p></div></div>
  <div class="grid g2" style="align-items:start">
    <div class="col" style="gap:var(--sp-3)">
      ${open.map(taskCard).join('') || emptyHtml('没有进行中的任务', '休息一下', '✅')}
    </div>
    <div class="col" style="gap:var(--sp-3)">
      <div class="card card-pad"><b class="small muted">已完成（${done.length}）</b></div>
      ${done.map(taskCard).join('')}
    </div>
  </div>`;

  function taskCard(t) {
    return `<div class="card card-pad" style="${t.overdue ? 'border-left:3px solid var(--danger)' : ''}">
      <div class="row-between" style="gap:10px;align-items:flex-start">
        <div class="grow" style="min-width:0">
          <div class="bold">${esc(t.title)}</div>
          <div class="row-wrap tiny muted" style="gap:10px;margin-top:5px">
            ${badge(t.priority)} ${badge(t.status)}
            ${t.due_at ? `<span style="color:${t.overdue ? 'var(--danger)' : ''}">截止 ${esc(t.due_at)}</span>` : ''}
            ${t.department_name ? `<span>${esc(t.department_name)}</span>` : ''}
            ${t.creator_name ? `<span>来自 ${esc(t.creator_name)}</span>` : ''}
          </div>
          ${t.description ? `<div class="small muted clamp2" style="margin-top:8px">${esc(t.description)}</div>` : ''}
          <div class="row" style="gap:8px;margin-top:10px">
            <div class="bar grow"><i style="width:${t.progress || 0}%"></i></div>
            <span class="tiny muted mono">${t.progress || 0}%</span>
          </div>
        </div>
      </div>
      <div class="row" style="gap:7px;margin-top:12px">
        ${t.status !== 'doing' ? `<button class="btn btn-sm" data-set="${t.id}" data-s="doing">开始做</button>` : ''}
        ${t.status !== 'review' ? `<button class="btn btn-sm" data-set="${t.id}" data-s="review">提交审核</button>` : ''}
        ${t.status !== 'done' ? `<button class="btn btn-sm btn-primary" data-set="${t.id}" data-s="done">标记完成</button>` : `<button class="btn btn-sm" data-set="${t.id}" data-s="doing">重新打开</button>`}
        <a class="btn btn-sm btn-ghost" href="/admin.html#tasks">在后台查看</a>
      </div>
    </div>`;
  }

  content.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    try {
      await api.post(`/me/tasks/${b.dataset.set}/status`, { status: b.dataset.s });
      toastOk('已更新任务状态');
      route();
    } catch (err) { toastErr(err.message); }
  });
};

/* ------------------------------------------------------------------ 资料 */

VIEWS.documents = async function () {
  content.innerHTML = '<div id="doc-host"></div>';
  await renderDocBrowser($('#doc-host'), { canManage: has('document.write') });
};

VIEWS.favorites = async function () {
  const rows = (await api.get('/me/favorites')).data || [];
  content.innerHTML = `
  <div class="page-head"><div><h2>我的收藏</h2><p>共 ${rows.length} 份资料</p></div>
    <a class="btn" href="#documents">去资料库 →</a></div>
  <div class="card"><div id="t"></div></div>`;
  $('#t').append(renderTable({
    columns: [
      { key: 'title', label: '资料' },
      { key: 'folder_name', label: '目录', render: (v) => esc(v || '未分类') },
      { key: 'category', label: '分类' },
      { key: 'visibility', label: '可见范围', field: { type: 'select' } },
      { key: 'size', label: '大小', render: (v) => fmt.size(v) },
      { key: 'favorited_at', label: '收藏时间', field: { type: 'datetime' } }
    ],
    rows, compact: true, empty: '还没有收藏任何资料',
    actions: (r) => `<button class="btn btn-sm btn-primary" data-dl="${r.id}" data-vid="${r.version_id || ''}">下载</button>
      <button class="btn btn-sm" data-unfav="${r.id}">取消收藏</button>`
  }));
  $('#t').addEventListener('click', async (e) => {
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      try {
        let vid = dl.dataset.vid;
        if (!vid) vid = (await api.get(`/documents/${dl.dataset.dl}`)).data.current_version_id;
        if (!vid) return toastErr('该资料没有可下载的文件');
        await api.download(`/documents/${dl.dataset.dl}/download/${vid}`, 'download');
        toastOk('已开始下载');
      } catch (err) { toastErr(err.message); }
      return;
    }
    const un = e.target.closest('[data-unfav]');
    if (un) {
      try { await api.post(`/documents/${un.dataset.unfav}/favorite`, {}); toastOk('已取消收藏'); route(); }
      catch (err) { toastErr(err.message); }
    }
  });
};

/* ------------------------------------------------------------------ 积分 */

VIEWS.points = async function () {
  const [mine, board] = await Promise.all([
    api.get('/points/mine').then((r) => r.data),
    api.get('/points/leaderboard', { limit: 20 }).then((r) => r.data)
  ]);
  content.innerHTML = `
  <div class="dash-grid" style="margin-bottom:var(--sp-4)">
    <div class="card stat"><div class="stat-k">我的积分</div><div class="stat-v">${mine.total}</div></div>
    <div class="card stat"><div class="stat-k">积分记录</div><div class="stat-v">${mine.rows.length}</div></div>
    <div class="card stat"><div class="stat-k">我的排名</div><div class="stat-v">${board.myRank || '—'}</div></div>
    <div class="card stat"><div class="stat-k">参与人数</div><div class="stat-v">${board.rows.length}</div></div>
  </div>
  <div class="dash-2">
    <div class="card">
      <div class="card-hd"><h4>积分流水</h4></div>
      <div id="pt"></div>
    </div>
    <div class="card">
      <div class="card-hd"><h4>积分排行榜</h4></div>
      <div class="card-bd">
        ${board.rows.map((r, i) => `
          <div class="row" style="gap:11px;padding:7px 0;border-bottom:1px dashed var(--line)">
            <b class="mono ${i < 3 ? '' : 'muted'}" style="width:24px">${i + 1}</b>
            ${avatarHtml(r.name, r.avatar, 'avatar-sm')}
            <div class="grow" style="min-width:0">
              <div class="small bold clip">${esc(r.name)} ${r.id === store.user?.id ? '<span class="badge badge-brand">我</span>' : ''}</div>
              <div class="tiny muted">${esc(r.department_name || '—')}</div>
            </div>
            <b class="mono">${r.points}</b>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
  $('#pt').append(renderTable({
    columns: [
      { key: 'created_at', label: '时间', field: { type: 'datetime' } },
      { key: 'reason', label: '事由' },
      { key: 'points', label: '积分', align: 'right', render: (v) => `<b style="color:${v >= 0 ? 'var(--ok)' : 'var(--danger)'}">${v > 0 ? '+' : ''}${v}</b>` }
    ],
    rows: mine.rows, compact: true, empty: '还没有积分记录'
  }));
};

/* ------------------------------------------------------------------ 通知 */

VIEWS.notifications = async function () {
  const r = await api.get('/notifications', { pageSize: 50 });
  content.innerHTML = `
  <div class="page-head"><div><h2>通知中心</h2><p>共 ${r.total} 条，未读 ${r.unread} 条</p></div>
    <button class="btn" id="btn-readall">全部标记已读</button></div>
  <div class="col" style="gap:9px" id="nl">
    ${r.items.map((n) => `
      <div class="notif ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
        <span class="ic">${notifIcon(n.type)}</span>
        <div class="grow" style="min-width:0">
          <div class="tt">${esc(n.title)}</div>
          <div class="ds">${esc(n.content || '')}</div>
        </div>
        <span class="tm">${esc(fmt.rel(n.created_at))}</span>
      </div>`).join('') || emptyHtml('还没有通知', '', '🔔')}
  </div>`;
  $('#btn-readall').addEventListener('click', async () => {
    await api.post('/notifications/read', {});
    toastOk('已全部标记为已读');
    route();
  });
  $('#nl').addEventListener('click', async (e) => {
    const n = e.target.closest('[data-id]');
    if (!n) return;
    try { await api.post('/notifications/read', { ids: [Number(n.dataset.id)] }); } catch { /* ignore */ }
    if (n.dataset.link) location.href = n.dataset.link;
    else route();
  });

  function notifIcon(t) {
    return { system: '⚙️', event: '🎪', review: '🔍', course: '📚', task: '📌', asset: '📦', announcement: '📢', leave: '🏷️', document: '📄' }[t] || '🔔';
  }
};

/* ------------------------------------------------------------------ 公告 */

VIEWS.announcements = async function () {
  const d = (await api.get('/my/announcements')).data;
  content.innerHTML = `
  <div class="page-head"><div><h2>公告</h2><p>共 ${d.items.length} 条，未读 ${d.unread} 条</p></div>
    <button class="btn" id="btn-allread">全部标记已读</button></div>
  <div class="col" style="gap:var(--sp-3)" id="al">
    ${d.items.map((a) => `
      <div class="card card-pad ${a.read_at ? '' : ''}" style="${a.read_at ? '' : 'border-left:3px solid var(--brand)'}">
        <div class="row-between" style="gap:12px;align-items:flex-start">
          <div class="grow">
            <div class="row-wrap" style="gap:8px;margin-bottom:6px">
              ${badge(a.level)}
              ${a.is_pinned ? '<span class="badge badge-brand">置顶</span>' : ''}
              ${a.read_at ? '<span class="badge badge-line">已读</span>' : '<span class="badge badge-warn">未读</span>'}
              <span class="tiny muted">${esc(fmt.dt(a.publish_at || a.created_at))}</span>
              ${a.expire_at ? `<span class="tiny muted">· ${esc(fmt.date(a.expire_at))} 失效</span>` : ''}
            </div>
            <h4 style="margin:0 0 6px">${esc(a.title)}</h4>
            <div class="md small" data-body="${a.id}" style="display:none">${mdLite(a.content)}</div>
            <button class="btn btn-sm btn-ghost" data-toggle="${a.id}">展开正文</button>
          </div>
          ${a.read_at ? '' : `<button class="btn btn-sm btn-primary nowrap" data-read="${a.id}">标记已读</button>`}
        </div>
      </div>`).join('') || emptyHtml('暂无公告', '', '📢')}
  </div>`;

  content.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const body = $(`[data-body="${tg.dataset.toggle}"]`);
      const show = body.style.display === 'none';
      body.style.display = show ? 'block' : 'none';
      tg.textContent = show ? '收起' : '展开正文';
      return;
    }
    const rd = e.target.closest('[data-read]');
    if (rd) {
      try { await api.post(`/announcements/${rd.dataset.read}/read`, {}); toastOk('已标记为已读'); route(); }
      catch (err) { toastErr(err.message); }
    }
  });
  $('#btn-allread').addEventListener('click', async () => {
    for (const a of d.items.filter((x) => !x.read_at)) {
      try { await api.post(`/announcements/${a.id}/read`, {}); } catch { /* ignore */ }
    }
    toastOk('已全部标记为已读');
    route();
  });

  function mdLite(src) {
    return esc(String(src || '')).replace(/\n/g, '<br>');
  }
};

/* ------------------------------------------------------------------ 借用 */

VIEWS.loans = async function () {
  const [loans, assets] = await Promise.all([
    api.get('/me/loans').then((r) => r.data),
    api.get('/me/assets').then((r) => r.data)
  ]);
  content.innerHTML = `
  <div class="page-head"><div><h2>物资借用</h2><p>借用需要管理员审批，请按时归还</p></div></div>
  <div class="grid g2" style="align-items:start">
    <div class="card">
      <div class="card-hd"><h4>我的借用记录</h4></div>
      <div id="lt"></div>
    </div>
    <div class="card">
      <div class="card-hd"><h4>可借物资</h4></div>
      <div class="card-bd" style="padding-top:var(--sp-3)">
        ${assets.map((a) => `
          <div class="row" style="gap:11px;padding:9px 0;border-bottom:1px dashed var(--line)">
            <div class="grow" style="min-width:0">
              <div class="small bold clip">${esc(a.name)}</div>
              <div class="tiny muted">${esc(a.code || '—')} · ${esc(a.spec || '')} · ${esc(a.location || '')}</div>
            </div>
            <span class="seat">可用 <b class="${a.available_qty > 0 ? '' : 'muted'}">${a.available_qty}</b>/${a.quantity} ${esc(a.unit)}</span>
            <button class="btn btn-sm btn-primary" data-borrow="${a.id}" ${a.available_qty > 0 && a.status !== 'maintenance' ? '' : 'disabled'}>申请借用</button>
          </div>`).join('') || emptyHtml('暂无可借物资', '', '📦')}
      </div>
    </div>
  </div>`;

  $('#lt').append(renderTable({
    columns: [
      { key: 'asset_name', label: '物资' },
      { key: 'quantity', label: '数量', align: 'right' },
      { key: 'borrowed_at', label: '借出', render: (v) => esc(v || '—') },
      { key: 'due_at', label: '应归还', render: (v, r) => v ? `<span style="color:${r.overdue ? 'var(--danger)' : ''}">${esc(v)}</span>` : '—' },
      { key: 'status', label: '状态', field: { type: 'select' } }
    ],
    rows: loans, compact: true, empty: '还没有借用记录'
  }));

  content.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-borrow]');
    if (!b) return;
    const asset = assets.find((a) => a.id === Number(b.dataset.borrow));
    const qty = el('input', { class: 'input', type: 'number', value: '1', min: '1', max: String(asset.available_qty) });
    const due = el('input', { class: 'input', type: 'date', value: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) });
    const purpose = el('input', { class: 'input', placeholder: '用来做什么' });
    const body = el('div', { class: 'form-grid' });
    body.append(
      el('div', { class: 'field span2' }, [el('label', { text: '物资' }), el('div', { class: 'panel', text: `${asset.name}（可用 ${asset.available_qty} ${asset.unit}）` })]),
      el('div', { class: 'field' }, [el('label', { text: '借用数量' }), qty]),
      el('div', { class: 'field' }, [el('label', { text: '预计归还' }), due]),
      el('div', { class: 'field span2' }, [el('label', { text: '用途' }), purpose])
    );
    const { root, close } = modal({ title: '申请借用', body, size: 'narrow', footer: '' });
    const ft = el('div', { class: 'modal-ft' });
    const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '提交申请' });
    c1.addEventListener('click', close);
    ok.addEventListener('click', async () => {
      try {
        await api.post(`/assets/${asset.id}/loan`, { quantity: Number(qty.value), due_at: due.value, purpose: purpose.value });
        toastOk('借用申请已提交，等待审批');
        close(); route();
      } catch (err) { toastErr(err.message); }
    });
    ft.append(c1, ok); root.append(ft);
  });
};

/* ------------------------------------------------------------------ 投票 */

VIEWS.polls = async function () {
  const polls = (await api.get('/polls')).data || [];
  content.innerHTML = `
  <div class="page-head"><div><h2>投票</h2><p>参与社团决策，投票后不可修改</p></div></div>
  <div class="grid g2" style="align-items:start">
    ${polls.map((p) => pollCard(p)).join('') || emptyHtml('暂时没有投票', '', '🗳️')}
  </div>`;

  content.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-vote]');
    if (!btn) return;
    const pid = Number(btn.dataset.vote);
    const poll = polls.find((x) => x.id === pid);
    const chosen = [];
    content.querySelectorAll(`input[name="poll-${pid}"]:checked`).forEach((i) => chosen.push(i.value));
    if (!chosen.length) return toastErr('请至少选择一项');
    if (poll.type === 'single' && chosen.length > 1) return toastErr('这是单选投票');
    if (!(await confirmDialog('投票后不可修改，确定提交吗？', { okText: '提交投票' }))) return;
    try {
      await api.post(`/polls/${pid}/vote`, { choices: chosen });
      toastOk('投票成功');
      route();
    } catch (err) { toastErr(err.message); }
  });

  function pollCard(p) {
    const totalVotes = p.total_votes || 1;
    return `<div class="card card-pad">
      <div class="row-between" style="gap:12px;align-items:flex-start">
        <div class="grow">
          <div class="row-wrap" style="gap:8px;margin-bottom:6px">
            ${badge(p.status)}${p.anonymous ? '<span class="badge">匿名</span>' : ''}<span class="badge badge-line">${p.type === 'single' ? '单选' : '多选'}</span>
          </div>
          <h4 style="margin:0 0 4px">${esc(p.title)}</h4>
          <div class="small muted">${esc(p.description || '')}</div>
          <div class="tiny muted" style="margin-top:6px">
            参与率 ${p.participation}%（${p.total_votes}/${p.eligible}）${p.end_at ? ` · ${esc(fmt.date(p.end_at))} 截止` : ''}
          </div>
        </div>
        ${p.voted ? '<span class="badge badge-ok nowrap">已投票</span>' : ''}
      </div>
      <div class="col" style="gap:9px;margin-top:var(--sp-4)">
        ${p.options.map((o) => {
      const n = p.counts[o.key] || 0;
      const pct = Math.round((n / totalVotes) * 100);
      const mine = (p.my_choices || []).includes(o.key);
      return `<label style="display:block;cursor:${p.voted || p.closed ? 'default' : 'pointer'}">
            <div class="row" style="gap:9px">
              ${p.voted || p.closed ? '' : `<input type="${p.type === 'single' ? 'radio' : 'checkbox'}" name="poll-${p.id}" value="${esc(o.key)}">`}
              <span class="grow small ${mine ? 'bold' : ''}">${esc(o.label)} ${mine ? '<span class="badge badge-brand">我的选择</span>' : ''}</span>
              <span class="tiny muted mono">${n} 票 · ${pct}%</span>
            </div>
            ${p.voted || p.closed ? `<div class="bar" style="margin-top:5px"><i style="width:${pct}%"></i></div>` : ''}
          </label>`;
    }).join('')}
      </div>
      ${p.voted || p.closed ? '' : `<button class="btn btn-primary btn-block" style="margin-top:var(--sp-4)" data-vote="${p.id}">提交投票</button>`}
    </div>`;
  }
};

/* ------------------------------------------------------------------ 会议 */

VIEWS.meetings = async function () {
  const rows = (await api.get('/me/meetings')).data || [];
  content.innerHTML = `
  <div class="page-head"><div><h2>会议</h2><p>你参与的会议与纪要</p></div></div>
  <div class="col" style="gap:var(--sp-3)">
    ${rows.map((m) => `
      <div class="card card-pad">
        <div class="row-between" style="gap:12px;align-items:flex-start">
          <div>
            <div class="row-wrap" style="gap:8px;margin-bottom:5px">
              <span class="badge badge-line">${esc(m.type)}</span>${badge(m.status)}
              <span class="tiny muted">${esc(m.date || '待定')} ${esc(m.start_time || '')}${m.end_time ? '–' + esc(m.end_time) : ''} · ${esc(m.venue || '待定')}</span>
            </div>
            <h4 style="margin:0">${esc(m.title)}</h4>
            <div class="tiny muted" style="margin-top:4px">主持人：${esc(m.host_name || '—')}</div>
          </div>
        </div>
        ${m.agenda ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">会议议程</summary><div class="md small" style="margin-top:8px">${md(m.agenda)}</div></details>` : ''}
        ${m.minutes ? `<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">会议纪要</summary><div class="md small" style="margin-top:8px">${md(m.minutes)}</div></details>` : ''}
      </div>`).join('') || emptyHtml('还没有你参与的会议', '', '🧾')}
  </div>`;

  function md(src) {
    return esc(String(src || '')).replace(/^## (.*)$/gm, '<b>$1</b>').replace(/\n/g, '<br>');
  }
};

/* ------------------------------------------------------------------ 值班 */

VIEWS.duty = async function () {
  const d = (await api.get('/me/duty')).data;
  content.innerHTML = `
  <div class="page-head"><div><h2>值班</h2><p>未来的值班安排</p></div></div>
  <div class="card" style="margin-bottom:var(--sp-4)">
    <div class="card-hd"><h4>待值班（${d.upcoming.length}）</h4></div>
    <div class="card-bd" style="padding-top:var(--sp-3)">
      ${d.upcoming.length ? `<div class="grid g3">${d.upcoming.map((r) => `
        <div class="panel">
          <div class="bold">${esc(r.date)}</div>
          <div class="row-wrap" style="gap:8px;margin-top:5px">${badge(r.status)}<span class="badge badge-line">${esc(r.shift)}</span></div>
          <div class="small muted" style="margin-top:6px">${esc(r.location || '未指定地点')}</div>
          ${r.note ? `<div class="tiny muted">${esc(r.note)}</div>` : ''}
        </div>`).join('')}</div>` : emptyHtml('暂时没有安排', '好好休息', '🕐')}
    </div>
  </div>
  <div class="card">
    <div class="card-hd"><h4>历史值班</h4></div>
    <div id="dt"></div>
  </div>`;
  $('#dt').append(renderTable({
    columns: [
      { key: 'date', label: '日期' }, { key: 'shift', label: '时段' },
      { key: 'location', label: '地点' }, { key: 'status', label: '状态', field: { type: 'select' } },
      { key: 'note', label: '备注' }
    ],
    rows: d.history, compact: true, empty: '暂无历史记录'
  }));
};

/* ------------------------------------------------------------------ 个人资料 */

VIEWS.profile = async function () {
  const p = (await api.get('/me/profile')).data;
  content.innerHTML = `
  <div class="page-head"><div><h2>个人资料</h2><p>账号 ${esc(p.username)} · 入社于 ${esc(p.joined_at || '—')}</p></div></div>
  <div class="me-grid">
    <div class="col" style="gap:var(--sp-4)">
      <div class="card profile-card">
        ${avatarHtml(p.name, p.avatar, 'avatar-xl')}
        <div class="nm">${esc(p.name)}</div>
        <div class="pos">${esc(p.position || '')}</div>
        <div class="row-wrap" style="justify-content:center;gap:6px;margin-top:10px">
          <span class="badge badge-brand">${esc(ROLE_LABEL[p.role] || p.role)}</span>
          ${p.department_name ? `<span class="badge">${esc(p.department_icon || '')} ${esc(p.department_name)}</span>` : ''}
        </div>
        <div class="col" style="gap:8px;margin-top:var(--sp-4)">
          <button class="btn" id="btn-avatar">更换头像</button>
        </div>
      </div>
      <div class="card card-pad">
        <h4 style="margin-bottom:12px">修改密码</h4>
        <div class="col" style="gap:10px">
          <input class="input" type="password" id="pw-old" placeholder="原密码" autocomplete="current-password">
          <input class="input" type="password" id="pw-new" placeholder="新密码（至少 6 位）" autocomplete="new-password">
          <input class="input" type="password" id="pw-new2" placeholder="确认新密码" autocomplete="new-password">
          <button class="btn btn-primary" id="btn-pw">更新密码</button>
          <p class="tiny muted" style="margin:0">修改密码后，其他设备上的登录会被退出。</p>
        </div>
      </div>
    </div>
    <div class="card card-pad">
      <h4 style="margin-bottom:var(--sp-4)">基本信息</h4>
      <div class="form-grid">
        <div class="field"><label>姓名</label><input class="input" id="p-name" value="${esc(p.name || '')}"></div>
        <div class="field"><label>学号</label><input class="input" id="p-no" value="${esc(p.student_no || '')}"></div>
        <div class="field"><label>专业</label><input class="input" id="p-major" value="${esc(p.major || '')}"></div>
        <div class="field"><label>年级</label><input class="input" id="p-grade" value="${esc(p.grade || '')}"></div>
        <div class="field"><label>邮箱</label><input class="input" id="p-email" value="${esc(p.email || '')}"></div>
        <div class="field"><label>手机</label><input class="input" id="p-phone" value="${esc(p.phone || '')}"></div>
        <div class="field"><label>QQ</label><input class="input" id="p-qq" value="${esc(p.qq || '')}"></div>
        <div class="field"><label>微信</label><input class="input" id="p-wechat" value="${esc(p.wechat || '')}"></div>
        <div class="field span2"><label>个人简介</label><textarea class="textarea" id="p-bio" rows="4">${esc(p.bio || '')}</textarea></div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:var(--sp-4)">
        <button class="btn btn-primary" id="btn-save">保存资料</button>
      </div>
      <div class="alert alert-info" style="margin-top:var(--sp-4)">
        角色、部门与职务由管理员维护；如需调整请联系部门负责人。
      </div>
    </div>
  </div>`;

  $('#btn-save').addEventListener('click', async () => {
    try {
      await api.patch('/auth/profile', {
        name: $('#p-name').value.trim(), student_no: $('#p-no').value.trim(),
        major: $('#p-major').value.trim(), grade: $('#p-grade').value.trim(),
        email: $('#p-email').value.trim(), phone: $('#p-phone').value.trim(),
        qq: $('#p-qq').value.trim(), wechat: $('#p-wechat').value.trim(),
        bio: $('#p-bio').value.trim()
      });
      toastOk('资料已保存');
      await loadMe();
      paintUser();
    } catch (e) { toastErr(e.message); }
  });

  $('#btn-avatar').addEventListener('click', () => {
    const file = el('input', { type: 'file', accept: 'image/*' });
    file.addEventListener('change', async () => {
      if (!file.files.length) return;
      try {
        const r = await api.upload(file.files[0], 'public');
        const rec = Array.isArray(r.data) ? r.data[0] : r.data;
        await api.patch('/auth/profile', { avatar: rec.url });
        toastOk('头像已更新');
        await loadMe();
        paintUser();
        route();
      } catch (e) { toastErr(e.message); }
    });
    file.click();
  });

  $('#btn-pw').addEventListener('click', async () => {
    const o = $('#pw-old').value; const n = $('#pw-new').value; const n2 = $('#pw-new2').value;
    if (n.length < 6) return toastErr('新密码至少 6 位');
    if (n !== n2) return toastErr('两次输入的新密码不一致');
    try {
      await api.post('/auth/password', { old_password: o, new_password: n });
      toastOk('密码已更新，请重新登录');
      setTimeout(() => { location.href = '/login.html'; }, 900);
    } catch (e) { toastErr(e.message); }
  });
};

/* ------------------------------------------------------------------ 用户界面 */

function paintUser() {
  const u = store.user;
  if (!u) return;
  $('#me-name').textContent = u.name || u.username;
  $('#me-role').textContent = `${ROLE_LABEL[u.role] || u.role}${u.position ? ' · ' + u.position : ''}`;
  const av = $('#me-avatar');
  if (u.avatar) av.innerHTML = `<img src="${esc(u.avatar)}" alt="">`;
  else av.textContent = String(u.name || u.username || '·').slice(0, 1);
}

/* ------------------------------------------------------------------ 启动 */

async function boot() {
  initTheme();
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-side').addEventListener('click', () => {
    const side = $('#side');
    side.classList.toggle('open');
    if (side.classList.contains('open')) {
      const mask = el('div', { class: 'side-mask' });
      mask.addEventListener('click', () => { side.classList.remove('open'); mask.remove(); });
      document.body.append(mask);
    } else $('.side-mask')?.remove();
  });
  $('#btn-bell').addEventListener('click', () => { location.hash = '#notifications'; });

  $('#btn-logout').addEventListener('click', async () => {
    if (!(await confirmDialog('确定退出登录吗？', { okText: '退出' }))) return;
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    location.href = '/';
  });

  const me = await loadMe();
  if (!me) { location.href = `/login.html?next=${encodeURIComponent('/member.html')}`; return; }
  if (me.status === 'pending') {
    content.innerHTML = `<div class="card card-pad">${emptyHtml('账号待审核', '你的账号正在等待管理员审核，通过后即可使用全部社内功能。', '⏳')}</div>`;
    return;
  }

  await loadSite();
  const st = store.settings || {};
  if (st.site_name) { $('#side-name').textContent = st.site_name; $('#side-mark').textContent = st.logo_text || st.site_name.slice(0, 1); }
  await loadLookups();
  paintUser();
  buildMenu();

  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#overview';
  await route();
  badgeCounts();
  setInterval(badgeCounts, 60000);
}

boot();
