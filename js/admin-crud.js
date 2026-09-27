/* ============================================================================
 *  admin-crud.js — 由 /api/meta 元数据驱动的通用 CRUD 界面
 *  列表（搜索 / 筛选 / 排序 / 分页 / 批量） + 详情抽屉 + 新建编辑抽屉 + CSV 导出
 * ==========================================================================*/

import { api } from './api.js';
import { store, has, fmt, lookupName } from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, modal, drawer, confirmDialog,
  badge, emptyHtml, loadingHtml, esc, renderForm, renderTable, renderPager,
  cellValue, selectedIds, setAllSelected, skeletonHtml
} from './ui.js';

const stateCache = new Map();

/** 状态标签覆盖（例如把 select 值翻译成中文） */
function labelFor(meta, key, value) {
  const f = meta.fields[key];
  if (f?.type === 'select' && f.options) {
    const hit = f.options.find(([k]) => String(k) === String(value));
    if (hit) return hit[1];
  }
  return null;
}

export async function renderCrud(host, key, opts = {}) {
  const meta = store.meta.resources[key];
  if (!meta) { host.innerHTML = emptyHtml('无权限或资源不存在', `资源：${key}`, '🔒'); return; }

  const state = stateCache.get(key) || {
    page: 1, pageSize: 20, q: '', sort: '', dir: 'desc', filters: {}, ids: []
  };
  Object.assign(state, opts.initialState || {});
  if (opts.initialState?.filters) state.filters = { ...opts.initialState.filters };
  stateCache.set(key, state);

  const listCols = meta.list || Object.keys(meta.fields).slice(0, 6);
  const filterKeys = (opts.filterKeys || Object.keys(meta.fields))
    .filter((k) => ['select', 'ref', 'bool', 'date'].includes(meta.fields[k]?.type) && meta.fields[k].ref !== 'uploads');

  host.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(opts.title || meta.label)}</h2>
        <p>${esc(opts.subtitle || '')}</p>
      </div>
      <div class="toolbar">
        <button class="btn" data-act="csv">导出 CSV</button>
        <button class="btn" data-act="reload">刷新</button>
        ${meta.can.write && !meta.readonly ? `<button class="btn btn-primary" data-act="new">＋ 新建${esc(meta.label.replace('管理', ''))}</button>` : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--sp-3);padding:12px 14px">
      <div class="toolbar">
        <input class="input grow" data-f="q" placeholder="搜索…" style="min-width:200px" value="${esc(state.q)}">
        ${filterKeys.slice(0, 4).map((k) => filterControl(meta, k, state)).join('')}
        ${['date', 'datetime'].some((t) => Object.values(meta.fields).some((f) => f.type === t)) ? `
          <input class="input" type="date" data-f="date_from" value="${esc(state.filters.date_from || '')}" title="起始日期" style="min-width:135px">
          <input class="input" type="date" data-f="date_to" value="${esc(state.filters.date_to || '')}" title="结束日期" style="min-width:135px">` : ''}
        <button class="btn btn-sm btn-ghost" data-act="reset">重置</button>
      </div>
    </div>

    <div class="bulkbar hide" id="bulk">
      <b>已选 <span id="bulk-n">0</span> 项</b>
      <span class="grow"></span>
      ${meta.can.write && !meta.readonly ? '<button class="btn btn-sm" data-act="bulk-edit">批量修改</button>' : ''}
      ${meta.can.delete ? '<button class="btn btn-sm btn-danger" data-act="bulk-del">批量删除</button>' : ''}
      <button class="btn btn-sm btn-ghost" data-act="bulk-clear">取消选择</button>
    </div>

    <div class="card"><div id="table-host">${skeletonHtml(6)}</div><div id="pager-host"></div></div>`;

  const tableHost = $('#table-host');

  /* -------------------------------------------------------- 载入列表 */

  async function load() {
    tableHost.innerHTML = skeletonHtml(6);
    const params = {
      page: state.page, pageSize: state.pageSize,
      q: state.q || undefined,
      sort: state.sort || undefined, dir: state.dir,
      ...state.filters
    };
    let data;
    try {
      data = await api.get(`/admin/${key}`, params);
    } catch (e) {
      tableHost.innerHTML = emptyHtml('加载失败', e.message, '⚠');
      return;
    }
    renderList(data, params);
  }

  function renderList(data, params) {
    const rows = data.items || [];
    const columns = listCols.map((k) => {
      const f = meta.fields[k] || { label: k, type: 'text' };
      return {
        key: k,
        label: f.label || k,
        width: f.w,
        field: f,
        render: (v, row) => opts.renderCell ? (opts.renderCell(k, v, row, f) ?? cellValue(f, v, row)) : cellValue(f, v, row)
      };
    });

    tableHost.innerHTML = '';
    if (!rows.length) {
      tableHost.innerHTML = emptyHtml(opts.empty || '暂无数据', state.q ? '换个关键词试试' : '', meta.icon || '🗂');
    } else {
      tableHost.append(renderTable({
        columns,
        rows,
        selectable: true,
        compact: rows.length > 12,
        onRow: (row) => openDetail(row),
        actions: (row) => {
          const extra = opts.rowActions ? opts.rowActions(row) : '';
          return `${extra}
            ${meta.can.write && !meta.readonly ? '<button class="btn btn-sm" data-edit="1">编辑</button>' : ''}
            <button class="btn btn-sm btn-ghost" data-view="1">详情</button>
            ${meta.can.delete ? '<button class="btn btn-sm btn-danger" data-del="1">删除</button>' : ''}`;
        }
      }));
    }

    const pagerHost = $('#pager-host');
    pagerHost.innerHTML = '';
    if (rows.length) {
      pagerHost.append(renderPager({
        page: data.page, pages: data.pages, total: data.total, pageSize: data.pageSize,
        onGo: (p) => { state.page = p; load(); },
        onChangeSize: (n) => { state.pageSize = n; state.page = 1; load(); }
      }));
    }

    // 行内按钮
    tableHost.querySelectorAll('tbody tr').forEach((tr) => {
      const id = Number(tr.dataset.id);
      const row = rows.find((r) => Number(r.id) === id);
      tr.querySelector('[data-edit]')?.addEventListener('click', () => openForm(row));
      tr.querySelector('[data-view]')?.addEventListener('click', () => openDetail(row));
      tr.querySelector('[data-del]')?.addEventListener('click', () => delRow(row));
      tr.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        if (opts.onAction) opts.onAction(b.dataset.act, row, { reload: load, host, key });
      }));
    });

    tableHost.addEventListener('selectionchange', (e) => {
      const ids = e.detail || [];
      $('#bulk').classList.toggle('hide', !ids.length);
      $('#bulk-n').textContent = String(ids.length);
    });
  }

  /* -------------------------------------------------------- 操作 */

  async function delRow(row) {
    const name = row[meta.titleField] ?? row.id;
    if (!(await confirmDialog(`确定删除「${name}」吗？该操作不可恢复。`, { danger: true, okText: '删除' }))) return;
    try {
      await api.del(`/admin/${key}/${row.id}`);
      toastOk('已删除');
      state.page = 1;
      load();
    } catch (e) { toastErr(e.message); }
  }

  function openForm(row) {
    const isEdit = !!row;
    const fields = {};
    for (const [k, f] of Object.entries(meta.fields)) {
      if (opts.excludeFields?.includes(k)) continue;
      fields[k] = f;
    }
    const form = renderForm(fields, row || {}, { cols: 2, only: opts.formFields || null });
    const { root, close } = drawer({
      title: isEdit ? `编辑${meta.label}` : `新建${meta.label}`,
      body: form.node,
      size: 'wide',
      footer: ''
    });
    const ft = el('div', { class: 'drawer-ft' });
    const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
    const ok = el('button', { class: 'btn btn-primary', type: 'button', text: isEdit ? '保存' : '创建' });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', async () => {
      let body;
      try { body = form.read(); } catch (e) { return toastErr(e.message); }
      // 必填校验
      for (const [k, f] of Object.entries(fields)) {
        if (f.required && (body[k] === undefined || body[k] === null || body[k] === '')) {
          form.setError(k, '此项必填');
          return toastErr(`请填写「${f.label}」`);
        }
      }
      if (opts.beforeSubmit) {
        const r = opts.beforeSubmit(body, row, form);
        if (r === false) return;
      }
      try {
        ok.disabled = true; ok.innerHTML = '<span class="spinner"></span> 保存中';
        if (isEdit) await api.patch(`/admin/${key}/${row.id}`, body);
        else await api.post(`/admin/${key}`, body);
        toastOk(isEdit ? '已保存' : '创建成功');
        close();
        load();
      } catch (e) {
        toastErr(e.message);
        ok.disabled = false; ok.textContent = isEdit ? '保存' : '创建';
      }
    });
    ft.append(cancel, ok);
    root.append(ft);
  }

  function openDetail(row) {
    if (opts.openDetail) return opts.openDetail(row, { reload: load, key, meta });
    const dl = el('div');
    const entries = Object.entries(meta.fields);
    dl.innerHTML = `<dl class="kv" style="grid-template-columns:110px 1fr;gap:9px 14px">
      ${entries.map(([k, f]) => `<dt>${esc(f.label)}</dt><dd>${cellValue(f, row[k], row)}</dd>`).join('')}
    </dl>`;
    const { root, close } = drawer({
      title: `${meta.label}详情`,
      body: dl,
      size: 'wide',
      footer: ''
    });
    root.querySelector('h3').textContent = String(row[meta.titleField] ?? `${meta.label} #${row.id}`);
    const ft = el('div', { class: 'drawer-ft' });
    if (meta.can.write && !meta.readonly) {
      const ed = el('button', { class: 'btn btn-primary', type: 'button', text: '编辑' });
      ed.addEventListener('click', () => { close(); openForm(row); });
      ft.append(ed);
    }
    const cl = el('button', { class: 'btn', type: 'button', text: '关闭' });
    cl.addEventListener('click', close);
    ft.prepend(cl);
    root.append(ft);
  }

  /* -------------------------------------------------------- 批量 */

  async function bulk(action) {
    const ids = selectedIds(tableHost);
    if (!ids.length) return toastErr('请先选择记录');
    if (action === 'del') {
      if (!(await confirmDialog(`确定删除选中的 ${ids.length} 条记录？`, { danger: true, okText: '删除' }))) return;
      try {
        const r = await api.post(`/admin/${key}/batch`, { action: 'delete', ids });
        toastOk(`已删除 ${r.data.deleted} 条`);
        load();
      } catch (e) { toastErr(e.message); }
      return;
    }
    if (action === 'edit') {
      const patchable = Object.entries(meta.fields).filter(([, f]) => ['select', 'bool', 'ref', 'text'].includes(f.type) && !f.readonly);
      if (!patchable.length) return toastErr('该资源没有可批量修改的字段');
      const sel = el('select', { class: 'select' });
      sel.append(el('option', { value: '', text: '— 选择要修改的字段 —' }));
      for (const [k, f] of patchable) sel.append(el('option', { value: k, text: f.label }));
      const valBox = el('div', { class: 'field' });
      const body = el('div', { class: 'col' }, [
        el('div', { class: 'field' }, [el('label', { text: '字段' }), sel]),
        valBox,
        el('div', { class: 'small muted', text: `将应用到选中的 ${ids.length} 条记录` })
      ]);
      sel.addEventListener('change', () => {
        valBox.innerHTML = '';
        const f = meta.fields[sel.value];
        if (!f) return;
        valBox.append(el('label', { text: f.label }));
        if (f.type === 'bool') {
          const s2 = el('select', { class: 'select' }, [el('option', { value: '1', text: '是' }), el('option', { value: '0', text: '否' })]);
          valBox.append(s2);
          valBox._input = s2;
        } else if (f.type === 'select') {
          const s2 = el('select', { class: 'select' });
          for (const [k, l] of (f.options || [])) s2.append(el('option', { value: k, text: l }));
          valBox.append(s2);
          valBox._input = s2;
        } else if (f.type === 'ref') {
          const s2 = el('select', { class: 'select' });
          s2.append(el('option', { value: '', text: '（置空）' }));
          for (const item of (store.lookups[f.ref] || [])) s2.append(el('option', { value: String(item.id), text: item.name || item.title || item.id }));
          valBox.append(s2);
          valBox._input = s2;
        } else {
          const i2 = el('input', { class: 'input' });
          valBox.append(i2);
          valBox._input = i2;
        }
      });
      const { root, close } = modal({ title: '批量修改', body, size: 'narrow', footer: '' });
      const ft = el('div', { class: 'modal-ft' });
      const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
      const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '应用' });
      c1.addEventListener('click', close);
      ok.addEventListener('click', async () => {
        const k = sel.value;
        if (!k || !valBox._input) return toastErr('请选择字段');
        try {
          await api.post(`/admin/${key}/batch`, { action: 'update', ids, patch: { [k]: valBox._input.value } });
          toastOk('批量修改完成');
          close(); load();
        } catch (e) { toastErr(e.message); }
      });
      ft.append(c1, ok); root.append(ft);
    }
  }

  /* -------------------------------------------------------- 事件 */

  host.querySelector('[data-act="reload"]').addEventListener('click', load);
  host.querySelector('[data-act="new"]')?.addEventListener('click', () => openForm(null));
  host.querySelector('[data-act="csv"]').addEventListener('click', () => {
    const params = { q: state.q || undefined, ...state.filters };
    api.exportCsv(`/admin/${key}/export.csv`, params);
    toastOk('已开始导出');
  });
  host.querySelector('[data-act="reset"]').addEventListener('click', () => {
    state.q = ''; state.filters = {}; state.page = 1;
    $$('[data-f]', host).forEach((i) => { i.value = ''; });
    load();
  });
  host.querySelectorAll('[data-f]').forEach((input) => {
    const evt = input.tagName === 'SELECT' || input.type === 'date' ? 'change' : 'input';
    let t;
    input.addEventListener(evt, () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const k = input.dataset.f;
        if (k === 'q') state.q = input.value.trim();
        else state.filters[k] = input.value;
        state.page = 1;
        load();
      }, evt === 'input' ? 320 : 0);
    });
  });
  $('#bulk').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'bulk-del') bulk('del');
    else if (b.dataset.act === 'bulk-edit') bulk('edit');
    else { setAllSelected(tableHost, false); $('#bulk').classList.add('hide'); }
  });

  await load();
  return { reload: load, state, openForm };
}

function filterControl(meta, k, state) {
  const f = meta.fields[k];
  if (!f) return '';
  const cur = state.filters[k] ?? '';
  if (f.type === 'bool') {
    return `<select class="select" data-f="${k}">
      <option value="">${esc(f.label)}：全部</option>
      <option value="1" ${cur === '1' ? 'selected' : ''}>${esc(f.label)}：是</option>
      <option value="0" ${cur === '0' ? 'selected' : ''}>${esc(f.label)}：否</option></select>`;
  }
  if (f.type === 'ref') {
    const list = store.lookups[f.ref] || [];
    return `<select class="select" data-f="${k}"><option value="">${esc(f.label)}：全部</option>
      ${list.map((x) => `<option value="${x.id}" ${String(cur) === String(x.id) ? 'selected' : ''}>${esc(x.name || x.title || x.original_name || x.id)}</option>`).join('')}</select>`;
  }
  if (f.type === 'select') {
    return `<select class="select" data-f="${k}"><option value="">${esc(f.label)}：全部</option>
      ${(f.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  return '';
}
