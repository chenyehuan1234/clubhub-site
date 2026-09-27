/* ============================================================================
 *  admin-finance.js — 财务账目
 *  收支总览 · 分类占比 · 月度趋势 · 预算对比 · 流水 CRUD
 * ==========================================================================*/

import { api } from './api.js';
import { store, has, fmt, lookupName } from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, modal, confirmDialog, badge,
  emptyHtml, loadingHtml, esc, renderForm, renderTable
} from './ui.js';
import { renderCrud } from './admin-crud.js';
import { donut, lineChart, groupedBar, rankBars } from './charts.js';

export async function viewFinance(host) {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 364 * 864e5).toISOString().slice(0, 10);
  let range = { from: yearAgo, to: today };

  host.innerHTML = `
    <div class="page-head">
      <div><h2>财务账目</h2><p>收支流水、预算执行与分类统计</p></div>
      <div class="toolbar">
        <input class="input" type="date" id="f-from" value="${range.from}" style="min-width:140px">
        <span class="muted small">至</span>
        <input class="input" type="date" id="f-to" value="${range.to}" style="min-width:140px">
        <button class="btn" id="f-q">查询</button>
        <button class="btn" id="f-csv">导出 CSV</button>
        <button class="btn" id="f-budget">预算管理</button>
        ${has('finance.write') ? '<button class="btn btn-primary" id="f-new">＋ 登记收支</button>' : ''}
      </div>
    </div>
    <div id="fin-body">${loadingHtml('加载财务数据…')}</div>`;

  async function load() {
    const body = $('#fin-body');
    body.innerHTML = loadingHtml('加载财务数据…');
    let d;
    try {
      d = (await api.get('/admin/finance/summary', range)).data;
    } catch (e) {
      body.innerHTML = emptyHtml('加载失败', e.message, '⚠');
      return;
    }
    const t = d.totals;
    const incomeCat = d.byCategory.filter((c) => c.type === 'income');
    const expenseCat = d.byCategory.filter((c) => c.type === 'expense');

    body.innerHTML = `
      <div class="dash-grid" style="margin-bottom:var(--sp-4)">
        <div class="card stat"><div class="stat-k">总收入</div><div class="stat-v" style="color:var(--ok)">¥${fmt.money(t.income)}</div></div>
        <div class="card stat"><div class="stat-k">总支出</div><div class="stat-v" style="color:var(--danger)">¥${fmt.money(t.expense)}</div></div>
        <div class="card stat"><div class="stat-k">结余</div><div class="stat-v" style="color:${t.balance >= 0 ? 'var(--ok)' : 'var(--danger)'}">¥${fmt.money(t.balance)}</div></div>
        <div class="card stat"><div class="stat-k">流水笔数</div><div class="stat-v">${t.records}</div></div>
      </div>

      <div class="dash-2" style="margin-bottom:var(--sp-4)">
        <div class="card">
          <div class="card-hd"><h4>月度收支趋势</h4></div>
          <div class="card-bd">
            ${d.byMonth.length ? groupedBar([
      { name: '收入', color: 'var(--ok)', data: d.byMonth.map((m) => ({ label: m.month, value: m.income })) },
      { name: '支出', color: 'var(--danger)', data: d.byMonth.map((m) => ({ label: m.month, value: m.expense })) }
    ], { height: 230 }) : '<div class="muted small">所选区间内没有数据</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h4>支出分类占比</h4></div>
          <div class="card-bd">
            ${expenseCat.length ? donut(expenseCat.map((c) => ({ label: c.category, value: c.amount })), { size: 175, thickness: 24, centerLabel: '总支出' })
      : '<div class="muted small">暂无支出</div>'}
          </div>
        </div>
      </div>

      <div class="dash-2" style="margin-bottom:var(--sp-4)">
        <div class="card">
          <div class="card-hd"><h4>预算执行</h4><span class="small muted">仅统计对应月份/季度</span></div>
          <div class="card-bd" style="padding-top:var(--sp-3)">
            ${d.budgets.length ? d.budgets.map((b) => `
              <div style="margin-bottom:14px">
                <div class="row-between small" style="margin-bottom:5px">
                  <span><b>${esc(b.period)}</b> · ${esc(b.category)}</span>
                  <span class="mono muted">¥${fmt.money(b.spent)} / ¥${fmt.money(b.amount)}（${b.usage}%）</span>
                </div>
                <div class="bar ${b.usage > 100 ? 'danger' : b.usage > 80 ? 'warn' : 'ok'}"><i style="width:${Math.min(100, b.usage)}%"></i></div>
              </div>`).join('') : '<div class="muted small">还没有设置预算</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h4>部门支出排行</h4></div>
          <div class="card-bd" style="padding-top:var(--sp-4)">
            ${d.byDepartment.length ? rankBars(d.byDepartment.map((x) => ({ label: x.department_name || '社务', value: x.amount, hint: `¥${fmt.money(x.amount)}` })), { color: 'var(--danger)' })
      : '<div class="muted small">暂无数据</div>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h4>收支流水（${d.recent.length}）</h4>
          <span class="small muted">${d.from} ~ ${d.to}</span></div>
        <div id="fin-table"></div>
      </div>`;

    $('#fin-table').append(renderTable({
      columns: [
        { key: 'occurred_on', label: '日期', width: 110 },
        { key: 'type', label: '类型', field: { type: 'select' } },
        { key: 'category', label: '分类' },
        { key: 'amount', label: '金额', align: 'right', render: (v, r) => `<b class="mono" style="color:${r.type === 'income' ? 'var(--ok)' : 'var(--danger)'}">${r.type === 'income' ? '+' : '−'}¥${fmt.money(v)}</b>` },
        { key: 'summary', label: '摘要' },
        { key: 'department_name', label: '部门', render: (v) => esc(v || '—') },
        { key: 'event_title', label: '关联活动', render: (v) => v ? esc(v) : '<span class="muted">—</span>' },
        { key: 'creator_name', label: '登记人', render: (v) => esc(v || '—') }
      ],
      rows: d.recent, compact: true, empty: '所选区间没有流水',
      actions: (r) => has('finance.write')
        ? `<button class="btn btn-sm" data-edit="${r.id}">编辑</button><button class="btn btn-sm btn-danger" data-del="${r.id}">删除</button>` : ''
    }));

    $('#fin-table').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        try {
          const row = (await api.get(`/admin/finance_records/${ed.dataset.edit}`)).data;
          openFinanceForm(row, load);
        } catch (err) { toastErr(err.message); }
        return;
      }
      const dl = e.target.closest('[data-del]');
      if (dl) {
        if (!(await confirmDialog('删除这条流水？', { danger: true, okText: '删除' }))) return;
        try { await api.del(`/admin/finance_records/${dl.dataset.del}`); toastOk('已删除'); load(); }
        catch (err) { toastErr(err.message); }
      }
    });
  }

  $('#f-q').addEventListener('click', () => { range = { from: $('#f-from').value, to: $('#f-to').value }; load(); });
  $('#f-csv').addEventListener('click', () => { api.exportCsv('/admin/finance_records/export.csv', range); toastOk('已开始导出'); });
  $('#f-budget').addEventListener('click', () => renderCrud(host, 'finance_budgets', { title: '预算管理' }));
  $('#f-new')?.addEventListener('click', () => openFinanceForm(null, load));

  await load();
}

export function openFinanceForm(row, onDone) {
  const fields = {
    type: { type: 'select', label: '类型', options: [['income', '收入'], ['expense', '支出']], default: 'expense', required: true },
    category: {
      type: 'select', label: '分类',
      options: [['会费', '会费'], ['赞助', '赞助'], ['物资', '物资'], ['场地', '场地'], ['宣传', '宣传'], ['活动', '活动'], ['其他', '其他']],
      default: '其他'
    },
    amount: { type: 'money', label: '金额（元）', required: true, default: 0 },
    occurred_on: { type: 'date', label: '发生日期', required: true, default: new Date().toISOString().slice(0, 10) },
    summary: { type: 'text', label: '摘要', required: true },
    department_id: { type: 'ref', label: '关联部门', ref: 'departments' },
    event_id: { type: 'ref', label: '关联活动', ref: 'events' },
    receipt_id: { type: 'ref', label: '凭据（素材库文件）', ref: 'uploads' },
    note: { type: 'textarea', label: '备注' }
  };
  const form = renderForm(fields, row || {}, { cols: 2 });
  const { root, close } = modal({ title: row ? '编辑流水' : '登记收支', body: form.node, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const c1 = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
  c1.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    let body;
    try { body = form.read(); } catch (e) { return toastErr(e.message); }
    if (!body.summary) return toastErr('请填写摘要');
    try {
      if (row) await api.patch(`/admin/finance_records/${row.id}`, body);
      else await api.post('/admin/finance_records', body);
      toastOk('已保存');
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(c1, ok); root.append(ft);
}
