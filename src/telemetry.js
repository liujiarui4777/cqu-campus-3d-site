/* 上报模块：登录记录 + 给作者的留言
 *
 * 设计原则：
 *   1. 一定不能影响 3D 页面本身 —— 所有请求都 try/catch，失败静默；
 *   2. 不阻塞交互 —— 登录后 fire-and-forget，留言是用户主动点发送才等；
 *   3. 没有配置就什么都不做（见 supabase-config.js）。
 */

import { TELEMETRY } from './supabase-config.js';

function enabled() {
  return !!(TELEMETRY && TELEMETRY.url && TELEMETRY.anon);
}

function endpoint(table) {
  return TELEMETRY.url.replace(/\/+$/, '') + '/rest/v1/' + table;
}

function headers() {
  return {
    apikey: TELEMETRY.anon,
    authorization: 'Bearer ' + TELEMETRY.anon,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  };
}

export function isTelemetryOn() {
  return enabled();
}

/* ---------------- 设备 / 浏览器 ---------------- */

function deviceKind() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return '平板';
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return '手机';
  return '电脑';
}

function browserName() {
  const ua = navigator.userAgent || '';
  if (/MicroMessenger/i.test(ua)) return '微信';
  if (/QQ\//.test(ua)) return 'QQ';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return '其他';
}

/* ---------------- IP 归属地（省 / 市） ----------------
 * 只是大致位置：校园网经常统一从成都/重庆出口，不代表真实所在城市。
 * 3 秒拿不到就放弃，绝不影响登录。
 */
let geoCache = null;

function geoLookup() {
  if (geoCache) return Promise.resolve(geoCache);

  // 单个接口：返回 {region, city} 或 null
  const one = (url, ms) =>
    new Promise((resolve) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        ctrl.abort();
        resolve(null);
      }, ms);
      fetch(url, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => {
          clearTimeout(timer);
          const region = String((j && (j.region || j.region_name)) || '');
          const city = String((j && (j.city || j.city_name)) || '');
          resolve(region || city ? { region, city } : null);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });

  // ipinfo.io 带城市；ip.sb 作备用。两个并行，谁先给结果用谁，5.5 秒兜底。
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      geoCache = v || { region: '', city: '' };
      resolve(geoCache);
    };
    [one('https://ipinfo.io/json', 5000), one('https://api.ip.sb/geoip', 5000)].forEach((p) =>
      p.then((v) => {
        if (v) finish(v);
      }),
    );
    setTimeout(() => finish(null), 5500);
  });
}

/* ---------------- 对外接口 ---------------- */

/**
 * 登录成功后调用一次：记一条登录流水。
 * 不返回结果，也不抛错。
 */
export async function reportLogin(name) {
  if (!enabled() || !name) return;
  try {
    const g = await geoLookup();
    await fetch(endpoint('login_events'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        name: String(name).slice(0, 40),
        device: deviceKind(),
        ua: browserName(),
        region: g.region || null,
        city: g.city || null,
      }),
      keepalive: true,
    });
  } catch (e) {
    /* 静默：记录失败不能影响学生使用 */
  }
}

/**
 * 提交一条给作者的留言。
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function submitMessage(name, body) {
  if (!enabled()) return { ok: false, reason: 'off' };
  const text = String(body || '').trim().slice(0, 2000);
  if (!text) return { ok: false, reason: 'empty' };
  try {
    const r = await fetch(endpoint('messages'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: String(name || '').slice(0, 40) || null, body: text }),
    });
    return { ok: r.ok, reason: r.ok ? '' : 'http ' + r.status };
  } catch (e) {
    return { ok: false, reason: 'net' };
  }
}
