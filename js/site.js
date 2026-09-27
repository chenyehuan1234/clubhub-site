/* ============================================================================
 *  site.js — 对外宣传站
 *  结构参考 DeepSeek Harness 产品页：
 *    深色 + 蓝色辉光首屏 / 2×2 胶囊按钮 / 带窗口装饰的信息面板 /
 *    居中双字体大标题 / 三栏特性卡 / 图文交替 / 分段切换 / 起步卡 / 页脚
 * ==========================================================================*/

import { api } from './api.js';
import { store, loadSite, loadMe, initTheme, toggleTheme, fmt } from './store.js';
import {
  $, $$, el, toast, toastOk, toastErr, modal, cover, avatarHtml,
  loadingHtml, esc, debounce
} from './ui.js';
import { mdToHtml } from './markdown.js';
import { initMotion, initHeroPointer, initBackToTop, initMotionToggle, observeReveal, revealInstant } from './motion.js';

const view = $('#view');
let SITE = null;

/* ------------------------------------------------------------------ 图标 */

const I = {
  calendar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8.5 14.5h3v3h-3z"/></svg>',
  layers: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.4l9 4.4 9-4.4L12 3Z"/><path d="M3 12.4 12 16.8l9-4.4"/><path d="M3 16.9 12 21.3l9-4.4"/></svg>',
  frame: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="9" cy="9" r="1.6"/><path d="M4 17.6 9.6 12l3.9 3.9 2.6-2.6 3.9 3.9"/></svg>',
  arrow: '<svg width="15" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true"><path d="M1 5h13M10 1.5 14 5l-4 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  github: '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.19c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>',
  mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
  compass: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  key: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-2 2 2 2-2 2-2-2-2 2"/></svg>',
  image: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M3.5 18 9.5 12l4 4 2.5-2.5 4.5 4.5"/></svg>'
};

/* ------------------------------------------------------------------ 工具 */

const loadLine = (t = 'Loading') => `<div class="container"><div class="loading-row">${esc(t)}</div></div>`;
const blank = (t = '暂无内容') => `<div class="blank">${esc(t)}</div>`;
const backLink = (href, text) => `<a class="back" href="${href}">← ${esc(text)}</a>`;

function stateOf(e) {
  const iso = new Date().toISOString();
  const past = e.signup_deadline && String(e.signup_deadline) < iso;
  const full = e.capacity > 0 && Number(e.signed) >= e.capacity;
  switch (e.status) {
    case 'ongoing': return { cls: 'on', text: '进行中' };
    case 'finished': return { cls: 'off', text: '已结束' };
    case 'cancelled': return { cls: 'off', text: '已取消' };
    case 'draft': return { cls: 'off', text: '草稿' };
    default:
      if (full) return { cls: 'wait', text: '名额已满' };
      if (past) return { cls: 'off', text: '报名已截止' };
      return { cls: 'on', text: '报名中' };
  }
}
const stateHtml = (e) => {
  const s = stateOf(e);
  return `<span class="state ${s.cls}"><i></i>${esc(s.text)}</span>`;
};

const mdShort = (dd) => (dd && dd.length >= 2) ? dd : { d: '—', m: '' };
function dateParts(v) {
  const s = String(v || '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return mdShort(null);
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return { d: `${m[2]}.${m[3]}`, m: `${names[Number(m[2]) - 1]} ${m[1].slice(2)}` };
}
const mdDay = (v) => {
  const s = String(v || '');
  const m = s.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : '—';
};

/* 入场动效与指针交互统一由 motion.js 处理。
 * instantNav：首屏首次渲染之后的所有页面切换与列表筛选都直接呈现，
 * 避免「清空 → 重新虚化聚焦」造成的闪动；首屏之外照常滚动入场。 */
let firstPaint = true;
let instantNav = false;

const motion = () => {
  if (instantNav) revealInstant(view);
  observeReveal(view);
  initHeroPointer(view);
};

/* ------------------------------------------------------------------ 首页 */

async function renderHome() {
  const [home, courseRes, deptRes, eventRes, memberRes] = await Promise.all([
    api.get('/site'),
    api.get('/courses').catch(() => ({ data: [] })),
    api.get('/departments').catch(() => ({ data: [] })),
    api.get('/events', { pageSize: 6 }).catch(() => ({ items: [] })),
    api.get('/members').catch(() => ({ data: { roster: [] } }))
  ]);
  SITE = home.data;
  SITE.roster = memberRes.data?.roster || [];
  const homeEvents = eventRes.items || [];
  const st = SITE.settings;
  const c = SITE.counts;
  const events = SITE.featuredEvents || [];
  const courses = courseRes.data || [];
  const depts = deptRes.data || [];
  const works = SITE.featuredProjects || [];
  const heroWork = works.find((w) => /机械臂/.test(w.title)) || works[0] || null;
  const news = SITE.latestNews || [];
  const anns = SITE.announcements || [];
  const gallery = SITE.gallery || [];
  const founded = (st.milestones || [])[0]?.year || '';

  const eventRows = events.slice(0, 5).map((e) => {
    const s = stateOf(e);
    return `<a class="win-row" href="#/events/${e.id}">
      <span class="dt">${esc(mdDay(e.start_at))}</span>
      <span class="tt">${esc(e.title)}</span>
      <span class="st ${s.cls}">${esc(s.text)}</span>
    </a>`;
  }).join('');

  const courseRows = courses.slice(0, 5).map((x) => `
    <a class="win-row" href="#/courses/${x.id}">
      <span class="dt">${esc(x.code || '—')}</span>
      <span class="tt">${esc(x.title)}</span>
      <span class="st off">${esc(x.category || '课程')}</span>
    </a>`).join('');

  view.innerHTML = `
  <section class="hero">
    <div class="hero-glow" aria-hidden="true" data-parallax="0.1" data-parallax-limit="500"></div>
    <div class="container">
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="hero-label" data-rv="up">${esc(st.site_name || '')} · ${esc(st.site_slogan || '学生社团')}</div>
          <h1 data-rv="blur">${esc(st.hero_title || '')}</h1>
          <p class="hero-lede" data-rv="up">${esc(st.hero_subtitle || st.site_intro || '')}</p>
          <p class="hero-lede" data-rv="up">${esc(st.contact_address || '')}${founded ? ` · 成立于 ${esc(String(founded))} 年` : ''}</p>
          <div class="hero-cta" data-rv="up">
            <a class="btn btn-primary" href="${esc(st.hero_cta_link || '#/join')}">${I.github}${esc(st.hero_cta_text || '加入我们')}</a>
            <a class="btn" href="#/events">${I.compass}活动日历</a>
            <a class="btn" href="#/projects">${I.image}作品画廊</a>
            <a class="btn" href="#/courses">${I.layers}课程培训</a>
          </div>
        </div>

        <div class="tilt-wrap" data-rv="panel">
          <div class="win" data-tilt="3">
            <div class="win-tabs">
              <button class="tab" type="button" aria-selected="true" data-htab="events">近期活动</button>
              <button class="tab" type="button" aria-selected="false" data-htab="courses">课程培训</button>
              <span class="spacer"></span>
              <a class="act" href="#/events" style="text-decoration:none">全部 →</a>
            </div>
            <div class="win-bar"><i></i><i></i><i></i><span class="ttl">社团动态 — live</span></div>
            <div class="win-body" id="win-body">${eventRows || `<div class="win-cmd" style="color:var(--ink-4)">暂无活动</div>`}</div>
          </div>
        </div>
      </div>

      <div class="stat-strip" data-rv="up">
        <div class="stat-cell"><div class="k">Members</div><div class="v tnum" data-count="${c.members}">0</div></div>
        <div class="stat-cell"><div class="k">Events</div><div class="v tnum" data-count="${c.events}">0</div></div>
        <div class="stat-cell"><div class="k">Works</div><div class="v tnum" data-count="${c.projects}">0</div></div>
        <div class="stat-cell"><div class="k">Teams</div><div class="v tnum" data-count="${c.departments}">0</div></div>
      </div>
    </div>
  </section>

  ${anns.length ? `<section class="ann-strip" data-rv="down"><div class="container">
    ${anns.slice(0, 3).map((a) => `
      <a class="ann-item ${a.level}" href="#/announcements/${a.id}">
        <span class="dot"></span>
        <span class="lv">${a.level === 'urgent' ? 'Urgent' : a.level === 'important' ? 'Notice' : 'News'}</span>
        <span class="t">${esc(a.title)}</span>
        <span class="d">${esc(fmt.date(a.publish_at || a.created_at))}</span>
      </a>`).join('')}
  </div></section>` : ''}

  ${st.home_visual ? `
  <section class="sec tight">
    <div class="container">
      <figure class="home-visual" data-rv="clip">
        <img src="${esc(st.home_visual)}" alt="${esc(st.home_visual_caption || st.site_name || '')}" loading="lazy" decoding="async">
        <figcaption>
          <span>${esc(st.home_visual_caption || '')}</span>
        </figcaption>
      </figure>
    </div>
  </section>` : ''}

  <section class="sec sec-center">
    <div class="container">
      <span class="chip accent" data-rv="scale">${founded ? 'since ' + esc(String(founded)) : 'student club'}</span>
      <h2 class="sec-title" data-rv="blur"><span class="mono-accent">${esc(st.site_name || '社团')}</span> ${esc(st.site_slogan || '让每一个想法，都找到同频的人')}</h2>
      <p class="sec-sub" data-rv="up">${esc(st.site_intro || '')}</p>

      <div class="cards-3">
        <div class="card" data-rv="up">
          <div class="ic">${I.calendar}</div>
          <h3><a href="#/courses">动手实践</a></h3>
          <p>实践部带你从 Arduino 开发板与传感器入手，完成电路搭建、程序编写与结构装配，把想法做成实物。</p>
          <a class="more" href="#/courses">查看课程 →</a>
        </div>
        <div class="card" data-rv="up">
          <div class="ic">${I.layers}</div>
          <h3><a href="#/about">数理与算法</a></h3>
          <p>理论部负责打牢数理底子：高等数学、数学二级结论、科学实验与数独，并承担算法类课题。</p>
          <a class="more" href="#/projects">看项目 →</a>
        </div>
        <div class="card" data-rv="up">
          <div class="ic">${I.frame}</div>
          <h3><a href="#/projects">设计与三维</a></h3>
          <p>设计部负责一切对外呈现：Photoshop 排版与修图、123D 建模与打印，以及 AIGC 创作课题。</p>
          <a class="more" href="#/projects">浏览项目 →</a>
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="container">
      <div class="sec-head-left">
        <div>
          <span class="chip" data-rv="scale">What we do</span>
          <h2 class="sec-title" style="margin-top:20px" data-rv="blur">把科学做成<br>看得见的东西。</h2>
        </div>
        <a class="btn" href="#/about" data-rv="left">关于社团</a>
      </div>

      <div class="feature">
        <div class="feature-txt" data-rv="left">
          <h3><a href="#/projects">${esc(heroWork ? heroWork.title : '水下清洁作业机械臂')}</a></h3>
          <p>${esc(heroWork ? (heroWork.summary || '') : '一款新型防水机械臂，能够应用于水域垃圾清理工作。')}</p>
          <div class="switch-meta">
            <span>公开项目 <b>${c.projects}</b></span>
            <span>覆盖部门 <b>${c.departments}</b></span>
            <span>获奖记录 <b>${(st.honors || []).length}</b></span>
          </div>
          <a class="btn btn-sm" style="margin-top:22px" href="#/projects">全部项目 ${I.arrow}</a>
        </div>
        <div class="tilt-wrap" data-rv="clip">
          <div class="frame" data-tilt="2.4">
            <img src="${esc(st.home_feature_a_image || (heroWork && heroWork.cover ? heroWork.cover : cover('水下清洁作业机械臂', 'feat-a', '16/10')))}" alt="">
          </div>
        </div>
      </div>

      <div class="feature rev">
        <div class="feature-txt" data-rv="right">
          <h3><a href="#/courses">课程与资料，构成社团的日常</a></h3>
          <p>每周固定时段开课：Arduino、传感器、项目设计、Python、高等数学、Photoshop、3D 建模。讲义与项目文档全部归档进资料库，按公开 / 社员 / 管理层 / 仅管理员四档控制可见范围。</p>
          <div class="switch-meta">
            <span>课程 <b>${courses.length}</b></span>
            <span>覆盖部门 <b>${c.departments}</b></span>
            <span>公开资料 <b>${c.documents}</b></span>
          </div>
          <a class="btn btn-sm" style="margin-top:22px" href="#/courses">查看课表 ${I.arrow}</a>
        </div>
        <div class="tilt-wrap" data-rv="clip">
          <div class="frame" data-tilt="2.4"><img src="${esc(st.home_feature_b_image || cover('课程与资料 curriculum', 'feat-b', '16/10'))}" alt=""></div>
        </div>
      </div>
    </div>
  </section>

  ${gallery.length ? `
  <section class="sec p-gallery">
    <div class="container">
      <div class="gal-wrap">
        <div class="gal-aside" data-rv="left">
          <span class="chip">Gallery</span>
          <h2 class="sec-title" style="margin-top:20px" data-rv="blur">社团的样子</h2>
          <p class="sec-sub">活动现场、项目原型、合照与海报。照片由社员自己拍，栏目内容后台可随时更换。</p>
          <div class="gal-count"><b>${gallery.length}</b> 张现场照片</div>
        </div>
        <div class="gal-grid">
          ${gallery.map((g, i) => `
            <figure class="gal-item" data-l="${esc(g.layout || 'normal')}" data-rv="clip">
              <img src="${esc(g.image)}" alt="${esc(g.title || '')}" loading="lazy" decoding="async" data-zoom>
              <figcaption>
                <b>${esc(g.title || '')}</b>
                ${g.caption ? `<i>${esc(g.caption)}</i>` : ''}
              </figcaption>
              <span class="gal-no">${String(i + 1).padStart(2, '0')}</span>
            </figure>`).join('')}
        </div>
      </div>
    </div>
  </section>` : ''}

  <section class="sec sec-center">
    <div class="container">
      <span class="chip" data-rv="scale">Teams</span>
      <h2 class="sec-title" data-rv="blur"><span class="mono-accent">${depts.length}</span> 个部门，各管一摊事</h2>
      <p class="sec-sub" data-rv="up">每个部门都有自己的负责人与固定职责，也常常一起干活。</p>
      <div class="switcher" data-rv="up">
        <div class="switch-tabs" id="dept-tabs">
          ${depts.map((d, i) => `<button type="button" data-dept="${i}" aria-selected="${i === 0}">${esc(d.name)}</button>`).join('')}
        </div>
        <div class="switch-body" id="dept-body"></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="container">
      <div class="sec-head-left">
        <div>
          <span class="chip" data-rv="scale">Events</span>
          <h2 class="sec-title" style="margin-top:20px" data-rv="blur">活动与比赛</h2>
        </div>
        <a class="btn" href="#/events" data-rv="left">全部活动</a>
      </div>
      ${homeEvents.length
    ? `<div class="list">${homeEvents.map(eventRow).join('')}</div>`
    : blank('暂时没有活动记录')}
    </div>
  </section>

  <section class="sec">
    <div class="container">
      <div class="sec-head-left">
        <div>
          <span class="chip" data-rv="scale">Projects</span>
          <h2 class="sec-title" style="margin-top:20px" data-rv="blur">项目成果</h2>
        </div>
        <a class="btn" href="#/projects" data-rv="left">完整画廊</a>
      </div>
      ${works.length ? `<div class="list">${works.slice(0, 6).map(workRow).join('')}</div>` : blank('还没有公开项目')}
    </div>
  </section>

  <section class="sec">
    <div class="container">
      <div class="sec-head-left">
        <div>
          <span class="chip" data-rv="scale">Journal</span>
          <h2 class="sec-title" style="margin-top:20px" data-rv="blur">新闻动态</h2>
        </div>
        <a class="btn" href="#/news" data-rv="left">全部新闻</a>
      </div>
      ${news.length ? `<div style="border-top:1px solid var(--line)">${news.map(newsRow).join('')}</div>` : blank('还没有新闻')}
    </div>
  </section>

  <section class="sec">
    <div class="container">
      <div class="sec-head-left">
        <div>
          <span class="chip" data-rv="scale">Members</span>
          <h2 class="sec-title" style="margin-top:20px" data-rv="blur">社员名录</h2>
        </div>
        <a class="btn" href="#/members" data-rv="left">查看全部成员</a>
      </div>
      <div class="roster-strip" data-rv="up">
        ${(SITE.roster || []).slice(0, 9).map((m) => `
          <a class="roster-chip" href="#/members">
            ${avatarHtml(m.name, m.avatar, 'avatar-sm')}
            <span><b>${esc(m.name)}</b><i>${esc(m.position)}</i></span>
          </a>`).join('')}
      </div>
    </div>
  </section>

  <section class="sec sec-center">
    <div class="container">
      <span class="chip accent" data-rv="scale">Get started</span>
      <h2 class="sec-title" data-rv="blur">现在加入，或者先来看看</h2>
      <p class="sec-sub" data-rv="up">线上提交申请，三个工作日内会有负责人联系你；在校同学也可以直接来活动室找我们。</p>

      <div class="start-cards" style="text-align:left">
        <div class="start-card" data-rv="up">
          <h3>在线报名</h3>
          <p>填写基本信息与意向部门，两分钟完成。</p>
          <div class="term"><span class="sig">$</span><span class="val">提交入社申请</span><button class="cp" type="button" data-go="#/join">Go</button></div>
          <a class="btn btn-accent" style="margin-top:16px" href="#/join">填写申请表</a>
        </div>
        <div class="start-card" data-rv="up">
          <h3>社员入口</h3>
          <p>课表、资料库、任务与通知，登录后即可使用。</p>
          <div class="term"><span class="sig">$</span><span class="val">${esc(st.contact_email || 'hello@club.example')}</span><button class="cp" type="button" data-copy="${esc(st.contact_email || '')}">Copy</button></div>
          <a class="btn" style="margin-top:16px" href="#/join">${I.key}进入会员中心</a>
        </div>
      </div>
    </div>
  </section>

  <section class="sec tight sec-center">
    <div class="container-narrow">
      <span class="chip" data-rv="scale">Contact</span>
      <h2 class="sec-title" style="margin-top:20px" data-rv="blur">有任何问题，直接联系我们</h2>
      <p class="sec-sub" data-rv="up">${esc(st.contact_address || '')}${st.contact_phone ? ' · ' + esc(st.contact_phone) : ''}</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:26px" data-rv="up">
        <a class="btn btn-primary" href="#/contact">${I.mail}留言板</a>
        <a class="btn" href="#/about">${I.compass}了解更多</a>
      </div>
    </div>
  </section>`;

  /* 窗口标签切换 */
  const bodies = { events: eventRows || '<div class="win-cmd" style="color:var(--ink-4)">暂无活动</div>', courses: courseRows || '<div class="win-cmd" style="color:var(--ink-4)">暂无公开课程</div>' };
  view.querySelectorAll('[data-htab]').forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-selected') === 'true') return;
    view.querySelectorAll('[data-htab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    const body = $('#win-body');
    body.innerHTML = bodies[b.dataset.htab];
    body.classList.remove('swap');
    void body.offsetWidth;
    body.classList.add('swap');
    const act = view.querySelector('.win-tabs .act');
    if (act) act.href = b.dataset.htab === 'courses' ? '#/courses' : '#/events';
  }));

  /* 部门切换 */
  function paintDept(i) {
    const d = depts[i];
    if (!d) return;
    $('#dept-body').innerHTML = `
      <div>
        <h4>${esc(d.name)}</h4>
        <p>${esc(d.summary || '')}</p>
        <div class="switch-meta">
          <span>负责人 <b>${esc(d.leader_name || '待定')}</b></span>
          <span>成员 <b>${d.member_count || 0}</b></span>
          <span>邮箱 <b>${esc(d.email || '—')}</b></span>
        </div>
        <a class="btn btn-sm" style="margin-top:20px" href="#/departments">部门详情 ${I.arrow}</a>
      </div>
      <div class="frame"><img src="${esc(d.cover || cover(d.name, 'dept-' + d.id, '4/3'))}" alt="${esc(d.name)}"></div>`;
  }
  view.querySelectorAll('[data-dept]').forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-selected') === 'true') return;
    view.querySelectorAll('[data-dept]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    paintDept(Number(b.dataset.dept));
  }));
  paintDept(0);

  /* 复制 / 跳转 */
  view.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const t = b.dataset.copy;
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      b.classList.add('done');
      const old = b.textContent;
      b.textContent = 'Copied';
      setTimeout(() => { b.classList.remove('done'); b.textContent = old; }, 1600);
      toastOk('已复制');
    } catch { toastErr('复制失败，请手动选择'); }
  }));
  view.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));

  motion();
}

/* -------------------------------------------------------------- 条目组件 */

function workItem(p, asButton = false) {
  const inner = `
    <div class="art"><img src="${esc(p.cover || cover(p.title, p.id, '1/1'))}" alt="${esc(p.title)}" loading="lazy"></div>
    <div class="tt">${esc(p.title)}</div>
    <div class="by"><span>${esc(p.author_name || '匿名')}</span><span>${esc(p.category)}</span></div>`;
  return asButton
    ? `<button class="work" type="button" data-acc="projects" data-id="${p.id}" data-label="${esc(p.title)}" data-rv="scale" aria-expanded="false">${inner}</button>`
    : `<a class="work" data-rv="scale" href="#/projects/${p.id}">${inner}</a>`;
}

/** 首页项目行：不带封面图，保持首页克制（照片集中在 /projects 画廊） */
function workHead(p) {
  return `
    <div class="row-num">${esc(p.category)}</div>
    <div class="row-main">
      <div class="t">${esc(p.title)}</div>
      <div class="m">
        <span>${esc(p.author_name || '')}</span>
        <span>${esc(p.category)}</span>
        <span>${p.view_count || 0} 次浏览</span>
      </div>
    </div>`;
}
function workRow(p) {
  return `<a class="row-item" data-rv="up" href="#/projects/${p.id}">${workHead(p)}<span class="row-go">${I.arrow}</span></a>`;
}

function newsHead(n) {
  return `
    <div class="meta">${esc(fmt.date(n.published_at || n.created_at))}</div>
    <div>
      <span class="cat">${esc(n.category)}${n.is_pinned ? ' · 置顶' : ''}</span>
      <div class="t">${esc(n.title)}</div>
      ${n.summary ? `<div class="s">${esc(n.summary)}</div>` : ''}
    </div>`;
}
function newsRow(n) {
  return `<a class="news-row" data-rv="up" href="#/news/${n.id}">${newsHead(n)}</a>`;
}

function eventHead(e) {
  const { d, m } = dateParts(e.start_at);
  return `
    <div class="row-num">${esc(d)}<br><span style="opacity:.6">${esc(m)}</span></div>
    <div class="row-main">
      <div class="t">${esc(e.title)}</div>
      <div class="m">
        <span>${esc(e.category)}</span>
        <span>${esc(fmt.time(e.start_at))}${e.end_at ? '–' + esc(fmt.time(e.end_at)) : ''}</span>
        <span>${esc(e.location || '地点待定')}</span>
        ${stateHtml(e)}
      </div>
    </div>`;
}
function eventRow(e) {
  return `<a class="row-item" data-rv="up" href="#/events/${e.id}">${eventHead(e)}<span class="row-go">${I.arrow}</span></a>`;
}

/* ------------------------------------------------------------ 折叠面板 */

/** 就地展开的条目：点击标题展开详情，再点收回；不跳转页面 */
function accWrap(kind, id, cls, headHtml) {
  return `<div class="acc" data-kind="${kind}" data-id="${id}">
    <button class="acc-head ${cls}" type="button" aria-expanded="false">
      ${headHtml}
      <span class="acc-chev">${I.arrow}</span>
    </button>
    <div class="acc-panel"><div class="acc-inner"></div></div>
  </div>`;
}

/** 面板内容按需拉取，展开过一次就缓存 */
async function accLoad(kind, id) {
  if (kind === 'events') {
    const e = (await api.get(`/events/${id}`)).data;
    return { html: eventPanel(e), bind: (s) => bindEventPanel(s, e) };
  }
  if (kind === 'courses') {
    const { c, enrolled } = await courseData(id);
    return { html: coursePanel(c, enrolled), bind: (s) => bindCoursePanel(s, c, enrolled) };
  }
  if (kind === 'projects') {
    const p = (await api.get(`/projects/${id}`)).data;
    return { html: projectPanel(p), bind: (s) => bindProjectPanel(s, p) };
  }
  if (kind === 'news') {
    const n = (await api.get(`/news/${id}`)).data;
    return { html: newsPanel(n), bind: null };
  }
  if (kind === 'announcements') {
    const a = (await api.get(`/announcements/${id}`)).data;
    return { html: annPanel(a), bind: null };
  }
  if (kind === 'departments') {
    const d = (await api.get(`/departments/${id}`)).data;
    return { html: deptPanel(d), bind: null };
  }
  return { html: '', bind: null };
}

/** 就地展开/收回。多个条目可以同时展开，互不影响 */
async function toggleAcc(head) {
  const item = head.closest('.acc');
  if (!item) return;
  const isOpen = item.classList.contains('open');

  if (isOpen) {
    item.classList.remove('open');
    head.setAttribute('aria-expanded', 'false');
    return;
  }

  item.classList.add('open');
  head.setAttribute('aria-expanded', 'true');

  const inner = item.querySelector('.acc-inner');
  if (!inner || inner.dataset.loaded === '1') return;
  inner.innerHTML = '<div class="acc-load"><span class="spinner"></span> 正在载入…</div>';
  try {
    const { html, bind } = await accLoad(item.dataset.kind, item.dataset.id);
    inner.dataset.loaded = '1';
    inner.innerHTML = `<div class="acc-body" data-rv="up">${html}</div>`;
    bind?.(inner);
    observeReveal(inner);
  } catch (e) {
    inner.innerHTML = `<div class="acc-body"><div class="blank">载入失败：${esc(e.message)}</div></div>`;
  }
}

/* 列表页统一在 #view 上做事件委托：折叠面板 + 图片放大。
 * 只绑一次（boot 时），避免每次渲染重复挂监听。 */
function bindViewDelegates() {
  view.addEventListener('click', (e) => {
    const card = e.target.closest('[data-acc]');
    if (card) { e.preventDefault(); toggleGalleryCard(card); return; }

    const head = e.target.closest('.acc-head');
    if (head) { e.preventDefault(); toggleAcc(head); return; }

    const img = e.target.closest('[data-zoom]');
    if (img) {
      const box = el('div', { style: { textAlign: 'center' } });
      box.append(el('img', { src: img.src, style: { maxWidth: '100%', maxHeight: '76vh', borderRadius: '9px' } }));
      modal({ title: img.alt || '', body: box, size: 'wide' });
    }
  });

  // 换行后把已展开的面板重新插到新的行尾
  let rzTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      view.querySelectorAll('[data-kind] > .acc-drawer.open').forEach(placePanel);
    }, 160);
  });
}

/* ------------------------------------------------------------------ 关于 */

async function renderAbout() {
  const st = SITE.settings;
  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>${esc(st.about_title || '关于我们')}</h1>
    <p class="lede">${esc(st.site_slogan || '')}</p>
    <div class="metaline">
      <span>${esc(st.contact_address || '')}</span>
      <span>${esc(st.contact_email || '')}</span>
    </div>
  </div></section>
  <section class="sec tight"><div class="container">
    <div class="detail-grid">
      <div>
        <div class="prose">${mdToHtml(st.site_intro || '')}</div>
        <h4 style="font-family:var(--font-mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-4);margin:52px 0 0">History</h4>
        <div class="ms-list" style="margin-top:16px">
          ${(st.milestones || []).map((m) => `
            <div class="ms-item">
              <div class="y">${esc(m.year)}</div>
              <div><div class="t">${esc(m.title)}</div><div class="d">${esc(m.desc)}</div></div>
            </div>`).join('') || blank('暂无记录')}
        </div>
      </div>
      <aside>
        <div class="side-block">
          <h4>Honors</h4>
          <div class="honor-grid" style="grid-template-columns:1fr">
            ${(st.honors || []).map((h) => `<div class="honor"><span class="y">${esc(h.year)}</span><span class="t">${esc(h.title)}</span></div>`).join('') || '<span class="prose">暂无</span>'}
          </div>
        </div>
        <div class="side-block">
          <h4>Contact</h4>
          <div class="rows">
            <div class="kv-row"><span class="k">邮箱</span><span class="v">${esc(st.contact_email || '—')}</span></div>
            <div class="kv-row"><span class="k">电话</span><span class="v">${esc(st.contact_phone || '—')}</span></div>
            <div class="kv-row"><span class="k">地址</span><span class="v">${esc(st.contact_address || '—')}</span></div>
          </div>
        </div>
      </aside>
    </div>
  </div></section>`;
}

/* -------------------------------------------------------------- 组织架构 */

async function renderDepartments() {
  const list = (await api.get('/departments')).data || [];
  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>组织架构</h1>
    <p class="lede">每个部门负责一摊事，也常常一起干活。点任意一个部门就地展开详细介绍，再点一次收回。</p>
  </div></section>
  <section class="sec tight"><div class="container">
    <div class="cards-3" data-kind="departments" style="margin-top:0">
      ${list.map((d, i) => `
        <button class="card left dept-card" type="button" data-acc="departments" data-id="${d.id}" data-label="${esc(d.name)}" aria-expanded="false" data-rv="up">
          <div class="row-num" style="margin-bottom:10px">${String(i + 1).padStart(2, '0')}</div>
          <h3 style="margin-bottom:8px">${esc(d.name)}</h3>
          <p>${esc(d.summary || '')}</p>
          <div class="switch-meta" style="margin-top:16px">
            <span>负责人 <b>${esc(d.leader_name || '待定')}</b></span>
            <span>成员 <b>${d.member_count || 0}</b></span>
          </div>
          <span class="dept-more">查看详细介绍 <span class="acc-chev">${I.arrow}</span></span>
        </button>`).join('') || blank('暂无部门')}
    </div>
  </div></section>`;
  motion();
}

/** 部门详细介绍：展开面板内容 */
function deptPanel(d) {
  const people = (d.members || []).length ? `
    <h4 class="sec-label-sm">Members · 部门成员</h4>
    <div class="people-row">
      ${d.members.map((m) => `
        <div class="person">
          <div class="avatar">${m.avatar ? `<img src="${esc(m.avatar)}" alt="" loading="lazy">` : esc((m.name || '?').slice(0, 1))}</div>
          <div class="pn">${esc(m.name)}</div>
          <div class="pr">${esc(m.position || '社员')}</div>
        </div>`).join('')}
    </div>` : '';

  const cards = (items, hrefBase, label) => items.length ? `
    <h4 class="sec-label-sm">${label}</h4>
    <div class="mini-grid">
      ${items.map((x) => `<a class="mini-card" href="${hrefBase}/${x.id}">
        ${x.cover ? `<div class="art"><img src="${esc(x.cover)}" alt="" loading="lazy"></div>` : ''}
        <div class="tt">${esc(x.title)}</div>
        <div class="by">${esc(x.category || '')}</div>
      </a>`).join('')}
    </div>` : '';

  return `
    <div class="detail-grid">
      <div>
        ${d.intro ? `<p class="lede" style="margin-top:0">${esc(d.intro)}</p>` : ''}
        ${d.description ? `<div class="prose">${mdToHtml(d.description)}</div>` : ''}
        ${cards(d.courses || [], '#/courses', 'Courses · 部门课程')}
        ${cards(d.projects || [], '#/projects', 'Works · 部门作品')}
      </div>
      <aside>
        <div class="side-block">
          <h4>Info</h4>
          <div class="rows">
            <div class="kv-row"><span class="k">负责人</span><span class="v">${esc(d.leader_name || '待定')}${d.leader_position ? ` · ${esc(d.leader_position)}` : ''}</span></div>
            <div class="kv-row"><span class="k">成员</span><span class="v">${d.member_count || 0} 人</span></div>
          </div>
          <a class="btn btn-sm cta" href="#/join" style="margin-top:14px">加入这个部门</a>
        </div>
      </aside>
    </div>
    ${people}`;
}

/* -------------------------------------------------------------- 成员名录 */

async function renderMembers() {
  const d = (await api.get('/members')).data;
  const roster = d.roster || [];
  const terms = d.alumniTerms || [];

  const personCard = (m, isAlum) => {
    const pos = m.position || m.role || '';
    const dept = m.department_name && !pos.includes(m.department_name) ? m.department_name : '';
    return `
    <div class="person" data-rv="up">
      <div class="ph">${m.avatar ? `<img src="${esc(m.avatar)}" alt="${esc(m.name)}" loading="lazy">` : avatarHtml(m.name, '', '')}</div>
      <div class="nm">${esc(m.name)}</div>
      <div class="ro">${esc(pos)}${dept ? ` · ${esc(dept)}` : ''}</div>
      ${isAlum && m.org ? `<div class="org">${esc(m.org)}</div>` : ''}
      ${!isAlum && m.bio ? `<div class="qt">「${esc(m.bio)}」</div>` : ''}
    </div>`;
  };

  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>社员名录</h1>
    <p class="lede">${esc(SITE.settings?.site_name || '')}现任核心成员与历届社干。</p>
    <div class="metaline">
      <span>现任 ${roster.length} 人</span>
      <span>历届 ${terms.reduce((a, t) => a + t.members.length, 0)} 人</span>
      <span>${terms.length} 届</span>
    </div>
  </div></section>

  <section class="sec tight">
    <div class="container">
      <span class="chip accent" data-rv="scale">Current</span>
      <h2 class="sec-title" style="margin:20px 0 10px" data-rv="blur">现任核心成员</h2>
      <p class="sec-sub" style="margin-bottom:0" data-rv="up">第三届（现任）社干与指导老师。</p>
      ${roster.length ? `<div class="people">${roster.map((m) => personCard(m, false)).join('')}</div>` : blank('暂无成员信息')}
    </div>
  </section>

  ${terms.map((t) => `
  <section class="sec tight">
    <div class="container">
      <div class="sec-head-left">
        <div>
          <span class="chip" data-rv="scale">Alumni</span>
          <h2 class="sec-title" style="margin-top:18px" data-rv="blur">${esc(t.term)}</h2>
        </div>
        <span class="tag-line">${t.members.length} 人</span>
      </div>
      <div class="people">${t.members.map((m) => personCard(m, true)).join('')}</div>
    </div>
  </section>`).join('')}

  <section class="sec tight sec-center">
    <div class="container-narrow">
      <span class="chip" data-rv="scale">Join us</span>
      <h2 class="sec-title" style="margin-top:20px" data-rv="blur">想成为下一届的一员？</h2>
      <p class="sec-sub" data-rv="up">不限年级、不限基础，三个部门都欢迎你。</p>
      <a class="btn btn-accent" style="margin-top:24px" href="#/join" data-rv="up">提交入社申请</a>
    </div>
  </section>`;
  motion();
}

/* ------------------------------------------------------------------ 活动 */

async function renderEvents() {
  const raw = location.hash.split('?')[1] || '';
  const cur = new URLSearchParams(raw).get('category') || '';
  const cats = ['', '社团活动', '讲座', '比赛', '团建', '志愿', '展览'];
  const r = await api.get('/events', { pageSize: 30, category: cur || undefined });

  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>活动</h1>
    <p class="lede">点任意一条就地展开详情与报名，再点一次收回。</p>
    <div class="switch-tabs" style="margin-top:26px;padding-bottom:0">
      ${cats.map((c) => `<a href="#/events${c ? '?category=' + encodeURIComponent(c) : ''}"
        class="btn btn-sm" style="${cur === c ? 'background:var(--ink);color:var(--bg);border-color:var(--ink)' : ''}">${esc(c || '全部')}</a>`).join('')}
    </div>
  </div></section>
  <section class="sec tight"><div class="container">
    ${r.items.length
      ? `<div class="list">${r.items.map((e) => accWrap('events', e.id, 'row-item', eventHead(e))).join('')}</div>`
      : blank('这个分类下暂时没有活动')}
  </div></section>`;
  motion();
}

/** 活动详情内容：详情页与列表折叠面板共用。宣传页只做展示，报名在社内系统进行 */
function eventPanel(e) {
  return `
    <div class="detail-art"><img src="${esc(e.cover || cover(e.title, e.id, '21/9'))}" alt="" loading="lazy"></div>
    <div class="detail-grid">
      <div class="prose">${mdToHtml(e.content || e.summary || '')}</div>
      <aside>
        <div class="side-block">
          <h4>Info</h4>
          <div class="rows">
            <div class="kv-row"><span class="k">时间</span><span class="v">${esc(fmt.dt(e.start_at))}${e.end_at ? ' – ' + esc(fmt.time(e.end_at)) : ''}</span></div>
            <div class="kv-row"><span class="k">地点</span><span class="v">${esc(e.location || '待定')}</span></div>
            <div class="kv-row"><span class="k">主办</span><span class="v">${esc(e.department?.name || e.organizer || '社务')}</span></div>
            ${e.fee > 0 ? `<div class="kv-row"><span class="k">费用</span><span class="v">¥${fmt.money(e.fee)}</span></div>` : ''}
            ${e.contact ? `<div class="kv-row"><span class="k">咨询</span><span class="v">${esc(e.contact)}</span></div>` : ''}
          </div>
          <p style="font-size:12px;color:var(--ink-4);margin:14px 0 0">活动报名与签到在社内系统里进行，社员登录后即可参加。</p>
        </div>
      </aside>
    </div>`;
}

function bindEventPanel() { /* 宣传页不提供报名入口 */ }

async function renderEventDetail(id) {
  const e = (await api.get(`/events/${id}`)).data;
  view.innerHTML = `
  <section class="detail-head"><div class="container-narrow">
    ${backLink('#/events', '返回活动列表')}
    <div class="row" style="gap:10px;margin-top:22px">
      <span class="chip">${esc(e.category)}</span>
      ${stateHtml(e)}
    </div>
    <h1>${esc(e.title)}</h1>
    <p class="lede">${esc(e.summary || '')}</p>
    <div class="metaline">
      <span>${esc(fmt.dt(e.start_at))}${e.end_at ? ' – ' + esc(fmt.time(e.end_at)) : ''}</span>
      <span>${esc(e.location || '地点待定')}</span>
      <span>${esc(e.department?.name || e.organizer || SITE.settings?.site_name || '')}</span>
    </div>
  </div></section>
  <div class="container-narrow">${eventPanel(e)}</div>`;
  bindEventPanel(view, e);
}

/* ------------------------------------------------------------------ 课程 */

async function renderCourses() {
  const list = (await api.get('/courses')).data || [];
  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>课程培训</h1>
    <p class="lede">我们平时上些什么课。点任意一门就地展开课程安排，再点一次收回。</p>
  </div></section>
  <section class="sec tight"><div class="container">
    <div class="list">
      ${list.map((c, i) => accWrap('courses', c.id, 'row-item course-row', `
        <div class="row-thumb">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : `<div class="row-num">${esc(c.code || String(i + 1).padStart(2, '0'))}</div>`}</div>
        <div class="row-main">
          <div class="t">${esc(c.title)}</div>
          <div class="m">
            <span>${esc(c.category)}</span>
            <span>${esc(c.teacher_name || '讲师待定')}</span>
          </div>
          ${c.summary ? `<div class="s">${esc(c.summary)}</div>` : ''}
        </div>`)).join('') || blank('暂无公开课程')}
    </div>
  </div></section>`;
  motion();
}

/** 课程详情需要额外查一次"我选没选" */
async function courseData(id) {
  const c = (await api.get(`/courses/${id}`)).data;
  let enrolled = null;
  if (store.user) { try { enrolled = (await api.get(`/courses/${id}/my-enrollment`)).data; } catch { /* 未选课 */ } }
  return { c, enrolled };
}

function coursePanel(c, enrolled) {
  return `
    <div class="detail-grid">
      <div>
        ${c.cover ? `<div class="detail-art" style="margin-bottom:22px"><img src="${esc(c.cover)}" alt="${esc(c.title)}" loading="lazy"></div>` : ''}
        ${c.description ? `<div class="prose">${mdToHtml(c.description)}</div>` : ''}
        <h4 class="sec-label-sm">Schedule · 课程安排</h4>
        ${(c.sessions || []).length ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>日期</th><th>时间</th><th>主题</th><th>场地</th><th>讲师</th></tr></thead>
          <tbody>${c.sessions.map((s) => `<tr>
            <td class="mono">${String(s.seq).padStart(2, '0')}</td>
            <td class="mono">${esc(s.date)}</td>
            <td class="mono">${esc(s.start_time)}–${esc(s.end_time)}</td>
            <td>${esc(s.topic || '')}</td>
            <td>${esc(s.venue_name || '—')}</td>
            <td>${esc(s.teacher_name || '—')}</td>
          </tr>`).join('')}</tbody></table></div>` : blank('课表尚未排出')}
      </div>
      <aside>
        <div class="side-block">
          <h4>Info</h4>
          <div class="rows">
            <div class="kv-row"><span class="k">部门</span><span class="v">${esc(c.department_name || '社务')}</span></div>
            <div class="kv-row"><span class="k">主讲</span><span class="v">${esc(c.teacher_name || '待定')}</span></div>
            <div class="kv-row"><span class="k">场地</span><span class="v">${esc(c.venue_name || '待定')}</span></div>
          </div>
        </div>
        <div class="side-block">
          <h4>How to join</h4>
          <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 12px">课程面向社员开放，纳新期间在「加入我们」提交申请即可。</p>
          <a class="btn btn-accent cta" href="#/join">加入我们</a>
        </div>
      </aside>
    </div>`;
}

function bindCoursePanel() { /* 宣传页不提供选课，课表与签到在社内系统 */ }

async function renderCourseDetail(id) {
  const { c, enrolled } = await courseData(id);
  view.innerHTML = `
  <section class="detail-head"><div class="container-narrow">
    ${backLink('#/courses', '返回课程列表')}
    <div class="row" style="gap:10px;margin-top:22px"><span class="chip">${esc(c.category)}</span>${c.code ? `<span class="chip accent">${esc(c.code)}</span>` : ''}</div>
    <h1>${esc(c.title)}</h1>
    <p class="lede">${esc(c.summary || '')}</p>
    <div class="metaline">
      <span>讲师 ${esc(c.teacher_name || '待定')}</span>
      <span>${c.total_sessions || (c.sessions || []).length} 次课</span>
      <span>已选 ${c.enrolled}${c.capacity ? ' / ' + c.capacity : ''} 人</span>
    </div>
  </div></section>
  <div class="container-narrow">${coursePanel(c, enrolled)}</div>`;
  bindCoursePanel(view, c, enrolled);
}

/* ------------------------------------------------------------------ 作品 */

async function renderProjects() {
  const raw = location.hash.split('?')[1] || '';
  const cur = new URLSearchParams(raw).get('category') || '';
  const cats = ['', '摄影', '绘画', '设计', '视频', '文字', '音乐', '编程', '其他'];
  const r = await api.get('/projects', { pageSize: 36, category: cur || undefined });

  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>作品风采</h1>
    <p class="lede">社员的作品集，按门类归档。点任意一张即可就地展开详情，再点一次收起。</p>
    <div class="switch-tabs" style="margin-top:26px;padding-bottom:0">
      ${cats.map((c) => `<a href="#/projects${c ? '?category=' + encodeURIComponent(c) : ''}"
        class="btn btn-sm" style="${cur === c ? 'background:var(--ink);color:var(--bg);border-color:var(--ink)' : ''}">${esc(c || '全部')}</a>`).join('')}
    </div>
  </div></section>
  <section class="sec tight"><div class="container">
    ${r.items.length
      ? `<div class="work-grid" data-kind="projects">${r.items.map((p) => workItem(p, true)).join('')}</div>`
      : blank('这个分类下暂时没有作品')}
  </div></section>`;
  motion();
}

/** 找到卡片所在网格行的最后一张卡，把面板插到它后面，画廊排列不会错位 */
function placePanel(panel) {
  const grid = panel.parentElement;
  if (!grid || !grid.dataset.kind) return;
  const card = grid.querySelector(`[data-acc][data-id="${panel.dataset.for}"]`);
  if (!card) return;
  const cards = [...grid.querySelectorAll(':scope > [data-acc]')];
  const top = card.offsetTop;
  const row = cards.filter((c) => Math.abs(c.offsetTop - top) < 2);
  const last = row[row.length - 1] || card;
  if (last.nextElementSibling !== panel) last.after(panel);
}

/** 画廊面板用显式高度过渡：网格项里 0fr/1fr 的 1fr 会被压成 0 */
let drawerSettle = null;
function expandDrawer(node, inner) {
  const p = node.querySelector('.acc-panel');
  if (!p) return;
  if (p.style.height === 'auto') return;      // 已自适应，后续内容变化直接撑开
  p.style.height = `${inner.scrollHeight}px`;
  clearTimeout(drawerSettle);
  drawerSettle = setTimeout(() => {
    if (node.classList.contains('open') && node.isConnected) p.style.height = 'auto';
  }, 540);
}

/** 画廊卡片就地展开。多张可以同时展开，各自的面板插在自己所在行的下方 */
async function toggleGalleryCard(card) {
  const grid = card.closest('[data-kind]');
  if (!grid) return;
  const id = String(card.dataset.id);
  const isOpen = card.classList.contains('is-open');
  const panel = grid.querySelector(`.acc-drawer[data-for="${id}"]`);

  if (isOpen) {
    card.classList.remove('is-open');
    card.setAttribute('aria-expanded', 'false');
    if (panel) {
      const p = panel.querySelector('.acc-panel');
      p.style.height = `${panel.querySelector('.acc-inner').scrollHeight}px`;
      void p.offsetHeight;
      p.style.height = '0px';
      panel.classList.remove('open');
      // 等高度动画结束再摘除节点
      setTimeout(() => { if (!panel.classList.contains('open') && panel.isConnected) panel.remove(); }, 560);
    }
    return;
  }

  card.classList.add('is-open');
  card.setAttribute('aria-expanded', 'true');

  let node = panel;
  if (!node) {
    node = document.createElement('div');
    node.className = 'acc acc-drawer';
    node.dataset.for = id;
    node.innerHTML = '<div class="acc-panel"><div class="acc-inner"></div></div>';
    grid.append(node);
  }
  placePanel(node);
  node.classList.add('open');

  const inner = node.querySelector('.acc-inner');
  const body = node.querySelector('.acc-panel');
  if (inner.dataset.loaded === id) { expandDrawer(node, inner); return; }

  inner.innerHTML = '<div class="acc-load"><span class="spinner"></span> 正在载入…</div>';
  // 先结算 0 高度，再展开到"载入中"
  body.style.height = '0px';
  void body.offsetHeight;
  expandDrawer(node, inner);

  try {
    const kind = grid.dataset.kind;
    const { html, bind } = await accLoad(kind, id);
    inner.dataset.loaded = id;
    const label = card.dataset.label || card.querySelector('.tt')?.textContent || '';
    inner.innerHTML = `<div class="acc-body" data-rv="up"><div class="acc-heading">${esc(label)}</div>${html}</div>`;
    bind?.(inner);
    observeReveal(inner);
    expandDrawer(node, inner);
  } catch (e) {
    inner.innerHTML = `<div class="acc-body"><div class="blank">载入失败：${esc(e.message)}</div></div>`;
    expandDrawer(node, inner);
  }
}

/** 项目详情内容：详情页与列表折叠面板共用 */
function projectPanel(p) {
  const arr = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  let images = arr(p.images);
  if (!images.length) images = [p.cover || cover(p.title, p.id, '4/3')];
  const tech = arr(p.tech_stack);
  const awards = arr(p.awards);
  const files = arr(p.files).filter((x) => typeof x === 'string' && x.startsWith('http'));

  return `
    ${images.length === 1
      ? `<figure class="proj-cover"><img src="${esc(images[0])}" alt="${esc(p.title)}" loading="lazy" data-zoom></figure>`
      : `<div class="gallery">${images.map((src) => `<div class="g"><img src="${esc(src)}" alt="${esc(p.title)}" loading="lazy" data-zoom></div>`).join('')}</div>`}
    <div class="detail-grid">
      <div>
        ${p.description ? `<div class="prose">${mdToHtml(p.description)}</div>` : ''}
        ${awards.length ? `
          <h4 class="sec-label-sm">曾获奖项</h4>
          <div class="award-list">
            ${awards.map((a) => `<div class="award-item">${esc(a)}</div>`).join('')}
          </div>` : ''}
      </div>
      <aside>
        ${tech.length ? `<div class="side-block">
          <h4>技术栈</h4>
          <div class="chips-wrap">${tech.map((t) => `<span class="tag-pill">${esc(t)}</span>`).join('')}</div>
        </div>` : ''}
        <div class="side-block">
          <h4>Project info</h4>
          <div class="rows">
            ${p.period ? `<div class="kv-row"><span class="k">周期</span><span class="v">${esc(p.period)}</span></div>` : ''}
            ${p.member_names ? `<div class="kv-row"><span class="k">成员</span><span class="v">${esc(p.member_names)}</span></div>` : ''}
            ${p.department_name ? `<div class="kv-row"><span class="k">部门</span><span class="v">${esc(p.department_name)}</span></div>` : ''}
          </div>
        </div>
        ${(p.demo_url || files.length) ? `<div class="side-block">
          <h4>相关材料</h4>
          <div class="col" style="gap:9px">
            ${p.demo_url ? `<a class="btn btn-accent btn-block" href="${esc(p.demo_url)}" target="_blank" rel="noopener">播放演示视频</a>` : ''}
            ${files.map((f, i) => `<a class="btn btn-block" href="${esc(f)}" target="_blank" rel="noopener">相关文件 ${i + 1}</a>`).join('')}
          </div>
        </div>` : ''}
      </aside>
    </div>`;
}

/** 面板里的图片点击放大由全局委托处理，这里只保留占位以保持接口一致 */
function bindProjectPanel() { /* no-op */ }

async function renderProjectDetail(id) {
  const p = (await api.get(`/projects/${id}`)).data;
  view.innerHTML = `
  <section class="detail-head"><div class="container-narrow">
    ${backLink('#/projects', '返回项目列表')}
    <div class="row" style="gap:10px;margin-top:22px">
      <span class="chip">${esc(p.category)}</span>
      ${p.department_name ? `<span class="chip">${esc(p.department_name)}</span>` : ''}
    </div>
    <h1>${esc(p.title)}</h1>
    <p class="lede">${esc(p.summary || '')}</p>
    <div class="metaline">
      <span>${esc(p.author_name || '')}</span>
      ${p.period ? `<span>${esc(p.period)}</span>` : ''}
      <span>${esc(fmt.date(p.created_at))}</span>
      <span>${p.view_count} 次浏览</span>
    </div>
  </div></section>
  <div class="container-narrow">${projectPanel(p)}</div>`;
}

/** 新闻详情内容：详情页与列表折叠面板共用 */
function newsPanel(n) {
  return `
    ${n.cover ? `<div class="detail-art"><img src="${esc(n.cover)}" alt="" loading="lazy"></div>` : ''}
    <div class="prose">${mdToHtml(n.content || '')}</div>
    <div class="acc-nav">
      ${n.prev ? `<a class="btn btn-sm" href="#/news/${n.prev.id}">← ${esc(n.prev.title.slice(0, 18))}</a>` : '<span></span>'}
      ${n.next ? `<a class="btn btn-sm" href="#/news/${n.next.id}">${esc(n.next.title.slice(0, 18))} →</a>` : '<span></span>'}
    </div>`;
}

async function renderNewsDetail(id) {
  const n = (await api.get(`/news/${id}`)).data;
  view.innerHTML = `
  <section class="detail-head"><div class="container-narrow">
    ${backLink('#/news', '返回新闻列表')}
    <div class="row" style="gap:10px;margin-top:22px">
      <span class="chip">${esc(n.category)}</span>${n.is_pinned ? '<span class="chip accent">置顶</span>' : ''}
    </div>
    <h1>${esc(n.title)}</h1>
    <div class="metaline">
      <span>${esc(fmt.dt(n.published_at || n.created_at))}</span>
      <span>${esc(n.author_name || SITE.settings?.site_name || '')}</span>
      <span>${n.view_count} 次浏览</span>
    </div>
  </div></section>
  <div class="container-narrow">${newsPanel(n)}</div>`;
}

/* ------------------------------------------------------------------ 公告 */

/** 公告详情内容：详情页与列表折叠面板共用 */
function annPanel(a) {
  return `
    <div class="prose">${mdToHtml(a.content || '')}</div>
    <p class="acc-note">社内定向公告请登录后在会员中心查看，支持标记已读。</p>`;
}

/* -------------------------------------------------- 资讯（新闻 + 公告） */

/** 公告条目头：列表页与折叠面板共用 */
function annHead(a) {
  return `
    <div class="meta">${esc(fmt.date(a.publish_at || a.created_at))}</div>
    <div>
      <span class="cat">${a.level === 'urgent' ? '紧急' : a.level === 'important' ? '重要' : '公告'}${a.is_pinned ? ' · 置顶' : ''}</span>
      <div class="t">${esc(a.title)}</div>
      <div class="s">${esc((a.content || '').replace(/[#*`>\-]/g, '').slice(0, 150))}</div>
    </div>`;
}

/**
 * 资讯页：新闻与公告合成一个页面，用标签切换。
 * 两个标签的内容一次取回，切换只切显示，不重新请求、不重播入场动画。
 */
async function renderNews(tab = 'news') {
  const isAnn = tab === 'ann';
  const [nr, ar] = await Promise.all([
    api.get('/news', { pageSize: 24 }),
    api.get('/announcements')
  ]);
  const news = nr.items || [];
  const anns = ar.data || [];

  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>资讯</h1>
    <p class="lede">新闻与公告都在这里。点任意一条就地展开全文，再点一次收回。</p>
    <div class="tabs" role="tablist" style="margin-top:26px">
      <button class="tab ${isAnn ? '' : 'on'}" type="button" role="tab" data-tab="news" aria-selected="${isAnn ? 'false' : 'true'}">新闻动态 <span class="n">${news.length}</span></button>
      <button class="tab ${isAnn ? 'on' : ''}" type="button" role="tab" data-tab="ann" aria-selected="${isAnn ? 'true' : 'false'}">公告栏 <span class="n">${anns.length}</span></button>
    </div>
  </div></section>
  <section class="sec tight"><div class="container">
    <div data-pane="news" class="${isAnn ? 'hide' : ''}">
      ${news.length
        ? `<div class="list">${news.map((n) => accWrap('news', n.id, 'news-row', newsHead(n))).join('')}</div>`
        : blank('暂无新闻')}
    </div>
    <div data-pane="ann" class="${isAnn ? '' : 'hide'}">
      ${anns.length
        ? `<div class="list">${anns.map((a) => accWrap('announcements', a.id, 'news-row', annHead(a))).join('')}</div>`
        : blank('暂无公开公告')}
      <p class="acc-note" style="margin-top:18px">社内定向公告登录后可在会员中心查看，支持标记已读。</p>
    </div>
  </div></section>`;

  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tab;
    $$('[data-tab]', view).forEach((x) => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('[data-pane]', view).forEach((p) => p.classList.toggle('hide', p.dataset.pane !== t));
    history.replaceState(null, '', t === 'ann' ? '#/news?tab=ann' : '#/news');
  }));
  motion();
}

async function renderAnnDetail(id) {
  const a = (await api.get(`/announcements/${id}`)).data;
  view.innerHTML = `
  <section class="detail-head"><div class="container-narrow">
    ${backLink('#/news?tab=ann', '返回公告栏')}
    <div class="row" style="gap:10px;margin-top:22px">
      <span class="chip ${a.level === 'urgent' ? 'accent' : ''}">${a.level === 'urgent' ? 'Urgent' : a.level === 'important' ? 'Notice' : 'Announcement'}</span>
    </div>
    <h1>${esc(a.title)}</h1>
    <div class="metaline"><span>${esc(fmt.dt(a.publish_at || a.created_at))}</span></div>
  </div></section>
  <div class="container-narrow">${annPanel(a)}</div>`;
}

/* ------------------------------------------------------------------ 加入 */

async function renderJoin() {
  const st = SITE.settings;
  const depts = SITE.departments || [];

  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>加入我们</h1>
    <p class="lede">${esc(st.site_slogan || '')}</p>
  </div></section>

  <section class="sec tight"><div class="container">
    <span class="chip">Process</span>
    <div class="steps" style="margin-top:24px">
      ${(st.join_process || []).map((s) => `
        <div class="step" data-rv="up">
          <div class="n">STEP ${esc(s.step)}</div>
          <div class="t">${esc(s.title)}</div>
          <div class="d">${esc(s.desc)}</div>
        </div>`).join('') || blank('暂无流程说明')}
    </div>
  </div></section>

  <section class="sec tight"><div class="container">
    <div class="detail-grid" style="padding-top:0;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)">
      <div>
        <span class="chip">FAQ</span>
        <h2 class="sec-title" style="margin:20px 0 26px">常见问题</h2>
        <div class="qa">
          <div class="qa-item"><div class="q">有年级或专业限制吗？</div><div class="a">没有。任何年级、任何专业都可以申请，我们只看你想不想做点东西。</div></div>
          <div class="qa-item"><div class="q">需要基础吗？</div><div class="a">不需要。摄影、设计、开发都有从零开始的课程与讲义。</div></div>
          <div class="qa-item"><div class="q">大概要投入多少时间？</div><div class="a">每周一次例会加一门课，约四小时；活动期间会多一点，但都是自愿参与。</div></div>
          <div class="qa-item"><div class="q">提交后多久有回复？</div><div class="a">三个工作日内会有负责人联系你，请留意手机与邮箱。</div></div>
        </div>
      </div>

      <div class="form-panel" data-rv="right" id="join-panel">
        <h3>在线报名</h3>
        <p class="hint">两分钟填完，我们会尽快联系你。</p>
        <div class="f-grid">
          <div class="field"><label>姓名<span class="req">*</span></label><input class="f-input" id="j-name" placeholder="你的姓名"></div>
          <div class="field"><label>学号</label><input class="f-input" id="j-no" placeholder="如 2025010101"></div>
          <div class="field"><label>性别</label><select class="f-select" id="j-gender"><option value="">未填</option><option>男</option><option>女</option></select></div>
          <div class="field"><label>年级</label><input class="f-input" id="j-grade" placeholder="如 2025"></div>
          <div class="field span2"><label>专业</label><input class="f-input" id="j-major" placeholder="你的专业"></div>
          <div class="field"><label>手机<span class="req">*</span></label><input class="f-input" id="j-phone" placeholder="方便联系的手机号"></div>
          <div class="field"><label>邮箱</label><input class="f-input" id="j-email" type="email" placeholder="you@example.com"></div>
          <div class="field"><label>微信 / QQ</label><input class="f-input" id="j-wechat" placeholder="选填"></div>
          <div class="field span2"><label>意向部门</label>
            <select class="f-select" id="j-dept"><option value="">还没想好</option>
              ${depts.map((d) => `<option value="${d.id}">${esc(d.name)} — ${esc(d.summary || '')}</option>`).join('')}
            </select>
          </div>
          <div class="field span2"><label>自我介绍</label><textarea class="f-textarea" id="j-intro" placeholder="简单说说你自己，以及为什么想加入我们"></textarea></div>
          <div class="field span2"><label>作品 / 主页链接</label><input class="f-input" id="j-portfolio" placeholder="选填"></div>
        </div>
        <div class="actions">
          <span class="note">提交即表示同意我们在审核过程中联系你</span>
          <button class="btn btn-accent" id="j-submit">提交申请</button>
        </div>
      </div>
    </div>
  </div></section>`;

  motion();

  $('#j-submit').addEventListener('click', async () => {
    const btn = $('#j-submit');
    const body = {
      name: $('#j-name').value.trim(), student_no: $('#j-no').value.trim(), gender: $('#j-gender').value,
      grade: $('#j-grade').value.trim(), major: $('#j-major').value.trim(), phone: $('#j-phone').value.trim(),
      email: $('#j-email').value.trim(), wechat: $('#j-wechat').value.trim(),
      department_id: $('#j-dept').value || null, intro: $('#j-intro').value.trim(), portfolio: $('#j-portfolio').value.trim()
    };
    if (!body.name) return toastErr('请填写姓名');
    if (!body.phone && !body.email) return toastErr('请至少留下手机号或邮箱');
    try {
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 提交中';
      await api.post('/applications', body);
      $('#join-panel').innerHTML = `
        <span class="chip accent">Submitted</span>
        <h3 style="margin-top:20px">申请已提交</h3>
        <p class="hint" style="margin-bottom:22px">我们会尽快查看你的申请，三个工作日内有负责人联系你。</p>
        <a class="btn" href="#/">返回首页</a>`;
    } catch (e) {
      toastErr(e.message);
      btn.disabled = false; btn.textContent = '提交申请';
    }
  });
}

/* ------------------------------------------------------------------ 联系 */

async function renderContact() {
  const st = SITE.settings;
  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>联系我们</h1>
    <p class="lede">有问题、有合作意向，或者只是想打个招呼，都可以。</p>
  </div></section>

  <section class="sec tight"><div class="container">
    <div class="detail-grid" style="padding-top:0">
      <div>
        <div class="form-panel" style="margin-bottom:clamp(28px,3.5vw,44px)">
          <h3>留言</h3>
          <p class="hint">我们通常会在两个工作日内回复。</p>
          <div class="f-grid">
            <div class="field"><label>称呼</label><input class="f-input" id="m-name" placeholder="怎么称呼你"></div>
            <div class="field"><label>邮箱</label><input class="f-input" id="m-email" placeholder="选填"></div>
            <div class="field span2"><label>内容</label><textarea class="f-textarea" id="m-content" placeholder="想说的话…"></textarea></div>
          </div>
          <div class="actions">
            <span class="note">留言可能会被公开展示</span>
            <button class="btn btn-accent" id="m-submit">发送留言</button>
          </div>
        </div>
        <span class="chip">Messages</span>
        <div id="m-list" style="margin-top:20px">${loadLine('Loading')}</div>
      </div>

      <aside>
        <div class="side-block">
          <h4>Contact</h4>
          <div class="rows">
            <div class="kv-row"><span class="k">邮箱</span><span class="v">${esc(st.contact_email || '—')}</span></div>
            <div class="kv-row"><span class="k">电话</span><span class="v">${esc(st.contact_phone || '—')}</span></div>
            <div class="kv-row"><span class="k">地址</span><span class="v">${esc(st.contact_address || '—')}</span></div>
            <div class="kv-row"><span class="k">QQ 群</span><span class="v">${esc(st.qq_group || '—')}</span></div>
            <div class="kv-row"><span class="k">公众号</span><span class="v">${esc(st.wechat_official || '—')}</span></div>
          </div>
        </div>
        <div class="side-block">
          <h4>Follow</h4>
          <div class="rows">
            ${(st.social_links || []).map((l) => `<div class="kv-row"><span class="k">${esc(l.label)}</span><span class="v">${esc(l.value)}</span></div>`).join('') || '<div class="kv-row"><span class="v" style="color:var(--ink-4)">暂无</span></div>'}
          </div>
        </div>
        <div class="side-block">
          <h4>Member</h4>
          <p style="font-size:13px;color:var(--ink-3);line-height:1.8;margin:0 0 14px">课表、资料库与任务在社内系统里，登录后可用。</p>
          <a class="btn btn-accent cta" href="#/join">${I.key}进入会员中心</a>
        </div>
      </aside>
    </div>
  </div></section>`;

  $('#m-submit').addEventListener('click', async () => {
    const content = $('#m-content').value.trim();
    if (content.length < 2) return toastErr('留言内容太短了');
    try {
      await api.post('/messages', { name: $('#m-name').value.trim(), email: $('#m-email').value.trim(), content });
      $('#m-content').value = '';
      toastOk('留言已提交，谢谢反馈');
      loadPublicMessages();
    } catch (e) { toastErr(e.message); }
  });
  loadPublicMessages();
}

async function loadPublicMessages() {
  try {
    const list = (await api.get('/messages/public')).data || [];
    $('#m-list').innerHTML = list.length ? `<div class="msg-list">
      ${list.map((m, i) => `<div class="msg-item" data-rv="up">
        <div class="hd"><span class="nm">${esc(m.name)}</span><span class="tm">${esc(fmt.rel(m.created_at))}</span></div>
        <div class="bd">${esc(m.content)}</div>
        ${m.reply ? `<div class="re"><b>社团回复</b> · ${esc(m.reply)}</div>` : ''}
      </div>`).join('')}</div>` : blank('还没有公开留言，欢迎成为第一个');
    observeReveal($('#m-list'));
  } catch {
    $('#m-list').innerHTML = blank('留言加载失败');
  }
}

/* ------------------------------------------------------------------ 搜索 */

async function renderSearch(q) {
  view.innerHTML = `
  <section class="detail-head"><div class="container">
    ${backLink('#/', '返回首页')}
    <h1>搜索</h1>
    <div class="search-field" style="margin-top:26px;max-width:620px">
      <input id="s-input" value="${esc(q)}" placeholder="搜索活动、作品、新闻…" autocomplete="off">
      <button class="btn btn-accent" id="s-go">搜索</button>
    </div>
  </div></section>
  <section class="sec tight"><div class="container" id="s-results"></div></section>`;

  const go = () => { location.hash = `#/search?q=${encodeURIComponent($('#s-input').value.trim())}`; };
  $('#s-go').addEventListener('click', go);
  $('#s-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  if (!q) { $('#s-results').innerHTML = blank('输入关键词开始搜索'); return; }

  const d = (await api.get('/search', { q })).data;
  const group = (title, items, render) => items.length
    ? `<div class="hit-group"><h4>${esc(title)}</h4>${items.map(render).join('')}</div>` : '';

  $('#s-results').innerHTML = d.total
    ? group('活动', d.events, (x) => `<a class="hit" href="#/events/${x.id}"><span><span class="t">${esc(x.title)}</span><span class="s">${esc(x.summary || '')}</span></span><span class="k">Event</span></a>`)
    + group('作品', d.projects, (x) => `<a class="hit" href="#/projects/${x.id}"><span><span class="t">${esc(x.title)}</span><span class="s">${esc(x.summary || '')}</span></span><span class="k">Work</span></a>`)
    + group('新闻', d.news, (x) => `<a class="hit" href="#/news/${x.id}"><span><span class="t">${esc(x.title)}</span><span class="s">${esc(x.summary || '')}</span></span><span class="k">News</span></a>`)
    + group('资料', d.documents || [], (x) => `<a class="hit" href="/member.html#documents"><span><span class="t">${esc(x.title)}</span><span class="s">${esc(x.category)}</span></span><span class="k">Doc</span></a>`)
    : blank(`没有找到与「${q}」相关的内容`);
}

/* ------------------------------------------------------------------ 路由 */

function setActiveNav(key) {
  document.querySelectorAll('#site-menu a').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
  $('#site-menu')?.classList.remove('open');
  $('#btn-menu')?.setAttribute('aria-expanded', 'false');
}

/* 顶部进度条：只在导航确实慢（>170ms）时才出现，快速切换时完全不闪 */
let navBarTimer = null;
function navStart() {
  const bar = $('#nav-bar');
  if (!bar) return;
  clearTimeout(navBarTimer);
  bar.classList.remove('on', 'done');
  bar.style.width = '0';
  navBarTimer = setTimeout(() => {
    if (!bar.isConnected) return;
    bar.classList.add('on');
    requestAnimationFrame(() => { bar.style.width = '72%'; });
  }, 170);
}
function navEnd() {
  const bar = $('#nav-bar');
  clearTimeout(navBarTimer);
  if (!bar || !bar.classList.contains('on')) return;
  bar.style.width = '100%';
  bar.classList.add('done');
  setTimeout(() => { bar.classList.remove('on', 'done'); bar.style.width = '0'; }, 280);
}

async function route() {
  if (!SITE) {
    await loadSite();
    SITE = { settings: store.settings, departments: store.departments, counts: store.counts };
  }
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  const q = new URLSearchParams(queryPart || '').get('q') || '';

  // 首屏首次渲染播放入场动画；之后所有切换直接呈现，不再重播，避免闪动
  instantNav = !firstPaint;
  window.scrollTo({ top: 0, behavior: 'auto' });
  navStart();
  try {
    switch (seg[0]) {
      case undefined: case '': setActiveNav('home'); await renderHome(); break;
      case 'about': setActiveNav('about'); await renderAbout(); break;
      case 'departments': setActiveNav('departments'); await renderDepartments(); break;
      case 'members': setActiveNav('members'); await renderMembers(); break;
      case 'events': setActiveNav('events'); await (seg[1] ? renderEventDetail(seg[1]) : renderEvents()); break;
      case 'courses': setActiveNav('courses'); await (seg[1] ? renderCourseDetail(seg[1]) : renderCourses()); break;
      case 'projects': setActiveNav('projects'); await (seg[1] ? renderProjectDetail(seg[1]) : renderProjects()); break;
      case 'news': setActiveNav('news'); await (seg[1] ? renderNewsDetail(seg[1]) : renderNews(new URLSearchParams(queryPart || '').get('tab') === 'ann' ? 'ann' : 'news')); break;
      case 'announcements': setActiveNav('news'); await (seg[1] ? renderAnnDetail(seg[1]) : renderNews('ann')); break;
      case 'join': setActiveNav('join'); await renderJoin(); break;
      case 'contact': setActiveNav('contact'); await renderContact(); break;
      case 'search': setActiveNav(''); await renderSearch(q); break;
      default: setActiveNav(''); await renderHome();
    }
  } catch (e) {
    view.innerHTML = `<section class="sec"><div class="container">
      <div class="blank">页面加载失败：${esc(e.message)}</div>
      <a class="btn btn-sm" href="#/">返回首页</a></div></section>`;
  }
  navEnd();
  firstPaint = false;
}

/* ------------------------------------------------------------------ 启动 */

function applyBrand() {
  const st = store.settings || {};
  if (st.site_name) {
    document.title = `${st.site_name} · ${st.site_slogan || ''}`.trim();
    $('#brand-name').textContent = st.site_name;
    $('#foot-name').textContent = st.site_name;
  }
  // 社徽：优先使用上传的标志图，否则用文字标
  for (const id of ['#brand-mark', '#foot-mark']) {
    const node = $(id);
    if (!node) continue;
    const src = st.logo_image || '';
    if (src) { node.innerHTML = `<img src="${esc(src)}" alt="">`; node.classList.add('has-img'); }
    else { node.textContent = st.logo_text || (st.site_name || '社').slice(0, 1); node.classList.remove('has-img'); }
  }
  if (st.favicon) {
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = st.favicon;
  }
  // 页脚简介只取首段并截断，避免页脚被长文撑高
  const introFull = String(st.site_intro || '').split('\n')[0].trim();
  $('#foot-intro').textContent = introFull.length > 120 ? `${introFull.slice(0, 120)}…` : introFull;
  $('#foot-email').textContent = st.contact_email ? `邮箱：${st.contact_email}` : '';
  $('#foot-phone').textContent = st.contact_phone ? `电话：${st.contact_phone}` : '';
  $('#foot-addr').textContent = st.contact_address ? `地址：${st.contact_address}` : '';
  const oh = $('#foot-hours');
  if (oh) oh.textContent = st.office_hours ? `活动时间：${st.office_hours}` : '';
  $('#foot-copy').textContent = `© ${new Date().getFullYear()} ${st.site_name || '社团'}${st.footer_text ? ' · ' + st.footer_text : ''}`;
  $('#foot-icp').textContent = st.icp_text || '';

  // 页脚两列动态列表
  const areas = $('#foot-areas');
  if (areas) {
    areas.innerHTML = (st.research_areas || []).map((x) => `<span class="li">${esc(typeof x === 'string' ? x : x.label || '')}</span>`).join('')
      || '<span class="li">—</span>';
  }
  const friends = $('#foot-friends');
  if (friends) {
    friends.innerHTML = (st.friend_links || []).map((l) => `<a href="${esc(l.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(l.label || '')}</a>`).join('')
      || '<span class="li">—</span>';
  }
}

async function boot() {
  initTheme('dark');
  initMotion();
  initBackToTop();
  initMotionToggle();
  bindViewDelegates();

  const nav = $('#p-nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-search').addEventListener('click', () => { location.hash = '#/search'; });
  $('#btn-menu').addEventListener('click', () => {
    const m = $('#site-menu');
    const open = m.classList.toggle('open');
    $('#btn-menu').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('#site-menu')?.classList.remove('open'); $('#btn-menu')?.setAttribute('aria-expanded', 'false'); }
  });

  await loadSite();
  applyBrand();
  await loadMe();

  if (store.user) {
    const b = $('#btn-portal');
    b.textContent = '会员中心';
    b.href = '/member.html';
    const mp = $('#menu-portal');
    if (mp) { mp.textContent = '进入会员中心'; mp.href = '/member.html'; }
    if (['superadmin', 'admin', 'leader'].includes(store.user.role)) {
      const a = el('a', { class: 'btn btn-sm hide-sm', href: '/admin.html', text: '管理后台' });
      b.after(a);
      const ma = el('a', { class: 'only-mobile', href: '/admin.html', text: '管理后台' });
      mp?.after(ma);
    }
  }

  window.addEventListener('hashchange', route);
  await route();
}

boot();
