/* ============================================================================
 *  schedule-ui.js — 排课系统的共享界面（会员中心与后台复用）
 *  周课表 · 课次详情 · 点名面板 · 签到码 · 停课调课 · 冲突提示
 * ==========================================================================*/

import { api } from './api.js';
import { store, has, fmt, lookupName } from './store.js';
import {
  $, el, modal, drawer, toast, toastOk, toastErr, toastWarn, badge, emptyHtml,
  loadingHtml, esc, avatarHtml, renderForm, confirmDialog
} from './ui.js';

const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const SLOTS = [
  ['08:00', '10:00'], ['10:00', '12:00'], ['12:00', '14:00'],
  ['14:00', '16:00'], ['16:00', '18:00'], ['18:00', '20:00'], ['20:00', '22:00']
];

const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => dstr(new Date(new Date(`${s}T00:00:00`).getTime() + n * 864e5));
const mondayOf = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = (d.getDay() + 6) % 7;
  return addDays(dateStr, -wd);
};
const toMin = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };

/* ------------------------------------------------------------ 周课表 */

/**
 * @param {HTMLElement} host
 * @param {object} opts { from, days, editable, filters:boolean, title }
 */
export async function renderWeek(host, opts = {}) {
  const state = {
    from: opts.from || mondayOf(dstr(new Date())),
    days: opts.days || 7,
    ...(opts.params || {}),
    venue_id: '', teacher_id: '', course_id: '', department_id: ''
  };
  Object.assign(state, opts.params || {});
  const editable = opts.editable !== false && (has('session.write') || has('attendance.mark'));

  async function load() {
    host.innerHTML = loadingHtml('加载课表…');
    const to = addDays(state.from, state.days - 1);
    let data;
    try {
      data = (await api.get('/schedule/week', { ...state, from: state.from, days: state.days })).data;
    } catch (e) {
      host.innerHTML = emptyHtml('课表加载失败', e.message, '⚠');
      return;
    }
    render(data, to);
  }

  function render(data, to) {
    const days = [];
    for (let i = 0; i < state.days; i++) days.push(addDays(state.from, i));
    const today = dstr(new Date());

    const byCell = {};
    for (const s of data.sessions) {
      const row = SLOTS.findIndex(([a, b]) => toMin(s.start_time) >= toMin(a) && toMin(s.start_time) < toMin(b));
      const r = row >= 0 ? row : SLOTS.length - 1;
      const key = `${s.date}|${r}`;
      (byCell[key] ||= []).push(s);
    }

    let html = `
    <div class="row-between" style="margin-bottom:var(--sp-3);flex-wrap:wrap;gap:10px">
      <div class="row" style="gap:6px">
        <button class="btn btn-sm" data-nav="-1">‹ 上一周</button>
        <button class="btn btn-sm" data-nav="0">本周</button>
        <button class="btn btn-sm" data-nav="1">下一周 ›</button>
        <span class="small muted" style="margin-left:6px">${state.from} ~ ${to}</span>
      </div>
      ${opts.filters === false ? '' : `<div class="toolbar">
        <select class="select" data-filter="venue_id"><option value="">全部场地</option>
          ${(store.lookups.venues || []).map((v) => `<option value="${v.id}" ${String(state.venue_id) === String(v.id) ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
        <select class="select" data-filter="teacher_id"><option value="">全部讲师</option>
          ${(store.lookups.users || []).filter((u) => ['leader', 'admin', 'superadmin'].includes(u.role)).map((u) => `<option value="${u.id}" ${String(state.teacher_id) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
        <select class="select" data-filter="course_id"><option value="">全部课程</option>
          ${(store.lookups.courses || []).map((c) => `<option value="${c.id}" ${String(state.course_id) === String(c.id) ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>
        <button class="btn btn-sm" data-export-ics="1">导出 .ics</button>
      </div>`}
    </div>
    <div class="sched-wrap"><div class="sched">
      <div class="hd">时间</div>
      ${days.map((d) => {
      const wd = WD[(new Date(`${d}T00:00:00`).getDay() + 6) % 7];
      return `<div class="hd ${d === today ? 'today' : ''}">${wd}<span class="d">${d.slice(5)}</span></div>`;
    }).join('')}`;

    SLOTS.forEach(([a, b], r) => {
      html += `<div class="slot">${a}<br><span style="opacity:.6">${b}</span></div>`;
      days.forEach((d) => {
        const items = byCell[`${d}|${r}`] || [];
        html += `<div class="cell ${d === today ? 'today' : ''}">${items.map((s) => `
          <div class="sc-item ${s.status}" data-session="${s.id}" title="${esc(s.course_title || '')} ${esc(s.topic || '')}">
            <span class="t">${esc(s.course_title || s.topic || '课程')}</span>
            <span class="m">${esc(s.start_time)}-${esc(s.end_time)} ${esc(s.venue_name || '')}</span>
          </div>`).join('')}</div>`;
      });
    });
    html += '</div></div>';

    const total = data.sessions.length;
    html += `<div class="row-wrap small muted" style="margin-top:10px;gap:16px">
      <span>共 ${total} 次课</span>
      <span><span class="badge badge-info">待上课</span> 正常</span>
      <span><span class="badge badge-warn">已调课</span> 时间有变</span>
      <span><span class="badge">已停课</span> 不上</span>
      <span><span class="badge badge-ok">已结束</span> 已完成</span>
    </div>`;

    host.innerHTML = html;

    host.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      state.from = addDays(state.from, Number(b.dataset.nav) * 7);
      load();
    }));
    host.querySelectorAll('[data-filter]').forEach((sel) => sel.addEventListener('change', () => {
      state[sel.dataset.filter] = sel.value;
      load();
    }));
    host.querySelector('[data-export-ics]')?.addEventListener('click', () => {
      api.exportCsv(`/calendar.ics?from=${state.from}&to=${addDays(state.from, state.days)}&types=course`);
      toastOk('已开始导出日历文件');
    });
    host.querySelectorAll('[data-session]').forEach((n) => n.addEventListener('click', () => {
      openSession(Number(n.dataset.session), { editable, onChange: load });
    }));
  }

  await load();
  return { reload: load, state };
}

/* --------------------------------------------------------- 课次详情/点名 */

export async function openSession(sessionId, { editable = false, onChange } = {}) {
  let data;
  try {
    data = (await api.get(`/admin/sessions/${sessionId}/roster`)).data;
  } catch (e) {
    toastErr(e.message);
    return;
  }
  const s = data.session;

  const renderBody = () => {
    const rows = data.roster.map((r) => `
      <div class="roll-row" data-uid="${r.user_id}">
        ${avatarHtml(r.name, r.avatar, 'avatar-sm')}
        <div class="nm">
          <div class="small bold">${esc(r.name)} <span class="muted tiny">${esc(r.username)}</span></div>
          <div class="tiny muted">${esc(r.department_name || '未分配部门')}${r.leave_status === 'approved' ? ' · 已批准请假' : r.leave_status === 'pending' ? ' · 请假待审' : ''}</div>
        </div>
        <div class="roll-seg">
          ${['present', 'late', 'absent', 'leave'].map((v) => `
            <button type="button" data-v="${v}" aria-pressed="${r.attendance_status === v}" ${editable ? '' : 'disabled'}>
              ${{ present: '到', late: '迟', absent: '缺', leave: '假' }[v]}
            </button>`).join('')}
        </div>
      </div>`).join('');

    return `
    <div class="grid g2" style="gap:var(--sp-3);margin-bottom:var(--sp-4)">
      <div class="panel">
        <div class="kv">
          <dt>课程</dt><dd>${esc(s.course_title || '—')}</dd>
          <dt>课次</dt><dd>第 ${s.seq} 讲${s.topic ? ' · ' + esc(s.topic) : ''}</dd>
          <dt>时间</dt><dd>${esc(s.date)} ${esc(s.start_time)}–${esc(s.end_time)}</dd>
          <dt>场地</dt><dd>${esc(s.venue_name || '未指定')}</dd>
          <dt>讲师</dt><dd>${esc(s.teacher_name || '未指定')}</dd>
          <dt>状态</dt><dd>${badge(s.status)}</dd>
          ${s.cancel_reason ? `<dt>说明</dt><dd>${esc(s.cancel_reason)}</dd>` : ''}
        </div>
      </div>
      <div class="panel">
        <div class="kv" style="margin-bottom:10px">
          <dt>应到</dt><dd>${data.summary.total} 人</dd>
          <dt>已点名</dt><dd>${data.summary.total - data.summary.unchecked} 人</dd>
        </div>
        <div class="row-wrap" style="gap:8px">
          <span class="badge badge-ok">到 ${data.summary.present}</span>
          <span class="badge badge-warn">迟 ${data.summary.late}</span>
          <span class="badge badge-danger">缺 ${data.summary.absent}</span>
          <span class="badge badge-info">假 ${data.summary.leave}</span>
        </div>
        <div style="margin-top:14px">
          <div class="small muted">自助签到码（学员在会员中心输入）</div>
          <div class="mono bold" style="font-size:26px;letter-spacing:.22em">${esc(data.checkinCode)}</div>
        </div>
      </div>
    </div>

    ${editable ? `<div class="row-wrap" style="margin-bottom:10px">
      <button class="btn btn-sm" id="all-present">一键全部到课</button>
      <button class="btn btn-sm" id="all-absent">全部标记缺席</button>
      <span class="grow"></span>
      <button class="btn btn-sm" id="btn-cancel-session">停课</button>
      <button class="btn btn-sm" id="btn-resched">调课</button>
    </div>` : ''}

    <div class="roll">${rows || '<div class="muted center small" style="padding:20px">还没有学员选这门课</div>'}</div>`;
  };

  const box = el('div');
  const { root, close } = modal({
    title: `${s.course_title || '课次'} · 第 ${s.seq} 讲`,
    body: box,
    size: 'wide',
    footer: ''
  });

  const marks = {};
  for (const r of data.roster) marks[r.user_id] = r.attendance_status || '';

  function paint() {
    box.innerHTML = renderBody();
    box.querySelectorAll('.roll-row').forEach((row) => {
      const uid = Number(row.dataset.uid);
      row.querySelectorAll('.roll-seg button').forEach((b) => {
        b.addEventListener('click', () => {
          const v = b.dataset.v;
          marks[uid] = marks[uid] === v ? '' : v;
          row.querySelectorAll('.roll-seg button').forEach((x) => x.setAttribute('aria-pressed', String(marks[uid] === x.dataset.v)));
        });
      });
    });
    box.querySelector('#all-present')?.addEventListener('click', () => {
      for (const r of data.roster) marks[r.user_id] = 'present';
      paint();
    });
    box.querySelector('#all-absent')?.addEventListener('click', () => {
      for (const r of data.roster) marks[r.user_id] = 'absent';
      paint();
    });
    box.querySelector('#btn-cancel-session')?.addEventListener('click', () => changeStatus(s.id, 'cancelled'));
    box.querySelector('#btn-resched')?.addEventListener('click', () => reschedule(s));
  }
  paint();

  const ft = el('div', { class: 'modal-ft' });
  const save = el('button', { class: 'btn btn-primary', type: 'button', text: '保存点名' });
  const closeBtn = el('button', { class: 'btn', type: 'button', text: '关闭' });
  closeBtn.addEventListener('click', close);
  save.addEventListener('click', async () => {
    const records = Object.entries(marks).filter(([, v]) => v).map(([uid, v]) => ({ user_id: Number(uid), status: v }));
    if (!records.length) return toastWarn('还没有标记任何学员');
    try {
      save.disabled = true; save.innerHTML = '<span class="spinner"></span> 保存中';
      const r = await api.post(`/admin/sessions/${s.id}/attendance`, { records });
      toastOk(`已保存 ${r.data.marked} 条点名记录`);
      close();
      if (onChange) onChange();
    } catch (e) {
      toastErr(e.message);
      save.disabled = false; save.textContent = '保存点名';
    }
  });
  ft.append(closeBtn);
  if (editable) ft.append(save);
  root.append(ft);

  async function changeStatus(id, status) {
    const reason = status === 'cancelled'
      ? await new Promise((res) => {
        const input = el('input', { class: 'input', placeholder: '停课原因（选填）' });
        const { root: r2, close: c2 } = modal({
          title: '停课', size: 'narrow',
          body: el('div', { class: 'field' }, [el('label', { text: '停课原因' }), input]),
          footer: ''
        });
        const f2 = el('div', { class: 'modal-ft' });
        const b1 = el('button', { class: 'btn', type: 'button', text: '取消' });
        const b2 = el('button', { class: 'btn btn-danger-solid', type: 'button', text: '确认停课' });
        b1.addEventListener('click', () => { c2(); res(null); });
        b2.addEventListener('click', () => { c2(); res(input.value); });
        f2.append(b1, b2); r2.append(f2);
      })
      : '';
    if (reason === null) return;
    try {
      await api.post(`/admin/sessions/${id}/status`, { status, cancel_reason: reason });
      toastOk('已更新课次状态，已通知选课学员');
      close();
      if (onChange) onChange();
    } catch (e) { toastErr(e.message); }
  }

  function reschedule(sess) {
    const fields = {
      date: { type: 'date', label: '新日期', required: true },
      start_time: { type: 'time', label: '开始时间', required: true },
      end_time: { type: 'time', label: '结束时间', required: true },
      venue_id: { type: 'ref', label: '场地', ref: 'venues' },
      teacher_id: { type: 'ref', label: '讲师', ref: 'users' },
      cancel_reason: { type: 'text', label: '调整原因' }
    };
    const form = renderForm(fields, {
      date: sess.date, start_time: sess.start_time, end_time: sess.end_time,
      venue_id: sess.venue_id, teacher_id: sess.teacher_id, cancel_reason: ''
    }, { cols: 2 });
    const { root: r3, close: c3 } = modal({ title: '调课', body: form.node, size: 'wide', footer: '' });
    const f3 = el('div', { class: 'modal-ft' });
    const b1 = el('button', { class: 'btn', type: 'button', text: '取消' });
    const b2 = el('button', { class: 'btn btn-primary', type: 'button', text: '保存调整' });
    b1.addEventListener('click', c3);
    b2.addEventListener('click', async () => {
      try {
        const body = { ...form.read(), status: 'rescheduled' };
        const r = await api.post(`/admin/sessions/${sess.id}/status`, body);
        toastOk('调课成功');
        c3(); close();
        if (onChange) onChange();
      } catch (e) {
        if (e.status === 409) {
          const keep = await confirmDialog(`${e.message}\n\n是否仍然强制保存？`, { title: '时间冲突', okText: '强制保存', danger: true });
          if (keep) {
            await api.post(`/admin/sessions/${sess.id}/status`, { ...form.read(), status: 'rescheduled', force: 1 });
            toastOk('已强制调课');
            c3(); close();
            if (onChange) onChange();
          }
        } else toastErr(e.message);
      }
    });
    f3.append(b1, b2); r3.append(f3);
  }
}

/* ------------------------------------------------------- 批量排课（后台） */

export async function openGenerateSessions(course, onDone) {
  const fields = {
    start_date: { type: 'date', label: '首次上课日期', required: true, help: '会从该日期所在周的指定星期开始' },
    weekday: {
      type: 'select', label: '每周星期', required: true, default: '1',
      options: [['1', '周一'], ['2', '周二'], ['3', '周三'], ['4', '周四'], ['5', '周五'], ['6', '周六'], ['7', '周日']]
    },
    weeks: { type: 'number', label: '连续周数', required: true, default: 8, min: 1, max: 30 },
    start_time: { type: 'time', label: '开始时间', required: true, default: '19:00' },
    end_time: { type: 'time', label: '结束时间', required: true, default: '21:00' },
    venue_id: { type: 'ref', label: '场地', ref: 'venues' },
    teacher_id: { type: 'ref', label: '讲师', ref: 'users' },
    topic_prefix: { type: 'text', label: '课次主题前缀', default: course.title }
  };
  const form = renderForm(fields, {
    start_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    weekday: '1', weeks: 8, start_time: '19:00', end_time: '21:00',
    venue_id: course.default_venue_id, teacher_id: course.teacher_id, topic_prefix: course.title
  }, { cols: 2 });

  const info = el('div', { class: 'alert alert-info', style: { marginBottom: 'var(--sp-4)' } });
  info.innerHTML = '排课时会自动检测<b>场地冲突</b>与<b>讲师冲突</b>；若存在冲突会阻止保存并列出冲突明细。';

  const holder = el('div');
  holder.append(info, form.node);

  const { root, close } = modal({ title: `批量排课：${course.title}`, body: holder, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '生成课表' });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    let body;
    try { body = form.read(); } catch (e) { return toastErr(e.message); }
    try {
      ok.disabled = true; ok.innerHTML = '<span class="spinner"></span> 生成中';
      const r = await api.post(`/admin/courses/${course.id}/generate-sessions`, body);
      toastOk(`已生成 ${r.data.created} 次课，并通知了选课学员`);
      close();
      if (onDone) onDone();
    } catch (e) {
      ok.disabled = false; ok.textContent = '生成课表';
      if (e.status === 409 && e.payload?.conflicts) {
        const list = e.payload.conflicts.map((c) => `<li>${esc(c.date)} ${esc(c.start_time)}-${esc(c.end_time)}：${esc(c.message)}</li>`).join('');
        const keep = await confirmDialog(
          `检测到 ${e.payload.conflicts.length} 处冲突，仍然强制排课吗？`,
          { title: '时间冲突', okText: '强制排课', danger: true }
        );
        info.className = 'alert alert-danger';
        info.innerHTML = `<div><b>冲突明细</b><ul style="margin:6px 0 0;padding-left:18px">${list}</ul></div>`;
        if (keep) {
          try {
            await api.post(`/admin/courses/${course.id}/generate-sessions`, { ...body, force: 1 });
            toastWarn('已强制排课，请尽快处理冲突');
            close();
            if (onDone) onDone();
          } catch (e2) { toastErr(e2.message); }
        }
      } else toastErr(e.message);
    }
  });
  ft.append(cancel, ok);
  root.append(ft);
}
