/* 自定义单张底图 ImageryProvider：按瓦片从一张大图裁剪，保证经纬度严格对齐。
 * Cesium 自带的 SingleTileImageryProvider 在该场景下会把图拉伸错位，故自己实现。
 *
 * 线上底图走 jsDelivr CDN；CDN 在国内会抖，加载失败或超时就回退到本站（GitHub Pages）。
 */
function loadImage(url, timeout) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    // 跨域图必须带 CORS 声明，否则 canvas 被污染，WebGL 上传纹理会抛 SecurityError
    i.crossOrigin = 'anonymous';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('image timeout ' + url));
    }, timeout);
    i.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(i);
    };
    i.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error('image error ' + url));
    };
    i.src = url;
  });
}

export async function createBasemapProvider(base, Cesium, meta, file = 'basemap.jpg', version = '', fallbackBase = '') {
  // 大图必须带版本号，否则浏览器会一直用缓存里的旧影像（改了图也看不到）
  const q = version ? (file.includes('?') ? '&' : '?') + 'v=' + version : '';
  const primary = `${base}data/${file}${q}`;
  let img;
  try {
    img = await loadImage(primary, 12000);
  } catch (e) {
    if (!fallbackBase) throw new Error('底图加载失败：' + file);
    img = await loadImage(`${fallbackBase}data/${file}${q}`, 20000);
  }

  const rect = new Cesium.Rectangle(
    Cesium.Math.toRadians(meta.west),
    Cesium.Math.toRadians(meta.south),
    Cesium.Math.toRadians(meta.east),
    Cesium.Math.toRadians(meta.north),
  );
  const tilingScheme = new Cesium.GeographicTilingScheme();
  const errorEvent = new Cesium.Event();
  const credit = new Cesium.Credit('底图：自绘（DEM + OSM）');

  const provider = {
    tilingScheme,
    rectangle: rect,
    tileWidth: 256,
    tileHeight: 256,
    minimumLevel: 0,
    maximumLevel: 19,
    hasAlphaChannel: true,
    errorEvent,
    credit,
    proxy: undefined,
    getTileCredits() {
      return [];
    },
    pickFeatures() {
      return undefined;
    },
    requestImage(x, y, level) {
      const r = tilingScheme.tileXYToRectangle(x, y, level);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);

      const w = Math.max(r.west, rect.west);
      const e = Math.min(r.east, rect.east);
      const s = Math.max(r.south, rect.south);
      const n = Math.min(r.north, rect.north);
      if (w >= e || s >= n) return Promise.resolve(canvas);

      const tw = r.east - r.west;
      const th = r.north - r.south;
      const px0 = ((w - r.west) / tw) * 256;
      const px1 = ((e - r.west) / tw) * 256;
      const py0 = ((r.north - n) / th) * 256;
      const py1 = ((r.north - s) / th) * 256;

      const rw = rect.east - rect.west;
      const rh = rect.north - rect.south;
      const sx0 = ((w - rect.west) / rw) * img.width;
      const sx1 = ((e - rect.west) / rw) * img.width;
      const sy0 = ((rect.north - n) / rh) * img.height;
      const sy1 = ((rect.north - s) / rh) * img.height;

      if (sx1 - sx0 > 0 && sy1 - sy0 > 0) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, px0, py0, px1 - px0, py1 - py0);
      }
      return Promise.resolve(canvas);
    },
  };

  return provider;
}
