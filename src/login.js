/* 登录门禁：账号表来自 data/accounts.json（21-30 班学生信息，密码 = 学号）
 * 额外账号：余思琪 / 20080229。本标签页记住登录状态（sessionStorage）。
 * 登录成功后会把「姓名 + 时间 + 设备 + 大致地区」静默上报到作者后台（见 telemetry.js）。
 */

import { reportLogin } from './telemetry.js?v=20261103a';

const AUTH_KEY = 'cqu-auth-user';
const EXTRA = {
  余思琪: '20080229',
};

let accounts = null; // Map<姓名, 学号>
let loading = null;

function fetchAccounts() {
  if (accounts) return Promise.resolve(accounts);
  if (loading) return loading;
  loading = fetch(new URL('data/accounts.json', document.baseURI).href)
    .then((r) => {
      if (!r.ok) throw new Error('accounts http ' + r.status);
      return r.json();
    })
    .then((json) => {
      const map = new Map();
      for (const p of json.people || []) map.set(String(p.name).trim(), String(p.sid).trim());
      for (const [k, v] of Object.entries(EXTRA)) map.set(k, v);
      accounts = map;
      return map;
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function isAuthed() {
  try {
    return !!JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
  } catch (e) {
    return false;
  }
}

export function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

export function initLogin() {
  const overlay = document.getElementById('login');
  const form = document.getElementById('login-form');
  const nameInput = document.getElementById('login-name');
  const passInput = document.getElementById('login-pass');
  const err = document.getElementById('login-err');
  const btn = form ? form.querySelector('.login-btn') : null;
  if (!overlay || !form) return;

  function unlock() {
    overlay.hidden = true;
    document.body.classList.remove('locked');
  }

  if (isAuthed()) {
    unlock();
    return;
  }
  document.body.classList.add('locked');
  setTimeout(() => nameInput && nameInput.focus(), 300);
  fetchAccounts().catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn && btn.disabled) return;
    const name = (nameInput.value || '').trim();
    const pass = (passInput.value || '').trim();
    if (err) err.textContent = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在验证…';
    }
    try {
      const map = await fetchAccounts();
      const sid = map.get(name);
      if (sid && sid === pass) {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({ name, sid, at: Date.now() }));
        unlock();
        if (window.__accountRefresh) window.__accountRefresh();
        // 上报一条登录记录（异步、失败静默，不影响进入）
        reportLogin(name);
      } else {
        if (err) err.textContent = '姓名或学号不正确，无法进入';
        passInput.value = '';
        passInput.focus();
      }
    } catch (ex) {
      if (err) err.textContent = '账号数据加载失败，请刷新重试';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '进入校园';
      }
    }
  });
}
