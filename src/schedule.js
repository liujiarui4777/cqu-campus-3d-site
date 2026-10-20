/* 课表：解析文本、匹配建筑、在地图上标出今天的课 */

export const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DAY_MAP = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0 };

export function todayIndex() {
  return new Date().getDay();
}

export function parseSchedule(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  const re = /^(周[一二三四五六日天])\s+(\d{1,2}[:：]\d{2})\s*[-–—~]\s*(\d{1,2}[:：]\d{2})\s+(.+)$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(re);
    if (!m) continue;
    const rest = m[4].trim();
    // 最后一段若为空白分隔的短词，视为地点
    const parts = rest.split(/\s+/);
    let place = '';
    let name = rest;
    if (parts.length >= 2) {
      place = parts[parts.length - 1];
      name = parts.slice(0, -1).join(' ');
    }
    const dayKey = m[1] === '周天' ? '周日' : m[1];
    out.push({
      day: DAY_MAP[dayKey] ?? 1,
      dayName: dayKey,
      start: m[2].replace('：', ':'),
      end: m[3].replace('：', ':'),
      name,
      place,
    });
  }
  return out;
}

/** 用地点名模糊匹配建筑 */
export function matchBuilding(buildings, place) {
  if (!place) return null;
  const p = place.replace(/[（(].*?[)）]/g, '').trim();
  if (!p) return null;
  // 精确/包含匹配
  let hit = buildings.find((b) => b.name && b.name.includes(p));
  if (hit) return hit;
  hit = buildings.find((b) => b.name && p.includes(b.name));
  if (hit) return hit;
  // 关键字匹配（去掉"楼/馆/教室"）
  const key = p.replace(/[教学楼馆室区]$/, '');
  if (key && key.length >= 2) {
    hit = buildings.find((b) => b.name && b.name.includes(key));
  }
  return hit || null;
}

export function save(rows) {
  try {
    localStorage.setItem('cqu3d.schedule', JSON.stringify(rows));
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

export function load() {
  try {
    return JSON.parse(localStorage.getItem('cqu3d.schedule') || '[]');
  } catch (e) {
    return [];
  }
}
