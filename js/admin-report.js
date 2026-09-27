/* ============================================================================
 *  admin-report.js — 统计报表中心 与 日历聚合
 * ==========================================================================*/

import { api } from './api.js';
import { store, has, fmt, lookupName } from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, badge, emptyHtml, loadingHtml, esc,
  renderTable, modal
} from './ui.js';
import { lineChart, barChart, groupedBar, donut, rankBars, weekdayBars } from './charts.js';

/* ==========================================================================
 *  报表中心
 * ========================================================================*/

const KINDS = [
  { key: 'overview', label: '总览' },
  { key: 'members', label: '成员' },
  { key: 'events', label: '活动' },
  { key: 'courses', label: '排课与出勤' },
  { key: 'documents', label: '资料' },
  { key: 'finance', label: '财务' },
  { key: 'departments', label: '部门对比' },
  { key: 'activity', label: '活跃度' }
];

export async function viewReports(host) {
  const today = new Date().toISOString().slice(0, 10);
  const half = new Date(Date.now() - 179 * 864e5).toISOString().slice(0, 10);
  let kind = 'overview';
  let range = { from: half, to: today };

  host.innerHTML = `
    <div class="page-head">
      <div><h2>统计报表</h2><p>社团运营的多维数据</p></div>
      <div class="toolbar">
        <input class="input" type="date" id="r-from" value="${range.from}" style="min-width:140px">
        <span class="muted small">至</span>
        <input class="input" type="date" id="r-to" value="${range.to}" style="min-width:140px">
        <button class="btn" id="r-q">查询</button>
        <button class="btn" id="r-csv">导出 CSV</button>
      </div>
    </div>
    <div class="tabs" style="margin-bottom:var(--sp-4)" id="r-tabs">
      ${KINDS.map((k) => `<button class="tab" data-kind="${k.key}" aria-selected="${k.key === kind}">${esc(k.label)}</button>`).join('')}
    </div>
    <div id="r-body">${loadingHtml()}</div>`;

  async function load() {
    const body = $('#r-body');
    body.innerHTML = loadingHtml('统计中…');
    let d;
    try {
      d = (await api.get(`/admin/reports/${kind}`, range)).data;
    } catch (e) {
      body.innerHTML = emptyHtml('加载失败', e.message, '⚠');
      return;
    }
    body.innerHTML = render(kind, d);
  }

  function render(k, d) {
    if (k === 'overview') {
      const c = d.counts;
      return `
        <div class="dash-grid" style="margin-bottom:var(--sp-4)">
          ${stat('在册社员', c.members, '👥')}
          ${stat('待审入社申请', c.pendingApplications, '📝', c.pendingApplications ? 'warn' : '')}
          ${stat('待审作品', c.pendingProjects, '🎨', c.pendingProjects ? 'warn' : '')}
          ${stat('待处理留言', c.newMessages, '💬', c.newMessages ? 'warn' : '')}
        </div>
        <div class="dash-grid" style="margin-bottom:var(--sp-4)">
          ${stat('活动总数', c.events, '🎪')}
          ${stat('课程总数', c.courses, '📚')}
          ${stat('资料总数', c.documents, '📄')}
          ${stat('未完成任务', c.tasksOpen, '✅', c.tasksOpen ? 'warn' : '')}
        </div>
        <div class="dash-grid">
          ${stat('逾期未还物资', c.overdueLoans, '📦', c.overdueLoans ? 'danger' : '')}
          ${stat('已发布公告', c.announcements, '📢')}
        </div>`;
    }

    if (k === 'members') {
      return `
        <div class="dash-2" style="margin-bottom:var(--sp-4)">
          <div class="card"><div class="card-hd"><h4>成员增长（近 12 个月累计）</h4></div>
            <div class="card-bd">${lineChart(d.growth.map((g) => ({ label: g.month, value: g.total })), { height: 230 })}</div></div>
          <div class="card"><div class="card-hd"><h4>部门分布</h4></div>
            <div class="card-bd">${donut(d.byDept.map((x) => ({ label: x.name, value: x.count })), { size: 175, thickness: 24, centerLabel: '总人数' })}</div></div>
        </div>
        <div class="dash-2">
          <div class="card"><div class="card-hd"><h4>每月新增</h4></div>
            <div class="card-bd">${barChart(d.byMonth.map((m) => ({ label: m.month, value: m.count })), { height: 200 })}</div></div>
          <div class="card"><div class="card-hd"><h4>年级分布</h4></div>
            <div class="card-bd" style="padding-top:var(--sp-4)">${rankBars(d.byGrade.map((g) => ({ label: g.grade, value: g.count })))}</div></div>
        </div>`;
    }

    if (k === 'events') {
      return `
        <div class="dash-2" style="margin-bottom:var(--sp-4)">
          <div class="card"><div class="card-hd"><h4>报名人数 TOP</h4></div>
            <div class="card-bd" style="padding-top:var(--sp-4)">${rankBars(d.top.map((e) => ({ label: e.title, value: e.signed, hint: `${e.signed} 人` })), { max: 12 })}</div></div>
          <div class="card"><div class="card-hd"><h4>活动分类</h4></div>
            <div class="card-bd">${donut(d.byCategory.map((c) => ({ label: c.category, value: c.count })), { size: 175, thickness: 24, centerLabel: '活动数' })}</div></div>
        </div>
        <div class="card"><div class="card-hd"><h4>活动状态</h4></div>
          <div class="card-bd" style="padding-top:var(--sp-4)">
            <div class="row-wrap" style="gap:14px">${d.byStatus.map((s) => `<div class="panel" style="min-width:120px">
              <div class="muted small">${esc(statusLabel(s.status))}</div><div style="font-size:22px;font-weight:700">${s.count}</div></div>`).join('')}</div>
          </div></div>`;
    }

    if (k === 'courses') {
      const o = d.overall || {};
      const total = Number(o.total || 0);
      const rate = total ? Math.round(((Number(o.present || 0) + Number(o.late || 0)) / total) * 100) : 0;
      const wd = [0, 0, 0, 0, 0, 0, 0];
      for (const x of d.byWeekday) {
        const i = (Number(x.wd) + 6) % 7;
        wd[i] = x.count;
      }
      return `
        <div class="dash-grid" style="margin-bottom:var(--sp-4)">
          ${stat('出勤记录', total, '✅')}
          ${stat('整体出勤率', `${rate}%`, '📈', rate >= 80 ? '' : 'warn')}
          ${stat('缺席', o.absent || 0, '🚫', o.absent ? 'danger' : '')}
          ${stat('请假', o.leave_cnt || 0, '🏷️')}
        </div>
        <div class="dash-2" style="margin-bottom:var(--sp-4)">
          <div class="card"><div class="card-hd"><h4>课次按星期分布</h4></div>
            <div class="card-bd">${weekdayBars(wd)}</div></div>
          <div class="card"><div class="card-hd"><h4>各课程出勤</h4></div>
            <div class="card-bd">${donut([
        { label: '到课', value: Number(o.present || 0) },
        { label: '迟到', value: Number(o.late || 0) },
        { label: '缺席', value: Number(o.absent || 0) },
        { label: '请假', value: Number(o.leave_cnt || 0) }
      ], { size: 175, thickness: 24, centerLabel: '总记录' })}</div></div>
        </div>
        <div class="card"><div class="card-hd"><h4>课程明细</h4></div><div id="cp"></div></div>`;
    }

    if (k === 'documents') {
      return `
        <div class="dash-2" style="margin-bottom:var(--sp-4)">
          <div class="card"><div class="card-hd"><h4>下载量 TOP</h4></div>
            <div class="card-bd" style="padding-top:var(--sp-4)">${rankBars(d.top.map((x) => ({ label: x.title, value: x.download_count, hint: `${x.download_count} 次` })), { max: 12 })}</div></div>
          <div class="card"><div class="card-hd"><h4>可见范围分布</h4></div>
            <div class="card-bd">${donut(d.byVisibility.map((x) => ({ label: visibilityLabel(x.visibility), value: x.count })), { size: 175, thickness: 24, centerLabel: '资料数' })}</div></div>
        </div>
        <div class="card"><div class="card-hd"><h4>分类统计</h4></div>
          <div class="card-bd">${barChart(d.byCategory.map((x) => ({ label: x.category, value: x.count })), { height: 200 })}</div></div>`;
    }

    if (k === 'finance') {
      return `
        <div class="card" style="margin-bottom:var(--sp-4)"><div class="card-hd"><h4>月度收支</h4></div>
          <div class="card-bd">${d.byMonth.length ? groupedBar([
        { name: '收入', color: 'var(--ok)', data: d.byMonth.map((m) => ({ label: m.month, value: m.income })) },
        { name: '支出', color: 'var(--danger)', data: d.byMonth.map((m) => ({ label: m.month, value: m.expense })) }
      ], { height: 250 }) : '<div class="muted small">区间内没有数据</div>'}</div></div>
        <div class="card"><div class="card-hd"><h4>分类收支</h4></div>
          <div class="card-bd" style="padding-top:var(--sp-4)">
            ${rankBars(d.byCategory.map((x) => ({ label: `${x.category}（${x.type === 'income' ? '收' : '支'}）`, value: x.amount, hint: `¥${fmt.money(x.amount)}` })), { max: 14, color: 'var(--brand)' })}
          </div></div>`;
    }

    if (k === 'departments') {
      return `<div class="card" style="margin-bottom:var(--sp-4)"><div class="card-hd"><h4>部门活跃度对比</h4></div>
        <div class="card-bd">${groupedBar([
        { name: '成员', color: 'var(--brand)', data: d.map((x) => ({ label: x.name, value: x.members })) },
        { name: '活动', color: 'var(--warn)', data: d.map((x) => ({ label: x.name, value: x.events })) },
        { name: '课程', color: 'var(--ok)', data: d.map((x) => ({ label: x.name, value: x.courses })) },
        { name: '作品', color: '#a855f7', data: d.map((x) => ({ label: x.name, value: x.projects })) }
      ], { height: 240 })}</div></div>
      <div class="card"><div id="dept-table"></div></div>`;
    }

    if (k === 'activity') {
      return `
        <div class="card" style="margin-bottom:var(--sp-4)"><div class="card-hd"><h4>每日操作量</h4>
          <span class="small muted">来自操作日志</span></div>
          <div class="card-bd">${lineChart(d.series.map((x) => ({ label: x.date, value: x.count })), { height: 240 })}</div></div>
        <div class="dash-2">
          <div class="card"><div class="card-hd"><h4>操作类型分布</h4></div>
            <div class="card-bd">${donut(d.byAction.map((x) => ({ label: actionLabel(x.action), value: x.count })), { size: 175, thickness: 24, centerLabel: '总操作' })}</div></div>
          <div class="card"><div class="card-hd"><h4>最活跃的账号</h4></div>
            <div class="card-bd" style="padding-top:var(--sp-4)">${rankBars(d.topUsers.map((x) => ({ label: x.username, value: x.count, hint: `${x.count} 次` })))}</div></div>
        </div>`;
    }
    return '<div class="muted">暂不支持该报表</div>';
  }

  function stat(k, v, ic, tone) {
    return `<div class="card stat"><div class="stat-k">${ic} ${esc(k)}</div>
      <div class="stat-v" style="${tone === 'danger' ? 'color:var(--danger)' : tone === 'warn' ? 'color:var(--warn)' : ''}">${esc(String(v))}</div></div>`;
  }

  function statusLabel(s0) {
    return { draft: '草稿', published: '报名中', ongoing: '进行中', finished: '已结束', cancelled: '已取消' }[s0] || s0;
  }
  function visibilityLabel(v) {
    return { public: '公开', member: '社员可见', leader: '管理层', admin: '仅管理员' }[v] || v;
  }
  function actionLabel(a) {
    return { create: '新建', update: '修改', delete: '删除', login: '登录', logout: '登出', review: '审核', approve: '审批', upload: '上传', export: '导出' }[a] || a;
  }

  /* 表格型报表的补充渲染 */
  async function afterRender() {
    const body = $('#r-body');
    if (kind === 'courses') {
      const d = (await api.get('/admin/reports/courses', range)).data;
      $('#cp')?.append(renderTable({
        columns: [
          { key: 'title', label: '课程' }, { key: 'code', label: '编号' },
          { key: 'enrolled', label: '选课人数', align: 'right' },
          { key: 'sessions', label: '课次', align: 'right' },
          { key: 'attendance_rows', label: '出勤记录', align: 'right' },
          { key: 'status', label: '状态', field: { type: 'select' } }
        ],
        rows: d.byCourse, compact: true, empty: '暂无课程'
      }));
    }
    if (kind === 'departments') {
      const d = (await api.get('/admin/reports/departments', range)).data;
      $('#dept-table')?.append(renderTable({
        columns: [
          { key: 'name', label: '部门', render: (v, r) => `${esc(r.icon || '')} ${esc(v)}` },
          { key: 'members', label: '成员', align: 'right' },
          { key: 'events', label: '活动', align: 'right' },
          { key: 'courses', label: '课程', align: 'right' },
          { key: 'documents', label: '资料', align: 'right' },
          { key: 'projects', label: '作品', align: 'right' },
          { key: 'points', label: '总积分', align: 'right' }
        ],
        rows: d, compact: true, empty: '暂无部门'
      }));
    }
    body.querySelectorAll('.card-bd').forEach((x) => x.classList.add('rendered'));
  }

  $('#r-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    kind = b.dataset.kind;
    $$('#r-tabs .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.kind === kind)));
    load().then(afterRender);
  });
  $('#r-q').addEventListener('click', () => { range = { from: $('#r-from').value, to: $('#r-to').value }; load().then(afterRender); });
  $('#r-csv').addEventListener('click', () => {
    const map = { members: 'members', events: 'events', courses: 'attendance', finance: 'finance' };
    const k2 = map[kind] || 'members';
    api.exportCsv(`/admin/reports/${k2}/export.csv`, range);
    toastOk('已开始导出');
  });

  await load();
  await afterRender();
}

/* ==========================================================================
 *  日历
 * ========================================================================*/

const TYPE_LABEL = {
  event: '活动', course: '课程', meeting: '会议',
  duty: '值班', task: '任务截止', announcement: '公告'
};

export async function viewCalendar(host) {
  let anchor = new Date();
  const enabled = new Set(['event', 'course', 'meeting', 'duty', 'task', 'announcement']);

  host.innerHTML = `
    <div class="page-head">
      <div><h2>日历</h2><p>活动、课程、会议、值班与截止日期的统一视图</p></div>
      <div class="toolbar">
        <button class="btn" id="c-prev">‹ 上月</button>
        <button class="btn" id="c-today">本月</button>
        <button class="btn" id="c-next">下月 ›</button>
        <button class="btn" id="c-ics">导出 .ics</button>
      </div>
    </div>
    <div class="card card-pad" style="margin-bottom:var(--sp-3)">
      <div class="row-wrap" style="gap:14px">
        ${Object.entries(TYPE_LABEL).map(([k, l]) => `<label class="check"><input type="checkbox" data-type="${k}" checked>
          <span class="cal-ev t-${k}" style="padding:1px 8px">${l}</span></label>`).join('')}
      </div>
    </div>
    <div id="cal-host">${loadingHtml()}</div>`;

  async function load() {
    const y = anchor.getFullYear(); const m = anchor.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const from = dstr(new Date(y, m, 1 - startOffset));
    const to = dstr(new Date(y, m, 42 - startOffset));
    const hostBox = $('#cal-host');
    hostBox.innerHTML = loadingHtml('加载日历…');
    let events = [];
    try {
      events = (await api.get('/calendar', { from, to, types: [...enabled].join(',') })).data.events || [];
    } catch (e) {
      hostBox.innerHTML = emptyHtml('加载失败', e.message, '⚠');
      return;
    }
    const byDate = {};
    for (const e of events) (byDate[e.date] ||= []).push(e);

    const today = dstr(new Date());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(y, m, 1 - startOffset + i);
      const ds = dstr(d);
      const list = byDate[ds] || [];
      cells.push(`<div class="cal-cell ${d.getMonth() !== m ? 'out' : ''} ${ds === today ? 'today' : ''}">
        <div class="cal-date"><span>${d.getDate()}</span>${list.length ? `<span>${list.length}</span>` : ''}</div>
        ${list.slice(0, 3).map((e) => `<div class="cal-ev t-${e.type}" data-ev='${encodeURIComponent(JSON.stringify(e))}' title="${esc(e.title)}">${e.all_day ? '' : esc(e.start_time || '') + ' '}${esc(e.title)}</div>`).join('')}
        ${list.length > 3 ? `<div class="cal-more">还有 ${list.length - 3} 项…</div>` : ''}
      </div>`);
    }

    hostBox.innerHTML = `
      <div class="cal-grid">
        ${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<div class="cal-head">周${d}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="row-between" style="margin-top:12px">
        <span class="small muted">${y} 年 ${m + 1} 月 · 共 ${events.length} 项</span>
        <span class="small muted">点击条目查看详情</span>
      </div>`;

    hostBox.querySelectorAll('[data-ev]').forEach((n) => n.addEventListener('click', () => {
      const e = JSON.parse(decodeURIComponent(n.dataset.ev));
      const body = el('div');
      body.innerHTML = `<div class="row-wrap" style="gap:8px;margin-bottom:12px">
          <span class="badge badge-line">${esc(TYPE_LABEL[e.type] || e.type)}</span>
          ${e.status ? badge(e.status) : ''}</div>
        <h4 style="margin:0 0 8px">${esc(e.title)}</h4>
        <div class="kv">
          <dt>日期</dt><dd>${esc(e.date)}</dd>
          ${e.start_time ? `<dt>时间</dt><dd>${esc(e.start_time)}${e.end_time ? ' – ' + esc(e.end_time) : ''}</dd>` : ''}
          ${e.location ? `<dt>地点</dt><dd>${esc(e.location)}</dd>` : ''}
          ${e.meta ? `<dt>备注</dt><dd>${esc(e.meta)}</dd>` : ''}
        </div>`;
      const { root, close } = modal({ title: '日程详情', body, size: 'narrow', footer: '' });
      const ft = el('div', { class: 'modal-ft' });
      if (e.link) {
        const a = el('a', { class: 'btn btn-primary', href: e.link, text: '前往查看' });
        ft.append(a);
      }
      const cl = el('button', { class: 'btn', type: 'button', text: '关闭' });
      cl.addEventListener('click', close);
      ft.append(cl);
      root.append(ft);
    }));
  }

  $('#c-prev').addEventListener('click', () => { anchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1); load(); });
  $('#c-next').addEventListener('click', () => { anchor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1); load(); });
  $('#c-today').addEventListener('click', () => { anchor = new Date(); load(); });
  $('#c-ics').addEventListener('click', () => {
    api.exportCsv(`/calendar.ics?types=${[...enabled].join(',')}`);
    toastOk('已导出日历文件，可导入系统日历');
  });
  host.querySelectorAll('[data-type]').forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked) enabled.add(cb.dataset.type); else enabled.delete(cb.dataset.type);
    load();
  }));

  await load();
}

function dstr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
