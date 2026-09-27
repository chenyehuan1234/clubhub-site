/* ============================================================================
 *  admin.js — 管理后台外壳
 *  仪表盘 / 路由 / 菜单 / 排课 / 资料库 / 站点设置 / 日志 / 备份 / 审核流程
 * ==========================================================================*/

import { api } from './api.js';
import {
  store, loadMe, loadSite, loadMeta, loadLookups, initTheme, toggleTheme,
  fmt, has, ROLE_LABEL, lookupName
} from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, toastWarn, modal, drawer, confirmDialog,
  badge, emptyHtml, loadingHtml, esc, avatarHtml, renderForm, renderTable, renderPager,
  cellValue, cover, promptDialog, pickMedia
} from './ui.js';
import { renderCrud } from './admin-crud.js';
import { renderWeek, openSession, openGenerateSessions } from './schedule-ui.js';
import { renderDocBrowser } from './docs-ui.js';
import { viewTaskBoard, viewAssets, viewDuty, viewMeetings, viewPolls, openTaskForm } from './admin-ops.js';
import { viewFinance } from './admin-finance.js';
import { viewReports, viewCalendar } from './admin-report.js';
import { lineChart, donut, barChart, rankBars } from './charts.js';

const content = $('#content');

/* ------------------------------------------------------------------ 菜单 */

const MENU = [
  { key: 'dashboard', ic: '📊', label: '仪表盘', perm: 'member.read' },
  { group: '组织' },
  { key: 'members', ic: '👥', label: '成员管理', perm: 'member.read' },
  { key: 'alumni', ic: '🎓', label: '往届成员', perm: 'member.read' },
  { key: 'departments', ic: '🏛️', label: '部门管理', perm: 'member.read' },
  { key: 'roles', ic: '🔑', label: '角色权限', perm: 'admin.manage' },
  { group: '内容' },
  { key: 'events', ic: '🎪', label: '活动管理', perm: 'event.read' },
  { key: 'projects', ic: '🎨', label: '作品审核', perm: 'project.write' },
  { key: 'gallery', ic: '🖼️', label: '宣传图栏', perm: 'news.read' },
  { key: 'news', ic: '📰', label: '新闻中心', perm: 'news.read' },
  { key: 'announcements', ic: '📢', label: '公告管理', perm: 'announcement.read' },
  { group: '互动' },
  { key: 'applications', ic: '📝', label: '入社申请', perm: 'application.read' },
  { key: 'messages', ic: '💬', label: '留言管理', perm: 'message.read' },
  { key: 'notifications', ic: '🔔', label: '通知推送', perm: 'notification.push' },
  { group: '排课' },
  { key: 'courses', ic: '📚', label: '课程管理', perm: 'course.read' },
  { key: 'schedule', ic: '🗓️', label: '课表排课', perm: 'session.read' },
  { key: 'venues', ic: '🏫', label: '场地管理', perm: 'course.read' },
  { key: 'course_enrollments', ic: '✍️', label: '选课名单', perm: 'course.read' },
  { key: 'leave_requests', ic: '🏷️', label: '请假审批', perm: 'leave.request' },
  { key: 'attendance-stats', ic: '📈', label: '出勤统计', perm: 'attendance.read' },
  { group: '资料' },
  { key: 'documents', ic: '🗂️', label: '资料库', perm: 'document.read' },
  { key: 'doc_folders', ic: '📁', label: '资料目录', perm: 'document.read' },
  { group: '运营' },
  { key: 'tasks', ic: '✅', label: '任务看板', perm: 'task.read' },
  { key: 'assets', ic: '📦', label: '物资借还', perm: 'asset.read' },
  { key: 'duty', ic: '🕐', label: '值班排班', perm: 'duty.read' },
  { key: 'meetings', ic: '🧾', label: '会议纪要', perm: 'meeting.read' },
  { key: 'polls', ic: '🗳️', label: '投票决策', perm: 'poll.read' },
  { group: '财务' },
  { key: 'finance', ic: '💰', label: '财务账目', perm: 'finance.read' },
  { group: '数据与系统' },
  { key: 'calendar', ic: '📅', label: '日历', perm: 'session.read' },
  { key: 'reports', ic: '📉', label: '报表中心', perm: 'report.view' },
  { key: 'uploads', ic: '🗃️', label: '素材库', perm: 'upload' },
  { key: 'activity_logs', ic: '📜', label: '操作日志', perm: 'log.read' },
  { key: 'settings', ic: '⚙️', label: '站点设置', perm: 'site.edit' },
  { key: 'backup', ic: '💾', label: '数据备份', perm: 'backup' }
];

const TITLES = {
  dashboard: ['仪表盘', '社团运营总览'],
  roles: ['角色与权限', '查看各角色的权限范围'],
  schedule: ['课表排课', '周课表、冲突检测与点名'],
  'attendance-stats': ['出勤统计', '按人与按课统计出勤率'],
  documents: ['资料库', '目录、版本、权限与预览'],
  announcements: ['公告管理', '定向投放与已读回执'],
  notifications: ['通知推送', '向指定范围发送站内通知'],
  settings: ['站点设置', '站名、首页文案、联系方式与积分规则'],
  backup: ['数据备份', '导出全量数据与数据库文件']
};

/* ------------------------------------------------------------------ 外壳 */

function buildMenu() {
  const box = $('#side-menu');
  box.innerHTML = MENU.filter((m) => m.group || has(m.perm)).map((m) => {
    if (m.group) return `<div class="side-group">${esc(m.group)}</div>`;
    return `<a class="side-item" data-key="${m.key}" href="#${m.key}">
      <span class="ic">${m.ic}</span><span class="nm">${esc(m.label)}</span>
      <span class="cnt hide" data-cnt="${m.key}"></span></a>`;
  }).join('');
}

function setActive(key) {
  $$('#side-menu .side-item').forEach((a) => a.classList.toggle('on', a.dataset.key === key));
  const label = MENU.find((m) => m.key === key)?.label || key;
  const t = TITLES[key] || [label, ''];
  $('#page-title').textContent = t[0];
  $('#page-sub').textContent = t[1] || '';
  document.title = `${t[0]} · 管理后台`;
}

async function badgeCounts() {
  try {
    const r = await fetch('/api/admin/dashboard', { credentials: 'same-origin' }).then((x) => x.json());
    if (!r.ok) return;
    const todos = r.data.todos;
    const set = (key, n) => {
      const node = $(`[data-cnt="${key}"]`);
      if (!node) return;
      node.textContent = n ? String(n) : '';
      node.classList.toggle('hide', !n);
      node.classList.toggle('alert', n > 0);
    };
    set('applications', todos.applications);
    set('projects', todos.projects);
    set('messages', todos.messages);
    set('leave_requests', todos.leaves);
    set('assets', todos.loans + todos.overdueLoans);
    const total = todos.applications + todos.projects + todos.messages + todos.leaves + todos.loans;
    const bell = $('#bell-count');
    bell.textContent = total > 99 ? '99+' : String(total);
    bell.classList.toggle('hide', !total);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ 路由 */

const VIEWS = {
  dashboard: viewDashboard,
  schedule: viewSchedule,
  'attendance-stats': viewAttendanceStats,
  documents: viewDocuments,
  announcements: viewAnnouncements,
  notifications: viewNotifications,
  settings: viewSettings,
  backup: viewBackup,
  roles: viewRoles,
  tasks: viewTaskBoard,
  assets: viewAssets,
  duty: viewDuty,
  meetings: viewMeetings,
  polls: viewPolls,
  finance: viewFinance,
  reports: viewReports,
  calendar: viewCalendar,
  members: viewMembers,
  events: viewEvents,
  projects: viewProjects,
  applications: viewApplications,
  messages: viewMessages,
  courses: viewCourses,
  leave_requests: viewLeaveRequests,
  uploads: viewUploads
};

const CRUD_ONLY = ['departments', 'alumni', 'gallery', 'news', 'venues', 'course_enrollments', 'doc_folders', 'activity_logs'];

async function route() {
  const key = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'dashboard';
  if (CRUD_ONLY.includes(key)) {
    setActive(key);
    content.innerHTML = '';
    await renderCrud(content, key);
  } else if (VIEWS[key]) {
    setActive(key);
    content.innerHTML = '';
    await VIEWS[key](content);
  } else {
    setActive('dashboard');
    content.innerHTML = '';
    await viewDashboard();
  }
  badgeCounts();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ 仪表盘 */

async function viewDashboard() {
  const d = (await api.get('/admin/dashboard')).data;
  const c = d.counts; const t = d.todos;

  content.innerHTML = `
  <div class="page-head">
    <div><h2>你好，${esc(d.me.name)}</h2>
      <p>${esc(d.me.roleLabel)}${store.user.department_id ? ' · ' + esc(lookupName('departments', store.user.department_id)) : ''} · 欢迎回到社团后台</p></div>
    <div class="toolbar">
      <button class="btn" id="d-refresh">刷新</button>
      <button class="btn btn-primary" id="d-quick">＋ 快速新建</button>
    </div>
  </div>

  <div class="dash-grid" style="margin-bottom:var(--sp-4)">
    ${statCard('在册社员', c.members, '👥', `${t.pendingMembers} 人待审核`)}
    ${statCard('进行中活动', c.activeEvents, '🎪', `共 ${c.events} 场`)}
    ${statCard('进行中课程', c.courses, '📚', `本周 ${c.sessionsThisWeek} 次课`)}
    ${statCard('已发布资料', c.documents, '📄', `${c.projects} 件作品`)}
  </div>

  <div class="dash-2" style="margin-bottom:var(--sp-4)">
    <div class="card">
      <div class="card-hd"><h4>近 30 天报名趋势</h4>
        <span class="small muted">共 ${d.signupTrend.reduce((a, b) => a + b.count, 0)} 次报名</span></div>
      <div class="card-bd">${lineChart(d.signupTrend.map((x) => ({ label: x.date, value: x.count })), { height: 220 })}</div>
    </div>
    <div class="card">
      <div class="card-hd"><h4>待办事项</h4><span class="small muted">需要你处理</span></div>
      <div class="card-bd" style="padding-top:var(--sp-3)">
        <div class="col" style="gap:9px">
          ${todo('#applications', t.applications, '入社申请待审核', '📝')}
          ${todo('#projects', t.projects, '作品待审核', '🎨')}
          ${todo('#messages', t.messages, '留言待回复', '💬')}
          ${todo('#leave_requests', t.leaves, '请假待审批', '🏷️')}
          ${todo('#assets', t.loans, '借用待审批', '📦')}
          ${todo('#assets', t.overdueLoans, '物资逾期未还', '⏰')}
          ${todo('#tasks', t.overdueTasks, '任务已逾期', '⚠️')}
          ${todo('#members', t.pendingMembers, '成员待激活', '👤')}
        </div>
      </div>
    </div>
  </div>

  <div class="dash-2" style="margin-bottom:var(--sp-4)">
    <div class="card">
      <div class="card-hd"><h4>即将开始的活动</h4><a class="btn btn-sm" href="#events">全部 →</a></div>
      <div id="dash-events"></div>
    </div>
    <div class="card">
      <div class="card-hd"><h4>部门人数</h4></div>
      <div class="card-bd">${d.deptDistribution.length ? donut(d.deptDistribution.map((x) => ({ label: x.name, value: x.count })), { size: 160, thickness: 22, centerLabel: '总人数' }) : '<div class="muted small">暂无部门</div>'}</div>
    </div>
  </div>

  <div class="dash-2" style="margin-bottom:var(--sp-4)">
    <div class="card">
      <div class="card-hd"><h4>最近操作</h4><a class="btn btn-sm" href="#activity_logs">日志 →</a></div>
      <div class="card-bd" style="padding-top:var(--sp-3)">
        ${d.recentLogs.map((l) => `<div class="row-between" style="gap:10px;padding:6px 0;border-bottom:1px dashed var(--line)">
          <span class="small clip"><b>${esc(l.username)}</b> ${esc(actionText(l.action))} ${esc(targetText(l.target_type))}</span>
          <span class="tiny muted nowrap">${esc(fmt.rel(l.created_at))}</span></div>`).join('') || '<div class="muted small">暂无日志</div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><h4>最近的入社申请</h4><a class="btn btn-sm" href="#applications">全部 →</a></div>
      <div class="card-bd" style="padding-top:var(--sp-3)">
        ${d.recentApplications.map((a) => `<div class="row-between" style="gap:10px;padding:6px 0;border-bottom:1px dashed var(--line)">
          <span class="small"><b>${esc(a.name)}</b> <span class="muted">${esc(a.major || '')}</span></span>
          <span class="row" style="gap:6px">${badge(a.status)}<span class="tiny muted nowrap">${esc(fmt.rel(a.created_at))}</span></span></div>`).join('') || '<div class="muted small">暂无申请</div>'}
      </div>
    </div>
  </div>

  <div class="dash-2">
    <div class="card">
      <div class="card-hd"><h4>本周课程</h4><a class="btn btn-sm" href="#schedule">课表 →</a></div>
      <div id="dash-sessions"></div>
    </div>
    <div class="card">
      <div class="card-hd"><h4>最新留言</h4><a class="btn btn-sm" href="#messages">全部 →</a></div>
      <div class="card-bd" style="padding-top:var(--sp-3)">
        ${d.latestMessages.map((m) => `<div style="padding:7px 0;border-bottom:1px dashed var(--line)">
          <div class="row-between"><b class="small">${esc(m.name)}</b><span class="tiny muted">${esc(fmt.rel(m.created_at))}</span></div>
          <div class="small muted clamp2">${esc(m.content)}</div></div>`).join('') || '<div class="muted small">暂无留言</div>'}
      </div>
    </div>
  </div>`;

  $('#dash-events').append(renderTable({
    columns: [
      { key: 'title', label: '活动' },
      { key: 'start_at', label: '时间', field: { type: 'datetime' } },
      { key: 'location', label: '地点' },
      { key: 'signed', label: '报名', align: 'right' }
    ],
    rows: d.upcomingEvents, compact: true, empty: '近期没有活动',
    onRow: (r) => location.hash = '#events'
  }));
  $('#dash-sessions').append(renderTable({
    columns: [
      { key: 'date', label: '日期' }, { key: 'start_time', label: '时间' },
      { key: 'course_title', label: '课程' }, { key: 'teacher_name', label: '讲师' },
      { key: 'venue_name', label: '场地' }, { key: 'status', label: '状态', field: { type: 'select' } }
    ],
    rows: d.upcomingSessions, compact: true, empty: '本周没有排课'
  }));

  $('#d-refresh').addEventListener('click', () => viewDashboard());
  $('#d-quick').addEventListener('click', () => {
    const items = [
      ['活动', () => renderCrud(content, 'events')],
      ['新闻', () => renderCrud(content, 'news')],
      ['公告', () => location.hash = '#announcements'],
      ['课程', () => renderCrud(content, 'courses')],
      ['任务', () => openTaskForm(null, () => viewDashboard())],
      ['资料', () => location.hash = '#documents'],
      ['通知', () => location.hash = '#notifications'],
      ['成员', () => renderCrud(content, 'members')]
    ].filter(([k]) => canCreate(k));
    const body = el('div', { class: 'row-wrap', style: { gap: '9px' } });
    for (const [label, fn] of items) {
      const b = el('button', { class: 'btn', type: 'button', text: `＋ ${label}` });
      b.addEventListener('click', () => { close(); fn(); });
      body.append(b);
    }
    const { close } = modal({ title: '快速新建', body, size: 'narrow' });
  });

  function canCreate(label) {
    const map = { 活动: 'event.write', 新闻: 'news.write', 公告: 'announcement.write', 课程: 'course.write', 任务: 'task.write', 资料: 'document.write', 通知: 'notification.push', 成员: 'member.write' };
    return has(map[label]);
  }
  function statCard(k, v, ic, sub) {
    return `<div class="card stat"><div class="stat-k">${ic} ${esc(k)}</div><div class="stat-v">${v}</div>
      <div class="stat-d">${esc(sub || '')}</div></div>`;
  }
  function todo(href, n, label, ic) {
    const tone = n ? (label.includes('逾期') ? 'alert' : 'warn') : 'ok';
    return `<a class="todo-item ${n ? tone : ''}" href="${href}">
      <span class="n">${ic}</span><span class="grow small">${esc(label)}</span>
      <b style="${n ? '' : 'color:var(--ink-4)'}">${n}</b></a>`;
  }
  function actionText(a) {
    return { create: '新建了', update: '修改了', delete: '删除了', login: '登录了', logout: '登出', review: '审核了', approve: '审批了', upload: '上传了', export: '导出了' }[a] || a;
  }
  function targetText(t2) {
    return {
      users: '成员', events: '活动', news: '新闻', projects: '作品', documents: '资料',
      course_sessions: '课次', courses: '课程', tasks: '任务', asset_loans: '借用', settings: '站点设置',
      announcements: '公告', applications: '入社申请', messages: '留言', finance_records: '财务', backup: '备份'
    }[t2] || t2 || '';
  }
}

/* ------------------------------------------------------------------ 排课 */

async function viewSchedule() {
  content.innerHTML = `
    <div class="page-head">
      <div><h2>课表排课</h2><p>点击课次可查看名单、点名、停课或调课</p></div>
      <div class="toolbar">
        <button class="btn" id="s-courses">课程管理</button>
        ${has('session.write') ? '<button class="btn btn-primary" id="s-new">＋ 单次排课</button>' : ''}
      </div>
    </div>
    <div id="week"></div>`;
  await renderWeek($('#week'), { editable: true });
  $('#s-courses').addEventListener('click', () => { location.hash = '#courses'; });
  $('#s-new')?.addEventListener('click', () => {
    const courses = store.lookups.courses || [];
    if (!courses.length) return toastWarn('请先创建课程');
    const sel = el('select', { class: 'select' });
    for (const c of courses) sel.append(el('option', { value: String(c.id), text: c.title }));
    const body = el('div', { class: 'field' }, [el('label', { text: '选择课程' }), sel]);
    const { root, close } = modal({ title: '新建单次课', body, size: 'narrow', footer: '' });
    const ft = el('div', { class: 'modal-ft' });
    const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '下一步' });
    c1.addEventListener('click', close);
    ok.addEventListener('click', () => {
      const course = courses.find((c) => String(c.id) === sel.value);
      close();
      renderCrud(content, 'course_sessions', {
        title: `新建课次 · ${course.title}`,
        initialState: { filters: { course_id: String(course.id) } },
        beforeSubmit: (b) => { b.course_id = course.id; }
      });
    });
    ft.append(c1, ok); root.append(ft);
  });
}

async function viewAttendanceStats() {
  content.innerHTML = `
    <div class="page-head">
      <div><h2>出勤统计</h2><p>按成员与按课程统计出勤情况</p></div>
      <div class="toolbar">
        <select class="select" id="a-course"><option value="">全部课程</option>
          ${(store.lookups.courses || []).map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select>
        <select class="select" id="a-dept"><option value="">全部部门</option>
          ${(store.lookups.departments || []).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="dash-grid" id="a-cards" style="margin-bottom:var(--sp-4)"></div>
    <div class="dash-2">
      <div class="card"><div class="card-hd"><h4>按成员</h4><span class="small muted">出勤率低于 60% 会标红</span></div><div id="a-user"></div></div>
      <div class="card"><div class="card-hd"><h4>按课程</h4></div><div id="a-course-tbl"></div></div>
    </div>
    <div class="card mt4"><div class="card-hd"><h4>缺勤预警</h4></div><div class="card-bd" id="a-warn"></div></div>`;

  async function load() {
    let d;
    try {
      d = (await api.get('/admin/schedule/stats', { course_id: $('#a-course').value, department_id: $('#a-dept').value })).data;
    } catch (e) { return toastErr(e.message); }
    const o = d.overview || {};
    const total = Number(o.total || 0);
    const rate = total ? Math.round(((Number(o.present || 0) + Number(o.late || 0)) / total) * 100) : 0;
    $('#a-cards').innerHTML = `
      <div class="card stat"><div class="stat-k">出勤记录</div><div class="stat-v">${total}</div></div>
      <div class="card stat"><div class="stat-k">整体出勤率</div><div class="stat-v" style="color:${rate >= 80 ? 'var(--ok)' : rate >= 60 ? 'var(--warn)' : 'var(--danger)'}">${rate}%</div></div>
      <div class="card stat"><div class="stat-k">缺席</div><div class="stat-v">${o.absent || 0}</div></div>
      <div class="card stat"><div class="stat-k">请假</div><div class="stat-v">${o.leave_cnt || 0}</div></div>`;

    $('#a-user').innerHTML = '';
    $('#a-user').append(renderTable({
      columns: [
        { key: 'name', label: '成员', render: (v, r) => `${avatarHtml(v, r.avatar, 'avatar-sm')} ${esc(v)}` },
        { key: 'department_name', label: '部门', render: (v) => esc(v || '—') },
        { key: 'total', label: '应出勤', align: 'right' },
        { key: 'present', label: '到课', align: 'right' },
        { key: 'absent', label: '缺席', align: 'right' },
        {
          key: 'rate', label: '出勤率', align: 'right',
          render: (v) => `<b style="color:${v >= 80 ? 'var(--ok)' : v >= 60 ? 'var(--warn)' : 'var(--danger)'}">${v}%</b>`
        }
      ],
      rows: d.byUser, compact: true, empty: '暂无出勤数据'
    }));

    $('#a-course-tbl').innerHTML = '';
    $('#a-course-tbl').append(renderTable({
      columns: [
        { key: 'title', label: '课程' }, { key: 'total', label: '记录', align: 'right' },
        { key: 'attended', label: '到课', align: 'right' }, { key: 'absent', label: '缺席', align: 'right' },
        { key: 'rate', label: '出勤率', align: 'right', render: (v) => `<b>${v}%</b>` }
      ],
      rows: d.byCourse, compact: true, empty: '暂无课程数据'
    }));

    $('#a-warn').innerHTML = d.warnings.length
      ? d.warnings.map((w) => `<div class="row-between small" style="padding:6px 0;border-bottom:1px dashed var(--line)">
          <span><b>${esc(w.name)}</b> <span class="muted">${esc(w.department_name || '')}</span></span>
          <span>缺席 <b style="color:var(--danger)">${w.absent}</b> 次 · 出勤率 <b>${w.rate}%</b></span></div>`).join('')
      : '<div class="muted small">没有出勤率过低的成员</div>';
  }

  $('#a-course').addEventListener('change', load);
  $('#a-dept').addEventListener('change', load);
  await load();
}

/* ------------------------------------------------------------------ 资料 */

async function viewDocuments() {
  content.innerHTML = '<div id="doc-host"></div>';
  await renderDocBrowser($('#doc-host'), { canManage: has('document.write') });
}

/* ------------------------------------------------------------------ 公告 */

async function viewAnnouncements() {
  content.innerHTML = `
    <div class="page-head">
      <div><h2>公告管理</h2><p>按范围定向投放，并跟踪已读回执</p></div>
      <div class="toolbar">
        <input class="input" id="an-q" placeholder="搜索公告…" style="min-width:190px">
        <select class="select" id="an-status"><option value="">全部状态</option>
          <option value="published">已发布</option><option value="draft">草稿</option><option value="archived">已归档</option></select>
        ${has('announcement.write') ? '<button class="btn btn-primary" id="an-new">＋ 起草公告</button>' : ''}
      </div>
    </div>
    <div id="an-list"></div>`;

  async function load() {
    const box = $('#an-list');
    box.innerHTML = loadingHtml();
    let d;
    try {
      d = await api.get('/admin/announcements', { q: $('#an-q').value.trim() || undefined, status: $('#an-status').value || undefined, pageSize: 30 });
    } catch (e) { box.innerHTML = emptyHtml('加载失败', e.message, '⚠'); return; }
    box.innerHTML = '';
    box.append(renderTable({
      columns: [
        { key: 'title', label: '标题' },
        { key: 'level', label: '级别', field: { type: 'select' } },
        { key: 'status', label: '状态', field: { type: 'select' } },
        { key: 'target_type', label: '范围', render: (v, r) => targetText(v, r) },
        { key: 'is_pinned', label: '置顶', field: { type: 'bool' } },
        { key: 'publish_at', label: '生效', field: { type: 'datetime' } },
        { key: 'expire_at', label: '失效', render: (v) => v ? esc(fmt.date(v)) : '<span class="muted">—</span>' },
        { key: 'author_name', label: '发布人', render: (v) => esc(v || '—') }
      ],
      rows: d.items, compact: true, empty: '还没有公告',
      actions: (r) => `
        ${r.status !== 'published' && has('announcement.write') ? `<button class="btn btn-sm btn-primary" data-pub="${r.id}">发布</button>` : ''}
        ${r.status === 'published' ? `<button class="btn btn-sm" data-reads="${r.id}">已读回执</button>` : ''}
        ${has('announcement.write') ? `<button class="btn btn-sm" data-edit="${r.id}">编辑</button>` : ''}
        ${has('announcement.write') ? `<button class="btn btn-sm btn-danger" data-del="${r.id}">删除</button>` : ''}`
    }));

    box.addEventListener('click', async (e) => {
      const pub = e.target.closest('[data-pub]');
      if (pub) {
        try {
          const r = await api.post(`/admin/announcements/${pub.dataset.pub}/publish`, {});
          toastOk(`已发布，已通知 ${r.data.notified} 人`);
          load(); badgeCounts();
        } catch (err) { toastErr(err.message); }
        return;
      }
      const rd = e.target.closest('[data-reads]');
      if (rd) { openReads(Number(rd.dataset.reads)); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const row = d.items.find((x) => Number(x.id) === Number(ed.dataset.edit));
        openAnnForm(row, load);
        return;
      }
      const dl = e.target.closest('[data-del]');
      if (dl) {
        if (!(await confirmDialog('删除这条公告？', { danger: true, okText: '删除' }))) return;
        try { await api.del(`/admin/announcements/${dl.dataset.del}`); toastOk('已删除'); load(); }
        catch (err) { toastErr(err.message); }
      }
    });
  }

  function targetText(v, r) {
    let ids = [];
    try { ids = JSON.parse(r.target_ids || '[]'); } catch { ids = []; }
    if (v === 'all') return '全体社员';
    if (v === 'role') return '角色：' + ids.map((x) => ROLE_LABEL[x] || x).join('、');
    if (v === 'department') return '部门：' + ids.map((x) => lookupName('departments', x)).join('、');
    if (v === 'users') return `指定 ${ids.length} 人`;
    return v;
  }

  async function openReads(id) {
    let d;
    try { d = (await api.get(`/admin/announcements/${id}/reads`)).data; } catch (e) { return toastErr(e.message); }
    const body = el('div');
    body.innerHTML = `
      <div class="row-wrap" style="gap:12px;margin-bottom:var(--sp-4)">
        <div class="panel" style="min-width:110px"><div class="muted small">覆盖</div><div style="font-size:20px;font-weight:700">${d.total}</div></div>
        <div class="panel" style="min-width:110px"><div class="muted small">已读</div><div style="font-size:20px;font-weight:700;color:var(--ok)">${d.read}</div></div>
        <div class="panel" style="min-width:110px"><div class="muted small">未读</div><div style="font-size:20px;font-weight:700;color:var(--warn)">${d.unread.length}</div></div>
        <div class="grow"><div class="bar" style="height:10px"><i style="width:${d.total ? Math.round((d.read / d.total) * 100) : 0}%"></i></div>
          <div class="small muted" style="margin-top:5px">已读率 ${d.total ? Math.round((d.read / d.total) * 100) : 0}%</div></div>
      </div>
      <div id="reads-table"></div>`;
    const { root } = modal({ title: `已读回执 · ${d.announcement.title}`, body, size: 'wide' });
    $('#reads-table').append(renderTable({
      columns: [
        { key: 'name', label: '成员', render: (v, r) => `${avatarHtml(v, '', 'avatar-sm')} ${esc(v)}` },
        { key: 'username', label: '账号' },
        { key: 'department_name', label: '部门', render: (v) => esc(v || '—') },
        { key: 'role', label: '角色', render: (v) => badge(v, ROLE_LABEL[v]) },
        { key: 'read', label: '状态', render: (v, r) => v ? `<span class="badge badge-ok">${esc(fmt.dt(r.read_at))}</span>` : '<span class="badge badge-warn">未读</span>' }
      ],
      rows: d.roster, compact: true, empty: '没有匹配的成员'
    }));
    const ft = el('div', { class: 'modal-ft' });
    const remind = el('button', { class: 'btn btn-primary', type: 'button', text: `催办 ${d.unread.length} 人` });
    remind.addEventListener('click', async () => {
      if (!d.unread.length) return toastWarn('所有人都已读');
      try {
        await api.post('/admin/notifications/push', {
          title: `请查收公告：${d.announcement.title}`,
          content: '这条公告你还没有标记已读，请到会员中心查看。',
          link: '/member.html#announcements',
          target_type: 'users',
          target_ids: d.unread.map((u) => u.id),
          type: 'announcement'
        });
        toastOk('已发送催办通知');
      } catch (e) { toastErr(e.message); }
    });
    if (d.unread.length) ft.append(remind);
    root.append(ft);
  }

  function openAnnForm(row, onDone) {
    const fields = {
      title: { type: 'text', label: '公告标题', required: true },
      level: { type: 'select', label: '级别', options: [['normal', '普通'], ['important', '重要'], ['urgent', '紧急']], default: 'normal' },
      target_type: { type: 'select', label: '投放范围', options: [['all', '全体社员'], ['role', '按角色'], ['department', '按部门'], ['users', '指定成员']], default: 'all' },
      target_ids: { type: 'json', label: '目标', help: 'role 填角色名数组如 ["leader"]；department / users 填 ID 数组如 [2,3]' },
      is_pinned: { type: 'bool', label: '置顶' },
      status: { type: 'select', label: '状态', options: [['draft', '草稿'], ['published', '已发布'], ['archived', '已归档']], default: 'draft' },
      publish_at: { type: 'datetime', label: '生效时间' },
      expire_at: { type: 'datetime', label: '失效时间' },
      content: { type: 'richtext', label: '公告正文（Markdown）' }
    };
    const form = renderForm(fields, row || { target_ids: [], level: 'normal' }, { cols: 2 });
    const { root, close } = modal({ title: row ? '编辑公告' : '起草公告', body: form.node, size: 'wide', footer: '' });
    const ft = el('div', { class: 'modal-ft' });
    const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const saveDraft = el('button', { class: 'btn', type: 'button', text: '存为草稿' });
    const pub = el('button', { class: 'btn btn-primary', type: 'button', text: '保存并发布' });
    c1.addEventListener('click', close);
    const submit = async (publish) => {
      let body;
      try { body = form.read(); } catch (e) { return toastErr(e.message); }
      if (!body.title) return toastErr('请填写公告标题');
      body.target_ids = body.target_ids || [];
      try {
        let id = row?.id;
        if (row) await api.patch(`/admin/announcements/${id}`, { ...body, status: publish ? undefined : 'draft' });
        else id = (await api.post('/admin/announcements', { ...body, status: publish ? 'draft' : 'draft' })).data.id;
        if (publish) {
          const r = await api.post(`/admin/announcements/${id}/publish`, {});
          toastOk(`已发布，覆盖 ${r.data.notified} 人`);
        } else toastOk('已保存为草稿');
        close(); onDone();
      } catch (e) { toastErr(e.message); }
    };
    saveDraft.addEventListener('click', () => submit(false));
    pub.addEventListener('click', () => submit(true));
    ft.append(c1, saveDraft, pub);
    root.append(ft);
  }

  $('#an-q').addEventListener('input', debounce(load, 320));
  $('#an-status').addEventListener('change', load);
  $('#an-new')?.addEventListener('click', () => openAnnForm(null, load));
  await load();
}

/* ---------------------------------------------------------------- 通知推送 */

async function viewNotifications() {
  content.innerHTML = `
    <div class="page-head">
      <div><h2>通知推送</h2><p>向指定范围发送站内通知，成员登录后会看到未读角标</p></div>
    </div>
    <div class="dash-2">
      <div class="card card-pad">
        <h4 style="margin-bottom:var(--sp-4)">发送通知</h4>
        <div class="form-grid">
          <div class="field span2"><label>标题 <span class="req">*</span></label><input class="input" id="n-title" placeholder="通知标题"></div>
          <div class="field"><label>投放范围</label>
            <select class="select" id="n-target">
              <option value="all">全体社员</option><option value="role">按角色</option>
              <option value="department">按部门</option><option value="users">指定成员</option>
            </select></div>
          <div class="field"><label>类型</label>
            <select class="select" id="n-type">
              <option value="system">系统</option><option value="announcement">公告</option>
              <option value="event">活动</option><option value="task">任务</option><option value="review">审核</option>
            </select></div>
          <div class="field span2" id="n-target-box"></div>
          <div class="field span2"><label>跳转链接</label><input class="input" id="n-link" placeholder="如 /member.html#schedule"></div>
          <div class="field span2"><label>内容</label><textarea class="textarea" id="n-content" rows="4"></textarea></div>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:var(--sp-4)">
          <button class="btn btn-primary" id="n-send">发送通知</button>
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h4>已发送的通知</h4></div>
        <div id="n-list"></div>
      </div>
    </div>`;

  function paintTarget() {
    const t = $('#n-target').value;
    const box = $('#n-target-box');
    if (t === 'all') { box.innerHTML = '<span class="small muted">将发送给全部在册成员</span>'; return; }
    if (t === 'role') {
      box.innerHTML = `<label>选择角色</label><div class="row-wrap" style="gap:12px;margin-top:6px">
        ${Object.entries(ROLE_LABEL).map(([k, l]) => `<label class="check"><input type="checkbox" data-role="${k}"> ${l}</label>`).join('')}</div>`;
      return;
    }
    if (t === 'department') {
      box.innerHTML = `<label>选择部门</label><div class="row-wrap" style="gap:12px;margin-top:6px">
        ${(store.lookups.departments || []).map((d) => `<label class="check"><input type="checkbox" data-dept="${d.id}"> ${esc(d.name)}</label>`).join('')}</div>`;
      return;
    }
    box.innerHTML = `<label>选择成员</label>
      <input class="input" id="n-user-q" placeholder="搜索姓名或账号…" style="margin:6px 0">
      <div class="row-wrap" id="n-users" style="gap:10px;max-height:190px;overflow:auto"></div>`;
    paintUsers('');
    $('#n-user-q').addEventListener('input', debounce(() => paintUsers($('#n-user-q').value.trim()), 200));
  }

  async function paintUsers(q) {
    const users = await api.get('/admin/directory', { q: q || undefined, pageSize: 60 }).then((r) => r.items || []).catch(() => []);
    $('#n-users').innerHTML = users.map((u) => `<label class="check"><input type="checkbox" data-user="${u.id}"> ${esc(u.name)} <span class="muted tiny">${esc(u.username)}</span></label>`).join('') || '<span class="muted small">没有匹配的成员</span>';
  }

  $('#n-target').addEventListener('change', paintTarget);
  paintTarget();

  $('#n-send').addEventListener('click', async () => {
    const title = $('#n-title').value.trim();
    if (!title) return toastErr('请填写通知标题');
    const t = $('#n-target').value;
    let ids = [];
    if (t === 'role') ids = $$('[data-role]:checked').map((c) => c.dataset.role);
    if (t === 'department') ids = $$('[data-dept]:checked').map((c) => Number(c.dataset.dept));
    if (t === 'users') ids = $$('[data-user]:checked').map((c) => Number(c.dataset.user));
    if (t !== 'all' && !ids.length) return toastErr('请选择接收范围');
    try {
      const r = await api.post('/admin/notifications/push', {
        title, content: $('#n-content').value.trim(), link: $('#n-link').value.trim(),
        type: $('#n-type').value, target_type: t, target_ids: ids
      });
      toastOk(`已发送给 ${r.data.sent} 人`);
      $('#n-title').value = ''; $('#n-content').value = '';
      loadList();
    } catch (e) { toastErr(e.message); }
  });

  async function loadList() {
    try {
      const r = await api.get('/admin/notifications', { pageSize: 40 });
      $('#n-list').innerHTML = '';
      $('#n-list').append(renderTable({
        columns: [
          { key: 'title', label: '标题' },
          { key: 'user_id', label: '接收人', render: (v) => v ? esc(lookupName('users', v)) : '<span class="badge">全体</span>' },
          { key: 'type', label: '类型' },
          { key: 'is_read', label: '已读', field: { type: 'bool' } },
          { key: 'created_at', label: '时间', field: { type: 'datetime' } }
        ],
        rows: r.items, compact: true, empty: '还没有发送过通知'
      }));
    } catch (e) { $('#n-list').innerHTML = `<div class="muted small" style="padding:14px">${esc(e.message)}</div>`; }
  }
  await loadList();
}

/* ---------------------------------------------------------------- 成员管理 */

async function viewMembers() {
  content.innerHTML = `
    <div class="page-head">
      <div><h2>成员管理</h2><p>账号、角色、部门与状态</p></div>
      <div class="toolbar">
        <button class="btn" id="m-import">批量导入</button>
        <button class="btn" id="m-dir">通讯录</button>
      </div>
    </div>
    <div id="m-crud"></div>`;

  const ref = await renderCrud($('#m-crud'), 'members', {
    subtitle: '共 25 个演示账号，初始密码 club1234',
    rowActions: (row) => `
      ${has('member.write') ? `<button class="btn btn-sm" data-reset="${row.id}">重置密码</button>` : ''}
      <button class="btn btn-sm" data-profile="${row.id}">档案</button>`,
    onAction: (act, row) => {
      if (act === 'reset-password') openReset(row);
      if (act === 'profile') openProfile(row.id);
    },
    openDetail: (row) => openProfile(row.id)
  });

  // 通过事件委托处理行内按钮
  $('#m-crud').addEventListener('click', (e) => {
    const r = e.target.closest('[data-reset]');
    if (r) { e.stopPropagation(); openReset({ id: Number(r.dataset.reset) }); return; }
    const p = e.target.closest('[data-profile]');
    if (p) { e.stopPropagation(); openProfile(Number(p.dataset.profile)); }
  });

  async function openReset(row) {
    const user = (await api.get(`/admin/members/${row.id}`)).data;
    const pw = el('input', { class: 'input', value: 'club1234' });
    const notify = el('input', { type: 'checkbox', checked: true });
    const body = el('div', { class: 'col', style: { gap: 'var(--sp-3)' } }, [
      el('div', { class: 'panel', text: `${user.name}（${user.username}）` }),
      el('div', { class: 'field' }, [el('label', { text: '新密码' }), pw]),
      el('label', { class: 'check' }, [notify, document.createTextNode(' 同时发送站内通知告知本人')])
    ]);
    const { root, close } = modal({ title: '重置密码', body, size: 'narrow', footer: '' });
    const ft = el('div', { class: 'modal-ft' });
    const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '重置' });
    c1.addEventListener('click', close);
    ok.addEventListener('click', async () => {
      try {
        const r = await api.post(`/admin/members/${row.id}/reset-password`, { password: pw.value, notify: notify.checked });
        toastOk(`密码已重置为：${r.data.password}`);
        close();
      } catch (e) { toastErr(e.message); }
    });
    ft.append(c1, ok); root.append(ft);
  }

  async function openProfile(id) {
    let d;
    try { d = (await api.get(`/admin/members/${id}/profile`)).data; } catch (e) { return toastErr(e.message); }
    const u = d.user;
    const box = el('div');
    box.innerHTML = `
      <div class="row" style="gap:14px;margin-bottom:var(--sp-4)">
        ${avatarHtml(u.name, u.avatar, 'avatar-lg')}
        <div>
          <h3 style="margin:0">${esc(u.name)} <span class="muted" style="font-size:14px">${esc(u.username)}</span></h3>
          <div class="row-wrap" style="gap:7px;margin-top:6px">
            ${badge(u.role, ROLE_LABEL[u.role])}
            ${u.department_name ? `<span class="badge">${esc(u.department_icon || '')} ${esc(u.department_name)}</span>` : ''}
            <span class="badge badge-line">${esc(u.position || '未设职务')}</span>
            ${badge(u.status)}
          </div>
        </div>
      </div>
      <div class="dash-grid" style="margin-bottom:var(--sp-4)">
        <div class="card stat"><div class="stat-k">积分</div><div class="stat-v">${d.points}</div></div>
        <div class="card stat"><div class="stat-k">出勤率</div><div class="stat-v">${d.attendance.rate}%</div></div>
        <div class="card stat"><div class="stat-k">报名活动</div><div class="stat-v">${d.signups.length}</div></div>
        <div class="card stat"><div class="stat-k">作品</div><div class="stat-v">${d.projects.length}</div></div>
      </div>
      <dl class="kv" style="grid-template-columns:96px 1fr;margin-bottom:var(--sp-4)">
        <dt>学号</dt><dd>${esc(u.student_no || '—')}</dd>
        <dt>专业</dt><dd>${esc(u.major || '—')}</dd>
        <dt>年级</dt><dd>${esc(u.grade || '—')}</dd>
        <dt>邮箱</dt><dd>${esc(u.email || '—')}</dd>
        <dt>手机</dt><dd>${esc(u.phone || '—')}</dd>
        <dt>微信</dt><dd>${esc(u.wechat || '—')}</dd>
        <dt>入社</dt><dd>${esc(u.joined_at || '—')}</dd>
        <dt>最近登录</dt><dd>${esc(fmt.dt(u.last_login_at))}</dd>
        <dt>简介</dt><dd>${esc(u.bio || '—')}</dd>
      </dl>
      <h4 style="margin-bottom:10px">最近报名</h4>
      <div id="pf-signups" style="margin-bottom:var(--sp-4)"></div>
      <h4 style="margin-bottom:10px">在选课程</h4>
      <div id="pf-courses" style="margin-bottom:var(--sp-4)"></div>
      <h4 style="margin-bottom:10px">任务</h4>
      <div id="pf-tasks"></div>`;
    const { root } = drawer({ title: '成员档案', body: box, size: 'wide' });

    $('#pf-signups').append(renderTable({
      columns: [{ key: 'title', label: '活动' }, { key: 'start_at', label: '时间', field: { type: 'datetime' } }, { key: 'status', label: '状态', field: { type: 'select' } }],
      rows: d.signups, compact: true, empty: '暂无报名'
    }));
    $('#pf-courses').append(renderTable({
      columns: [{ key: 'title', label: '课程' }, { key: 'category', label: '类型' }, { key: 'status', label: '状态', field: { type: 'select' } }],
      rows: d.courses, compact: true, empty: '暂无课程'
    }));
    $('#pf-tasks').append(renderTable({
      columns: [{ key: 'title', label: '任务' }, { key: 'due_at', label: '截止' }, { key: 'status', label: '状态', field: { type: 'select' } }],
      rows: d.tasks, compact: true, empty: '暂无任务'
    }));

    const ft = el('div', { class: 'drawer-ft' });
    const rs = el('button', { class: 'btn', type: 'button', text: '重置密码' });
    rs.addEventListener('click', () => openReset({ id }));
    ft.append(rs);
    root.append(ft);
  }

  $('#m-import').addEventListener('click', () => {
    const ta = el('textarea', { class: 'textarea mono', rows: 10, placeholder: '每行一个成员，逗号分隔：\n姓名,账号,密码,部门,职务,学号,手机,邮箱\n张三,zhangsan,club1234,宣传部,干事,20250101,13800000000,zs@example.com' });
    const body = el('div', { class: 'col', style: { gap: 'var(--sp-3)' } }, [
      el('div', { class: 'alert alert-info', text: '支持从 Excel 复制后粘贴（制表符或逗号分隔）。账号重复或格式错误会自动跳过并列出原因。' }),
      ta
    ]);
    const { root, close } = modal({ title: '批量导入成员', body, size: 'wide', footer: '' });
    const ft = el('div', { class: 'modal-ft' });
    const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '开始导入' });
    c1.addEventListener('click', close);
    ok.addEventListener('click', async () => {
      if (!ta.value.trim()) return toastErr('请粘贴数据');
      try {
        const r = await api.post('/admin/members/import', { rows: ta.value });
        const res = r.data;
        toastOk(`导入完成：成功 ${res.created}，失败 ${res.failed}`);
        if (res.errors?.length) {
          const list = el('div', { class: 'col', style: { gap: '4px', marginTop: '12px' } });
          list.innerHTML = res.errors.map((e) => `<div class="small">第 ${e.row} 行 ${esc(e.username || '')}：${esc(e.error)}</div>`).join('');
          body.append(el('h4', { text: '失败明细', style: { marginTop: '16px' } }), list);
        } else close();
        ref.reload();
      } catch (e) { toastErr(e.message); }
    });
    ft.append(c1, ok); root.append(ft);
  });

  $('#m-dir').addEventListener('click', () => { location.href = '/member.html'; });
}

/* ---------------------------------------------------------------- 作品审核 */

async function viewProjects() {
  content.innerHTML = '<div id="p-crud"></div>';
  await renderCrud($('#p-crud'), 'projects', {
    subtitle: '审核社员投稿，通过后会展示在对外宣传页',
    initialState: { filters: {} },
    rowActions: (row) => row.status === 'pending' ? `
      <button class="btn btn-sm btn-primary" data-review="approved">通过</button>
      <button class="btn btn-sm btn-danger" data-review="rejected">驳回</button>` : '',
    onAction: (act, row, ctx) => {
      if (act === 'review-approved' || act === 'review-rejected') return;
    }
  });
  $('#p-crud').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-review]');
    if (!b) return;
    e.stopPropagation();
    const tr = b.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;
    const status = b.dataset.review;
    let note = '';
    if (status === 'rejected') {
      note = await promptDialog('请填写驳回理由（会展示给作者）', { title: '驳回作品', placeholder: '如：图片分辨率不足' });
      if (note === null) return;
    }
    try {
      await api.patch(`/admin/projects/${id}`, { status, review_note: note });
      toastOk(status === 'approved' ? '已通过审核' : '已驳回');
      location.reload();
    } catch (err) { toastErr(err.message); }
  });
}

/* ---------------------------------------------------------------- 活动管理 */

async function viewEvents() {
  content.innerHTML = '<div id="e-crud"></div>';
  await renderCrud($('#e-crud'), 'events', {
    subtitle: '发布活动、管理报名与签到',
    rowActions: (row) => `<button class="btn btn-sm" data-signups="${row.id}">报名名单</button>`,
    onAction: (act, row) => { if (act === 'signups') openSignups(row); }
  });
  $('#e-crud').addEventListener('click', (e) => {
    const b = e.target.closest('[data-signups]');
    if (!b) return;
    e.stopPropagation();
    openSignups({ id: Number(b.dataset.signups) });
  });

  async function openSignups(row) {
    let ev;
    try { ev = (await api.get(`/admin/events/${row.id}`)).data; } catch (e) { return toastErr(e.message); }
    let list = [];
    try { list = (await api.get('/admin/event_signups', { event_id: row.id, pageSize: 100 })).items || []; } catch { list = []; }
    const approved = list.filter((x) => ['approved', 'attended'].includes(x.status)).length;
    const body = el('div');
    body.innerHTML = `
      <div class="row-wrap" style="gap:12px;margin-bottom:var(--sp-4)">
        <div class="panel" style="min-width:100px"><div class="muted small">报名总数</div><div style="font-size:20px;font-weight:700">${list.length}</div></div>
        <div class="panel" style="min-width:100px"><div class="muted small">已通过</div><div style="font-size:20px;font-weight:700;color:var(--ok)">${approved}</div></div>
        <div class="panel" style="min-width:100px"><div class="muted small">名额</div><div style="font-size:20px;font-weight:700">${ev.capacity || '不限'}</div></div>
        <span class="grow"></span>
        <button class="btn" id="sg-csv">导出名单 CSV</button>
      </div>
      <div id="sg-table"></div>`;
    const { root } = modal({ title: `报名名单 · ${ev.title}`, body, size: 'wide' });
    $('#sg-table').append(renderTable({
      columns: [
        { key: 'name', label: '姓名' },
        { key: 'contact', label: '联系方式' },
        { key: 'user_id', label: '账号', render: (v) => v ? esc(lookupName('users', v)) : '<span class="badge">游客</span>' },
        { key: 'remark', label: '备注', render: (v) => esc(v || '—') },
        { key: 'status', label: '状态', field: { type: 'select' } },
        { key: 'created_at', label: '报名时间', field: { type: 'datetime' } }
      ],
      rows: list, compact: true, empty: '还没有人报名',
      actions: (r) => `
        ${r.status !== 'approved' && r.status !== 'attended' ? `<button class="btn btn-sm btn-primary" data-sg="${r.id}" data-s="approved">通过</button>` : ''}
        ${r.status !== 'attended' ? `<button class="btn btn-sm" data-sg="${r.id}" data-s="attended">已参与</button>` : ''}
        ${r.status !== 'rejected' ? `<button class="btn btn-sm btn-danger" data-sg="${r.id}" data-s="rejected">拒绝</button>` : ''}`
    }));
    $('#sg-csv').addEventListener('click', () => {
      api.exportCsv('/admin/event_signups/export.csv', { event_id: row.id });
      toastOk('已开始导出');
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-sg]');
      if (!b) return;
      try {
        await api.patch(`/admin/event_signups/${b.dataset.sg}`, { status: b.dataset.s });
        toastOk('已更新');
        openSignups(row);
      } catch (err) { toastErr(err.message); }
    });
  }
}

/* ------------------------------------------------------------- 入社申请 */

async function viewApplications() {
  content.innerHTML = '<div id="a-crud"></div>';
  const ref = await renderCrud($('#a-crud'), 'applications', {
    subtitle: '审核通过后可一键创建社内账号',
    rowActions: (row) => (row.status === 'pending' && has('application.review')
      ? '<button class="btn btn-sm btn-primary" data-approve-apply="1">通过</button><button class="btn btn-sm btn-danger" data-reject-apply="1">拒绝</button>'
      : ''),
    onAction: () => { }
  });
  // 通过表格行内按钮审核
  $('#a-crud').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;
    if (e.target.closest('[data-approve-apply]')) {
      const okc = await confirmDialog('通过这条申请？将同时创建社内账号并通知本人。', { okText: '通过并建号' });
      if (!okc) return;
      try {
        const r = await api.post(`/admin/applications/${id}/review`, { status: 'approved' });
        if (r.data?.account) toastOk(`已通过，账号 ${r.data.account.username}，初始密码 ${r.data.account.password}`);
        else toastOk('已通过');
        ref.reload();
        badgeCounts();
      } catch (err) { toastErr(err.message); }
    }
    if (e.target.closest('[data-reject-apply]')) {
      const note = await promptDialog('驳回理由（选填，不会发送给申请人）', { title: '驳回申请' });
      if (note === null) return;
      try {
        await api.post(`/admin/applications/${id}/review`, { status: 'rejected', review_note: note });
        toastOk('已驳回');
        ref.reload();
        badgeCounts();
      } catch (err) { toastErr(err.message); }
    }
  });
}

/* ---------------------------------------------------------------- 留言 */

async function viewMessages() {
  content.innerHTML = '<div id="g-crud"></div>';
  const ref = await renderCrud($('#g-crud'), 'messages', {
    subtitle: '回复来访者的问题',
    rowActions: (row) => (has('message.reply')
      ? `<button class="btn btn-sm btn-primary" data-reply="1">${row.reply ? '修改回复' : '回复'}</button>` : '')
  });
  $('#g-crud').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;
    if (e.target.closest('[data-reply]')) {
      const text = await promptDialog('回复内容', { title: '回复留言', placeholder: '写下你的回复…' });
      if (!text) return;
      try {
        await api.patch(`/admin/messages/${id}`, { reply: text, status: 'replied', replied_at: new Date().toISOString() });
        toastOk('已回复');
        ref.reload();
      } catch (err) { toastErr(err.message); }
    }
  });
}

/* ---------------------------------------------------------------- 课程 */

async function viewCourses() {
  content.innerHTML = '<div id="c-crud"></div>';
  const ref = await renderCrud($('#c-crud'), 'courses', {
    subtitle: '创建课程后可以批量排课',
    rowActions: (row) => has('session.write') ? `<button class="btn btn-sm btn-primary" data-gen="${row.id}">排课</button>` : '',
    onAction: (act, row) => { if (act === 'gen-sessions') openGenerate(row); }
  });
  $('#c-crud').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-gen]');
    if (!b) return;
    e.stopPropagation();
    const row = (await api.get(`/admin/courses/${b.dataset.gen}`)).data;
    openGenerate(row);
  });
  function openGenerate(course) {
    openGenerateSessions(course, () => { toastOk('课表已更新'); route(); });
  }
}

/* -------------------------------------------------------------- 请假审批 */

async function viewLeaveRequests() {
  content.innerHTML = '<div id="l-crud"></div>';
  const ref = await renderCrud($('#l-crud'), 'leave_requests', {
    subtitle: '批准后会自动写入考勤为「请假」',
    rowActions: (row) => (row.status === 'pending' && has('leave.review')
      ? '<button class="btn btn-sm btn-primary" data-lv="approved">批准</button><button class="btn btn-sm btn-danger" data-lv="rejected">驳回</button>'
      : '')
  });
  $('#l-crud').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;
    const ap = e.target.closest('[data-lv]');
    if (!ap) return;
    try {
      await api.post(`/admin/leaves/${id}/review`, { status: ap.dataset.lv, review_note: '' });
      toastOk(ap.dataset.lv === 'approved' ? '已批准' : '已驳回');
      ref.reload();
      badgeCounts();
    } catch (err) { toastErr(err.message); }
  });
}

/* -------------------------------------------------------------- 素材库 */
/* uploads 表的列（文件名/链接/类型/大小/范围）全是只读元数据，所以这个模块
 * 不能用通用 CRUD 的「新建」表单 —— 那个表单填不出文件来。这里直接做成
 * 上传器：拖拽或选择文件 → POST /api/uploads（multipart）→ 落盘 + 入库，
 * 再把已有素材列成带缩略图的卡片，可复制链接 / 下载 / 删除。 */

const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|ico)$/i;
const isImageFile = (r) => /^image\//.test(r.mime || '') || IMG_EXT.test(r.original_name || '');
const humanSize = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
};
const fileExt = (name) => (String(name || '').match(/\.([a-z0-9]+)$/i)?.[1] || 'file').toLowerCase();

async function viewUploads(host) {
  let scope = 'public';
  let q = '';
  let busy = false;
  let rows = [];
  let total = 0;

  host.innerHTML = `
    <div class="page-head">
      <div><h2>素材库</h2><p id="up-count">正在载入…</p></div>
      <div class="row" style="gap:8px;align-items:center">
        <input id="up-q" class="input" type="search" placeholder="按文件名搜索" style="width:190px">
        <button class="btn btn-sm" id="up-refresh" type="button">刷新</button>
      </div>
    </div>

    <div class="upload-zone" id="up-zone">
      <div class="uz-ic">⬆</div>
      <div class="uz-txt">
        <b>把文件拖到这里，或点右侧「选择文件」</b>
        <span>图片 / PDF / Office / 压缩包 / 音视频 · 单个 ≤ 20 MB · 一次最多 10 个</span>
      </div>
      <div class="uz-side">
        <label class="uz-scope">上传到
          <select id="up-scope" class="input">
            <option value="public">公开（可直接引用）</option>
            <option value="private">受限（仅社员登录后可下载）</option>
          </select>
        </label>
        <button class="btn btn-sm btn-primary" id="up-pick" type="button">选择文件</button>
      </div>
      <input id="up-file" type="file" multiple hidden>
    </div>

    <div id="up-list" class="upload-grid"></div>`;

  const listBox = $('#up-list', host);
  const zone = $('#up-zone', host);
  const fileInput = $('#up-file', host);

  const srcOf = (r) => (r.scope === 'private' || !r.url ? api.fileUrl(r.id) : r.url);
  const absOf = (r) => `${location.origin}${r.scope === 'private' || !r.url ? api.fileUrl(r.id) : r.url}`;

  function cardHtml(r) {
    const img = isImageFile(r);
    return `
      <div class="up-card" data-id="${r.id}">
        <button class="up-thumb" type="button" data-open="${r.id}" title="${esc(r.original_name || '')}">
          ${img
            ? `<img src="${esc(srcOf(r))}" alt="" loading="lazy">`
            : `<span class="up-ext">${esc(fileExt(r.original_name))}</span>`}
        </button>
        <div class="up-meta">
          <div class="up-name" title="${esc(r.original_name || '')}">${esc(r.original_name || '(未命名)')}</div>
          <div class="up-sub">
            <span>${humanSize(r.size)}</span>
            <span class="up-scope-tag ${r.scope === 'private' ? 'priv' : ''}">${r.scope === 'private' ? '受限' : '公开'}</span>
          </div>
        </div>
        <div class="up-acts">
          <button class="btn btn-xs" type="button" data-copy="${r.id}" title="复制链接">链接</button>
          <a class="btn btn-xs" href="${esc(srcOf(r))}" download="${esc(r.original_name || '')}" title="下载">下载</a>
          <button class="btn btn-xs btn-danger" type="button" data-del="${r.id}" title="删除">删除</button>
        </div>
      </div>`;
  }

  function paint() {
    $('#up-count', host).textContent = q
      ? `搜索「${q}」：${rows.length} / ${total} 个文件`
      : `共 ${total} 个文件`;
    listBox.innerHTML = rows.length
      ? rows.map(cardHtml).join('')
      : emptyHtml(q ? '没有匹配的文件' : '素材库还是空的', q ? '换个关键词试试' : '把图片拖到上面的区域即可上传', '🗃️');
  }

  async function refresh() {
    listBox.innerHTML = loadingHtml('载入素材…');
    try {
      const r = await api.get('/admin/uploads', { pageSize: 200, q: q || undefined });
      rows = r.items || [];
      total = r.total ?? rows.length;
      paint();
    } catch (e) {
      listBox.innerHTML = `<div class="blank">载入失败：${esc(e.message)}</div>`;
    }
  }

  async function doUpload(files) {
    const list = [...(files || [])].filter(Boolean);
    if (!list.length || busy) return;
    busy = true;
    zone.classList.add('busy');
    $('#up-pick', host).textContent = '上传中…';
    try {
      await api.upload(list, scope);
      toastOk(`已上传 ${list.length} 个文件`);
      await loadLookups(true);   // 让「选择图片」弹窗立刻能看到新素材
      await refresh();
    } catch (e) {
      toastErr(e.message || '上传失败');
    } finally {
      busy = false;
      zone.classList.remove('busy');
      $('#up-pick', host).textContent = '选择文件';
      fileInput.value = '';
    }
  }

  /* 选择文件 / 拖拽 */
  $('#up-scope', host).addEventListener('change', (e) => { scope = e.target.value; });
  $('#up-pick', host).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => doUpload(fileInput.files));
  zone.addEventListener('click', (e) => { if (e.target === zone) fileInput.click(); });
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => {
    e.preventDefault();
    zone.classList.add('over');
  }));
  ['dragleave', 'dragend'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    doUpload(e.dataTransfer?.files);
  });

  /* 搜索 / 刷新 */
  $('#up-refresh', host).addEventListener('click', refresh);
  let qTimer = null;
  $('#up-q', host).addEventListener('input', (e) => {
    q = e.target.value.trim();
    clearTimeout(qTimer);
    qTimer = setTimeout(refresh, 260);
  });

  /* 卡片操作 */
  listBox.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const r = rows.find((x) => String(x.id) === open.dataset.open);
      if (!r) return;
      if (isImageFile(r)) {
        const box = el('div', { style: { textAlign: 'center' } });
        box.append(el('img', { src: srcOf(r), style: { maxWidth: '100%', maxHeight: '74vh', borderRadius: '9px' } }));
        modal({ title: r.original_name || '', body: box, size: 'wide' });
      } else {
        window.open(srcOf(r), '_blank');
      }
      return;
    }

    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const r = rows.find((x) => String(x.id) === copy.dataset.copy);
      if (!r) return;
      try {
        await navigator.clipboard.writeText(absOf(r));
        toastOk('链接已复制');
      } catch { toastErr('复制失败，请手动选择链接'); }
      return;
    }

    const del = e.target.closest('[data-del]');
    if (del) {
      const r = rows.find((x) => String(x.id) === del.dataset.del);
      if (!r) return;
      const yes = await confirmDialog(`删除「${r.original_name || ''}」？文件也会从磁盘删掉，已引用它的地方会变成空图。`,
        { okText: '删除', danger: true });
      if (!yes) return;
      try {
        await api.del(`/admin/uploads/${r.id}`);
        toastOk('已删除');
        await loadLookups(true);
        await refresh();
      } catch (err) { toastErr(err.message); }
    }
  });

  await refresh();
}

/* ---------------------------------------------------------------- 设置 */

async function viewSettings() {
  const st = (await api.get('/admin/settings')).data;
  const groups = [
    {
      title: '基本信息', fields: [
        ['site_name', '社团名称', 'text'], ['site_name_en', '英文名', 'text'],
        ['logo_text', '标志文字（没有社徽图时使用，1 个字）', 'text'],
        ['logo_image', '社徽图片地址（填了就用图片）', 'text', 'image'],
        ['favicon', '浏览器标签图标地址', 'text', 'image'],
        ['theme_color', '主题色（#hex）', 'text'],
        ['site_slogan', '一句话口号', 'text'], ['footer_text', '页脚文字', 'text'], ['icp_text', '备案信息', 'text']
      ]
    },
    {
      title: '首页首屏', fields: [
        ['hero_title', '首屏大标题', 'textarea'], ['hero_subtitle', '首屏副标题', 'textarea'],
        ['hero_cta_text', '按钮文字', 'text'], ['hero_cta_link', '按钮链接', 'text'],
        ['home_visual', '首页主视觉图地址（留空则不显示该区块）', 'text', 'image'],
        ['home_visual_caption', '主视觉图说明文字', 'text'],
        ['home_feature_a_image', '「我们在做什么」第一块配图（留空则用代表项目的封面）', 'text', 'image'],
        ['home_feature_b_image', '「我们在做什么」第二块配图·课程与资料（留空则用生成的抽象图）', 'text', 'image'],
        ['about_title', '「关于我们」标题', 'text']
      ]
    },
    {
      title: '联系方式', fields: [
        ['contact_email', '邮箱', 'text'], ['contact_phone', '电话', 'text'],
        ['contact_address', '地址', 'text'],
        ['office_hours', '日常活动时间', 'textarea'],
        ['qq_group', 'QQ 群', 'text'], ['wechat_official', '公众号', 'text']
      ]
    },
    {
      title: '注册与积分', fields: [
        ['open_register', '开放自助注册（1 开 / 0 关）', 'text'],
        ['default_signup_status', '注册后状态（active / pending）', 'text'],
        ['default_member_password', '新成员默认密码', 'text'],
        ['announcement_expire_days', '公告默认有效天数', 'text']
      ]
    }
  ];

  content.innerHTML = `
    <div class="page-head">
      <div><h2>站点设置</h2><p>修改后立即对全站生效，包括对外宣传页</p></div>
      <div class="toolbar">
        <button class="btn" id="st-reset">放弃修改</button>
        <button class="btn btn-primary" id="st-save">保存全部</button>
      </div>
    </div>
    <div id="st-body"></div>
    <div class="card card-pad" style="margin-top:var(--sp-4)">
      <h4 style="margin-bottom:10px">结构化内容（JSON）</h4>
      <div class="small muted" style="margin-bottom:12px">这些字段是 JSON 数组，改错会导致首页对应模块空白，请谨慎编辑。</div>
      <div class="col" style="gap:var(--sp-4)">
        <div class="field"><label>社团大事记 milestones</label><textarea class="textarea mono" rows="6" data-json="milestones">${esc(pretty(st.milestones))}</textarea></div>
        <div class="field"><label>荣誉 honors</label><textarea class="textarea mono" rows="5" data-json="honors">${esc(pretty(st.honors))}</textarea></div>
        <div class="field"><label>纳新流程 join_process</label><textarea class="textarea mono" rows="6" data-json="join_process">${esc(pretty(st.join_process))}</textarea></div>
        <div class="field"><label>研究方向 research_areas（字符串数组）</label><textarea class="textarea mono" rows="5" data-json="research_areas">${esc(pretty(st.research_areas))}</textarea></div>
        <div class="field"><label>友情链接 friend_links（{label,url} 数组）</label><textarea class="textarea mono" rows="6" data-json="friend_links">${esc(pretty(st.friend_links))}</textarea></div>
        <div class="field"><label>社交链接 social_links</label><textarea class="textarea mono" rows="5" data-json="social_links">${esc(pretty(st.social_links))}</textarea></div>
        <div class="field"><label>积分规则 points_rules</label><textarea class="textarea mono" rows="6" data-json="points_rules">${esc(pretty(st.points_rules))}</textarea></div>
      </div>
    </div>
    <div class="card card-pad" style="margin-top:var(--sp-4)">
      <h4 style="margin-bottom:10px">当前配置一览</h4>
      <div id="st-preview" class="set-grid"></div>
    </div>`;

  const body = $('#st-body');
  for (const g of groups) {
    const card = el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } });
    card.innerHTML = `<div class="card-hd"><h4>${esc(g.title)}</h4></div><div class="card-bd"><div class="set-grid"></div></div>`;
    const grid = card.querySelector('.set-grid');
    for (const [k, label, type, kind] of g.fields) {
      const wrap = el('div', { class: 'field' });
      wrap.innerHTML = `<label>${esc(label)} <span class="muted tiny mono">${esc(k)}</span></label>`;
      const input = type === 'textarea' ? el('textarea', { class: 'textarea', rows: 3 }) : el('input', { class: 'input' });
      input.value = st[k] ?? '';
      input.dataset.key = k;
      if (k === 'theme_color') {
        input.type = 'text';
        input.addEventListener('input', () => { document.documentElement.style.setProperty('--brand', input.value); });
      }
      wrap.append(input);
      if (kind === 'image') {
        const bar = el('div', { class: 'img-picker', style: { marginTop: '8px' } });
        const thumb = el('div', { class: 'thumb' });
        const paint = (url) => { thumb.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '🖼'; };
        paint(input.value);
        const lib = el('button', { class: 'btn btn-sm', type: 'button', text: '素材库' });
        const up = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '上传' });
        const clr = el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '清除' });
        const file = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        lib.addEventListener('click', async () => {
          const url = await pickMedia({ title: `为「${label}」选择图片` });
          if (!url) return;
          input.value = url; paint(url); toastOk('已选择');
        });
        up.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
          if (!file.files.length) return;
          try {
            up.disabled = true; up.textContent = '上传中…';
            const r = await api.upload(file.files[0], 'public');
            const rec = Array.isArray(r.data) ? r.data[0] : r.data;
            input.value = rec.url; paint(rec.url); toastOk('已上传');
          } catch (e) { toastErr(e.message); }
          finally { up.disabled = false; up.textContent = '上传'; file.value = ''; }
        });
        clr.addEventListener('click', () => { input.value = ''; paint(''); });
        bar.append(thumb, lib, up, clr, file);
        wrap.append(bar);
      }
      grid.append(wrap);
    }
    body.append(card);
  }

  function pretty(v) {
    try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2); } catch { return String(v ?? ''); }
  }

  $('#st-save').addEventListener('click', async () => {
    const patch = {};
    $$('[data-key]', content).forEach((i) => { patch[i.dataset.key] = i.value; });
    let bad = null;
    $$('[data-json]', content).forEach((t) => {
      try { patch[t.dataset.json] = JSON.parse(t.value); }
      catch { bad = t.dataset.json; }
    });
    if (bad) return toastErr(`「${bad}」不是合法的 JSON，请检查`);
    if (patch.theme_color && !/^#[0-9a-f]{3,8}$/i.test(patch.theme_color)) return toastErr('主题色需要是 #RRGGBB 形式');
    try {
      await api.patch('/admin/settings', patch);
      toastOk('设置已保存，刷新页面后全站生效');
      await loadSite();
      viewSettings();
    } catch (e) { toastErr(e.message); }
  });
  $('#st-reset').addEventListener('click', () => viewSettings());

  // 预览
  const pv = $('#st-preview');
  const items = [
    ['站名', st.site_name], ['英文名', st.site_name_en], ['口号', st.site_slogan],
    ['主题色', st.theme_color], ['首屏标题', st.hero_title],
    ['邮箱', st.contact_email], ['电话', st.contact_phone], ['地址', st.contact_address],
    ['自助注册', st.open_register === '1' ? '已开启' : '已关闭'],
    ['新成员默认密码', st.default_member_password],
    ['公告有效天数', st.announcement_expire_days]
  ];
  pv.innerHTML = items.map(([k, v]) => `<div class="panel">
    <div class="muted small">${esc(k)}</div>
    <div class="clip" style="font-weight:600">${esc(v ?? '—')}</div></div>`).join('');
}

/* ---------------------------------------------------------------- 备份 */

async function viewBackup() {
  let info = null;
  try { info = (await api.get('/admin/system/info')).data; } catch { /* ignore */ }
  content.innerHTML = `
    <div class="page-head">
      <div><h2>数据备份</h2><p>导出全部数据为 JSON，或直接下载 SQLite 数据库文件</p></div>
    </div>
    <div class="dash-grid" style="margin-bottom:var(--sp-4)">
      <div class="card stat"><div class="stat-k">Node 版本</div><div class="stat-v" style="font-size:20px">${esc(info?.node || '—')}</div></div>
      <div class="card stat"><div class="stat-k">运行环境</div><div class="stat-v" style="font-size:20px">${esc(info?.platform || '—')}</div></div>
      <div class="card stat"><div class="stat-k">数据库大小</div><div class="stat-v" style="font-size:20px">${info ? fmt.size(info.db_size) : '—'}</div></div>
      <div class="card stat"><div class="stat-k">运行时长</div><div class="stat-v" style="font-size:20px">${info ? Math.round(info.uptime_sec / 60) + ' 分钟' : '—'}</div></div>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card card-pad">
        <h4 style="margin-bottom:10px">导出备份</h4>
        <p class="small muted">JSON 备份包含全部业务数据（含账号密码哈希），可用于迁移或留档。SQLite 文件是数据库原样副本。</p>
        <div class="row-wrap" style="gap:10px;margin-top:var(--sp-4)">
          <button class="btn btn-primary" id="b-json">下载 JSON 全量备份</button>
          <button class="btn" id="b-db">下载 SQLite 数据库</button>
          <button class="btn" id="b-logs">导出操作日志 CSV</button>
        </div>
        <div class="alert alert-warn" style="margin-top:var(--sp-4)">
          备份文件包含敏感数据，请妥善保管，不要上传到公开位置。
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h4>数据表统计</h4></div>
        <div id="b-tables"></div>
      </div>
    </div>`;

  if (info) {
    const rows = Object.entries(info.tables).map(([k, v]) => ({ table: k, count: v }));
    $('#b-tables').append(renderTable({
      columns: [
        { key: 'table', label: '数据表', render: (v) => `<span class="mono small">${esc(v)}</span>` },
        { key: 'count', label: '记录数', align: 'right', render: (v) => fmt.num(v) }
      ],
      rows: rows.sort((a, b) => b.count - a.count), compact: true
    }));
  }

  const dl = (path, name) => {
    const a = el('a', { href: `/api${path}`, download: name || '' });
    document.body.append(a);
    a.click();
    a.remove();
  };
  $('#b-json').addEventListener('click', () => { dl('/admin/backup'); toastOk('已开始导出'); });
  $('#b-db').addEventListener('click', () => { dl('/admin/backup/db'); toastOk('已开始下载数据库文件'); });
  $('#b-logs').addEventListener('click', () => { dl('/admin/logs/export.csv'); toastOk('已开始导出'); });
}

/* ---------------------------------------------------------------- 角色 */

async function viewRoles() {
  const d = (await api.get('/admin/roles')).data;
  content.innerHTML = `
    <div class="page-head">
      <div><h2>角色与权限</h2><p>权限在后端硬校验，前端菜单只是按权限隐藏</p></div>
    </div>
    <div class="grid g2" style="align-items:start">
      ${d.roles.map((r) => `<div class="card">
        <div class="card-hd"><h4>${esc(r.label)}</h4><span class="badge">${r.count} 人</span></div>
        <div class="card-bd" style="padding-top:var(--sp-3)">
          ${r.grants.includes('*')
      ? '<div class="alert alert-danger">拥有全部权限（不受限制）</div>'
      : `<div class="row-wrap" style="gap:6px">${r.grants.map((g) => `<span class="tag mono">${esc(g)}</span>`).join('')}</div>`}
        </div>
      </div>`).join('')}
    </div>`;
}

/* ---------------------------------------------------------------- 启动 */

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

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
  $('#btn-bell').addEventListener('click', () => { location.hash = '#applications'; });
  $('#btn-logout').addEventListener('click', async () => {
    if (!(await confirmDialog('确定退出登录吗？', { okText: '退出' }))) return;
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    location.href = '/';
  });

  const me = await loadMe();
  if (!me) { location.href = `/login.html?next=${encodeURIComponent('/admin.html')}`; return; }
  if (!['superadmin', 'admin', 'leader'].includes(me.role)) { location.href = '/member.html'; return; }

  await Promise.all([loadSite(), loadMeta(), loadLookups()]);

  const st = store.settings || {};
  if (st.site_name) { $('#side-name').textContent = st.site_name; $('#side-mark').textContent = st.logo_text || st.site_name.slice(0, 1); }
  $('#me-name').textContent = me.name || me.username;
  $('#me-role').textContent = `${ROLE_LABEL[me.role] || me.role}${me.position ? ' · ' + me.position : ''}`;
  const av = $('#me-avatar');
  if (me.avatar) av.innerHTML = `<img src="${me.avatar}" alt="">`; else av.textContent = String(me.name || me.username).slice(0, 1);

  buildMenu();

  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#dashboard';
  await route();
  setInterval(badgeCounts, 90000);
}

boot();
