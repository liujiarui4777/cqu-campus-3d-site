/* 步行导航：用 OSM 道路网建图，Dijkstra 求最短路径 */

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

export function buildRoadGraph(roads) {
  const TOL = 1.15e-5; // 约 1.2m
  const nodes = [];
  const adj = [];
  const grid = new Map();

  function getNode(lon, lat) {
    const gx = Math.round(lon / TOL);
    const gy = Math.round(lat / TOL);
    // 查 3x3 邻域，避免同一路口被拆成两个点
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const hit = grid.get(`${gx + dx},${gy + dy}`);
        if (hit !== undefined) {
          const n = nodes[hit];
          if (Math.hypot((n.lon - lon) * mLon(lat), (n.lat - lat) * MLAT) < 9) {
            return hit;
          }
        }
      }
    }
    const id = nodes.length;
    nodes.push({ lon, lat });
    adj.push([]);
    grid.set(`${gx},${gy}`, id);
    return id;
  }

  for (const r of roads) {
    if (!r.path || r.path.length < 2) continue;
    // 只走人行可达的路
    if (!['footway', 'steps', 'service', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'cycleway', 'primary_link', 'secondary_link'].includes(r.cls)) continue;
    let prev = getNode(r.path[0][0], r.path[0][1]);
    for (let i = 1; i < r.path.length; i++) {
      const cur = getNode(r.path[i][0], r.path[i][1]);
      if (cur === prev) continue;
      const a = nodes[prev];
      const b = nodes[cur];
      const dx = (b.lon - a.lon) * mLon(a.lat);
      const dy = (b.lat - a.lat) * MLAT;
      const len = Math.hypot(dx, dy);
      if (len > 900) continue; // 断网路段跳过
      adj[prev].push({ to: cur, len, cls: r.cls });
      adj[cur].push({ to: prev, len, cls: r.cls });
      prev = cur;
    }
  }

  // ---- 连通性修复：把零碎路网接回最大连通分量 ----
  const n = nodes.length;
  const comp = new Int32Array(n).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  let cid = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] !== -1) continue;
    const stack = [i];
    comp[i] = cid;
    let size = 0;
    while (stack.length) {
      const v = stack.pop();
      size++;
      for (const e of adj[v]) {
        if (comp[e.to] === -1) {
          comp[e.to] = cid;
          stack.push(e.to);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = cid;
    }
    cid++;
  }
  const main = [];
  for (let i = 0; i < n; i++) if (comp[i] === bestComp) main.push(i);
  for (let i = 0; i < n; i++) {
    if (comp[i] === bestComp) continue;
    let best = -1;
    let bd = Infinity;
    for (const j of main) {
      const d = Math.hypot((nodes[j].lon - nodes[i].lon) * mLon(nodes[i].lat), (nodes[j].lat - nodes[i].lat) * MLAT);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best >= 0 && bd < 90) {
      adj[i].push({ to: best, len: bd * 1.35, cls: 'link' });
      adj[best].push({ to: i, len: bd * 1.35, cls: 'link' });
    }
  }

  return { nodes, adj };
}

export function nearestNode(graph, lon, lat) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const d = Math.hypot((n.lon - lon) * mLon(lat), (n.lat - lat) * MLAT);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { id: best, dist: bestD };
}

export function shortestPath(graph, start, goal) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[start] = 0;

  // 简易二叉堆
  const heap = [[0, start]];
  const push = (d, v) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const [d, v] = pop();
    if (done[v]) continue;
    done[v] = 1;
    if (v === goal) break;
    for (const e of graph.adj[v]) {
      const nd = d + e.len;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = v;
        push(nd, e.to);
      }
    }
  }

  if (!isFinite(dist[goal])) return null;
  const path = [];
  let cur = goal;
  while (cur !== -1) {
    path.push(graph.nodes[cur]);
    cur = prev[cur];
  }
  path.reverse();
  return { path, length: dist[goal] };
}
