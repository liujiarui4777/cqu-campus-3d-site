/* 地形：预下载的 DEM（A/B/C 区细网格）→ Cesium 本地地形
 *
 * 只加载 A/B/C 区细网格（约 0.9 MB，gzip）。base 可以是数组：
 * [CDN, 本站] 会并行请求、谁先回用谁，避免单一路径慢导致首屏卡住。
 */

async function raceFetch(urls) {
  if (typeof urls === 'string') return fetch(urls);
  return Promise.any(
    urls.map((u) =>
      fetch(u).then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r;
      }),
    ),
  );
}

async function fetchBin(base, name, dir = '') {
  const bases = Array.isArray(base) ? base : [base];
  let gz;
  try {
    gz = await raceFetch(bases.map((b) => `${b}data/${dir}${name}.bin.gz`));
  } catch (e) {
    gz = null;
  }
  if (gz && gz.ok && typeof DecompressionStream !== 'undefined') {
    const compressed = await gz.arrayBuffer();
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }
  const plain = await raceFetch(bases.map((b) => `${b}data/${dir}${name}.bin`));
  return plain.arrayBuffer();
}

async function loadGrid(base, name, dir = '') {
  const bases = Array.isArray(base) ? base : [base];
  const meta = await raceFetch(bases.map((b) => `${b}data/${dir}${name}.json`)).then((r) => r.json());
  const buf = await fetchBin(base, name, dir);
  const q = new Int16Array(buf);
  const W = meta.width;
  const H = meta.height;
  const k = meta.scale || 0.1;

  const at = (col, row) => {
    const c = col < 0 ? 0 : col >= W ? W - 1 : col;
    const r = row < 0 ? 0 : row >= H ? H - 1 : row;
    return q[r * W + c] * k;
  };

  const sample = (lon, lat) => {
    const fx = ((lon - meta.west) / (meta.east - meta.west)) * (W - 1);
    const fy = ((meta.north - lat) / (meta.north - meta.south)) * (H - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const h00 = at(x0, y0);
    const h10 = at(x0 + 1, y0);
    const h01 = at(x0, y0 + 1);
    const h11 = at(x0 + 1, y0 + 1);
    return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
  };

  const inRange = (lon, lat) =>
    lon >= meta.west && lon <= meta.east && lat >= meta.south && lat <= meta.north;

  return { meta, sample, inRange };
}

export async function loadTerrain(base, Cesium, dir = '') {
  const fine = await loadGrid(base, 'terrain', dir);
  const state = { fine, mid: null, coarse: null };

  const MLAT = 110540;
  const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

  // 预采样一张 1024² 高程图：之后每次取高程只做一次双线性查表，
  // 比每次走 fine.sample()（含边界判断）快一个数量级，地形瓦片生成会明显变快
  const HM = 640;
  const hm = new Float32Array(HM * HM);
  {
    const m = fine.meta;
    const dLon = (m.east - m.west) / (HM - 1);
    const dLat = (m.north - m.south) / (HM - 1);
    for (let r = 0; r < HM; r++) {
      const lat = m.north - dLat * r;
      for (let c = 0; c < HM; c++) {
        hm[r * HM + c] = fine.sample(m.west + dLon * c, lat);
      }
    }
  }
  const sampleFast = (lon, lat) => {
    const m = fine.meta;
    const fx = ((lon - m.west) / (m.east - m.west)) * (HM - 1);
    const fy = ((m.north - lat) / (m.north - m.south)) * (HM - 1);
    const x0 = fx <= 0 ? 0 : fx >= HM - 1 ? HM - 2 : Math.floor(fx);
    const y0 = fy <= 0 ? 0 : fy >= HM - 1 ? HM - 2 : Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const i = y0 * HM + x0;
    const a = hm[i] + (hm[i + 1] - hm[i]) * tx;
    const b = hm[i + HM] + (hm[i + HM + 1] - hm[i + HM]) * tx;
    return a + (b - a) * ty;
  };

  // 距网格边界的有符号距离（米）：正=内部，负=外部
  const edgeDist = (meta, lon, lat) => {
    const dx = Math.min(lon - meta.west, meta.east - lon) * mLon(lat);
    const dy = Math.min(lat - meta.south, meta.north - lat) * MLAT;
    return Math.min(dx, dy);
  };

  const lerp = (a, b, t) => a * (1 - t) + b * t;
  const blendDist = 400;

  const sample = (lon, lat) => {
    const { mid, coarse } = state;
    if (!mid && !coarse) return sampleFast(lon, lat);
    const dF = edgeDist(fine.meta, lon, lat);
    if (dF >= blendDist) return fine.sample(lon, lat);
    if (dF >= 0) {
      if (mid) return lerp(mid.sample(lon, lat), fine.sample(lon, lat), dF / blendDist);
      if (coarse) return lerp(coarse.sample(lon, lat), fine.sample(lon, lat), dF / blendDist);
      return fine.sample(lon, lat);
    }
    if (!mid) {
      return coarse ? coarse.sample(lon, lat) : fine.sample(lon, lat);
    }
    const dM = edgeDist(mid.meta, lon, lat);
    if (dM >= blendDist) return mid.sample(lon, lat);
    if (dM >= 0 && coarse) return lerp(coarse.sample(lon, lat), mid.sample(lon, lat), dM / blendDist);
    return coarse ? coarse.sample(lon, lat) : mid.sample(lon, lat);
  };

  const tilingScheme = new Cesium.GeographicTilingScheme();
  const N = 33; // 49→33：地形网格顶点少一半，生成更快，肉眼差别很小

  function makeProvider() {
    const tileCache = new Map();
    const b = state.coarse ? state.coarse.meta : state.mid ? state.mid.meta : fine.meta;
    const clampLon = (v) => (v < b.west ? b.west : v > b.east ? b.east : v);
    const clampLat = (v) => (v < b.south ? b.south : v > b.north ? b.north : v);

    return new Cesium.CustomHeightmapTerrainProvider({
      width: N,
      height: N,
      tilingScheme,
      callback: (x, y, level) => {
        const key = level + '/' + x + '/' + y;
        const hit = tileCache.get(key);
        if (hit) return hit;
        const rect = tilingScheme.tileXYToRectangle(x, y, level);
        const west = Cesium.Math.toDegrees(rect.west);
        const east = Cesium.Math.toDegrees(rect.east);
        const south = Cesium.Math.toDegrees(rect.south);
        const north = Cesium.Math.toDegrees(rect.north);
        const out = new Float32Array(N * N);
        const dLon = (east - west) / (N - 1);
        const dLat = (north - south) / (N - 1);
        for (let r = 0; r < N; r++) {
          const lat = north - dLat * r;
          for (let c = 0; c < N; c++) {
            const lon = west + dLon * c;
            // 覆盖范围外按边界值延展，避免断崖式孤岛
            out[r * N + c] = sample(clampLon(lon), clampLat(lat));
          }
        }
        if (tileCache.size > 4000) tileCache.clear();
        tileCache.set(key, out);
        return out;
      },
    });
  }

  const terrain = {
    provider: makeProvider(),
    meta: fine.meta,
    midMeta: fine.meta,
    coarseMeta: fine.meta,
    sample,
    inRange: fine.inRange,
    // 后台补全 10 km / 20 km 地形后重建 provider
    rebuild() {
      terrain.provider = makeProvider();
      return terrain.provider;
    },
    async loadExtended() {
      const [m, c] = await Promise.all([
        loadGrid(base, 'terrain_mid', dir).catch(() => null),
        loadGrid(base, 'terrain_coarse', dir).catch(() => null),
      ]);
      state.mid = m;
      state.coarse = c;
      terrain.midMeta = m ? m.meta : fine.meta;
      terrain.coarseMeta = c ? c.meta : m ? m.meta : fine.meta;
      return { midMeta: terrain.midMeta, coarseMeta: terrain.coarseMeta, hasCoarse: !!c };
    },
  };
  return terrain;
}

