// Push-space A* solver used for hints. Mirrors the validator used to verify every level.
window.DSSolver = (function () {
  const DR = [-1, 1, 0, 0];
  const DC = [0, 0, -1, 1];
  const DIR_NAME = ['U', 'D', 'L', 'R'];

  function parseRows(rows) {
    const h = rows.length;
    let w = 0;
    for (const line of rows) w = Math.max(w, line.length);
    const walls = new Uint8Array(w * h).fill(1);
    const goals = [];
    const boxes = [];
    let player = -1;
    for (let r = 0; r < h; r++) {
      const line = rows[r];
      for (let c = 0; c < w; c++) {
        const ch = line[c] || ' ';
        const i = r * w + c;
        if (ch === '#') continue;
        walls[i] = 0;
        if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
        if (ch === '$' || ch === '*') boxes.push(i);
        if (ch === '@' || ch === '+') player = i;
      }
    }
    return { w, h, walls, goals, boxes: boxes.sort((a, b) => a - b), player };
  }

  function bfsDist(w, h, walls, start) {
    const dist = new Int16Array(w * h).fill(-1);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      const r = (cur / w) | 0;
      const c = cur % w;
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
        const ni = nr * w + nc;
        if (walls[ni] || dist[ni] !== -1) continue;
        dist[ni] = dist[cur] + 1;
        queue[tail++] = ni;
      }
    }
    return dist;
  }

  function deadSquares(w, h, walls, goals) {
    const alive = new Uint8Array(w * h);
    const stack = [];
    for (const g of goals) {
      if (!alive[g]) {
        alive[g] = 1;
        stack.push(g);
      }
    }
    while (stack.length) {
      const cur = stack.pop();
      const r = (cur / w) | 0;
      const c = cur % w;
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        const fr = r + 2 * DR[d];
        const fc = c + 2 * DC[d];
        if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
        if (fr < 0 || fc < 0 || fr >= h || fc >= w) continue;
        const ni = nr * w + nc;
        const fi = fr * w + fc;
        if (walls[ni] || walls[fi] || alive[ni]) continue;
        alive[ni] = 1;
        stack.push(ni);
      }
    }
    const dead = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (!walls[i] && !alive[i]) dead[i] = 1;
    return dead;
  }

  function minMatching(cost, n) {
    const size = 1 << n;
    const dp = new Float64Array(size).fill(Infinity);
    dp[0] = 0;
    for (let mask = 0; mask < size; mask++) {
      if (dp[mask] === Infinity) continue;
      let i = 0;
      for (let m = mask; m; m &= m - 1) i++;
      if (i >= n) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nm = mask | (1 << j);
        const v = dp[mask] + cost[i][j];
        if (v < dp[nm]) dp[nm] = v;
      }
    }
    return dp[size - 1];
  }

  class Heap {
    constructor() { this.keys = []; }
    get size() { return this.keys.length; }
    push(node) {
      const a = this.keys;
      a.push(node);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.keys;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let best = i;
          if (l < a.length && a[l].f < a[best].f) best = l;
          if (r < a.length && a[r].f < a[best].f) best = r;
          if (best === i) break;
          [a[best], a[i]] = [a[i], a[best]];
          i = best;
        }
      }
      return top;
    }
  }

  class Problem {
    constructor(rows) {
      const data = parseRows(rows);
      this.w = data.w;
      this.h = data.h;
      this.walls = data.walls;
      this.goals = data.goals;
      this.startBoxes = data.boxes;
      this.startPlayer = data.player;
      this.goalSet = new Uint8Array(this.w * this.h);
      for (const g of this.goals) this.goalSet[g] = 1;
      this.goalDist = this.goals.map((g) => bfsDist(this.w, this.h, this.walls, g));
      this.dead = deadSquares(this.w, this.h, this.walls, this.goals);
      this.seen = new Int32Array(this.w * this.h);
      this.stamp = 0;
      this.queue = new Int32Array(this.w * this.h);
    }

    reachable(player, boxMask) {
      const { w, h, walls, queue } = this;
      const stamp = ++this.stamp;
      const seen = this.seen;
      let head = 0;
      let tail = 0;
      seen[player] = stamp;
      queue[tail++] = player;
      while (head < tail) {
        const cur = queue[head++];
        const r = (cur / w) | 0;
        const c = cur % w;
        for (let d = 0; d < 4; d++) {
          const nr = r + DR[d];
          const nc = c + DC[d];
          if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
          const ni = nr * w + nc;
          if (walls[ni] || seen[ni] === stamp || boxMask[ni]) continue;
          seen[ni] = stamp;
          queue[tail++] = ni;
        }
      }
      return seen;
    }

    heuristic(boxes) {
      const n = boxes.length;
      const goals = this.goals;
      const cost = [];
      for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
          const dist = this.goalDist[j][boxes[i]];
          row.push(dist < 0 ? 999 : dist);
        }
        cost.push(row);
      }
      return minMatching(cost, n);
    }

    solve(options) {
      const opts = options || {};
      const maxNodes = opts.maxNodes || 160000;
      const boxes = this.startBoxes.slice();
      const n = boxes.length;
      if (n === 0 || n !== this.goals.length) return null;
      const boxMask = new Uint8Array(this.w * this.h);
      for (const b of boxes) boxMask[b] = 1;

      const startKey = boxes.join(',') + '|' + this.startPlayer;
      const parents = new Map();
      parents.set(startKey, null);
      const best = new Map();
      best.set(startKey, 0);
      const heap = new Heap();
      heap.push({ f: this.heuristic(boxes), g: 0, boxes: boxes.slice(), player: this.startPlayer, key: startKey });

      const goalCount = this.goals.length;
      let nodes = 0;
      while (heap.size) {
        const node = heap.pop();
        if (best.get(node.key) < node.g) continue;
        const curBoxMask = new Uint8Array(this.w * this.h);
        for (const b of node.boxes) curBoxMask[b] = 1;
        let onGoal = 0;
        for (const b of node.boxes) if (this.goalSet[b]) onGoal++;
        if (onGoal === goalCount) {
          return this.reconstruct(parents, node);
        }
        if (++nodes > maxNodes) return null;

        const seen = this.reachable(node.player, curBoxMask);
        for (let bi = 0; bi < n; bi++) {
          const b = node.boxes[bi];
          const br = (b / this.w) | 0;
          const bc = b % this.w;
          for (let d = 0; d < 4; d++) {
            const sr = br - DR[d];
            const sc = bc - DC[d];
            if (sr < 0 || sc < 0 || sr >= this.h || sc >= this.w) continue;
            const stand = sr * this.w + sc;
            if (seen[stand] !== this.stamp || this.walls[stand]) continue;
            const nr = br + DR[d];
            const nc = bc + DC[d];
            if (nr < 0 || nc < 0 || nr >= this.h || nc >= this.w) continue;
            const dest = nr * this.w + nc;
            if (this.walls[dest] || curBoxMask[dest]) continue;
            if (this.dead[dest] && !this.goalSet[dest]) continue;
            const nb = node.boxes.slice();
            nb[bi] = dest;
            nb.sort((x, y) => x - y);
            const key = nb.join(',') + '|' + b;
            const ng = node.g + 1;
            const prevG = best.get(key);
            if (prevG !== undefined && prevG <= ng) continue;
            best.set(key, ng);
            parents.set(key, { from: node.key, box: b, dest, dir: d });
            heap.push({ f: ng + this.heuristic(nb), g: ng, boxes: nb, player: b, key });
          }
        }
      }
      return null;
    }

    reconstruct(parents, node) {
      const pushes = [];
      let key = node.key;
      while (true) {
        const p = parents.get(key);
        if (!p) break;
        pushes.push({ from: p.box, to: p.dest, dir: p.dir });
        key = p.from;
      }
      pushes.reverse();
      const moves = [];
      let player = this.startPlayer;
      const boxMask = new Uint8Array(this.w * this.h);
      for (const b of this.startBoxes) boxMask[b] = 1;
      for (const push of pushes) {
        const walk = this.walkPath(player, this.standOf(push), boxMask);
        if (walk === null) return null;
        moves.push(...walk);
        moves.push(DIR_NAME[push.dir]);
        boxMask[push.from] = 0;
        boxMask[push.to] = 1;
        player = push.from;
      }
      return { pushes: pushes.length, moves: moves.join(''), firstMove: moves[0] || null };
    }

    standOf(push) {
      const r = ((push.from / this.w) | 0) - DR[push.dir];
      const c = (push.from % this.w) - DC[push.dir];
      return r * this.w + c;
    }

    walkPath(start, goal, boxMask) {
      if (start === goal) return '';
      const w = this.w;
      const h = this.h;
      const prev = new Int32Array(w * h).fill(-2);
      const prevDir = new Int8Array(w * h).fill(-1);
      const queue = new Int32Array(w * h);
      let head = 0;
      let tail = 0;
      prev[start] = -1;
      queue[tail++] = start;
      while (head < tail) {
        const cur = queue[head++];
        if (cur === goal) break;
        const r = (cur / w) | 0;
        const c = cur % w;
        for (let d = 0; d < 4; d++) {
          const nr = r + DR[d];
          const nc = c + DC[d];
          if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
          const ni = nr * w + nc;
          if (this.walls[ni] || prev[ni] !== -2) continue;
          if (boxMask[ni] && ni !== goal) continue;
          prev[ni] = cur;
          prevDir[ni] = d;
          queue[tail++] = ni;
        }
      }
      if (prev[goal] === -2) return null;
      const out = [];
      let cur = goal;
      while (prev[cur] !== -1) {
        out.push(DIR_NAME[prevDir[cur]]);
        cur = prev[cur];
      }
      return out.reverse().join('');
    }
  }

  function solve(rows, options) {
    try {
      return new Problem(rows).solve(options);
    } catch (err) {
      console.error('solver failed', err);
      return null;
    }
  }

  return { solve, parseRows };
})();
