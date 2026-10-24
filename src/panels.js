/* 插件面板：左侧功能栏 + 右侧抽屉，每个按钮对应一个面板（导航 / 巴士 / 美食 / 课表 / 账号） */

import { submitMessage, isTelemetryOn } from './telemetry.js?v=20261103a';
import { clearSession, loadSession, logout as apiLogout } from './auth.js?v=20261105a';

const TITLES = {
  nav: '步行导航',
  bus: '校园巴士',
  food: '校园美食',
  schedule: '我的课表',
  message: '给作者留言',
  notice: '更新与关于',
  account: '账号',
};

const FOOD_KEY = 'cqu-food-posts';
const MSG_KEY = 'cqu-messages';
const AUTHOR_EMAIL = 'liujiarui_33@qq.com';
const NOTICE_SEEN_KEY = 'cqu-notice-version';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function dataUrl(file) {
  const V = (import.meta.url.match(/[?&]v=([^&]+)/) || [])[1] || '';
  return new URL('data/' + file + (V ? '?v=' + V : ''), document.baseURI).href;
}

/* ---------------- 抽屉控制 ---------------- */
function initDrawer() {
  const drawer = document.getElementById('drawer');
  const rail = document.getElementById('rail');
  const title = document.getElementById('drawer-title');
  const closeBtn = document.getElementById('drawer-close');
  if (!drawer || !rail) return null;

  const buttons = Array.from(rail.querySelectorAll('[data-plugin]'));
  const secs = new Map(Array.from(drawer.querySelectorAll('[data-panel]')).map((el) => [el.dataset.panel, el]));
  let current = null;

  const quickBar = document.getElementById('quick-bar');
  const QUICK_MAP = {
    sat: '#sat-btn',
    day: '.times [data-time="day"]',
    dusk: '.times [data-time="dusk"]',
    night: '.times [data-time="night"]',
    lock: '#cam-lock',
    home: '#views [data-view="all"]',
  };

  // 抽屉里的快捷控制和顶部按钮是同一套状态，点完把高亮同步回来
  function syncQuick() {
    if (!quickBar) return;
    const sat = document.getElementById('sat-btn');
    const lock = document.getElementById('cam-lock');
    const time = Array.from(document.querySelectorAll('.times [data-time]')).find((b) => b.classList.contains('active'));
    for (const b of quickBar.querySelectorAll('[data-quick]')) {
      const k = b.dataset.quick;
      let on = false;
      if (k === 'sat') on = !!(sat && sat.classList.contains('active'));
      else if (k === 'lock') on = !!(lock && lock.classList.contains('is-on'));
      else if (k === 'day' || k === 'dusk' || k === 'night') on = !!(time && time.dataset.time === k);
      b.classList.toggle('on', on);
    }
  }

  if (quickBar) {
    quickBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quick]');
      if (!b) return;
      const target = document.querySelector(QUICK_MAP[b.dataset.quick] || '');
      if (target) target.click();
      setTimeout(syncQuick, 80);
    });
  }
  // 顶部按钮自己变化时也同步（卫星是异步加载，多等一会儿）
  document.addEventListener('click', (e) => {
    if (e.target.closest('.tools, .times, #views, #back-home, #brand-home')) {
      setTimeout(syncQuick, 120);
      setTimeout(syncQuick, 900);
    }
  });

  function open(key) {
    if (!secs.has(key)) return;
    current = key;
    for (const [k, el] of secs) el.hidden = k !== key;
    if (title) title.textContent = TITLES[key] || '面板';
    drawer.hidden = false;
    for (const b of buttons) b.classList.toggle('active', b.dataset.plugin === key);
    syncQuick();
  }

  function close() {
    current = null;
    drawer.hidden = true;
    for (const b of buttons) b.classList.remove('active');
  }

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const key = b.dataset.plugin;
      if (current === key && !drawer.hidden) close();
      else open(key);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', close);
  const collapse = document.getElementById('drawer-collapse');
  if (collapse) collapse.addEventListener('click', close);

  // 顶部标题栏整条都能点（按钮除外），一点就收
  const head = document.getElementById('drawer-head');
  if (head) {
    head.addEventListener('click', (e) => {
      if (e.target.closest('.drawer-close')) return;
      close();
    });
  }

  // 点地图空白处也收起（导航面板除外：它要在图上依次点起点/终点）
  const canvas = document.querySelector('#cesium-root canvas');
  if (canvas) {
    canvas.addEventListener('click', () => {
      if (!drawer.hidden && current !== 'nav') close();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  // 老面板里的关闭按钮（nav-close / shuttle-close / schedule-close）也统一收抽屉
  for (const sel of ['#nav-close', '#shuttle-close', '#schedule-close']) {
    const el = document.querySelector(sel);
    if (el) el.addEventListener('click', close);
  }

  syncQuick();
  return { open, close, get current() { return current; } };
}
/* ---------------- 账号 ---------------- */
function initAccount() {
  const nameEl = document.getElementById('account-name');
  const nickEl = document.getElementById('account-nick');
  const emailEl = document.getElementById('account-email');
  const favEl = document.getElementById('account-fav');
  const foodEl = document.getElementById('account-food');
  const timeEl = document.getElementById('account-time');
  const avatarEl = document.getElementById('account-avatar');
  const logout = document.getElementById('account-logout');

  function refresh() {
    const user = loadSession();
    const name = (user && user.name) || '未登录';
    if (nameEl) nameEl.textContent = name;
    if (nickEl) nickEl.textContent = user ? (user.sid ? '21–30 班 · ' + user.sid : '注册用户') : '—';
    if (emailEl) emailEl.textContent = user && user.email ? user.email : '—';
    if (avatarEl) avatarEl.textContent = name.slice(0, 1);
    if (timeEl) {
      timeEl.textContent = user && user.at ? new Date(user.at).toLocaleString('zh-CN', { hour12: false }) : '—';
    }
    if (favEl) favEl.textContent = String((JSON.parse(localStorage.getItem('cqu-favs') || '[]') || []).length);
    if (foodEl) foodEl.textContent = String((JSON.parse(localStorage.getItem(FOOD_KEY) || '[]') || []).length);
  }

  if (logout) {
    logout.addEventListener('click', () => {
      const s = loadSession();
      clearSession();
      if (s && s.token) apiLogout(s.token);
      refresh();
      window.dispatchEvent(new Event('cqu-auth-changed'));
      // 兜底：即使事件监听还没挂上，也把页面锁回去
      document.body.classList.add('locked');
      const login = document.getElementById('login');
      if (login) login.hidden = false;
    });
  }

  refresh();
  return { refresh };
}

/* ---------------- 美食 ---------------- */
﻿async function initFood() {
  const listEl = document.getElementById('food-list');
  const filterEl = document.getElementById('food-filters');
  const campusEl = document.getElementById('food-campus');
  const countEl = document.getElementById('food-count');
  const searchEl = document.getElementById('food-search');
  const clearEl = document.getElementById('food-search-clear');
  const form = document.getElementById('food-form');
  const nickInput = document.getElementById('food-nick');
  const textInput = document.getElementById('food-text');
  const postsEl = document.getElementById('food-posts');
  if (!listEl) return;

  let canteens = [];
  let items = [];
  let reviews = [];
  let reviewsAt = '';
  try {
    const [curated, reviewData] = await Promise.all([
      fetch(dataUrl('food.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(dataUrl('food-reviews.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    canteens = curated.canteens || [];
    items = curated.items || [];
    reviews = reviewData.items || [];
    reviewsAt = reviewData.updatedAt || '';
  } catch (e) {
    canteens = [];
    items = [];
    reviews = [];
  }

  const CAMPUS = [
    ['all', '全部'],
    ['A', 'A 区'],
    ['B', 'B 区'],
    ['C', 'C 区'],
    ['OLD', '老校区'],
    ['虎溪', '虎溪'],
    ['OUT', '校外'],
  ];
  const TABS = [
    ['rec', '食堂推荐'],
    ['review', '同学评分'],
    ['top', '4.5 分以上'],
  ];

  let campus = 'all';
  let tab = 'rec';
  let query = '';
  let reviewLimit = 40;

  function stars(rating) {
    const r = Number(rating) || 0;
    const full = Math.round(r * 2) / 2;
    let out = '';
    for (let i = 1; i <= 5; i++) {
      out += full >= i ? '★' : full >= i - 0.5 ? '⯨' : '☆';
    }
    return '<span class="food-stars" title="' + r.toFixed(1) + ' 分">' + out + '<em>' + r.toFixed(1) + '</em></span>';
  }

  function campusLabel(c) {
    if (c === 'A') return 'A 区';
    if (c === 'B') return 'B 区';
    if (c === 'C') return 'C 区';
    if (c === '虎溪') return '虎溪';
    if (c === 'OUT') return '校外';
    return c || '';
  }

  // 榜单条目的校区是 "A/B/C"（老校区）或 "虎溪"
  function matchCampus(c, sel) {
    if (sel === 'all') return true;
    if (c === sel) return true;
    // 原表里没写具体校区的条目只在「全部」出现，避免归错区
    return false;
  }

  function hit(it, q) {
    if (!q) return true;
    const hay = [it.name, it.where, it.desc, it.type, it.reason, it.campus]
      .concat(it.dishes || [])
      .concat(it.tags || [])
      .concat(it.comments || [])
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  function chips(target, list, current, onPick) {
    if (!target) return;
    target.innerHTML = '';
    for (const [key, label] of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = key === current ? 'active' : '';
      b.addEventListener('click', () => onPick(key));
      target.appendChild(b);
    }
  }

  function canteenCard(it) {
    const el = document.createElement('div');
    el.className = 'food-card';
    el.innerHTML =
      '<div class="food-card-top"><b>' + esc(it.name) + '</b>' +
      '<span class="food-campus-tag">' + esc(campusLabel(it.campus)) + '</span>' +
      stars(it.rating) + '</div>' +
      '<p class="food-meta">' + esc(it.where || '') + (it.price ? ' · 人均 ¥' + esc(it.price) : '') + '</p>' +
      ((it.dishes || []).length
        ? '<div class="food-dishes">招牌：' + it.dishes.map((d) => '<span>' + esc(d) + '</span>').join('') + '</div>'
        : '') +
      '<p class="food-desc">' + esc(it.desc || '') + '</p>' +
      ((it.tags || []).length
        ? '<div class="food-tags">' + it.tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>'
        : '');
    return el;
  }

  function reviewCard(it) {
    const el = document.createElement('div');
    el.className = 'food-card food-review';
    const where = [campusLabel(it.campus), it.type].filter(Boolean).join(' · ');
    const tags = (it.tags || []).map((t) => '<span>' + esc(t) + '</span>').join('');
    el.innerHTML =
      '<div class="food-card-top"><b>' + esc(it.name) + '</b>' + stars(it.rating) + '</div>' +
      (where ? '<p class="food-meta">' + esc(where) + '</p>' : '') +
      '<div class="food-review-foot">' +
      '<span class="food-votes">' + (Number(it.votes) || 0) + ' 人评分</span>' +
      (tags ? '<div class="food-tags">' + tags + '</div>' : '') +
      '</div>';
    return el;
  }

  function reviewRank(q) {
    let list = reviews.filter((x) => matchCampus(x.campus, campus) && hit(x, q));
    if (tab === 'top') list = list.filter((x) => Number(x.rating) >= 4.5);
    list.sort((a, b) => Number(b.rating) - Number(a.rating) || Number(b.votes) - Number(a.votes));
    return list;
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    const q = query.trim().toLowerCase();
    let shown = 0;

    if (tab === 'review' || tab === 'top') {
      const list = reviewRank(q);
      shown = list.length;
      const slice = list.slice(0, reviewLimit);

      if (!list.length) {
        listEl.innerHTML = '<p class="sec-hint">没有匹配的评分，换个关键词或校区试试</p>';
      } else {
        const h = document.createElement('p');
        h.className = 'food-group';
        h.textContent = (tab === 'top' ? '4.5 分以上' : '同学评分') + '（' + list.length + '）';
        listEl.appendChild(h);
        for (const it of slice) listEl.appendChild(reviewCard(it));
        if (list.length > slice.length) {
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'food-more';
          more.textContent = '再看 ' + Math.min(40, list.length - slice.length) + ' 家';
          more.addEventListener('click', () => {
            reviewLimit += 40;
            renderList();
          });
          listEl.appendChild(more);
        }
      }
    } else {
      const cs = canteens.filter((x) => (campus === 'all' || x.campus === campus) && hit(x, q));
      const its = items.filter((x) => (campus === 'all' || x.campus === campus) && hit(x, q));
      shown = cs.length + its.length;
      if (!shown) listEl.innerHTML = '<p class="sec-hint">没有匹配的餐厅，换个关键词试试</p>';
      if (cs.length) {
        const h = document.createElement('p');
        h.className = 'food-group';
        h.textContent = '食堂 / 餐厅（' + cs.length + '）';
        listEl.appendChild(h);
        for (const it of cs) listEl.appendChild(canteenCard(it));
      }
      if (its.length) {
        const h = document.createElement('p');
        h.className = 'food-group';
        h.textContent = '档口 / 单品（' + its.length + '）';
        listEl.appendChild(h);
        for (const it of its) listEl.appendChild(canteenCard(it));
      }
    }

    if (countEl) {
      if (q) {
        countEl.textContent = '搜索「' + query.trim() + '」：' + shown + ' 条结果';
      } else if (tab === 'review' || tab === 'top') {
        const avg = reviews.length
          ? (reviews.reduce((s, x) => s + (Number(x.rating) || 0), 0) / reviews.length).toFixed(1)
          : '—';
        countEl.textContent =
          '共 ' + shown + ' 家 · 平均 ' + avg + ' 分' + (reviewsAt ? ' · 更新于 ' + reviewsAt : '');
      } else {
        countEl.textContent = '共 ' + shown + ' 条 · 口碑库 ' + reviews.length + ' 家';
      }
    }
  }


  function renderCampus() {
    chips(campusEl, CAMPUS, campus, (k) => {
      campus = k;
      reviewLimit = 40;
      renderCampus();
      renderList();
    });
  }
  function renderTabs() {
    chips(filterEl, TABS, tab, (k) => {
      tab = k;
      reviewLimit = 40;
      renderTabs();
      renderList();
    });
  }

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      query = searchEl.value || '';
      reviewLimit = 40;
      renderList();
    });
  }
  if (clearEl) {
    clearEl.addEventListener('click', () => {
      if (searchEl) searchEl.value = '';
      query = '';
      reviewLimit = 40;
      renderList();
      if (searchEl) searchEl.focus();
    });
  }

  function loadPosts() {
    try {
      return JSON.parse(localStorage.getItem(FOOD_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function renderPosts() {
    if (!postsEl) return;
    const posts = loadPosts();
    postsEl.innerHTML = posts.length ? '<p class="food-group">同学补充（本机保存）</p>' : '';
    for (const p of posts.slice().reverse().slice(0, 30)) {
      const el = document.createElement('div');
      el.className = 'food-post';
      const when = new Date(p.at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      el.innerHTML = '<b>' + esc(p.nick) + ' · ' + when + '</b>' + esc(p.text);
      postsEl.appendChild(el);
    }
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (textInput.value || '').trim();
      if (!text) return;
      const nick = (nickInput.value || '').trim() || '匿名同学';
      const posts = loadPosts();
      posts.push({ nick, text, at: Date.now() });
      localStorage.setItem(FOOD_KEY, JSON.stringify(posts.slice(-100)));
      localStorage.setItem('cqu-nick', nick);
      textInput.value = '';
      renderPosts();
      if (window.__accountRefresh) window.__accountRefresh();
    });
  }

  renderCampus();
  renderTabs();
  renderList();
  renderPosts();
  return { renderPosts };
}

/* ---------------- 给作者留言 ---------------- */
function initMessage() {
  const nickEl = document.getElementById('msg-nick');
  const textEl = document.getElementById('msg-text');
  const sendBtn = document.getElementById('msg-send');
  const copyBtn = document.getElementById('msg-copy');
  const stateEl = document.getElementById('msg-state');
  const historyEl = document.getElementById('msg-history');
  if (!sendBtn || !textEl) return;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(MSG_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function renderHistory() {
    if (!historyEl) return;
    const list = load();
    historyEl.innerHTML = list.length
      ? '<p class="sec-hint">你发过的留言（本机留一份）</p>'
      : '<p class="sec-hint">还没有留过言。</p>';
    for (const m of list.slice().reverse().slice(0, 10)) {
      const el = document.createElement('div');
      el.className = 'food-post';
      const when = new Date(m.at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      el.innerHTML = '<b>' + (m.nick || '匿名同学') + ' · ' + when + '</b>' + m.text;
      historyEl.appendChild(el);
    }
  }

  // 本机留一份，方便回看
  function remember(nick, body) {
    const list = load();
    list.push({ nick, text: body, at: Date.now() });
    try {
      localStorage.setItem(MSG_KEY, JSON.stringify(list.slice(-50)));
    } catch (e) {}
    renderHistory();
  }

  // 备用通道：调起邮件客户端
  function sendByMail(nick, body) {
    const subject = '【三维校园留言】' + nick;
    const full = body + '\n\n—— 来自三维校园 · ' + nick;
    if (stateEl) stateEl.textContent = '已打开邮件客户端（收件人 ' + AUTHOR_EMAIL + '），点发送即可。';
    window.location.href =
      'mailto:' + AUTHOR_EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(full);
  }

  // 默认用登录姓名署名；学生自己改过（哪怕清空）就不再自动填，清空即为匿名
  let nickTouched = false;
  function fillNick() {
    if (!nickEl || nickTouched || nickEl.value) return;
    const u = loadSession();
    if (u && u.name) nickEl.value = u.name;
  }
  if (nickEl) nickEl.addEventListener('input', () => { nickTouched = true; });
  fillNick();
  // 登录发生在面板初始化之后，所以每次点开留言面板再补一次署名
  const railMsg = document.querySelector('[data-plugin="message"]');
  if (railMsg) railMsg.addEventListener('click', fillNick);

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const body = (textEl.value || '').trim();
      if (!body) {
        if (stateEl) stateEl.textContent = '先写点内容再发吧。';
        textEl.focus();
        return;
      }
      const nickInput = (nickEl && nickEl.value.trim()) || '';
      const nick = nickInput || '匿名同学';

      // 后台没接通时，保持原来的邮件方式
      if (!isTelemetryOn()) {
        remember(nick, body);
        sendByMail(nick, body);
        return;
      }

      const old = sendBtn.textContent;
      sendBtn.disabled = true;
      sendBtn.textContent = '正在发送…';
      const r = await submitMessage(nickInput, body);
      sendBtn.disabled = false;
      sendBtn.textContent = old;

      if (r.ok) {
        remember(nick, body);
        textEl.value = '';
        if (stateEl) stateEl.textContent = '已经送到作者了，他会在后台看到，谢谢你。';
        return;
      }
      // 发送失败：兜底走邮件，别让留言丢掉
      if (stateEl) stateEl.textContent = '网络没发出去，帮你用邮件再发一次…';
      remember(nick, body);
      sendByMail(nick, body);
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(AUTHOR_EMAIL);
        if (stateEl) stateEl.textContent = '邮箱已复制：' + AUTHOR_EMAIL;
      } catch (e) {
        if (stateEl) stateEl.textContent = '复制失败，请手动复制：' + AUTHOR_EMAIL;
      }
    });
  }

  renderHistory();
}

/* ---------------- 更新 / 维护 / 打赏 ---------------- */
async function initNotice(drawer) {
  const section = document.getElementById('notice');
  if (!section) return;

  const $ = (id) => document.getElementById(id);
  const dot = $('notice-dot');
  const toast = $('update-toast');
  let data = null;
  try {
    data = await fetch(dataUrl('notice.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  } catch (e) {
    data = null;
  }
  if (!data) return;

  const version = String(data.version || '').trim();
  const status = data.status || {};

  const versionEl = $('notice-version');
  if (versionEl) versionEl.textContent = version ? 'v' + version : '最新版';
  if ($('notice-headline')) $('notice-headline').textContent = data.headline || '校园地图更新了';
  if ($('notice-released')) $('notice-released').textContent = data.releasedAt ? '发布于 ' + data.releasedAt : '';

  const statusEl = $('notice-status');
  if (statusEl) {
    const state = status.state === 'ok' ? 'ok' : status.state === 'maintenance' ? 'warn' : 'bad';
    statusEl.className = 'notice-pill ' + state;
    statusEl.textContent = status.label || (state === 'ok' ? '服务正常' : '维护中');
  }
  if ($('notice-checked')) {
    $('notice-checked').textContent = status.checkedAt ? '数据更新于 ' + status.checkedAt : '';
  }

  const maint = data.maintenance || {};
  const maintEl = $('notice-maintenance');
  if (maintEl && maint.state && maint.state !== 'ok') {
    maintEl.hidden = false;
    if ($('notice-maint-title')) $('notice-maint-title').textContent = maint.state === 'maintenance' ? '维护提醒' : '部分功能维护';
    if ($('notice-maint-text')) $('notice-maint-text').textContent = maint.message || '作者正在处理，稍后再来看看。';
  }

  const listEl = $('notice-list');
  if (listEl) {
    const items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
    listEl.innerHTML = items
      .map(
        (it) =>
          '<li><span class="notice-date">' +
          esc(it.date || '') +
          '</span><div><b>' +
          esc(it.title || '') +
          '</b><p>' +
          esc(it.text || '') +
          '</p></div></li>',
      )
      .join('');
  }

  if ($('notice-feedback') && data.feedback && data.feedback.note) {
    $('notice-feedback').textContent = data.feedback.note;
  }

  const donate = data.donation || {};
  const donateEl = $('notice-donate');
  if (donateEl) {
    const on = donate.enabled !== false && donate.qr;
    donateEl.hidden = !on;
    if (on) {
      const title = donateEl.querySelector('summary span');
      if (title && donate.title) title.textContent = donate.title;
      if ($('donate-text') && donate.text) $('donate-text').textContent = donate.text;
      if ($('donate-qr')) {
        $('donate-qr').src = new URL(donate.qr, document.baseURI).href;
        $('donate-qr').alt = donate.qrAlt || '微信赞赏码';
      }
    }
  }

  const mail = (data.feedback && data.feedback.email) || AUTHOR_EMAIL;
  if ($('notice-mail')) {
    $('notice-mail').addEventListener('click', async () => {
      const state = $('notice-mail-state');
      try {
        await navigator.clipboard.writeText(mail);
        if (state) state.textContent = '邮箱已复制：' + mail;
      } catch (e) {
        if (state) state.textContent = '复制失败，请手动复制：' + mail;
      }
    });
  }
  if ($('notice-msg')) {
    $('notice-msg').addEventListener('click', () => {
      if (drawer) drawer.open('message');
    });
  }

  /* 新版本提示：左侧「动态」小红点 + 一次性小气泡 */
  let seen = '';
  try {
    seen = localStorage.getItem(NOTICE_SEEN_KEY) || '';
  } catch (e) {}
  const isNew = !!version && version !== seen;

  function markSeen() {
    seen = version;
    try {
      localStorage.setItem(NOTICE_SEEN_KEY, version);
    } catch (e) {}
    if (dot) dot.hidden = true;
    if (toast) toast.hidden = true;
  }

  if (isNew) {
    if (dot) dot.hidden = false;
    if (toast) {
      if ($('update-toast-title')) $('update-toast-title').textContent = '地图更新到 ' + version;
      if ($('update-toast-sub')) $('update-toast-sub').textContent = data.headline || '看看这次改了什么';
      setTimeout(() => {
        toast.hidden = false;
      }, 1600);
      setTimeout(() => {
        if (toast && !toast.hidden) markSeen();
      }, 15000);
    }
  }

  if ($('update-toast-open')) {
    $('update-toast-open').addEventListener('click', () => {
      markSeen();
      if (drawer) drawer.open('notice');
    });
  }
  if ($('update-toast-close')) {
    $('update-toast-close').addEventListener('click', markSeen);
  }

  const railBtn = document.querySelector('[data-plugin="notice"]');
  if (railBtn) {
    railBtn.addEventListener('click', () => {
      if (version && version !== seen) markSeen();
    });
  }
}

/* ---------------- 巴士倒计时 ---------------- */
function initBusTicker() {
  const metaEl = document.getElementById('bus-next-meta');
  const barEl = document.getElementById('bus-next-bar-fill');
  if (!metaEl || !barEl) return;

  // ui.js 已经渲染了「下一班」，这里只做进度条与分钟级刷新
  const timer = setInterval(() => {
    const m = /(\d+)\s*分钟后/.exec(metaEl.textContent || '');
    if (!m) {
      barEl.style.width = '0%';
      return;
    }
    const min = Number(m[1]);
    const pct = Math.max(4, Math.min(100, 100 - (min / 45) * 100));
    barEl.style.width = pct.toFixed(0) + '%';
  }, 2000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
}

export function initPanels() {
  const drawer = initDrawer();
  const account = initAccount();
  window.__accountRefresh = account ? account.refresh : null;
  window.__drawer = drawer;
  initFood();
  initMessage();
  initNotice(drawer);
  initBusTicker();
  return drawer;
}
