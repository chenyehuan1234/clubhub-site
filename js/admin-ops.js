/* ============================================================================
 *  admin-ops.js — 后台运营模块
 *  任务看板 · 物资借还 · 值班排班 · 会议纪要 · 投票结果
 * ==========================================================================*/

import { api } from './api.js';
import { store, has, fmt, lookupName } from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, toastWarn, modal, drawer, confirmDialog,
  badge, emptyHtml, loadingHtml, esc, avatarHtml, renderForm, renderTable, renderPager,
  cellValue, cover
} from './ui.js';
import { renderCrud } from './admin-crud.js';
import { donut, rankBars, barChart } from './charts.js';

/* ==========================================================================
 *  任务看板
 * ========================================================================*/

export async function viewTaskBoard(host) {
  const COLUMNS = [
    { key: 'todo', label: '待办', ic: '📥' },
    { key: 'doing', label: '进行中', ic: '🚀' },
    { key: 'review', label: '待审核', ic: '🔍' },
    { key: 'done', label: '已完成', ic: '✅' }
  ];
  host.innerHTML = `
    <div class="page-head">
      <div><h2>任务看板</h2><p>拖动卡片即可改变状态</p></div>
      <div class="toolbar">
        <input class="input" id="t-q" placeholder="搜索任务…" style="min-width:180px">
        <select class="select" id="t-dept"><option value="">全部部门</option>
          ${(store.lookups.departments || []).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
        <button class="btn" id="t-mine">只看我的</button>
        <button class="btn" id="t-list">列表视图</button>
        ${has('task.write') ? '<button class="btn btn-primary" id="t-new">＋ 新建任务</button>' : ''}
      </div>
    </div>
    <div class="dash-grid" id="t-stats" style="margin-bottom:var(--sp-4)"></div>
    <div id="board"></div>`;

  let mineOnly = false;
  let filters = {};

  async function load() {
    $('#board').innerHTML = loadingHtml('加载看板…');
    try {
      const r = await api.get('/admin/tasks/board', { ...filters, mine: mineOnly ? 1 : undefined });
      const d = r.data;
      $('#t-stats').innerHTML = `
        <div class="card stat"><div class="stat-k">任务总数</div><div class="stat-v">${d.stats.total}</div></div>
        <div class="card stat"><div class="stat-k">进行中</div><div class="stat-v">${d.columns.find((c) => c.key === 'doing')?.count || 0}</div></div>
        <div class="card stat"><div class="stat-k">已逾期</div><div class="stat-v" style="color:${d.stats.overdue ? 'var(--danger)' : ''}">${d.stats.overdue}</div></div>
        <div class="card stat"><div class="stat-k">紧急未完成</div><div class="stat-v" style="color:${d.stats.urgent ? 'var(--warn)' : ''}">${d.stats.urgent}</div></div>`;

      $('#board').innerHTML = `<div class="kanban">${d.columns.map((col) => `
        <div class="kcol" data-col="${col.key}">
          <div class="kcol-hd"><span>${COLUMNS.find((c) => c.key === col.key).ic} ${COLUMNS.find((c) => c.key === col.key).label}</span>
            <span class="badge">${col.count}</span></div>
          <div class="kcol-bd" data-drop="${col.key}">
            ${col.items.map((t) => card(t)).join('') || '<div class="muted tiny center" style="padding:14px">拖到这里</div>'}
          </div>
        </div>`).join('')}</div>`;

      bind(d);
    } catch (e) {
      $('#board').innerHTML = emptyHtml('加载失败', e.message, '⚠');
    }
  }

  function card(t) {
    return `<div class="kcard ${t.overdue ? 'overdue' : ''}" draggable="true" data-id="${t.id}">
      <div class="t">${esc(t.title)}</div>
      <div class="meta">
        ${badge(t.priority)}
        ${t.assignee_name ? `<span>${esc(t.assignee_name)}</span>` : '<span class="muted">未指派</span>'}
        ${t.due_at ? `<span style="color:${t.overdue ? 'var(--danger)' : ''}">${esc(t.due_at.slice(5))}</span>` : ''}
        ${t.comment_count ? `<span>💬 ${t.comment_count}</span>` : ''}
      </div>
      ${t.progress ? `<div class="bar" style="margin-top:7px;height:4px"><i style="width:${t.progress}%"></i></div>` : ''}
    </div>`;
  }

  function bind(data) {
    const board = $('#board');
    board.querySelectorAll('.kcard').forEach((c) => {
      c.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.dataset.id);
        c.classList.add('dragging');
      });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
      c.addEventListener('click', () => openTask(Number(c.dataset.id), load, data));
    });
    board.querySelectorAll('[data-drop]').forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.closest('.kcol').classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.closest('.kcol').classList.remove('dragover'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.closest('.kcol').classList.remove('dragover');
        const id = Number(e.dataTransfer.getData('text/plain'));
        const status = zone.dataset.drop;
        if (!id) return;
        try {
          await api.post(`/admin/tasks/${id}/status`, { status });
          toastOk('已移动');
          load();
        } catch (err) { toastErr(err.message); }
      });
    });
  }

  $('#t-q').addEventListener('input', debounce(() => { filters.q = $('#t-q').value.trim(); load(); }, 320));
  $('#t-dept').addEventListener('change', () => { filters.department_id = $('#t-dept').value; load(); });
  $('#t-mine').addEventListener('click', (e) => {
    mineOnly = !mineOnly;
    e.target.classList.toggle('btn-primary', mineOnly);
    load();
  });
  $('#t-list').addEventListener('click', () => renderCrud(host, 'tasks'));
  $('#t-new')?.addEventListener('click', () => openTaskForm(null, load));

  await load();
}

async function openTask(id, reload, boardData) {
  let task = null;
  try {
    const r = await api.get(`/admin/tasks/${id}`);
    task = r.data;
  } catch (e) { return toastErr(e.message); }

  const box = el('div');
  const { root, close } = drawer({ title: task.title, body: box, size: 'wide', footer: '' });

  async function paint() {
    let comments = [];
    try { comments = (await api.get(`/admin/tasks/${id}/comments`)).data || []; } catch { /* ignore */ }
    let checklist = [];
    try { checklist = JSON.parse(task.checklist || '[]'); } catch { checklist = []; }

    box.innerHTML = `
      <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-4)">
        ${badge(task.status)}${badge(task.priority)}
        <span class="badge badge-line">${esc(lookupName('departments', task.department_id) || '社务')}</span>
        ${task.due_at ? `<span class="badge ${task.due_at < new Date().toISOString().slice(0, 10) && task.status !== 'done' ? 'badge-danger' : ''}">截止 ${esc(task.due_at)}</span>` : ''}
      </div>

      <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-4)">
        <span class="small muted">负责人：</span>
        ${task.assignee_id ? `${avatarHtml(lookupName('users', task.assignee_id), '', 'avatar-sm')}<b class="small">${esc(lookupName('users', task.assignee_id))}</b>` : '<span class="muted small">未指派</span>'}
        <span class="grow"></span>
        ${has('task.assign') ? '<button class="btn btn-sm" id="k-assign">重新指派</button>' : ''}
        ${has('task.write') ? '<button class="btn btn-sm" id="k-edit">编辑</button>' : ''}
        ${has('task.delete') ? '<button class="btn btn-sm btn-danger" id="k-del">删除</button>' : ''}
      </div>

      <div class="panel" style="margin-bottom:var(--sp-4)">
        <div class="md small">${task.description ? esc(task.description).replace(/\n/g, '<br>') : '<span class="muted">暂无说明</span>'}</div>
      </div>

      <div class="row" style="gap:10px;margin-bottom:var(--sp-4)">
        <div class="bar grow"><i style="width:${task.progress || 0}%"></i></div>
        <span class="small mono muted">${task.progress || 0}%</span>
      </div>

      ${checklist.length ? `<h4 style="margin-bottom:10px">子任务</h4>
        <div class="col" style="gap:6px;margin-bottom:var(--sp-4)">
          ${checklist.map((c, i) => `<label class="check"><input type="checkbox" data-chk="${i}" ${c.done ? 'checked' : ''}>
            <span style="${c.done ? 'text-decoration:line-through;color:var(--ink-3)' : ''}">${esc(c.text)}</span></label>`).join('')}
        </div>` : ''}

      <h4 style="margin-bottom:10px">状态</h4>
      <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-5)">
        ${['todo', 'doing', 'review', 'done'].map((s0) => `<button class="btn btn-sm ${task.status === s0 ? 'btn-primary' : ''}" data-st="${s0}">
          ${{ todo: '待办', doing: '进行中', review: '待审核', done: '已完成' }[s0]}</button>`).join('')}
      </div>

      <h4 style="margin-bottom:10px">讨论（${comments.length}）</h4>
      <div class="col" style="gap:10px;margin-bottom:var(--sp-3)">
        ${comments.map((c) => `<div class="row" style="gap:10px;align-items:flex-start">
          ${avatarHtml(c.name, c.avatar, 'avatar-sm')}
          <div class="grow panel" style="padding:9px 12px">
            <div class="row-between"><b class="small">${esc(c.name || c.user_name || '')}</b><span class="tiny muted">${esc(fmt.rel(c.created_at))}</span></div>
            <div class="small" style="margin-top:3px">${esc(c.content)}</div>
          </div></div>`).join('') || '<div class="muted small">还没有讨论</div>'}
      </div>
      <div class="row" style="gap:8px">
        <input class="input grow" id="k-comment" placeholder="写点什么…">
        <button class="btn btn-primary" id="k-send">发送</button>
      </div>`;

    box.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
      try {
        task = (await api.post(`/admin/tasks/${id}/status`, { status: b.dataset.st })).data;
        toastOk('状态已更新');
        paint(); reload();
      } catch (e) { toastErr(e.message); }
    }));
    box.querySelectorAll('[data-chk]').forEach((c) => c.addEventListener('change', async () => {
      try {
        const r = await api.post(`/admin/tasks/${id}/checklist`, { index: Number(c.dataset.chk) });
        task.checklist = JSON.stringify(r.data.checklist);
        task.progress = r.data.progress;
        paint();
      } catch (e) { toastErr(e.message); }
    }));
    $('#k-send').addEventListener('click', async () => {
      const v = $('#k-comment').value.trim();
      if (!v) return;
      try {
        await api.post(`/admin/tasks/${id}/comment`, { content: v });
        $('#k-comment').value = '';
        paint();
      } catch (e) { toastErr(e.message); }
    });
    $('#k-edit')?.addEventListener('click', () => openTaskForm(task, () => { close(); reload(); }));
    $('#k-assign')?.addEventListener('click', () => openAssign(task, () => { close(); reload(); }));
    $('#k-del')?.addEventListener('click', async () => {
      if (!(await confirmDialog('删除这个任务？', { danger: true, okText: '删除' }))) return;
      try { await api.del(`/admin/tasks/${id}`); toastOk('已删除'); close(); reload(); }
      catch (e) { toastErr(e.message); }
    });
  }

  await paint();
}

export function openTaskForm(task, onDone) {
  const fields = {
    title: { type: 'text', label: '任务标题', required: true },
    status: { type: 'select', label: '状态', options: [['todo', '待办'], ['doing', '进行中'], ['review', '待审核'], ['done', '已完成']], default: 'todo' },
    priority: { type: 'select', label: '优先级', options: [['low', '低'], ['normal', '普通'], ['high', '高'], ['urgent', '紧急']], default: 'normal' },
    assignee_id: { type: 'ref', label: '负责人', ref: 'users' },
    department_id: { type: 'ref', label: '所属部门', ref: 'departments' },
    start_at: { type: 'date', label: '开始日期' },
    due_at: { type: 'date', label: '截止日期' },
    event_id: { type: 'ref', label: '关联活动', ref: 'events' },
    progress: { type: 'number', label: '进度 %', default: 0, min: 0, max: 100 },
    tags: { type: 'tags', label: '标签' },
    description: { type: 'richtext', label: '任务说明' }
  };
  const form = renderForm(fields, task || {}, { cols: 2 });
  const { root, close } = modal({ title: task ? '编辑任务' : '新建任务', body: form.node, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: task ? '保存' : '创建' });
  c1.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    let body;
    try { body = form.read(); } catch (e) { return toastErr(e.message); }
    if (!body.title) return toastErr('请填写任务标题');
    try {
      if (task) await api.patch(`/admin/tasks/${task.id}`, body);
      else await api.post('/admin/tasks', body);
      toastOk('已保存');
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(c1, ok); root.append(ft);
}

async function openAssign(task, onDone) {
  const users = store.lookups.users || [];
  const body = el('div', { class: 'field' });
  body.append(el('label', { text: '选择负责人' }));
  const sel = el('select', { class: 'select' });
  sel.append(el('option', { value: '', text: '（不指派）' }));
  for (const u of users) sel.append(el('option', { value: String(u.id), text: `${u.name}（${u.username}）`, selected: Number(u.id) === Number(task.assignee_id) }));
  body.append(sel);
  const { root, close } = modal({ title: '指派任务', body, size: 'narrow', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
  c1.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    try {
      await api.patch(`/admin/tasks/${task.id}`, { assignee_id: sel.value ? Number(sel.value) : null });
      toastOk('已指派');
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(c1, ok); root.append(ft);
}

/* ==========================================================================
 *  物资借还
 * ========================================================================*/

export async function viewAssets(host) {
  host.innerHTML = `
    <div class="page-head">
      <div><h2>物资与借用</h2><p>台账、借出、归还与逾期提醒</p></div>
      <div class="toolbar">
        <button class="btn" data-tab="loans">借用记录</button>
        <button class="btn btn-primary" data-tab="assets">物资台账</button>
      </div>
    </div>
    <div id="asset-body"></div>`;

  async function load() {
    try {
      const d = (await api.get('/admin/assets/overview')).data;
      const body = $('#asset-body');
      body.innerHTML = `
        <div class="dash-grid" style="margin-bottom:var(--sp-4)">
          <div class="card stat"><div class="stat-k">物资种类</div><div class="stat-v">${d.stats.kinds || 0}</div></div>
          <div class="card stat"><div class="stat-k">在库数量</div><div class="stat-v">${d.stats.available || 0}</div></div>
          <div class="card stat"><div class="stat-k">借用中</div><div class="stat-v">${d.activeLoans.length}</div></div>
          <div class="card stat"><div class="stat-k">逾期未还</div><div class="stat-v" style="color:${d.overdue ? 'var(--danger)' : ''}">${d.overdue}</div></div>
        </div>
        <div class="dash-2">
          <div class="card">
            <div class="card-hd"><h4>借用中 / 逾期</h4>
              <span class="small muted">共 ${d.activeLoans.length} 条</span></div>
            <div id="loan-table"></div>
          </div>
          <div class="col" style="gap:var(--sp-4)">
            <div class="card card-pad">
              <h4 style="margin-bottom:12px">库存偏低</h4>
              ${d.lowStock.length ? d.lowStock.map((a) => `<div class="row-between small" style="padding:5px 0">
                <span class="clip">${esc(a.name)}</span>
                <span class="mono ${a.available_qty === 0 ? '' : 'muted'}" style="${a.available_qty === 0 ? 'color:var(--danger)' : ''}">${a.available_qty}/${a.quantity} ${esc(a.unit)}</span>
              </div>`).join('') : '<div class="muted small">库存充足</div>'}
            </div>
            <div class="card card-pad">
              <h4 style="margin-bottom:10px">待审批借用</h4>
              <div id="pending-loans"></div>
            </div>
          </div>
        </div>`;

      $('#loan-table').append(renderTable({
        columns: [
          { key: 'asset_name', label: '物资' },
          { key: 'user_name', label: '借用人' },
          { key: 'quantity', label: '数量', align: 'right' },
          { key: 'borrowed_at', label: '借出' },
          { key: 'due_at', label: '应归还', render: (v, r) => v ? `<span style="color:${r.overdue ? 'var(--danger)' : ''}">${esc(v)}</span>` : '—' },
          { key: 'status', label: '状态', field: { type: 'select' } }
        ],
        rows: d.activeLoans, compact: true, empty: '当前没有借出中的物资',
        actions: (r) => has('asset.approve') ? `<button class="btn btn-sm btn-primary" data-return="${r.id}">登记归还</button>` : ''
      }));

      // 待审批
      const pending = (await api.get('/admin/asset_loans', { status: 'pending', pageSize: 20 })).items || [];
      $('#pending-loans').innerHTML = pending.length ? pending.map((l) => `
        <div class="row-between small" style="padding:6px 0;border-bottom:1px dashed var(--line)">
          <span><b>${esc(l.user_name || lookupName('users', l.user_id))}</b> 申请 ${esc(lookupName('assets', l.asset_id))} ×${l.quantity}</span>
          <span class="row" style="gap:5px">
            <button class="btn btn-sm btn-primary" data-approve="${l.id}" data-s="borrowed">通过</button>
            <button class="btn btn-sm btn-danger" data-approve="${l.id}" data-s="rejected">驳回</button>
          </span>
        </div>`).join('') : '<div class="muted small">没有待审批的申请</div>';

      body.addEventListener('click', async (e) => {
        const ret = e.target.closest('[data-return]');
        if (ret) {
          if (!(await confirmDialog('登记归还？库存会自动恢复。', { okText: '确认归还' }))) return;
          try { await api.post(`/admin/loans/${ret.dataset.return}/return`, {}); toastOk('已登记归还'); load(); }
          catch (err) { toastErr(err.message); }
          return;
        }
        const ap = e.target.closest('[data-approve]');
        if (ap) {
          try { await api.post(`/admin/loans/${ap.dataset.approve}/approve`, { status: ap.dataset.s }); toastOk('已处理'); load(); }
          catch (err) { toastErr(err.message); }
        }
      });
    } catch (e) {
      $('#asset-body').innerHTML = emptyHtml('加载失败', e.message, '⚠');
    }
  }

  host.querySelector('[data-tab="assets"]').addEventListener('click', (e) => {
    e.target.classList.add('btn-primary');
    host.querySelector('[data-tab="loans"]').classList.remove('btn-primary');
    renderCrud(host, 'assets', { title: '物资台账', subtitle: '管理社团的设备、办公用品与服装等' });
  });
  host.querySelector('[data-tab="loans"]').addEventListener('click', (e) => {
    e.target.classList.add('btn-primary');
    host.querySelector('[data-tab="assets"]').classList.remove('btn-primary');
    renderCrud(host, 'asset_loans', { title: '借用记录', subtitle: '审批、借出与归还登记' });
  });

  await load();
}

/* ==========================================================================
 *  值班排班
 * ========================================================================*/

export async function viewDuty(host) {
  host.innerHTML = `
    <div class="page-head">
      <div><h2>值班排班</h2><p>按日期与时段安排值班人员</p></div>
      <div class="toolbar">
        <button class="btn" id="d-prev">‹ 上一周</button>
        <button class="btn" id="d-today">本周</button>
        <button class="btn" id="d-next">下一周 ›</button>
        ${has('duty.write') ? '<button class="btn btn-primary" id="d-bulk">批量排班</button>' : ''}
        <button class="btn" id="d-list">列表视图</button>
      </div>
    </div>
    <div id="duty-week"></div>`;

  let from = mondayStr(new Date());

  async function load() {
    $('#duty-week').innerHTML = loadingHtml('加载值班表…');
    try {
      const d = (await api.get('/duty/week', { from, days: 7 })).data;
      const days = [];
      for (let i = 0; i < 7; i++) days.push(addDays(from, i));
      $('#duty-week').innerHTML = `<div class="cal-grid">
        ${days.map((x) => `<div class="cal-head">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'][(new Date(x + 'T00:00:00').getDay() + 6) % 7]}<br><span class="muted">${x.slice(5)}</span></div>`).join('')}
        ${days.map((x) => {
        const rows = d.byDate[x] || [];
        return `<div class="cal-cell ${x === d.today ? 'today' : ''}">
            ${rows.map((r) => `<div class="cal-ev t-duty" title="${esc(r.note || '')}">${esc(r.shift)} · ${esc(r.user_name || '')}</div>`).join('') || '<span class="tiny muted">—</span>'}
          </div>`;
      }).join('')}
      </div>
      <div class="small muted" style="margin-top:10px">共 ${d.rows.length} 个班次 · ${from} ~ ${addDays(from, 6)}</div>`;
    } catch (e) {
      $('#duty-week').innerHTML = emptyHtml('加载失败', e.message, '⚠');
    }
  }

  $('#d-prev').addEventListener('click', () => { from = addDays(from, -7); load(); });
  $('#d-next').addEventListener('click', () => { from = addDays(from, 7); load(); });
  $('#d-today').addEventListener('click', () => { from = mondayStr(new Date()); load(); });
  $('#d-list').addEventListener('click', () => renderCrud(host, 'duty_roster', { title: '值班列表' }));
  $('#d-bulk')?.addEventListener('click', () => openBulkDuty(from, load));

  await load();
}

function openBulkDuty(from, onDone) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(from, i));
  const datesBox = el('div', { class: 'row-wrap', style: { gap: '8px' } });
  for (const d of days) {
    const lab = el('label', { class: 'check' });
    const cb = el('input', { type: 'checkbox', value: d });
    lab.append(cb, document.createTextNode(` ${['周一', '周二', '周三', '周四', '周五', '周六', '周日'][(new Date(d + 'T00:00:00').getDay() + 6) % 7]} ${d.slice(5)}`));
    datesBox.append(lab);
  }
  const usersBox = el('div', { class: 'row-wrap', style: { gap: '8px', maxHeight: '220px', overflow: 'auto' } });
  for (const u of (store.lookups.users || [])) {
    const lab = el('label', { class: 'check' });
    const cb = el('input', { type: 'checkbox', value: String(u.id) });
    lab.append(cb, document.createTextNode(` ${u.name}`));
    usersBox.append(lab);
  }
  const shift = el('select', { class: 'select' }, [['上午', '上午'], ['下午', '下午'], ['晚上', '晚上'], ['全天', '全天']].map(([v, l]) => el('option', { value: v, text: l })));
  const loc = el('input', { class: 'input', value: '活动中心 302 社团办公室' });

  const body = el('div', { class: 'col', style: { gap: 'var(--sp-4)' } }, [
    el('div', { class: 'field' }, [el('label', { text: '选择日期' }), datesBox]),
    el('div', { class: 'field' }, [el('label', { text: '选择值班人' }), usersBox]),
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [el('label', { text: '时段' }), shift]),
      el('div', { class: 'field' }, [el('label', { text: '地点' }), loc])
    ])
  ]);

  const { root, close } = modal({ title: '批量排班', body, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '生成排班' });
  c1.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    const dates = $$('input[type=checkbox]', datesBox).filter((c) => c.checked).map((c) => c.value);
    const userIds = $$('input[type=checkbox]', usersBox).filter((c) => c.checked).map((c) => Number(c.value));
    if (!dates.length) return toastErr('请选择日期');
    if (!userIds.length) return toastErr('请选择值班人');
    try {
      const r = await api.post('/admin/duty/bulk', { dates, user_ids: userIds, shift: shift.value, location: loc.value });
      toastOk(`已生成 ${r.data.created} 个班次${r.data.skipped ? `，跳过重复 ${r.data.skipped} 个` : ''}`);
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(c1, ok); root.append(ft);
}

/* ==========================================================================
 *  会议纪要
 * ========================================================================*/

export async function viewMeetings(host) {
  const d = (await api.get('/admin/meetings/upcoming')).data;
  host.innerHTML = `
    <div class="page-head">
      <div><h2>会议与纪要</h2><p>安排会议、记录纪要、跟踪决议</p></div>
      <div class="toolbar">
        <button class="btn" id="m-list">全部会议</button>
        ${has('meeting.write') ? '<button class="btn btn-primary" id="m-new">＋ 新建会议</button>' : ''}
      </div>
    </div>
    <div class="dash-2">
      <div class="col" style="gap:var(--sp-4)">
        <div class="card">
          <div class="card-hd"><h4>待召开（${d.upcoming.length}）</h4></div>
          <div class="card-bd" style="padding-top:var(--sp-3)">
            ${d.upcoming.map((m) => `<div class="panel" style="margin-bottom:9px">
              <div class="row-between" style="gap:10px">
                <div><b>${esc(m.title)}</b>
                  <div class="tiny muted" style="margin-top:3px">${esc(m.date || '待定')} ${esc(m.start_time || '')}–${esc(m.end_time || '')} · ${esc(m.venue || '待定')} · 主持：${esc(m.host_name || '—')}</div></div>
                <span class="row" style="gap:6px">${badge(m.type)}${badge(m.status)}</span>
              </div></div>`).join('') || '<div class="muted small">近期没有安排会议</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h4>最近会议</h4></div>
          <div id="recent-m"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h4>决议事项跟踪</h4><span class="small muted">${d.pendingResolutions.length} 项未完成</span></div>
        <div class="card-bd" style="padding-top:var(--sp-3)">
          ${d.pendingResolutions.map((r) => `<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)">
            <div class="grow" style="min-width:0">
              <div class="small">${esc(r.text)}</div>
              <div class="tiny muted">${esc(r.meeting_title)} · 负责人 ${esc(lookupName('users', r.owner_id) || '—')} · 截止 ${esc(r.due || '—')}</div>
            </div>
            <button class="btn btn-sm" data-res="${r.meeting_id}" data-idx="${r.index}">标记完成</button>
          </div>`).join('') || '<div class="muted small">没有待跟进的决议</div>'}
        </div>
      </div>
    </div>`;

  $('#recent-m').append(renderTable({
    columns: [
      { key: 'date', label: '日期' }, { key: 'title', label: '会议' },
      { key: 'type', label: '类型' }, { key: 'host_name', label: '主持' },
      { key: 'status', label: '状态', field: { type: 'select' } }
    ],
    rows: d.recent, compact: true, empty: '暂无历史会议',
    actions: (r) => `<button class="btn btn-sm" data-open="${r.id}">查看</button>`
  }));

  host.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-res]');
    if (r) {
      try {
        await api.post(`/admin/meetings/${r.dataset.res}/resolution`, { index: Number(r.dataset.idx) });
        toastOk('已标记为完成');
        viewMeetings(host);
      } catch (err) { toastErr(err.message); }
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o) openMeeting(Number(o.dataset.open), () => viewMeetings(host));
  });

  $('#m-list').addEventListener('click', () => renderCrud(host, 'meetings', { title: '全部会议' }));
  $('#m-new')?.addEventListener('click', () => openMeetingForm(null, () => viewMeetings(host)));
}

async function openMeeting(id, onDone) {
  let m;
  try { m = (await api.get(`/admin/meetings/${id}`)).data; } catch (e) { return toastErr(e.message); }
  let resolutions = [];
  try { resolutions = JSON.parse(m.resolutions || '[]'); } catch { resolutions = []; }
  const body = el('div');
  body.innerHTML = `
    <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-4)">${badge(m.type)}${badge(m.status)}
      <span class="badge badge-line">${esc(m.date || '')} ${esc(m.start_time || '')}–${esc(m.end_time || '')}</span>
      <span class="badge">${esc(m.venue || '')}</span></div>
    <h4>议程</h4>
    <div class="md small panel" style="margin:8px 0 var(--sp-4)">${esc(m.agenda || '（未填写）').replace(/\n/g, '<br>')}</div>
    <h4>会议纪要</h4>
    <div class="md small panel" style="margin:8px 0 var(--sp-4)">${esc(m.minutes || '（未填写）').replace(/\n/g, '<br>')}</div>
    <h4>决议事项</h4>
    <div class="col" style="gap:7px;margin-top:8px">
      ${resolutions.map((r, i) => `<label class="check">
        <input type="checkbox" data-ri="${i}" ${r.done ? 'checked' : ''}>
        <span style="${r.done ? 'text-decoration:line-through;color:var(--ink-3)' : ''}">${esc(r.text)} · ${esc(lookupName('users', r.owner_id) || '—')} · ${esc(r.due || '')}</span></label>`).join('') || '<span class="muted small">没有决议事项</span>'}
    </div>`;

  const { root, close } = modal({ title: m.title, body, size: 'wide', footer: '' });
  body.querySelectorAll('[data-ri]').forEach((c) => c.addEventListener('change', async () => {
    try {
      await api.post(`/admin/meetings/${m.id}/resolution`, { index: Number(c.dataset.ri) });
      toastOk('已更新');
    } catch (e) { toastErr(e.message); }
  }));
  const ft = el('div', { class: 'modal-ft' });
  if (has('meeting.write')) {
    const ed = el('button', { class: 'btn', type: 'button', text: '编辑' });
    ed.addEventListener('click', () => { close(); openMeetingForm(m, onDone); });
    ft.append(ed);
  }
  const cl = el('button', { class: 'btn btn-primary', type: 'button', text: '关闭' });
  cl.addEventListener('click', close);
  ft.prepend(cl);
  root.append(ft);
}

function openMeetingForm(m, onDone) {
  const fields = {
    title: { type: 'text', label: '会议主题', required: true },
    type: { type: 'select', label: '类型', options: [['例会', '例会'], ['临时会', '临时会'], ['换届', '换届'], ['培训', '培训']], default: '例会' },
    date: { type: 'date', label: '日期' },
    start_time: { type: 'time', label: '开始' },
    end_time: { type: 'time', label: '结束' },
    venue: { type: 'text', label: '地点' },
    host_id: { type: 'ref', label: '主持人', ref: 'users' },
    status: { type: 'select', label: '状态', options: [['planned', '待召开'], ['done', '已完成'], ['cancelled', '已取消']], default: 'planned' },
    attendees: { type: 'json', label: '参会人员（成员 ID 数组）', help: '如 [3,4,5]' },
    agenda: { type: 'richtext', label: '会议议程' },
    minutes: { type: 'richtext', label: '会议纪要' },
    resolutions: { type: 'json', label: '决议事项', help: '形如 [{"text":"…","owner_id":3,"due":"2025-10-01","done":false}]' }
  };
  const form = renderForm(fields, m || { attendees: [], resolutions: [] }, { cols: 2 });
  const { root, close } = modal({ title: m ? '编辑会议' : '新建会议', body: form.node, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
  c1.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    let body;
    try { body = form.read(); } catch (e) { return toastErr(e.message); }
    if (!body.title) return toastErr('请填写会议主题');
    try {
      if (m) await api.patch(`/admin/meetings/${m.id}`, body);
      else await api.post('/admin/meetings', body);
      toastOk('已保存');
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(c1, ok); root.append(ft);
}

/* ==========================================================================
 *  投票结果
 * ========================================================================*/

export async function viewPolls(host) {
  host.innerHTML = `
    <div class="page-head">
      <div><h2>投票与决策</h2><p>查看参与率与实时结果</p></div>
      <div class="toolbar">
        <button class="btn" id="p-list">管理投票</button>
        ${has('poll.write') ? '<button class="btn btn-primary" id="p-new">＋ 发起投票</button>' : ''}
      </div>
    </div>
    <div class="grid g2" id="poll-cards"></div>`;

  async function load() {
    try {
      const list = (await api.get('/polls')).data || [];
      $('#poll-cards').innerHTML = list.map((p) => `
        <div class="card card-pad">
          <div class="row-between" style="gap:10px;align-items:flex-start">
            <div>
              <h4 style="margin:0 0 4px">${esc(p.title)}</h4>
              <div class="row-wrap" style="gap:7px">${badge(p.status)}${p.anonymous ? '<span class="badge">匿名</span>' : ''}
                <span class="badge badge-line">${p.type === 'single' ? '单选' : '多选'}</span>
                <span class="badge badge-line">${esc({ all: '全体社员', role: '按角色', department: '按部门', users: '指定成员' }[p.target_type] || p.target_type)}</span></div>
            </div>
            <button class="btn btn-sm" data-detail="${p.id}">明细</button>
          </div>
          <div class="row-wrap small muted" style="gap:14px;margin:10px 0 var(--sp-4)">
            <span>参与率 ${p.participation}%</span><span>${p.total_votes}/${p.eligible} 人</span>
            ${p.end_at ? `<span>${esc(fmt.date(p.end_at))} 截止</span>` : ''}
          </div>
          ${donut(p.options.map((o) => ({ label: o.label, value: p.counts[o.key] || 0 })), { size: 165, thickness: 22, centerLabel: '总票数' })}
        </div>`).join('') || emptyHtml('还没有投票', '', '🗳️');
    } catch (e) {
      $('#poll-cards').innerHTML = emptyHtml('加载失败', e.message, '⚠');
    }
  }

  host.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-detail]');
    if (!d) return;
    try {
      const r = (await api.get(`/admin/polls/${d.dataset.detail}/results`)).data;
      const body = el('div');
      body.innerHTML = `
        <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-4)">${badge(r.poll.status)}
          <span class="badge badge-line">${r.poll.type === 'single' ? '单选' : '多选'}</span>
          ${r.poll.anonymous ? '<span class="badge">匿名投票</span>' : ''}</div>
        ${barChart(r.options.map((o) => ({ label: o.label, value: r.counts[o.key] || 0 })), { height: 200 })}
        <h4 style="margin:var(--sp-5) 0 10px">投票人${r.poll.anonymous ? '（匿名）' : `（${r.voters.length}）`}</h4>
        ${r.poll.anonymous ? '<div class="muted small">该投票为匿名，不展示投票人</div>'
      : `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>姓名</th><th>部门</th><th>选择</th><th>时间</th></tr></thead>
            <tbody>${r.voters.map((v) => `<tr><td>${esc(v.name || '')}</td><td>${esc(v.department_name || '')}</td>
              <td>${v.choices.map((c) => `<span class="tag">${esc(r.options.find((o) => o.key === c)?.label || c)}</span>`).join(' ')}</td>
              <td class="small nowrap">${esc(fmt.dt(v.created_at))}</td></tr>`).join('')}</tbody></table></div>`}`;
      modal({ title: r.poll.title, body, size: 'wide' });
    } catch (err) { toastErr(err.message); }
  });

  $('#p-list').addEventListener('click', () => renderCrud(host, 'polls', { title: '投票管理' }));
  $('#p-new')?.addEventListener('click', () => renderCrud(host, 'polls', { title: '投票管理' }));

  await load();
}

/* ------------------------------------------------------------------ 小工具 */

const addDays = (s, n) => new Date(new Date(`${s}T00:00:00`).getTime() + n * 864e5).toISOString().slice(0, 10);
function mondayStr(d) {
  const s = d.toISOString().slice(0, 10);
  const wd = (d.getDay() + 6) % 7;
  return addDays(s, -wd);
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
