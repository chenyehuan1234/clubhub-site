/* ============================================================================
 *  motion.js — 滚动动效与微交互引擎
 *
 *  · 分层交错入场：同组元素按 70ms 递进，8 种变体（位移/缩放/模糊/裁切/面板翻转）
 *  · 滚动视差：首屏辉光随滚动缓慢位移，首屏文案上移淡出
 *  · 指针跟随：鼠标在首屏移动时产生柔光；信息面板与配图做轻微 3D 倾斜
 *  · 数字滚动：统计数字进入视口时从 0 计数到目标值
 *
 *  开关策略：默认开启。系统若开启「减少动态效果」，仍默认开启（宣传页的动效
 *  属于核心观感），但导航栏提供显式开关，选择会记住；关闭后元素直接呈现终态。
 * ==========================================================================*/

const KEY = 'clubhub.motion';

import { toast } from './ui.js';

/* 注意：这里返回的是布尔值，不是 'on' / 'off' 字符串。
 * 整份模块都把 motionOn 当布尔用（applyAttr、if (!motionOn)、toggleMotion 的取反），
 * 返回字符串 'off' 会被当成真值 —— 那样「关闭动效」只在这一轮会话有效，
 * 刷新后又会自作主张地打开，而 localStorage 里明明记着 off。 */
const readPref = () => {
  try { return localStorage.getItem(KEY) !== 'off'; }
  catch { return true; }
};

let motionOn = readPref();
let observer = null;

export const isMotionOn = () => motionOn;

function applyAttr() {
  document.documentElement.dataset.motion = motionOn ? 'on' : 'off';
  document.querySelectorAll('[data-motion-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', motionOn ? 'true' : 'false');
    b.title = motionOn ? '关闭滚动动效' : '开启滚动动效';
    b.classList.toggle('off', !motionOn);
  });
}

/* ------------------------------------------------------------ 强制呈现终态 */

function revealAllNow(root = document) {
  root.querySelectorAll('[data-rv]').forEach((n) => n.classList.add('in'));
  root.querySelectorAll('[data-count]').forEach((n) => {
    if (n.dataset.counted !== '1') {
      n.dataset.counted = '1';
      n.textContent = Number(n.dataset.count).toLocaleString('zh-CN');
    }
  });
}

/* ------------------------------------------------------------ 直接呈现 */

/** 给一批元素结算终态：临时关掉过渡，避免出现"补动画"的闪动 */
function markIn(nodes) {
  if (!nodes.length) return 0;

  const st = document.createElement('style');
  st.textContent = '[data-rv]{transition:none!important}';
  document.head.appendChild(st);

  nodes.forEach((n) => {
    n.classList.add('in');
    if (n.hasAttribute('data-count')) countUp(n);
    n.querySelectorAll?.('[data-count]').forEach(countUp);
  });
  // 两帧后移除，确保终态已结算
  requestAnimationFrame(() => requestAnimationFrame(() => st.remove()));
  return nodes.length;
}

/**
 * 路由切换 / 列表筛选时使用：首屏范围内的元素直接呈现，不播入场动画。
 * 这样点导航或筛选按钮不会出现「整页重新虚化聚焦」的闪动；
 * 首屏之外的区块仍交给 observeReveal，滚动到时照常动画。
 * @returns {number} 被直接呈现的元素个数
 */
export function revealInstant(root = document) {
  return markIn([...root.querySelectorAll('[data-rv]:not(.in)')].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.top < window.innerHeight * 0.98 && r.bottom > 0;
  }));
}

/**
 * 兜底清扫：把「已经开始越过视口上沿」却还没入场的元素直接呈现。
 *
 * IntersectionObserver 只在元素与视口相交时回调，所以拖动滚动条、按 End、
 * 或任何一次跳跃式滚动跨过的元素永远不会相交；对 [data-rv="clip"] 更麻烦 ——
 * 它的起始态是顶部 1% 的一条细缝，往回滚时这条细缝要等元素顶端越过视口上沿
 * 才进入视口。不处理的话这些元素会一直停在隐藏态，用户往回滚只能看到空白。
 *
 * 判定条件是 r.top < 0（元素上沿已越过视口上沿）。向下滚动入场的元素此时
 * r.top > 0，因此正常的入场动画完全不受影响；只有已经越过、或正卡在上沿的
 * 元素会被直接结算。滚动时按帧节流，收敛后查询结果为空、开销可忽略。
 */
function sweepPassed() {
  const nodes = [...document.querySelectorAll('[data-rv]:not(.in)')].filter((n) => n.getBoundingClientRect().top < 0);
  if (nodes.length) markIn(nodes);
}

let sweepQueued = false;
function scheduleSweep() {
  if (sweepQueued) return;
  sweepQueued = true;
  requestAnimationFrame(() => { sweepQueued = false; sweepPassed(); });
}

let sweeping = false;
function installSweep() {
  if (sweeping) return;
  sweeping = true;
  addEventListener('scroll', scheduleSweep, { passive: true });
  addEventListener('resize', scheduleSweep, { passive: true });
}

/* ------------------------------------------------------------ 入场观察 */

let staggerStep = 80;

function groupDelay(node) {
  const parent = node.parentElement;
  if (!parent) return 0;
  const sibs = [...parent.children].filter((n) => n.hasAttribute && n.hasAttribute('data-rv'));
  const i = sibs.indexOf(node);
  if (i < 0) return 0;
  return Math.min(i, 8) * staggerStep;
}

/** 读取一次 CSS 变量（避免逐元素触发样式计算） */
function readStagger() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rv-stagger'));
  staggerStep = Number.isFinite(v) && v > 0 ? v : 80;
}

/** 让元素先以"起始态"完成一次样式计算，否则同帧加 .in 不会产生过渡 */
function freezeInitialState(nodes) {
  // 读取一次布局属性即强制样式与布局结算
  void document.documentElement.offsetHeight;
  nodes.forEach((n) => n.getBoundingClientRect());
}

export function observeReveal(root = document) {
  const nodes = root.querySelectorAll('[data-rv]:not(.in)');
  if (!nodes.length) return;

  if (!motionOn || !('IntersectionObserver' in window)) {
    revealAllNow(root);
    return;
  }
  readStagger();

  if (!observer) {
    /* threshold 必须是 0（而不是某个百分比）：
     * IntersectionObserver 会把目标自身的 clip-path 算进相交矩形，而 [data-rv="clip"]
     * 的起始态是一条 1% 高的细缝（见 site.css）。用百分比阈值会让这条细缝的面积
     * 达不到门槛，图片就永远等不到 .in、永远不显示。
     * 触发时机由 rootMargin 的 -10% 控制：元素顶端越过视口底部 10% 才开始动画。 */
    observer = new IntersectionObserver((list) => {
      for (const entry of list) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        node.style.setProperty('--d', `${groupDelay(node)}ms`);
        node.classList.add('in');
        observer.unobserve(node);
        if (node.hasAttribute('data-count')) countUp(node);
        node.querySelectorAll?.('[data-count]').forEach(countUp);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
  }
  nodes.forEach((n) => observer.observe(n));
  installSweep();

  // 首屏内已经可见的元素：先结算起始态，再在下一帧入场，保证动画真的播放
  requestAnimationFrame(() => {
    const inView = [...root.querySelectorAll('[data-rv]:not(.in)')].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.top < window.innerHeight * 0.92 && r.bottom > 0;
    });
    if (!inView.length) return;
    freezeInitialState(inView);
    requestAnimationFrame(() => {
      inView.forEach((n) => {
        n.style.setProperty('--d', `${groupDelay(n)}ms`);
        n.classList.add('in');
        observer.unobserve(n);
        if (n.hasAttribute('data-count')) countUp(n);
        n.querySelectorAll?.('[data-count]').forEach(countUp);
      });
    });
  });

  /* 兜底一：任何元素只要已经被滚过头，立刻结算终态（见 sweepPassed 注释） */
  scheduleSweep();

  /* 兜底二：万一某个元素因为自身的裁切/尺寸始终触发不了观察器（宣传图栏就踩过
   * 这个坑），2 秒后强制呈现当前已在视口内、却还没拿到 .in 的元素。
   * revealInstant 只处理「此刻确实可见」的元素，所以正常滚动入场的动画不受影响。 */
  setTimeout(() => revealInstant(root), 2000);
}

/* ------------------------------------------------------------ 数字滚动 */

function countUp(node) {
  if (node.dataset.counted === '1') return;
  node.dataset.counted = '1';
  const to = Number(node.dataset.count);
  if (!Number.isFinite(to)) return;
  if (!motionOn) { node.textContent = to.toLocaleString('zh-CN'); return; }
  const dur = 1200;
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = Math.round(to * eased).toLocaleString('zh-CN');
    if (p < 1) requestAnimationFrame(tick);
  };
  node.textContent = '0';
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------ 视差 / 指针 */

function rAFThrottle(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

export function initMotion() {
  applyAttr();
  if (!motionOn) { revealAllNow(); return; }

  const onScroll = rAFThrottle(() => {
    const y = window.scrollY;
    document.querySelectorAll('[data-parallax]').forEach((n) => {
      const speed = Number(n.dataset.parallax || 0.18);
      const limit = Number(n.dataset.parallaxLimit || 420);
      n.style.transform = `translate3d(0, ${(Math.min(y, limit) * speed).toFixed(1)}px, 0)`;
    });
    const heroBody = document.querySelector('.hero-copy');
    if (heroBody) {
      const p = Math.min(1, y / 520);
      heroBody.style.transform = `translate3d(0, ${(-p * 26).toFixed(1)}px, 0)`;
      heroBody.style.opacity = String(1 - p * 0.55);
    }
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/** 首屏指针柔光 + 面板倾斜 */
export function initHeroPointer(scope = document) {
  if (!motionOn) return;
  const hero = scope.querySelector('.hero');
  if (!hero) return;

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let glow = hero.querySelector('.hero-glow');
    if (!glow) {
      glow = document.createElement('div');
      glow.className = 'hero-glow';
      glow.setAttribute('aria-hidden', 'true');
      glow.setAttribute('data-parallax', '0.1');
      glow.setAttribute('data-parallax-limit', '500');
      hero.prepend(glow);
    }
    const move = rAFThrottle((x, y) => {
      const r = hero.getBoundingClientRect();
      glow.style.setProperty('--mx', `${(((x - r.left) / r.width) * 100).toFixed(2)}%`);
      glow.style.setProperty('--my', `${(((y - r.top) / r.height) * 100).toFixed(2)}%`);
    });
    hero.addEventListener('pointermove', (e) => { glow.style.opacity = '1'; move(e.clientX, e.clientY); });
    hero.addEventListener('pointerleave', () => { glow.style.opacity = '0'; });

    scope.querySelectorAll('[data-tilt]').forEach((card) => {
      const max = Number(card.dataset.tilt || 3.2);
      const onMove = rAFThrottle((x, y) => {
        const r = card.getBoundingClientRect();
        const px = (x - r.left) / r.width - 0.5;
        const py = (y - r.top) / r.height - 0.5;
        card.style.transform = `perspective(1100px) rotateY(${(px * max).toFixed(2)}deg) rotateX(${(-py * max).toFixed(2)}deg) translate3d(0,-2px,0)`;
      });
      card.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }
}

/* ------------------------------------------------------------ 回到顶部 */

export function initBackToTop() {
  if (document.querySelector('.to-top')) return;
  const btn = document.createElement('button');
  btn.className = 'to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', '回到顶部');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: motionOn ? 'smooth' : 'auto' }));
  document.body.append(btn);

  const onScroll = rAFThrottle(() => { btn.classList.toggle('show', window.scrollY > 700); });
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ------------------------------------------------------------ 开关 */

export function toggleMotion() {
  motionOn = !motionOn;
  try { localStorage.setItem(KEY, motionOn ? 'on' : 'off'); } catch { /* ignore */ }
  applyAttr();

  if (motionOn) {
    // 重新开始：先回到起始态，再让观察器接管
    document.querySelectorAll('[data-rv]').forEach((n) => {
      n.classList.remove('in');
      n.dataset.counted = '';
    });
    document.querySelectorAll('[data-count]').forEach((n) => { n.textContent = '0'; });
    if (observer) observer.disconnect();
    observer = null;
    window.scrollTo({ top: window.scrollY, behavior: 'auto' });
    observeReveal(document);
  } else {
    if (observer) { observer.disconnect(); observer = null; }
    revealAllNow(document);
    document.querySelectorAll('[data-parallax]').forEach((n) => { n.style.transform = ''; });
    const hc = document.querySelector('.hero-copy');
    if (hc) { hc.style.transform = ''; hc.style.opacity = ''; }
  }
  return motionOn;
}

export function initMotionToggle() {
  applyAttr();
  document.querySelectorAll('[data-motion-toggle]').forEach((b) => {
    if (b.dataset.bound === '1') return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      const on = toggleMotion();
      toast(on ? '已开启滚动动效' : '已关闭滚动动效', on ? 'ok' : 'info');
    });
  });
}
