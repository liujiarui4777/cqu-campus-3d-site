/* 登录门禁 UI
 *
 * 两种身份：
 *   · 21–30 班（kind=student）：姓名 + 本人学号，直接用原账号登录，不需要注册；
 *   · 其他同学（kind=self）：第一次进来点「注册」，设姓名 + 密码，之后长期可用。
 *
 * 性能上的取舍：
 *   · 已登录用户先放行、再在后台校验，打开页面不会被一次网络请求卡住；
 *   · 校验结果缓存 10 分钟，正常浏览不会反复请求；
 *   · 请求失败只提示，不自动重试（避免服务器繁忙时越帮越忙）。
 */

import {
  AUTH_STORE_KEY,
  authConfigured,
  checkSession,
  clearSession,
  login as apiLogin,
  loadSession,
  markChecked,
  needsCheck,
  publicConfig,
  register as apiRegister,
  registerWithEmail,
  requestEmailCode,
  saveSession,
} from './auth.js?v=20261106a';
import { reportLogin } from './telemetry.js?v=20261103a';

const MAX_NAME = 20;
const MIN_PASS = 6;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

let els = null;
let mode = 'login';
let busy = false;
let emailMode = false; // 服务端是否开启邮箱验证
let emailReady = false; // 发信服务是否配置好
let sendTimer = null;

// 本地调试用：localhost 上执行 localStorage.setItem('cqu-email-demo','1') 后刷新，
// 可以提前看到邮箱验证的界面；线上域名不生效。
const DEMO =
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
  (() => {
    try {
      return localStorage.getItem('cqu-email-demo') === '1';
    } catch (e) {
      return false;
    }
  })();

function $(id) {
  return document.getElementById(id);
}

function friendly(r) {
  const code = r && r.code;
  if (code === 'RATE_LIMITED') {
    const sec = Number(r.retry || 0);
    const wait = sec > 0 ? '（约 ' + Math.max(1, Math.ceil(sec / 60)) + ' 分钟）' : '';
    return (r.msg || '尝试太频繁') + wait;
  }
  if (code === 'BAD_CREDENTIALS') return '姓名或密码不正确';
  if (code === 'NETWORK') return '网络不太稳定，请检查网络后重试';
  if (code === 'TIMEOUT') return '网络有点慢，请再试一次';
  if (code === 'NOT_CONFIGURED') return '登录服务还没配置好，请联系作者';
  if (code === 'REG_CLOSED') return r.msg || '注册暂时关闭，请联系作者';
  if (code === 'NAME_TAKEN') return r.msg || '这个姓名已经有人用了，重名的同学请加班级后缀';
  if (code === 'EMAIL_TAKEN') return '这个邮箱已经绑定过别的账号了';
  if (code === 'EMAIL_INVALID') return '邮箱格式不太对，检查一下';
  if (code === 'EMAIL_OFF') return '邮箱验证暂时没开启，可以直接用姓名 + 密码注册';
  if (code === 'EMAIL_NOT_READY') return '邮箱验证还没配置好，请先用姓名 + 密码注册，或联系作者';
  if (code === 'CODE_INVALID') return '验证码不对，再检查一下';
  if (code === 'CODE_EXPIRED') return '验证码过期了，重新获取一个';
  if (code === 'CODE_TOO_MANY') return '验证码错误次数太多，重新获取一个';
  if (code === 'IS_STUDENT') return '21–30 班同学直接用学号登录，不用注册';
  if (code === 'PASS_MISMATCH') return '两次输入的密码不一致';
  if (code === 'SERVER') return r.msg || '登录服务暂时不可用，请稍后再试';
  return r.msg || '暂时无法登录，请稍后再试';
}

function setErr(text) {
  if (els && els.err) els.err.textContent = text || '';
}

function setMode(next) {
  mode = next === 'register' ? 'register' : 'login';
  if (!els) return;

  for (const tab of els.tabs) {
    const on = tab.dataset.mode === mode;
    tab.classList.toggle('is-on', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  }

  els.pass2Field.hidden = mode !== 'register';
  els.pass2.required = mode === 'register';
  els.pass.placeholder = mode === 'register' ? '至少 6 位' : '21–30 班填学号，其他同学填密码';
  els.pass.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  els.pass2.value = mode === 'register' ? els.pass2.value : '';
  els.sub.textContent =
    mode === 'register'
      ? '第一次来？设置姓名和密码，下次直接登录'
      : '21–30 班：姓名 + 学号 · 其他同学：先点「注册」';
  els.btn.textContent = mode === 'register' ? '注册并进入' : '进入校园';
  syncEmailFields();
  setErr('');
}

/* 邮箱验证：只在「注册」且服务端开启时出现 */
function syncEmailFields() {
  if (!els || !els.emailField) return;
  const on = mode === 'register' && emailMode;
  els.emailField.hidden = !on;
  els.codeField.hidden = !on;
  if (els.email) els.email.required = on;
  if (els.code) els.code.required = on;

  if (on) {
    els.sub.textContent = emailReady
      ? '第一次来？填姓名、邮箱和密码，验证码会发到邮箱'
      : '第一次来？设置姓名和密码，下次直接登录';
    if (els.emailHint) {
      els.emailHint.textContent = emailReady ? '用于接收验证码，只用来确认是你本人' : '邮箱验证暂未开通，可以先不填';
    }
  } else {
    els.code.value = '';
    if (sendTimer) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
    if (els.send) {
      els.send.disabled = false;
      els.send.textContent = '获取验证码';
    }
  }
}

function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  emailMode = !!cfg.email_verify || DEMO;
  emailReady = !!cfg.email_ready;
  syncEmailFields();
}

function startCountdown(sec) {
  if (!els || !els.send) return;
  if (sendTimer) clearInterval(sendTimer);
  let left = Math.max(1, Math.floor(Number(sec) || 60));
  els.send.disabled = true;
  els.send.textContent = left + 's 后重发';
  sendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(sendTimer);
      sendTimer = null;
      els.send.disabled = false;
      els.send.textContent = '重新获取';
      return;
    }
    els.send.textContent = left + 's 后重发';
  }, 1000);
}

async function onSendCode() {
  if (!els || !els.send || busy) return;
  const name = (els.name.value || '').trim().replace(/\s+/g, ' ');
  const email = (els.email.value || '').trim();
  setErr('');

  if (name.length < 2 || name.length > MAX_NAME) {
    setErr('先填姓名，再获取验证码');
    els.name.focus();
    return;
  }
  if (!EMAIL_RE.test(email)) {
    setErr('邮箱格式不太对，检查一下');
    els.email.focus();
    return;
  }

  els.send.disabled = true;
  els.send.textContent = '发送中…';
  try {
    const r = await requestEmailCode(name, email);
    if (r && r.ok) {
      if (r.demoCode) {
        els.code.value = String(r.demoCode);
        setErr('本地演示模式：验证码已自动填入');
      } else {
        setErr('验证码已发送，去邮箱看看（垃圾箱也翻一下）');
      }
      startCountdown(Number(r.retry) || 60);
    } else {
      els.send.disabled = false;
      els.send.textContent = '重新获取';
      setErr(friendly(r || {}));
    }
  } catch (e) {
    els.send.disabled = false;
    els.send.textContent = '重新获取';
    setErr('发送失败，请稍后再试');
  }
}

function unlock() {
  if (!els) return;
  els.overlay.hidden = true;
  document.body.classList.remove('locked');
}

function lock(message) {
  if (!els) return;
  els.overlay.hidden = false;
  document.body.classList.add('locked');
  setErr(message || '');
  // 手机上别自动弹键盘，否则登录卡片会被挡住一半
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) return;
  setTimeout(() => {
    if (els && !els.overlay.hidden && els.name) els.name.focus();
  }, 60);
}

function setBusy(on, label) {
  busy = on;
  if (!els) return;
  els.btn.disabled = on;
  els.name.disabled = on;
  els.pass.disabled = on;
  els.pass2.disabled = on;
  if (els.email) els.email.disabled = on;
  if (els.code) els.code.disabled = on;
  if (els.send) els.send.disabled = on || !!sendTimer;
  els.btn.textContent = on ? label : mode === 'register' ? '注册并进入' : '进入校园';
}

/* 登录成功后统一落盘 + 刷新界面 */
function accept(result) {
  const session = {
    name: result.name,
    kind: result.kind || 'self',
    sid: result.sid || null,
    email: result.email || null,
    token: result.token,
    exp: Number(result.exp) || 0,
    at: Date.now(),
    validatedAt: Date.now(),
  };
  saveSession(session);
  els.pass.value = '';
  els.pass2.value = '';
  if (els.code) els.code.value = '';
  unlock();
  reportLogin(session.name);
  if (window.__accountRefresh) window.__accountRefresh();
  window.dispatchEvent(new Event('cqu-auth-changed'));
}

async function onSubmit(e) {
  e.preventDefault();
  if (busy) return;

  const name = (els.name.value || '').trim().replace(/\s+/g, ' ');
  const pass = els.pass.value || '';
  const pass2 = els.pass2.value || '';
  const email = (els.email ? els.email.value || '' : '').trim();
  const code = (els.code ? els.code.value || '' : '').trim();

  setErr('');
  if (name.length < 2 || name.length > MAX_NAME) {
    setErr('姓名请填 2–20 个字');
    els.name.focus();
    return;
  }
  if (mode === 'register') {
    if (pass.length < MIN_PASS) {
      setErr('密码至少 ' + MIN_PASS + ' 位');
      els.pass.focus();
      return;
    }
    if (pass !== pass2) {
      setErr('两次输入的密码不一致');
      els.pass2.focus();
      return;
    }
    if (emailMode && emailReady) {
      if (!EMAIL_RE.test(email)) {
        setErr('邮箱格式不太对，检查一下');
        els.email.focus();
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setErr('请输入 6 位邮箱验证码');
        els.code.focus();
        return;
      }
    }
  } else if (!pass) {
    setErr('请输入密码');
    els.pass.focus();
    return;
  }

  if (!authConfigured()) {
    setErr('登录服务还没配置好，请联系作者');
    return;
  }

  setBusy(true, mode === 'register' ? '正在注册…' : '正在验证…');
  try {
    const r =
      mode === 'register' && emailMode && emailReady
        ? await registerWithEmail(name, pass, email, code)
        : mode === 'register'
          ? await apiRegister(name, pass)
          : await apiLogin(name, pass);
    if (r && r.ok) {
      accept(r);
      return;
    }
    setErr(friendly(r || {}));
    if (r && r.code === 'BAD_CREDENTIALS') {
      els.pass.value = '';
      els.pass.focus();
    }
    if (r && (r.code === 'CODE_INVALID' || r.code === 'CODE_EXPIRED' || r.code === 'CODE_TOO_MANY')) {
      els.code.value = '';
      els.code.focus();
    }
  } catch (ex) {
    setErr('登录服务暂时不可用，请稍后再试');
  } finally {
    setBusy(false);
  }
}

/* 后台校验已保存的会话：有效就续期，明确失效才踢回登录页 */
function scheduleCheck(session) {
  if (!session || !needsCheck(session)) return;
  const run = async () => {
    const r = await checkSession(session.token);
    if (r.state === 'ok') {
      markChecked(session, r.user);
      if (window.__accountRefresh) window.__accountRefresh();
    } else if (r.state === 'invalid') {
      clearSession();
      setMode('login');
      lock('登录已失效，请重新登录');
      if (window.__accountRefresh) window.__accountRefresh();
    }
    // unknown：网络/服务端暂时不可用，保持登录，不误踢
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}

export function isAuthed() {
  return !!loadSession();
}

export function currentUser() {
  return loadSession();
}

export function initLogin() {
  const overlay = $('login');
  const form = $('login-form');
  if (!overlay || !form) return;

  els = {
    overlay,
    form,
    name: $('login-name'),
    pass: $('login-pass'),
    pass2: $('login-pass2'),
    pass2Field: $('login-pass2-field'),
    emailField: $('login-email-field'),
    email: $('login-email'),
    emailHint: $('login-email-hint'),
    codeField: $('login-code-field'),
    code: $('login-code'),
    send: $('login-send-code'),
    err: $('login-err'),
    btn: $('login-btn') || form.querySelector('.login-btn'),
    sub: $('login-sub'),
    tabs: Array.from(form.querySelectorAll('.login-tab')),
  };
  if (!els.name || !els.pass || !els.btn) return;

  // 旧版是 sessionStorage + 明文账号表，升级后强制重登一次
  try {
    sessionStorage.removeItem('cqu-auth-user');
  } catch (e) {}

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (busy) return;
      setMode(tab.dataset.mode);
      els.name.focus();
    });
  });

  form.addEventListener('submit', onSubmit);

  if (els.send) els.send.addEventListener('click', onSendCode);

  // 问一下服务端有没有开启邮箱验证；失败就按「没开启」处理，不影响正常注册
  publicConfig().then(applyConfig).catch(() => {});

  const saved = loadSession();
  if (saved) {
    unlock();
    scheduleCheck(saved);
  } else {
    setMode('login');
    lock('');
  }

  // 账号面板退出 / 其他标签页登录状态变化
  window.addEventListener('cqu-auth-changed', () => {
    const s = loadSession();
    if (s) {
      unlock();
      scheduleCheck(s);
    } else {
      setMode('login');
      lock('');
      if (window.__accountRefresh) window.__accountRefresh();
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key !== AUTH_STORE_KEY) return;
    const s = loadSession();
    if (s) {
      unlock();
      if (window.__accountRefresh) window.__accountRefresh();
    } else {
      setMode('login');
      lock('已退出登录');
      if (window.__accountRefresh) window.__accountRefresh();
    }
  });
}
