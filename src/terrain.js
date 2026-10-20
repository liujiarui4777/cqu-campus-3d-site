/* 地形：预下载的 DEM（细网格 + 外围粗网格）→ Cesium 本地地形，不依赖在线服务 */

async function loadGrid(base, name) {
  const meta = await fetch(`${base}data/${name}.json`).then((r) => r.json());
  const buf = await fetch(`${base}data/${name}.bin`).then((r) => r.arrayBuffer());
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

export async function loadTerrain(base, Cesium) {
  const fine = await loadGrid(base, 'terrain');
  let coarse = null;
  try {
    coarse = await loadGrid(base, 'terrain_coarse');
  } catch (e) {
    console.warn('外围地形缺失，仅使用细网格', e);
  }

  const MLAT = 110540;
  const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
  const m = fine.meta;

  // 小范围内用精细网格，向外 400m 与粗网格渐变，避免接缝
  const sample = (lon, lat) => {
    if (!coarse) return fine.sample(lon, lat);
    const dx = Math.min(lon - m.west, m.east - lon) * mLon(lat);
    const dy = Math.min(lat - m.south, m.north - lat) * MLAT;
    const d = Math.min(dx, dy);
    if (d <= 0) return coarse.sample(lon, lat);
    if (d >= 400) return fine.sample(lon, lat);
    const t = d / 400;
    return coarse.sample(lon, lat) * (1 - t) + fine.sample(lon, lat) * t;
  };

  const tilingScheme = new Cesium.GeographicTilingScheme();
  const N = 65;
  const b = coarse ? coarse.meta : m;
  const clampLon = (v) => (v < b.west ? b.west : v > b.east ? b.east : v);
  const clampLat = (v) => (v < b.south ? b.south : v > b.north ? b.north : v);

  const provider = new Cesium.CustomHeightmapTerrainProvider({
    width: N,
    height: N,
    tilingScheme,
    callback: (x, y, level) => {
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
      return out;
    },
  });

  return { provider, meta: fine.meta, sample, inRange: fine.inRange };
}
