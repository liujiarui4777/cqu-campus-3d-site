/* 鉴权客户端：登录 / 注册 / 会话校验 / 退出
 *
 * 和旧版 login.js 的区别：
 *   · 旧版把 data/accounts.json 下载到浏览器里比对，只能挡路人；
 *   · 新版把密码交给 Supabase 的 Postgres 函数（bcrypt 校验），浏览器只拿到
 *     一个 30 天有效的随机会话 token，账号表不再下发。
 *
 * 并发/卡顿上的处理：
 *   · 同一请求只发一次（inflight 去重），避免连点造成重复 bcrypt；
 *   · 8 秒超时，失败不自动重试，不在服务端繁忙时放大流量；
 *   · 会话校验结果缓存 10 分钟，正常使用不会每次开页面都打数据库；
 *   · 退出用 keepalive 发一次，发不出去也不阻塞界面。
 */

import { TELEMETRY } from './supabase-config.js';

const STORE_KEY = 'cqu-auth-v2';
const LEGACY_KEY = 'cqu-auth-user';
const TIMEOUT = 8000;
const CHECK_TTL = 10 * 60 * 1000; // 10 分钟内在本地认为会话有效

const BASE = TELEMETRY && TELEMETRY.url ? String(TELEMETRY.url).replace(/\/+$/, '') : '';
const ANON = TELEMETRY && TELEMETRY.anon ? String(TELEMETRY.anon) : '';
const RPC = BASE ? BASE + '/rest/v1/rpc/' : '';

export const AUTH_STORE_KEY = STORE_KEY;

const inflight = new Map();

export function authConfigured() {
  return !!(RPC && ANON);
}

function headers() {
  return {
    apikey: ANON,
    authorization: 'Bearer ' + ANON,
    'content-type': 'application/json',
  };
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/* 统一 RPC：成功返回服务端的 JSON，失败返回 {ok:false, code, msg, retry?} */
async function call(fn, body) {
  if (!authConfigured()) {
    return { ok: false, code: 'NOT_CONFIGURED', msg: '登录服务还没配置好' };
  }

  const key = fn + '|' + JSON.stringify(body || {});
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const r = await fetch(RPC + fn, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body || {}),
        signal: timeoutSignal(TIMEOUT),
        cache: 'no-store',
      });
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = null;
      }
      if (r.ok && json && typeof json === 'object') return json;
      if (r.status === 429) {
        return { ok: false, code: 'RATE_LIMITED', msg: '请求太频繁，请稍后再试' };
      }
      if (r.status === 404) {
        return { ok: false, code: 'SERVER', msg: '登录服务还没配置好（函数不存在）' };
      }
      if (r.status === 401 || r.status === 403) {
        return { ok: false, code: 'SERVER', msg: '登录服务权限异常，请联系作者' };
      }
      return { ok: false, code: 'SERVER', msg: '登录服务暂时不可用（HTTP ' + r.status + '）' };
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return { ok: false, code: 'TIMEOUT', msg: '网络有点慢，请再试一次' };
      }
      return { ok: false, code: 'NETWORK', msg: '网络不太稳定，请检查网络后重试' };
    }
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/* ---------------- 本地会话 ---------------- */

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s || !s.token) return null;
    if (s.exp && Number(s.exp) < Date.now() + 60 * 1000) {
      clearSession();
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

export function saveSession(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch (e) {
    /* 隐私模式下写不进去也不影响本次使用 */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (e) {}
  try {
    sessionStorage.removeItem(LEGACY_KEY);
  } catch (e) {}
}

/* ---------------- 对外接口 ---------------- */

export function login(name, pass) {
  return call('app_login', { p_name: name, p_pass: pass });
}

export function register(name, pass) {
  return call('app_register', { p_name: name, p_pass: pass });
}

/**
 * 校验会话。
 * @returns {Promise<{state:'ok'|'invalid'|'unknown', user?:object}>}
 *   unknown = 网络/服务端暂时不可用，前端应保持当前登录状态，不要误踢人。
 */
export async function checkSession(token) {
  if (!token) return { state: 'invalid' };
  const r = await call('app_session', { p_token: token });
  if (r && r.ok) return { state: 'ok', user: r };
  if (r && (r.code === 'NETWORK' || r.code === 'TIMEOUT' || r.code === 'SERVER' || r.code === 'RATE_LIMITED')) {
    return { state: 'unknown' };
  }
  return { state: 'invalid' };
}

/** 距离上次校验是否已经超过 10 分钟 */
export function needsCheck(session) {
  if (!session) return false;
  const at = Number(session.validatedAt || 0);
  return !at || Date.now() - at > CHECK_TTL;
}

export function markChecked(session, user) {
  const next = {
    ...session,
    ...(user || {}),
    token: session.token,
    validatedAt: Date.now(),
  };
  saveSession(next);
  return next;
}

/** 退出：先清本地，再尽力通知服务端；不等待、不阻塞 */
export function logout(token) {
  clearSession();
  if (!token || !authConfigured()) return;
  try {
    fetch(RPC + 'app_logout', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_token: token }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}
