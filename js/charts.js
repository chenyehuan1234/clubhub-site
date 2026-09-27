/* ============================================================================
 *  charts.js — 纯 SVG 图表（无第三方库）
 *  折线/面积 · 柱状 · 分组柱 · 环形 · 条形排行 · 迷你走势
 * ==========================================================================*/

import { esc } from './markdown.js';

const PAD = { t: 14, r: 12, b: 26, l: 38 };

function niceMax(v) {
  if (!v || v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

function fnum(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n * 100) / 100);
}

/* -------------------------------------------------------------- 折线/面积 */

/**
 * @param {Array<{label:string,value:number}>} data
 */
export function lineChart(data, { height = 200, width = 720, area = true, color = 'var(--brand)', labelEvery = 0 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return '<div class="empty small">暂无数据</div>';
  const W = width; const H = height;
  const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const max = niceMax(Math.max(...rows.map((r) => Number(r.value) || 0)));
  const n = rows.length;
  const x = (i) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => PAD.t + ih - ((Number(v) || 0) / max) * ih;

  const pts = rows.map((r, i) => [x(i), y(r.value)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${line} L${x(n - 1).toFixed(1)},${(PAD.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + ih).toFixed(1)} Z`;

  const gridLines = [0, .25, .5, .75, 1].map((f) => {
    const yy = PAD.t + ih - f * ih;
    return `<line class="grid-line" x1="${PAD.l}" y1="${yy.toFixed(1)}" x2="${(W - PAD.r).toFixed(1)}" y2="${yy.toFixed(1)}"/>
      <text class="axis-text" x="${PAD.l - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${fnum(max * f)}</text>`;
  }).join('');

  const every = labelEvery || Math.max(1, Math.ceil(n / 8));
  const labels = rows.map((r, i) => (i % every === 0 || i === n - 1)
    ? `<text class="axis-text" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(String(r.label).slice(5) || r.label)}</text>`
    : '').join('');

  const dots = rows.map((r, i) => `<circle class="dot-p" cx="${x(i).toFixed(1)}" cy="${y(r.value).toFixed(1)}" r="2.6"><title>${esc(r.label)}：${fnum(r.value)}</title></circle>`).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="折线图">
    ${gridLines}
    ${area ? `<path class="area-p" d="${areaPath}" opacity=".75"/>` : ''}
    <path class="line-p" d="${line}" style="stroke:${color}"/>
    ${dots}
    ${labels}
  </svg>`;
}

/* ------------------------------------------------------------------ 柱状 */

export function barChart(data, { height = 200, width = 720, color = 'var(--brand)', labelEvery = 0 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return '<div class="empty small">暂无数据</div>';
  const W = width; const H = height;
  const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const max = niceMax(Math.max(...rows.map((r) => Number(r.value) || 0)));
  const n = rows.length;
  const slot = iw / n;
  const bw = Math.max(3, Math.min(38, slot * 0.6));

  const grid = [0, .5, 1].map((f) => {
    const yy = PAD.t + ih - f * ih;
    return `<line class="grid-line" x1="${PAD.l}" y1="${yy.toFixed(1)}" x2="${(W - PAD.r).toFixed(1)}" y2="${yy.toFixed(1)}"/>
      <text class="axis-text" x="${PAD.l - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${fnum(max * f)}</text>`;
  }).join('');

  const bars = rows.map((r, i) => {
    const h = ((Number(r.value) || 0) / max) * ih;
    const xx = PAD.l + i * slot + (slot - bw) / 2;
    return `<rect class="bar-r" x="${xx.toFixed(1)}" y="${(PAD.t + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3" style="fill:${color}">
      <title>${esc(r.label)}：${fnum(r.value)}</title></rect>`;
  }).join('');

  const every = labelEvery || Math.max(1, Math.ceil(n / 10));
  const labels = rows.map((r, i) => (i % every === 0
    ? `<text class="axis-text" x="${(PAD.l + i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(String(r.label).slice(0, 6))}</text>`
    : '')).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="柱状图">${grid}${bars}${labels}</svg>`;
}

/** 分组柱状：series = [{name,color,data:[{label,value}]}] */
export function groupedBar(series, { height = 220, width = 720, labelEvery = 0 } = {}) {
  const list = (series || []).filter((s) => s && s.data);
  if (!list.length) return '<div class="empty small">暂无数据</div>';
  const labels = list[0].data.map((d) => d.label);
  const W = width; const H = height;
  const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const max = niceMax(Math.max(1, ...list.flatMap((s) => s.data.map((d) => Number(d.value) || 0))));
  const slot = iw / labels.length;
  const bw = Math.max(2, Math.min(20, (slot * 0.62) / list.length));

  const grid = [0, .5, 1].map((f) => {
    const yy = PAD.t + ih - f * ih;
    return `<line class="grid-line" x1="${PAD.l}" y1="${yy.toFixed(1)}" x2="${(W - PAD.r).toFixed(1)}" y2="${yy.toFixed(1)}"/>
      <text class="axis-text" x="${PAD.l - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${fnum(max * f)}</text>`;
  }).join('');

  const bars = labels.map((lab, i) => list.map((s, si) => {
    const v = Number(s.data[i]?.value) || 0;
    const h = (v / max) * ih;
    const xx = PAD.l + i * slot + (slot - bw * list.length) / 2 + si * bw;
    return `<rect x="${xx.toFixed(1)}" y="${(PAD.t + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" style="fill:${s.color || 'var(--brand)'}">
      <title>${esc(s.name)} ${esc(lab)}：${fnum(v)}</title></rect>`;
  }).join('')).join('');

  const every = labelEvery || Math.max(1, Math.ceil(labels.length / 10));
  const labs = labels.map((l, i) => (i % every === 0
    ? `<text class="axis-text" x="${(PAD.l + i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(String(l).slice(0, 6))}</text>` : '')).join('');

  const legend = `<div class="legend" style="margin-top:8px">${list.map((s) => `<span><i style="background:${s.color || 'var(--brand)'}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="分组柱状图">${grid}${bars}${labs}</svg>${legend}`;
}

/* ------------------------------------------------------------------ 环形 */

const DONUT_COLORS = ['#4f7cff', '#17a673', '#d98916', '#a855f7', '#dc4b52', '#06b6d4', '#f97316', '#64748b'];

/** data = [{label, value}] */
export function donut(data, { size = 190, thickness = 26, total = null, centerLabel = '合计' } = {}) {
  const rows = (data || []).filter((d) => Number(d.value) > 0);
  const sum = total !== null ? total : rows.reduce((a, b) => a + (Number(b.value) || 0), 0);
  if (!rows.length || !sum) return '<div class="empty small">暂无数据</div>';

  const R = size / 2; const r = R - thickness;
  const cx = R; const cy = R;
  let acc = 0;
  const arcs = rows.map((d, i) => {
    const frac = (Number(d.value) || 0) / sum;
    const a0 = acc * Math.PI * 2 - Math.PI / 2;
    acc += frac;
    const a1 = acc * Math.PI * 2 - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x0, y0] = p(R, a0); const [x1, y1] = p(R, a1);
    const [x2, y2] = p(r, a1); const [x3, y3] = p(r, a0);
    const color = d.color || DONUT_COLORS[i % DONUT_COLORS.length];
    return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}
      L${x2.toFixed(1)},${y2.toFixed(1)} A${r},${r} 0 ${large} 0 ${x3.toFixed(1)},${y3.toFixed(1)} Z"
      fill="${color}" stroke="var(--surface)" stroke-width="1.2"><title>${esc(d.label)}：${fnum(d.value)}（${Math.round(frac * 100)}%）</title></path>`;
  }).join('');

  const legend = `<div class="legend" style="flex-direction:column;gap:6px;margin-top:10px">
    ${rows.map((d, i) => `<span style="display:flex;justify-content:space-between;gap:14px;width:100%">
      <span><i style="background:${d.color || DONUT_COLORS[i % DONUT_COLORS.length]}"></i>${esc(d.label)}</span>
      <b style="color:var(--ink)">${fnum(d.value)}</b></span>`).join('')}
  </div>`;

  return `<div class="row" style="align-items:center;gap:18px;flex-wrap:wrap">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="环形图" style="flex:0 0 auto">
      ${arcs}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" style="font-size:20px;font-weight:700;fill:var(--ink)">${fnum(sum)}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" style="font-size:11px;fill:var(--ink-3)">${esc(centerLabel)}</text>
    </svg>
    <div style="flex:1 1 190px;min-width:170px">${legend}</div>
  </div>`;
}

/* ------------------------------------------------------------ 条形排行 */

/** data = [{label, value, hint}] */
export function rankBars(data, { max = 10, color = 'var(--brand)' } = {}) {
  const rows = (data || []).slice(0, max);
  if (!rows.length) return '<div class="empty small">暂无数据</div>';
  const top = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  return `<div class="col" style="gap:10px">${rows.map((r, i) => `
    <div>
      <div class="row-between small" style="margin-bottom:4px">
        <span class="clip"><b class="muted mono" style="margin-right:6px">${i + 1}</b>${esc(r.label)}</span>
        <span class="mono muted nowrap">${r.hint || fnum(r.value)}</span>
      </div>
      <div class="bar"><i style="width:${Math.round(((Number(r.value) || 0) / top) * 100)}%;background:${color}"></i></div>
    </div>`).join('')}</div>`;
}

/* ------------------------------------------------------------ 迷你走势 */

export function sparkline(values, { width = 120, height = 34, color = 'var(--brand)' } = {}) {
  const arr = (values || []).map((v) => Number(v) || 0);
  if (arr.length < 2) return '';
  const max = Math.max(...arr); const min = Math.min(...arr);
  const span = max - min || 1;
  const pts = arr.map((v, i) => [
    (i / (arr.length - 1)) * (width - 4) + 2,
    height - 3 - ((v - min) / span) * (height - 8)
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="走势"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/* ------------------------------------------------------------ 出勤热力 */

/** 按周几聚合的简单条形，用于课表分布 */
export function weekdayBars(counts) {
  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const data = names.map((n, i) => ({ label: n, value: counts[i] || 0 }));
  return barChart(data, { height: 160 });
}

export const CHART_COLORS = DONUT_COLORS;
