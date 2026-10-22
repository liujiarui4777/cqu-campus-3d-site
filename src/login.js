/* 登录门禁：仅「刘家瑞 / 200803」可进入；本标签页记住登录状态（sessionStorage） */

const NAME = '刘家瑞';
const PASS = '200803';
export const AUTH_KEY = 'cqu-auth-user';

export function isAuthed() {
  try {
    return !!JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
  } catch (e) {
    return false;
  }
}

export function initLogin() {
  const overlay = document.getElementById('login');
  const form = document.getElementById('login-form');
  const nameInput = document.getElementById('login-name');
  const passInput = document.getElementById('login-pass');
  const err = document.getElementById('login-err');
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (nameInput.value || '').trim();
    const pass = (passInput.value || '').trim();
    if (name === NAME && pass === PASS) {
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({ name, at: Date.now() }));
      if (err) err.textContent = '';
      unlock();
      if (window.__accountRefresh) window.__accountRefresh();
    } else {
      if (err) err.textContent = '姓名或密码不正确，无法进入';
      passInput.value = '';
      passInput.focus();
    }
  });
}
