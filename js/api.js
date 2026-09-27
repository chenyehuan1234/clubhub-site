/* ============================================================================
 *  api.js（静态版）— 从 api-data/*.json 读取公开数据
 *  · GET：本地 JSON，支持 category/page 过滤与站内搜索
 *  · 写操作：静态站不支持，抛出友好提示
 * ==========================================================================*/

const DATA_BASE = 'api-data';
const cache = new Map();

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
  }
}

async function loadJson(file) {
  if (cache.has(file)) return cache.get(file);
  let res;
  try {
    res = await fetch(`${DATA_BASE}/${file}`);
  } catch (e) {
    throw new ApiError('网络异常，请稍后重试', 0);
  }
  if (!res.ok) throw new ApiError(`数据加载失败（${res.status}）`, res.status);
  const json = await res.json();
  cache.set(file, json);
  return json;
}

/** 用全量列表响应在客户端复刻服务端的分类过滤 + 分页 */
function pagedFrom(full, params) {
  let items = full.items || [];
  if (params && params.category) items = items.filter((x) => x.category === params.category);
  if (params && params.status) items = items.filter((x) => x.status === params.status);
  if (params && params.department_id) items = items.filter((x) => Number(x.department_id) === Number(params.department_id));
  const total = items.length;
  const defSize = full.pageSize || 12;
  const pageSize = Number(params && params.pageSize) > 0 ? Math.min(Number(params.pageSize), 100) : defSize;
  const page = Number(params && params.page) > 0 ? Number(params.page) : 1;
  const start = (page - 1) * pageSize;
  return {
    ok: true,
    items: items.slice(start, start + pageSize),
    total, page, pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize))
  };
}

async function doSearch(params) {
  const q = String((params && params.q) || '').trim().toLowerCase();
  const empty = { q: (params && params.q) || '', news: [], events: [], projects: [], documents: [], total: 0 };
  if (!q) return empty;
  const hit = (...fields) => fields.some((f) => String(f || '').toLowerCase().includes(q));

  const newsFull = await loadJson('news.json');
  const news = [];
  for (const n of newsFull.items) {
    const d = (await loadJson(`news/${n.id}.json`)).data;
    if (hit(d.title, d.summary, d.content)) {
      news.push({ id: d.id, title: d.title, summary: d.summary, category: d.category, cover: d.cover, created_at: d.created_at });
    }
    if (news.length >= 8) break;
  }

  const eventsFull = await loadJson('events.json');
  const events = eventsFull.items
    .filter((e) => hit(e.title, e.summary, e.location))
    .slice(0, 8)
    .map((e) => ({ id: e.id, title: e.title, summary: e.summary, category: e.category, cover: e.cover, start_at: e.start_at, status: e.status }));

  const projectsFull = await loadJson('projects.json');
  const projects = projectsFull.items
    .filter((p) => hit(p.title, p.summary, p.author_name))
    .slice(0, 8)
    .map((p) => ({ id: p.id, title: p.title, summary: p.summary, category: p.category, cover: p.cover, author_name: p.author_name }));

  return { q: (params && params.q) || '', news, events, projects, documents: [], total: news.length + events.length + projects.length };
}

async function get(path, params) {
  let m;
  if ((m = path.match(/^\/(events|projects|news|announcements|departments|courses)\/(\d+)$/))) {
    return loadJson(`${m[1]}/${m[2]}.json`);
  }
  if ((m = path.match(/^\/courses\/\d+\/my-enrollment$/))) {
    throw new ApiError('未登录，无选课记录', 404);
  }
  switch (path) {
    case '/auth/me':
      return { user: null, permissions: [] };
    case '/site':
      return loadJson('site.json');
    case '/gallery':
      return loadJson('gallery.json');
    case '/options':
      return loadJson('options.json');
    case '/courses':
      return loadJson('courses.json');
    case '/departments':
      return loadJson('departments.json');
    case '/members':
      return loadJson('members.json');
    case '/announcements':
      return loadJson('announcements.json');
    case '/messages/public':
      return loadJson('messages-public.json');
    case '/events':
      return pagedFrom(await loadJson('events.json'), params);
    case '/projects':
      return pagedFrom(await loadJson('projects.json'), params);
    case '/news':
      return pagedFrom(await loadJson('news.json'), params);
    case '/search':
      return doSearch(params);
    default:
      throw new ApiError(`静态演示站无此数据：${path}`, 404);
  }
}

const STATIC_MSG = '当前为静态演示站点，暂不支持在线提交，请通过页面上的联系方式（邮箱 / 电话）与我们联系。';
function notWritable() { throw new ApiError(STATIC_MSG, 503); }

export const api = {
  get: (p, params) => get(p, params),
  post: () => notWritable(),
  patch: () => notWritable(),
  del: () => notWritable(),
  upload: () => notWritable(),
  fileUrl: (id) => `${DATA_BASE}/${id}`,
  download: () => notWritable(),
  exportCsv: () => notWritable()
};

export default api;
