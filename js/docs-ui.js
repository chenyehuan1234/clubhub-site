/* ============================================================================
 *  docs-ui.js — 资料库浏览器（会员中心与后台复用）
 *  目录树 · 检索 · 四档可见范围 · 在线预览 · 多版本 · 鉴权下载 · 收藏
 * ==========================================================================*/

import { api } from './api.js';
import { store, has, fmt, lookupName } from './store.js';
import {
  $, el, modal, drawer, toast, toastOk, toastErr, badge, emptyHtml, loadingHtml,
  esc, renderForm, confirmDialog, cellValue
} from './ui.js';
import { mdToHtml } from './markdown.js';

/* ------------------------------------------------------------ 目录树 */

function buildTree(folders) {
  const map = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const f of map.values()) {
    if (f.parent_id && map.has(f.parent_id)) map.get(f.parent_id).children.push(f);
    else roots.push(f);
  }
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function treeHtml(nodes, activeId, depth = 0) {
  return nodes.map((n) => `
    <div class="tree-node">
      <div class="tree-row ${activeId === n.id ? 'active' : ''}" data-folder="${n.id}">
        <span class="caret ${n.children.length ? 'open' : ''}" data-toggle="${n.id}" style="${n.children.length ? '' : 'opacity:0'}">▶</span>
        <span>${esc(n.icon || '📁')}</span>
        <span class="nm">${esc(n.name)}</span>
        <span class="ct">${n.doc_count || 0}</span>
      </div>
      ${n.children.length ? `<div class="tree-children" data-children="${n.id}">${treeHtml(n.children, activeId, depth + 1)}</div>` : ''}
    </div>`).join('');
}

/* ------------------------------------------------------------ 浏览器 */

export async function renderDocBrowser(host, { canManage = false } = {}) {
  const state = { folder: '', q: '', category: '', sort: 'latest', page: 1, pageSize: 20, view: 'list' };

  host.innerHTML = `
  <div class="doc-layout">
    <aside class="doc-side col" style="gap:var(--sp-3)">
      <div class="card">
        <div class="card-hd" style="padding:11px 14px"><b class="small">目录</b>
          ${canManage ? '<button class="btn btn-sm btn-ghost" data-newfolder="1">＋ 新建</button>' : ''}</div>
        <div class="tree" id="doc-tree" style="padding:8px"></div>
      </div>
      <div class="card card-pad">
        <div class="small muted" style="line-height:1.8">
          <div>可见范围说明：</div>
          <div>🌐 公开 · 游客也能下载</div>
          <div>👥 社员可见 · 登录后可下载</div>
          <div>🛡 管理层 · 负责人及以上</div>
          <div>🔒 仅管理员</div>
        </div>
      </div>
    </aside>

    <section class="col" style="gap:var(--sp-3)">
      <div class="card card-pad" style="padding:14px">
        <div class="toolbar">
          <input class="input grow" id="doc-q" placeholder="搜索标题、说明、标签或文件名…" style="min-width:220px">
          <select class="select" id="doc-cat">
            <option value="">全部分类</option>
            ${['讲义', '制度', '模板', '表格', '影音', '其他'].map((c) => `<option>${c}</option>`).join('')}
          </select>
          <select class="select" id="doc-sort">
            <option value="latest">最新上传</option>
            <option value="hot">下载最多</option>
            <option value="name">按名称</option>
          </select>
          ${canManage ? '<button class="btn btn-primary" id="doc-new">＋ 上传资料</button>' : ''}
        </div>
      </div>
      <div id="doc-list"></div>
    </section>
  </div>`;

  async function loadTree() {
    try {
      const r = await api.get('/documents/tree');
      const tree = buildTree(r.data.folders || []);
      $('#doc-tree').innerHTML = `
        <div class="tree-row ${state.folder === '' ? 'active' : ''}" data-folder="">
          <span style="width:14px"></span><span>🗂️</span><span class="nm">全部资料</span>
          <span class="ct">${r.data.total}</span>
        </div>` + treeHtml(tree, Number(state.folder) || '');
      $('#doc-tree').addEventListener('click', (e) => {
        const t = e.target.closest('[data-toggle]');
        if (t) {
          e.stopPropagation();
          const box = $(`[data-children="${t.dataset.toggle}"]`);
          if (box) { box.classList.toggle('hide'); t.classList.toggle('open'); }
          return;
        }
        const row = e.target.closest('[data-folder]');
        if (!row) return;
        state.folder = row.dataset.folder;
        state.page = 1;
        loadTree(); loadList();
      });
    } catch (e) {
      $('#doc-tree').innerHTML = `<div class="small muted" style="padding:10px">${esc(e.message)}</div>`;
    }
  }

  async function loadList() {
    const box = $('#doc-list');
    box.innerHTML = loadingHtml('加载资料…');
    try {
      const r = await api.get('/documents', {
        folder_id: state.folder || undefined, q: state.q || undefined,
        category: state.category || undefined, sort: state.sort,
        page: state.page, pageSize: state.pageSize
      });
      const items = r.items || [];
      box.innerHTML = items.length ? `
        <div class="card">
          <div class="card-hd" style="padding:11px 15px">
            <span class="small muted">共 ${r.total} 份资料</span>
          </div>
          <div style="padding:var(--sp-3);display:grid;gap:9px">
            ${items.map((d) => `
              <div class="doc-item" data-doc="${d.id}">
                <span class="ic">${docIcon(d)}</span>
                <div class="grow" style="min-width:0">
                  <div class="row" style="gap:7px;flex-wrap:wrap">
                    <span class="tt">${esc(d.title)}</span>
                    ${badge(d.visibility)}
                    ${d.version_count > 1 ? `<span class="badge badge-line">v${d.current_version || d.version_count}</span>` : ''}
                  </div>
                  <div class="ds clamp2">${esc(d.summary || d.original_name || '')}</div>
                  <div class="row-wrap tiny muted" style="gap:12px;margin-top:4px">
                    <span>${esc(d.folder_name || '未分类')}</span>
                    <span>${esc(d.category)}</span>
                    <span>${esc(d.uploader_name || '—')}</span>
                    <span>${esc(fmt.date(d.created_at))}</span>
                    <span>↓ ${d.download_count} · 👁 ${d.view_count}</span>
                    ${d.size ? `<span>${fmt.size(d.size)}</span>` : ''}
                  </div>
                </div>
                <div class="row" style="gap:5px;flex:0 0 auto">
                  ${d.external_url
      ? `<a class="btn btn-sm btn-primary" href="${esc(d.external_url)}" target="_blank" rel="noopener">打开外链</a>`
      : `<button class="btn btn-sm" data-preview="${d.id}" data-vid="${d.current_version_id || ''}">预览</button>
                         <button class="btn btn-sm btn-primary" data-download="${d.id}" data-vid="${d.current_version_id || ''}">下载</button>`}
                </div>
              </div>`).join('')}
          </div>
          <div id="doc-pager"></div>
        </div>` : emptyHtml('没有找到资料', state.q ? '换个关键词试试' : '这个目录还是空的');

      if (items.length) {
        const pager = await import('./ui.js').then((m) => m.renderPager({
          page: r.page, pages: r.pages, total: r.total, pageSize: r.pageSize,
          onGo: (p) => { state.page = p; loadList(); },
          onChangeSize: (n) => { state.pageSize = n; state.page = 1; loadList(); }
        }));
        $('#doc-pager').append(pager);
      }

      box.querySelectorAll('[data-doc]').forEach((n) => n.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openDoc(Number(n.dataset.doc), { canManage, onChanged: () => { loadList(); loadTree(); } });
      }));
      box.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        openDoc(Number(b.dataset.preview), { canManage, onChanged: () => { loadList(); loadTree(); }, previewOnly: true });
      }));
      box.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(b.dataset.download);
        let vid = b.dataset.vid;
        try {
          if (!vid) {
            const d = await api.get(`/documents/${id}`);
            vid = d.data.current_version_id || d.data.versions?.[0]?.id;
          }
          if (!vid) return toastErr('该资料还没有上传文件');
          await api.download(`/documents/${id}/download/${vid}`, 'download');
          toastOk('已开始下载');
        } catch (err) { toastErr(err.message); }
      }));
    } catch (e) {
      box.innerHTML = emptyHtml('加载失败', e.message, '⚠');
    }
  }

  function docIcon(d) {
    const m = { 讲义: '📘', 制度: '📜', 模板: '📋', 表格: '📊', 影音: '🎬', 其他: '📄' };
    return m[d.category] || '📄';
  }

  /* -------------------------------- 事件绑定 */

  $('#doc-q').addEventListener('input', debounce(() => { state.q = $('#doc-q').value.trim(); state.page = 1; loadList(); }, 320));
  $('#doc-cat').addEventListener('change', () => { state.category = $('#doc-cat').value; state.page = 1; loadList(); });
  $('#doc-sort').addEventListener('change', () => { state.sort = $('#doc-sort').value; loadList(); });
  $('#doc-new')?.addEventListener('click', () => openUpload({ canManage, onDone: () => { loadList(); loadTree(); } }));
  host.querySelector('[data-newfolder]')?.addEventListener('click', () => openFolderForm({ onDone: () => { loadTree(); } }));

  await loadTree();
  await loadList();

  return { reload: () => { loadTree(); loadList(); } };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------------------------------------ 资料详情 */

export async function openDoc(id, { canManage = false, onChanged, previewOnly = false } = {}) {
  const box = el('div', { html: loadingHtml('打开资料…') });
  const { root, close } = modal({ title: '资料', body: box, size: 'wide' });

  let d;
  try {
    d = (await api.get(`/documents/${id}`)).data;
  } catch (e) {
    box.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
    return;
  }

  root.querySelector('h3').textContent = d.title;

  const versions = d.versions || [];
  const cur = versions.find((v) => v.id === d.current_version_id) || versions[0];

  async function paint(previewVersionId) {
    root.querySelector('h3').textContent = d.title;
    box.innerHTML = `
      <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-4)">
        ${badge(d.visibility)}<span class="badge badge-line">${esc(d.category)}</span>
        ${d.folder_name ? `<span class="badge">${esc(d.folder_icon || '📁')} ${esc(d.folder_name)}</span>` : ''}
        ${d.department_name ? `<span class="badge">${esc(d.department_name)}</span>` : ''}
        ${d.status !== 'published' ? badge(d.status) : ''}
      </div>
      <p class="muted" style="margin-top:0">${esc(d.summary || '')}</p>
      <div class="row-wrap small muted" style="gap:16px;margin-bottom:var(--sp-4)">
        <span>上传者：${esc(d.uploader_name || '—')}</span>
        <span>上传时间：${esc(fmt.dt(d.created_at))}</span>
        <span>下载 ${d.download_count} 次</span>
        <span>浏览 ${d.view_count} 次</span>
        ${(d.tags && JSON.parse(d.tags || '[]').length) ? `<span>标签：${JSON.parse(d.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</span>` : ''}
      </div>

      <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-4)">
        ${d.external_url
      ? `<a class="btn btn-primary" href="${esc(d.external_url)}" target="_blank" rel="noopener">打开外链</a>`
      : `<button class="btn btn-primary" id="d-dl">下载${cur ? `（v${cur.version}）` : ''}</button>`}
        <button class="btn" id="d-fav">${d.favorite ? '★ 已收藏' : '☆ 收藏'}</button>
        ${canManage && !d.external_url ? '<button class="btn" id="d-ver">＋ 上传新版本</button>' : ''}
        ${canManage ? '<button class="btn" id="d-edit">编辑信息</button>' : ''}
        ${canManage ? '<button class="btn btn-danger" id="d-del">删除</button>' : ''}
      </div>

      ${versions.length ? `
      <div class="row-wrap" style="gap:8px;margin-bottom:var(--sp-3)">
        <span class="small muted">版本：</span>
        ${versions.map((v) => `<button class="btn btn-sm ${v.id === (previewVersionId || cur?.id) ? 'btn-primary' : ''}" data-ver="${v.id}">
          v${v.version}<span class="tiny" style="opacity:.75"> ${esc(fmt.date(v.created_at))}</span></button>`).join('')}
      </div>` : '<div class="alert alert-warn">这份资料还没有上传文件</div>'}

      <div id="d-preview"></div>

      <details style="margin-top:var(--sp-4)">
        <summary class="small muted" style="cursor:pointer">版本历史（${versions.length}）</summary>
        <div class="table-wrap" style="margin-top:10px"><table class="tbl compact">
          <thead><tr><th>版本</th><th>文件名</th><th>大小</th><th>上传者</th><th>时间</th><th>说明</th><th></th></tr></thead>
          <tbody>${versions.map((v) => `<tr>
            <td class="mono">v${v.version}</td>
            <td>${esc(v.original_name || '')}</td>
            <td class="mono">${fmt.size(v.size)}</td>
            <td>${esc(lookupName('users', v.uploader_id))}</td>
            <td class="nowrap small">${esc(fmt.dt(v.created_at))}</td>
            <td class="small">${esc(v.note || '')}</td>
            <td><button class="btn btn-sm" data-ver="${v.id}">查看</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </details>`;

    // 预览
    const vid = previewVersionId || cur?.id;
    const pv = $('#d-preview');
    if (vid) {
      pv.innerHTML = loadingHtml('加载预览…');
      try {
        const r = (await api.get(`/documents/${id}/preview/${vid}`)).data;
        if (r.kind === 'text') {
          const isMd = /markdown|\.md$/i.test(r.mime) || /\.md$/i.test(cur?.original_name || '');
          pv.innerHTML = `<div class="doc-preview">
            <div class="hd"><span>${esc(cur?.original_name || '')} · ${fmt.size(r.size)}${r.truncated ? ' · 已截断显示前 200KB' : ''}</span></div>
            <div class="bd">${isMd ? `<div class="md">${mdToHtml(r.text)}</div>` : `<pre style="margin:0;white-space:pre-wrap">${esc(r.text)}</pre>`}</div>
          </div>`;
        } else if (r.kind === 'image') {
          pv.innerHTML = `<div class="doc-preview"><div class="hd"><span>图片预览</span></div>
            <div class="bd"><img src="${esc(r.raw)}" alt="${esc(d.title)}"></div></div>`;
        } else if (r.kind === 'pdf') {
          pv.innerHTML = `<div class="doc-preview"><div class="hd"><span>PDF 预览</span>
            <a class="btn btn-sm" href="${esc(r.raw)}" target="_blank" rel="noopener">新窗口打开</a></div>
            <iframe src="${esc(r.raw)}" title="PDF 预览"></iframe></div>`;
        } else if (r.kind === 'audio') {
          pv.innerHTML = `<div class="doc-preview"><div class="hd"><span>音频</span></div>
            <div class="bd"><audio controls src="${esc(r.raw)}" style="width:100%"></audio></div></div>`;
        } else if (r.kind === 'video') {
          pv.innerHTML = `<div class="doc-preview"><div class="hd"><span>视频</span></div>
            <div class="bd"><video controls src="${esc(r.raw)}" style="width:100%;max-height:520px"></video></div></div>`;
        } else {
          pv.innerHTML = `<div class="alert alert-info">${esc(r.note || '该格式暂不支持在线预览，请下载后查看')}</div>`;
        }
      } catch (e) {
        pv.innerHTML = `<div class="alert alert-danger">预览失败：${esc(e.message)}</div>`;
      }
    } else pv.innerHTML = '';

    // 绑定
    box.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => paint(Number(b.dataset.ver))));
    $('#d-dl')?.addEventListener('click', async () => {
      try {
        const v = previewVersionId || cur?.id;
        if (!v) return toastErr('没有可下载的文件');
        await api.download(`/documents/${id}/download/${v}`, cur?.original_name || 'download');
        toastOk('已开始下载');
        d.download_count += 1;
      } catch (e) { toastErr(e.message); }
    });
    $('#d-fav').addEventListener('click', async () => {
      try {
        const r = await api.post(`/documents/${id}/favorite`, {});
        d.favorite = r.data.favorite;
        toastOk(r.data.favorite ? '已加入收藏' : '已取消收藏');
        paint(previewVersionId);
      } catch (e) { toastErr(e.message); }
    });
    $('#d-ver')?.addEventListener('click', () => openVersionUpload(id, () => { close(); if (onChanged) onChanged(); }));
    $('#d-edit')?.addEventListener('click', () => openEditDoc(d, () => { close(); if (onChanged) onChanged(); }));
    $('#d-del')?.addEventListener('click', async () => {
      const okc = await confirmDialog(`确定删除资料「${d.title}」？所有版本文件将一并删除，不可恢复。`, { danger: true, okText: '删除' });
      if (!okc) return;
      try {
        await api.del(`/admin/documents/${id}`);
        toastOk('资料已删除');
        close();
        if (onChanged) onChanged();
      } catch (e) { toastErr(e.message); }
    });
  }

  await paint(cur?.id);
}

/* ------------------------------------------------------ 上传新资料/新版本 */

export async function openUpload({ onDone } = {}) {
  const folders = (store.lookups.doc_folders || []);
  const box = el('div');
  box.innerHTML = `
    <div class="form-grid">
      <div class="field span2"><label>资料名称 <span class="req">*</span></label>
        <input class="input" id="u-title" placeholder="如：摄影基础讲义 · 第一讲"></div>
      <div class="field"><label>所属目录</label>
        <select class="select" id="u-folder"><option value="">未分类</option>
          ${folders.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></div>
      <div class="field"><label>分类</label>
        <select class="select" id="u-cat">${['讲义', '制度', '模板', '表格', '影音', '其他'].map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>可见范围</label>
        <select class="select" id="u-vis">
          <option value="public">公开（游客可下载）</option>
          <option value="member" selected>社员可见</option>
          ${has('doc.visibility.set') ? '<option value="leader">管理层可见</option><option value="admin">仅管理员</option>' : ''}
        </select></div>
      <div class="field"><label>限定部门</label>
        <select class="select" id="u-dept"><option value="">不限</option>
          ${(store.lookups.departments || []).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field span2"><label>标签</label><input class="input" id="u-tags" placeholder="用逗号分隔，如：讲义,2025"></div>
      <div class="field span2"><label>资料说明</label><textarea class="textarea" id="u-sum" rows="3"></textarea></div>
      <div class="field span2"><label>上传文件 <span class="req">*</span></label>
        <input class="input" type="file" id="u-files" multiple>
        <div class="help">支持 PDF / Word / Excel / PPT / 图片 / 文本 / 压缩包 / 音视频，单个文件不超过 20MB。文件会以「受限」方式存储，仅授权用户可下载。</div></div>
    </div>`;

  const { root, close } = modal({ title: '上传资料', body: box, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '上传并保存' });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    const title = $('#u-title').value.trim();
    const files = [...$('#u-files').files];
    if (!title) return toastErr('请填写资料名称');
    if (!files.length) return toastErr('请选择要上传的文件');
    try {
      ok.disabled = true; ok.innerHTML = '<span class="spinner"></span> 上传中';
      const doc = await api.post('/admin/documents', {
        title,
        folder_id: $('#u-folder').value ? Number($('#u-folder').value) : null,
        category: $('#u-cat').value,
        visibility: $('#u-vis').value,
        department_id: $('#u-dept').value ? Number($('#u-dept').value) : null,
        tags: $('#u-tags').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean),
        summary: $('#u-sum').value.trim(),
        status: 'published'
      });
      const id = doc.data.id;
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      fd.append('note', '初始版本');
      await fetch(`/api/admin/documents/${id}/version`, { method: 'POST', body: fd, credentials: 'same-origin' });
      toastOk('资料已上传');
      close();
      if (onDone) onDone();
    } catch (e) {
      toastErr(e.message);
      ok.disabled = false; ok.textContent = '上传并保存';
    }
  });
  ft.append(cancel, ok);
  root.append(ft);
}

export async function openVersionUpload(docId, onDone) {
  const box = el('div');
  box.innerHTML = `
    <div class="col" style="gap:var(--sp-4)">
      <div class="alert alert-info">上传后旧版本会保留在版本历史中，随时可以回看或下载。</div>
      <div class="field"><label>选择文件（最多 4 个，将依次生成新版本）</label>
        <input class="input" type="file" id="v-files" multiple></div>
      <div class="field"><label>版本说明</label><input class="input" id="v-note" placeholder="如：补充第二章示例"></div>
    </div>`;
  const { root, close } = modal({ title: '上传新版本', body: box, footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '上传' });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    const files = [...$('#v-files').files];
    if (!files.length) return toastErr('请选择文件');
    try {
      ok.disabled = true; ok.innerHTML = '<span class="spinner"></span> 上传中';
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      fd.append('note', $('#v-note').value.trim());
      const res = await fetch(`/api/admin/documents/${docId}/version`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '上传失败');
      toastOk(`已上传 ${json.data.versions.length} 个新版本`);
      close();
      if (onDone) onDone();
    } catch (e) {
      toastErr(e.message);
      ok.disabled = false; ok.textContent = '上传';
    }
  });
  ft.append(cancel, ok);
  root.append(ft);
}

export async function openEditDoc(d, onDone) {
  const fields = {
    title: { type: 'text', label: '资料名称', required: true },
    category: { type: 'select', label: '分类', options: [['讲义', '讲义'], ['制度', '制度'], ['模板', '模板'], ['表格', '表格'], ['影音', '影音'], ['其他', '其他']] },
    visibility: {
      type: 'select', label: '可见范围',
      options: [['public', '公开'], ['member', '社员可见'], ['leader', '管理层可见'], ['admin', '仅管理员']],
      help: has('doc.visibility.set') ? '' : '你没有设置「管理层 / 仅管理员」的权限'
    },
    folder_id: { type: 'ref', label: '所属目录', ref: 'doc_folders' },
    department_id: { type: 'ref', label: '限定部门', ref: 'departments' },
    tags: { type: 'tags', label: '标签' },
    summary: { type: 'textarea', label: '资料说明' },
    status: { type: 'select', label: '状态', options: [['published', '已发布'], ['draft', '草稿'], ['archived', '已归档']] }
  };
  const form = renderForm(fields, d, { cols: 2 });
  const { root, close } = modal({ title: '编辑资料信息', body: form.node, size: 'wide', footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    try {
      await api.patch(`/admin/documents/${d.id}`, form.read());
      toastOk('已保存');
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(cancel, ok);
  root.append(ft);
}

export async function openFolderForm({ folder, onDone } = {}) {
  const fields = {
    name: { type: 'text', label: '目录名称', required: true },
    icon: { type: 'text', label: '图标', placeholder: '📁' },
    parent_id: { type: 'ref', label: '上级目录', ref: 'doc_folders' },
    visibility: {
      type: 'select', label: '可见范围',
      options: [['public', '公开'], ['member', '社员可见'], ['leader', '管理层可见'], ['admin', '仅管理员']]
    },
    department_id: { type: 'ref', label: '限定部门', ref: 'departments' },
    sort_order: { type: 'number', label: '排序', default: 0 }
  };
  const form = renderForm(fields, folder || { icon: '📁', visibility: 'member', sort_order: 0 }, { cols: 2 });
  const { root, close } = modal({ title: folder ? '编辑目录' : '新建目录', body: form.node, footer: '' });
  const ft = el('div', { class: 'modal-ft' });
  const cancel = el('button', { class: 'btn', type: 'button', text: '取消' });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', async () => {
    try {
      if (folder) await api.patch(`/admin/doc_folders/${folder.id}`, form.read());
      else await api.post('/admin/doc_folders', form.read());
      toastOk('已保存');
      close();
      if (onDone) onDone();
    } catch (e) { toastErr(e.message); }
  });
  ft.append(cancel, ok);
  root.append(ft);
}
