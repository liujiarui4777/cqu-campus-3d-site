/* 插件面板：左侧功能栏 + 右侧抽屉，每个按钮对应一个面板（导航 / 巴士 / 美食 / 课表 / 账号） */

const TITLES = {
  nav: '步行导航',
  bus: '校园巴士',
  food: '校园美食',
  schedule: '我的课表',
  message: '给作者留言',
  account: '账号',
};

const FOOD_CATS = [
  ['all', '全部'],
  ['canteen', '食堂'],
  ['snack', '小吃'],
  ['drink', '饮品'],
  ['night', '夜宵'],
  ['red', '红榜'],
  ['black', '黑榜'],
];

const FOOD_KEY = 'cqu-food-posts';
const MSG_KEY = 'cqu-messages';
const AUTHOR_EMAIL = 'liujiarui_33@qq.com';
const AUTH_KEY = 'cqu-auth-user';

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

  function open(key) {
    if (!secs.has(key)) return;
    current = key;
    for (const [k, el] of secs) el.hidden = k !== key;
    if (title) title.textContent = TITLES[key] || '面板';
    drawer.hidden = false;
    for (const b of buttons) b.classList.toggle('active', b.dataset.plugin === key);
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

  return { open, close, get current() { return current; } };
}

/* ---------------- 账号 ---------------- */
function initAccount() {
  const nameEl = document.getElementById('account-name');
  const nickEl = document.getElementById('account-nick');
  const favEl = document.getElementById('account-fav');
  const foodEl = document.getElementById('account-food');
  const timeEl = document.getElementById('account-time');
  const avatarEl = document.getElementById('account-avatar');
  const logout = document.getElementById('account-logout');

  function refresh() {
    let user = null;
    try {
      user = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
    } catch (e) {
      user = null;
    }
    const name = (user && user.name) || '未登录';
    if (nameEl) nameEl.textContent = name;
    if (nickEl) nickEl.textContent = (user && user.sid) || '—';
    if (avatarEl) avatarEl.textContent = name.slice(0, 1);
    if (timeEl) {
      timeEl.textContent = user && user.at ? new Date(user.at).toLocaleString('zh-CN', { hour12: false }) : '—';
    }
    if (favEl) favEl.textContent = String((JSON.parse(localStorage.getItem('cqu-favs') || '[]') || []).length);
    if (foodEl) foodEl.textContent = String((JSON.parse(localStorage.getItem(FOOD_KEY) || '[]') || []).length);
  }

  if (logout) {
    logout.addEventListener('click', () => {
      sessionStorage.removeItem(AUTH_KEY);
      document.body.classList.add('locked');
      const login = document.getElementById('login');
      if (login) login.hidden = false;
      const nameInput = document.getElementById('login-name');
      if (nameInput) nameInput.focus();
    });
  }

  refresh();
  return { refresh };
}

/* ---------------- 美食 ---------------- */
async function initFood(base) {
  const listEl = document.getElementById('food-list');
  const filterEl = document.getElementById('food-filters');
  const form = document.getElementById('food-form');
  const nickInput = document.getElementById('food-nick');
  const textInput = document.getElementById('food-text');
  const postsEl = document.getElementById('food-posts');
  if (!listEl) return;

  let items = [];
  let rankItems = [];
  try {
    const load = (f) =>
      fetch(new URL('data/' + f, document.baseURI).href)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    const [curated, rank] = await Promise.all([load('food.json'), load('food-rank.json')]);
    items = curated.items || [];
    // 红黑榜来自《重大饭协红黑榜.xlsx》，rank: red / black
    rankItems = (rank.items || []).map((x) => ({ ...x, cat: x.rank === 'red' ? 'red' : 'black' }));
  } catch (e) {
    items = [];
    rankItems = [];
  }

  let cat = 'all';

  function renderFilters() {
    if (!filterEl) return;
    filterEl.innerHTML = '';
    for (const [key, label] of FOOD_CATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = key === cat ? 'active' : '';
      b.addEventListener('click', () => {
        cat = key;
        renderFilters();
        renderList();
      });
      filterEl.appendChild(b);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function rankCard(it) {
    const el = document.createElement('div');
    el.className = 'food-item food-rank ' + (it.rank === 'red' ? 'is-red' : 'is-black');
    const badge = it.rank === 'red' ? '红榜' : '黑榜';
    const where = [it.campus, it.type].filter(Boolean).join(' · ');
    const comments = (it.comments || [])
      .map((c) => '<span class="food-quote">“' + esc(c) + '”</span>')
      .join('');
    el.innerHTML =
      '<div class="food-rank-badge">' + badge + '</div>' +
      '<div class="food-main"><b>' + esc(it.name) + '</b>' +
      (where ? '<p>' + esc(where) + '</p>' : '') +
      (it.reason ? '<p>' + esc(it.reason) + '</p>' : '') +
      (comments ? '<div class="food-quotes">' + comments + '</div>' : '') +
      '</div>';
    return el;
  }

  function renderList() {
    listEl.innerHTML = '';
    if (cat === 'red' || cat === 'black') {
      const list = rankItems.filter((x) => x.cat === cat);
      if (!list.length) {
        listEl.innerHTML = '<p class="sec-hint">这个榜单还没有条目</p>';
        return;
      }
      for (const it of list) listEl.appendChild(rankCard(it));
      return;
    }
    const curated = items.filter((x) => cat === 'all' || x.cat === cat);
    if (!curated.length && cat !== 'all') {
      listEl.innerHTML = '<p class="sec-hint">这个分类还没有条目</p>';
      return;
    }
    for (const it of curated) {
      const el = document.createElement('div');
      el.className = 'food-item';
      el.innerHTML =
        '<div class="food-emoji">' + (it.emoji || '🍜') + '</div>' +
        '<div class="food-main"><b>' + esc(it.name) + '</b>' +
        '<p>' + esc(it.where) + (it.price ? ' · 人均 ' + esc(it.price) : '') + '</p>' +
        '<p>' + esc(it.desc) + '</p>' +
        '<div class="food-tags">' + (it.tags || []).map((t) => '<span>' + esc(t) + '</span>').join('') + '</div></div>';
      listEl.appendChild(el);
    }
    // 「全部」里把红黑榜也带上，方便一眼看到
    if (cat === 'all' && rankItems.length) {
      const h = document.createElement('p');
      h.className = 'sec-hint';
      h.style.margin = '12px 0 6px';
      h.textContent = '饭协红黑榜（' + rankItems.length + ' 条，同学共创）';
      listEl.appendChild(h);
      const preview = rankItems.slice(0, 20);
      for (const it of preview) listEl.appendChild(rankCard(it));
      if (rankItems.length > preview.length) {
        const more = document.createElement('p');
        more.className = 'sec-hint';
        more.textContent = '还有 ' + (rankItems.length - preview.length) + ' 条，点上面的「红榜 / 黑榜」查看全部';
        listEl.appendChild(more);
      }
    }
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
    postsEl.innerHTML = posts.length ? '' : '<p class="sec-hint">还没有人发帖，来推荐一家吧。</p>';
    for (const p of posts.slice().reverse().slice(0, 20)) {
      const el = document.createElement('div');
      el.className = 'food-post';
      const when = new Date(p.at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      el.innerHTML = '<b>' + (p.nick || '匿名同学') + ' · ' + when + '</b>' + p.text;
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

  renderFilters();
  renderList();
  renderPosts();
  return { renderPosts };
}

/* ---------------- 巴士倒计时 ---------------- */
function initBusTicker() {
  const timeEl = document.getElementById('bus-next-time');
  const metaEl = document.getElementById('bus-next-meta');
  const barEl = document.getElementById('bus-next-bar-fill');
  if (!timeEl) return;

  // ui.js 已经渲染了「下一班」，这里只做进度条与分钟级刷新
  const timer = setInterval(() => {
    if (!metaEl || !barEl) return;
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
      ? '<p class="sec-hint">本机留存的留言</p>'
      : '<p class="sec-hint">还没有留过言。</p>';
    for (const m of list.slice().reverse().slice(0, 10)) {
      const el = document.createElement('div');
      el.className = 'food-post';
      const when = new Date(m.at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      el.innerHTML = '<b>' + (m.nick || '匿名同学') + ' · ' + when + '</b>' + m.text;
      historyEl.appendChild(el);
    }
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const body = (textEl.value || '').trim();
      if (!body) {
        if (stateEl) stateEl.textContent = '先写点内容再发吧。';
        textEl.focus();
        return;
      }
      const nick = (nickEl && nickEl.value.trim()) || '匿名同学';
      const subject = '【三维校园留言】' + nick;
      const full = body + '\n\n—— 来自三维校园 · ' + nick;
      // 本地留一份，方便回看
      const list = load();
      list.push({ nick, text: body, at: Date.now() });
      localStorage.setItem(MSG_KEY, JSON.stringify(list.slice(-50)));
      renderHistory();
      if (stateEl) stateEl.textContent = '已打开邮件客户端（收件人 ' + AUTHOR_EMAIL + '），点发送即可。';
      window.location.href =
        'mailto:' + AUTHOR_EMAIL +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(full);
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

export function initPanels() {
  const drawer = initDrawer();
  const account = initAccount();
  window.__accountRefresh = account ? account.refresh : null;
  initFood();
  initMessage();
  initBusTicker();
  return drawer;
}
