/* ============================================================================
 *  markdown.js — 极简 Markdown 渲染器（安全优先）
 *  先整体 HTML 转义，再在白名单内生成标签，因此用户内容无法注入脚本。
 *  支持：标题 / 段落 / 粗体 / 斜体 / 删除线 / 行内代码 / 代码块 / 引用 /
 *        有序无序列表 / 链接 / 图片 / 分割线 / 表格
 * ==========================================================================*/

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只允许 http(s) 与站内相对地址，阻断 javascript: 等协议 */
function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:)?\/\//i.test(u) || u.startsWith('/') || u.startsWith('#') || u.startsWith('mailto:')) {
    return esc(u);
  }
  return '#';
}

function inline(text) {
  let t = esc(text);
  // 行内代码
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // 图片
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, src, title) => `<img src="${safeUrl(src)}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`);
  // 链接
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, label, href, title) => `<a href="${safeUrl(href)}"${title ? ` title="${title}"` : ''}${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`);
  // 粗体 / 斜体 / 删除线
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 还原行内代码
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return t;
}

export function mdToHtml(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const listStack = [];
  const closeLists = () => { while (listStack.length) out.push(listStack.pop() === 'ul' ? '</ul>' : '</ol>'); };

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^\s*```/.test(line)) {
      closeLists();
      const lang = line.replace(/^\s*```/, '').trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 分割线
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { closeLists(); out.push('<hr>'); i += 1; continue; }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeLists(); const lv = h[1].length; out.push(`<h${lv}>${inline(h[2].trim())}</h${lv}>`); i += 1; continue; }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      closeLists();
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i += 1;
      }
      out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      closeLists();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      out.push(`<blockquote>${mdToHtml(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // 列表
    const ul = line.match(/^(\s*)([-*+])\s+(.*)$/);
    const ol = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (!listStack.length || listStack[listStack.length - 1] !== kind) {
        closeLists();
        listStack.push(kind);
        out.push(kind === 'ul' ? '<ul>' : '<ol>');
      }
      out.push(`<li>${inline((ul ? ul[3] : ol[3]).trim())}</li>`);
      i += 1;
      continue;
    }

    // 空行
    if (!line.trim()) { closeLists(); i += 1; continue; }

    // 段落
    closeLists();
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim()
      && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|\s*```|\s*\|)/.test(lines[i])
      && !/^\s*([-*_])\s*\1\s*\1/.test(lines[i])) {
      buf.push(lines[i]); i += 1;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  closeLists();
  return out.join('\n');
}

/** 渲染到元素 */
export function renderMd(el, src) {
  if (!el) return;
  el.classList.add('md');
  el.innerHTML = mdToHtml(src);
}

/** 去掉 Markdown 记号，得到纯文本摘要 */
export function plain(src, len = 120) {
  const t = String(src || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_~\[\]()!|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > len ? `${t.slice(0, len)}…` : t;
}

export default { mdToHtml, renderMd, esc, plain };
