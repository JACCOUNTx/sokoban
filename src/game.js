(function () {
  'use strict';

  const cfg = window.DS_CONFIG;
  const LEVELS = window.DS_LEVELS;
  const DIR_VEC = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
  const DIR_ANGLE = { U: -Math.PI / 2, D: Math.PI / 2, L: Math.PI, R: 0 };
  const DIR_LABEL = { U: '上', D: '下', L: '左', R: '右' };

  // ---------------------------------------------------------------- storage
  function todayKey() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function defaultStore() {
    return {
      version: 1,
      unlocked: 1,
      lastLevel: 1,
      progress: {},
      quota: { date: todayKey(), help: 0, autoUndo: 0 },
      ads: { lastInterstitialAt: 0, levelsSinceInterstitial: 0 },
    };
  }

  function coinsForStars(stars) {
    if (stars >= 3) return cfg.scoring.coins.three;
    if (stars === 2) return cfg.scoring.coins.two;
    if (stars === 1) return cfg.scoring.coins.one;
    return 0;
  }

  const Store = {
    data: defaultStore(),
    load() {
      try {
        const raw = localStorage.getItem(cfg.storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        this.data = Object.assign(defaultStore(), parsed);
        this.data.progress = parsed.progress || {};
        this.data.quota = Object.assign({ date: todayKey(), help: 0, autoUndo: 0 }, parsed.quota);
        this.data.ads = Object.assign({ lastInterstitialAt: 0, levelsSinceInterstitial: 0 }, parsed.ads);
        this.data.unlocked = Math.max(1, Math.min(LEVELS.length, this.data.unlocked || 1));
      } catch (err) {
        console.warn('storage load failed', err);
        this.data = defaultStore();
      }
    },
    save() {
      try {
        localStorage.setItem(cfg.storageKey, JSON.stringify(this.data));
      } catch (err) {
        console.warn('storage save failed', err);
      }
    },
    refreshDaily() {
      if (this.data.quota.date !== todayKey()) {
        this.data.quota = { date: todayKey(), help: 0, autoUndo: 0 };
        this.save();
      }
    },
    freeLeft(kind) {
      return Math.max(0, (cfg.dailyFree[kind] || 0) - (this.data.quota[kind] || 0));
    },
    progressOf(id) {
      return this.data.progress[id] || null;
    },
    totals() {
      let stars = 0;
      let coins = 0;
      let cleared = 0;
      for (const key of Object.keys(this.data.progress)) {
        const p = this.data.progress[key];
        if (!p) continue;
        cleared += 1;
        stars += p.stars || 0;
        coins += p.skipped && !p.stars ? cfg.scoring.coins.skip : coinsForStars(p.stars || 0);
      }
      return { stars, coins, cleared };
    },
  };

  // ---------------------------------------------------------------- state
  const state = {
    index: 0,
    data: null,
    w: 0,
    h: 0,
    walls: null,
    goals: new Set(),
    boxes: new Set(),
    player: 0,
    initialBoxes: [],
    initialPlayer: 0,
    moves: 0,
    history: [],
    solved: false,
    resetCount: 0,
    stuckShown: false,
    hint: { dir: null, until: 0 },
    anim: null,
    cell: 32,
    cssW: 0,
    cssH: 0,
    facing: 'D',
  };

  const el = {};
  let ctx = null;
  let dpr = 1;
  let toastTimer = null;
  let adBusyHint = false;
  let lastBoardSize = '';
  let boardCache = null;

  // ---------------------------------------------------------------- level load
  function parseLevel(index) {
    const data = LEVELS[index];
    const h = data.grid.length;
    let w = 0;
    for (const row of data.grid) w = Math.max(w, row.length);
    const walls = new Uint8Array(w * h).fill(1);
    const goals = new Set();
    const boxes = new Set();
    let player = 0;
    for (let r = 0; r < h; r++) {
      const row = data.grid[r];
      for (let c = 0; c < w; c++) {
        const ch = row[c] || ' ';
        const i = r * w + c;
        if (ch === '#') continue;
        walls[i] = 0;
        if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
        if (ch === '$' || ch === '*') boxes.add(i);
        if (ch === '@' || ch === '+') player = i;
      }
    }
    state.index = index;
    state.data = data;
    state.w = w;
    state.h = h;
    state.walls = walls;
    state.goals = goals;
    state.initialBoxes = [...boxes];
    state.initialPlayer = player;
    state.resetCount = 0;
    state.stuckShown = false;
    resetPositions();
    Store.data.lastLevel = index + 1;
    Store.save();
    updateLevelSelect();
    updateHud();
    resizeCanvas();
  }

  function resetPositions() {
    state.boxes = new Set(state.initialBoxes);
    state.player = state.initialPlayer;
    state.moves = 0;
    state.history = [];
    state.solved = false;
    state.hint = { dir: null, until: 0 };
    state.anim = null;
  }

  function currentRows() {
    const rows = [];
    for (let r = 0; r < state.h; r++) {
      let line = '';
      for (let c = 0; c < state.w; c++) {
        const i = r * state.w + c;
        const goal = state.goals.has(i);
        if (state.walls[i]) {
          line += '#';
        } else if (state.boxes.has(i)) {
          line += goal ? '*' : '$';
        } else if (state.player === i) {
          line += goal ? '+' : '@';
        } else {
          line += goal ? '.' : ' ';
        }
      }
      rows.push(line);
    }
    return rows;
  }

  // ---------------------------------------------------------------- sizing
  function resizeCanvas() {
    if (!ctx || !state.w) return;
    const pad = 20;
    const availW = Math.max(100, el.boardWrapper.clientWidth - pad);
    const availH = Math.max(100, el.boardWrapper.clientHeight - pad);
    const cell = Math.floor(Math.min(availW / state.w, availH / state.h));
    state.cell = Math.max(13, cell);
    state.cssW = state.cell * state.w;
    state.cssH = state.cell * state.h;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    el.canvas.style.width = `${state.cssW}px`;
    el.canvas.style.height = `${state.cssH}px`;
    el.canvas.width = Math.round(state.cssW * dpr);
    el.canvas.height = Math.round(state.cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    boardCache = null;
    draw(performance.now());
  }

  // ---------------------------------------------------------------- drawing helpers
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawFloor(x, y, s, r, c) {
    const alt = (r + c) % 2 === 0;
    ctx.fillStyle = alt ? 'rgba(125, 211, 252, 0.075)' : 'rgba(125, 211, 252, 0.045)';
    roundRect(x + 1, y + 1, s - 2, s - 2, s * 0.18);
    ctx.fill();
  }

  function drawFace(kind, cx, cy, s) {
    const rad = s * 0.235;
    const fur = ['#a9713f', '#f4e6d0', '#e8963f'][kind];
    const ear = ['#8a5528', '#e7c9a8', '#d97b28'][kind];
    if (kind === 1) {
      ctx.fillStyle = ear;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + dir * rad * 0.55, cy - rad * 1.35, rad * 0.32, rad * 0.95, dir * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f8b4c8';
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + dir * rad * 0.55, cy - rad * 1.3, rad * 0.14, rad * 0.6, dir * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = ear;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        if (kind === 0) {
          ctx.arc(cx + dir * rad * 0.82, cy - rad * 0.78, rad * 0.42, 0, Math.PI * 2);
        } else {
          ctx.moveTo(cx + dir * rad * 0.3, cy - rad * 0.7);
          ctx.lineTo(cx + dir * rad * 0.95, cy - rad * 1.45);
          ctx.lineTo(cx + dir * rad * 1.0, cy - rad * 0.5);
          ctx.closePath();
        }
        ctx.fill();
      }
    }
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 0) {
      ctx.fillStyle = '#f2ddbd';
      ctx.beginPath();
      ctx.ellipse(cx, cy + rad * 0.38, rad * 0.42, rad * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1f2937';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * rad * 0.36, cy - rad * 0.12, Math.max(1.1, rad * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    if (kind === 1) {
      ctx.ellipse(cx, cy + rad * 0.33, rad * 0.12, rad * 0.1, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(cx, cy + rad * 0.36, rad * 0.2, rad * 0.14, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (kind === 2) {
      ctx.strokeStyle = 'rgba(31, 41, 55, 0.75)';
      ctx.lineWidth = Math.max(0.7, s * 0.012);
      for (const dir of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(cx + dir * rad * 0.2, cy + rad * (0.3 + k * 0.12));
          ctx.lineTo(cx + dir * rad * 1.05, cy + rad * (0.2 + k * 0.24));
          ctx.stroke();
        }
      }
    }
  }

  function drawWall(x, y, s, r, c) {
    const g = ctx.createLinearGradient(x, y, x, y + s);
    g.addColorStop(0, '#3f9c6d');
    g.addColorStop(1, '#22684a');
    ctx.fillStyle = g;
    roundRect(x + s * 0.03, y + s * 0.03, s * 0.94, s * 0.94, s * 0.22);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRect(x + s * 0.12, y + s * 0.1, s * 0.26, s * 0.14, s * 0.07);
    ctx.fill();
    drawFace((r * 7 + c * 3) % 3, x + s * 0.5, y + s * 0.56, s);
  }

  function drawNest(x, y, s, t) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t / 520);
    ctx.save();
    ctx.fillStyle = `rgba(251, 191, 36, ${0.07 + 0.09 * pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c08b3a';
    ctx.lineWidth = Math.max(1.4, s * 0.09);
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.16, s * 0.27, s * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 236, 179, 0.5)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.16, s * 0.18, s * 0.09, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawStar(cx, cy - s * 0.02, s * 0.15, s * 0.062, '#fde047', 0.65 + 0.35 * pulse);
    ctx.restore();
  }

  function drawStar(cx, cy, outer, inner, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? outer : inner;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDragon(x, y, s, golden, t) {
    const bob = Math.sin(t / 420 + x * 0.05) * s * 0.018;
    const cx = x + s / 2;
    const cy = y + s / 2 + bob;
    const body = s * 0.34;
    ctx.save();
    if (golden) {
      ctx.shadowColor = 'rgba(253, 224, 71, 0.55)';
      ctx.shadowBlur = s * 0.35;
    }
    const grad = ctx.createRadialGradient(cx - body * 0.3, cy - body * 0.4, body * 0.2, cx, cy, body * 1.35);
    if (golden) {
      grad.addColorStop(0, '#fef3c7');
      grad.addColorStop(0.55, '#fbbf24');
      grad.addColorStop(1, '#d97706');
    } else {
      grad.addColorStop(0, '#86efac');
      grad.addColorStop(0.55, '#4ade80');
      grad.addColorStop(1, '#15803d');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.04, body, body * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // wings
    ctx.fillStyle = golden ? 'rgba(255, 247, 205, 0.85)' : 'rgba(187, 247, 208, 0.8)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * body * 0.55, cy - body * 0.15);
      ctx.quadraticCurveTo(cx + dir * body * 1.35, cy - body * 0.85, cx + dir * body * 0.95, cy + body * 0.32);
      ctx.closePath();
      ctx.fill();
    }

    // horns
    ctx.fillStyle = golden ? '#b45309' : '#065f46';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * body * 0.32, cy - body * 0.74);
      ctx.lineTo(cx + dir * body * 0.6, cy - body * 1.2);
      ctx.lineTo(cx + dir * body * 0.66, cy - body * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    // eyes
    ctx.fillStyle = '#0f172a';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * body * 0.36, cy - body * 0.16, Math.max(1.2, body * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * body * 0.36 + body * 0.05, cy - body * 0.22, Math.max(0.8, body * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }

    // snout + belly
    ctx.fillStyle = golden ? 'rgba(255, 250, 224, 0.9)' : 'rgba(220, 252, 231, 0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + body * 0.35, body * 0.5, body * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = Math.max(0.8, s * 0.014);
    ctx.beginPath();
    ctx.arc(cx, cy + body * 0.18, body * 0.26, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawExplorer(x, y, s, t) {
    const bob = Math.sin(t / 380) * s * 0.016;
    const cx = x + s / 2;
    const cy = y + s / 2 + bob;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, y + s * 0.9, s * 0.26, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // backpack
    ctx.fillStyle = '#b45309';
    roundRect(cx - s * 0.26, cy - s * 0.02, s * 0.16, s * 0.3, s * 0.07);
    ctx.fill();
    // body
    const g = ctx.createLinearGradient(cx, cy, cx, cy + s * 0.4);
    g.addColorStop(0, '#38bdf8');
    g.addColorStop(1, '#0369a1');
    ctx.fillStyle = g;
    roundRect(cx - s * 0.2, cy + s * 0.04, s * 0.4, s * 0.32, s * 0.11);
    ctx.fill();
    // head
    ctx.fillStyle = '#fcd9b6';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.12, s * 0.19, 0, Math.PI * 2);
    ctx.fill();
    // hat
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.24, s * 0.29, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.26, s * 0.16, Math.PI, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#0f172a';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * s * 0.07, cy - s * 0.1, Math.max(1, s * 0.032), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHintArrow(t) {    const hint = state.hint;
    if (!hint.dir || t > hint.until) return;
    const s = state.cell;
    const pr = (state.player / state.w) | 0;
    const pc = state.player % state.w;
    const x = pc * s + s / 2;
    const y = pr * s + s / 2;
    const pulse = 0.55 + 0.45 * Math.sin(t / 150);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(DIR_ANGLE[hint.dir]);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fde047';
    ctx.shadowColor = 'rgba(253, 224, 71, 0.85)';
    ctx.shadowBlur = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(s * 0.44, 0);
    ctx.lineTo(s * 0.12, -s * 0.2);
    ctx.lineTo(s * 0.12, s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function buildBoardCache() {
    if (!state.cssW || !state.cssH) return null;
    const cache = document.createElement('canvas');
    cache.width = Math.round(state.cssW * dpr);
    cache.height = Math.round(state.cssH * dpr);
    const g = cache.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const prev = ctx;
    ctx = g;
    const s = state.cell;
    for (let r = 0; r < state.h; r++) {
      for (let c = 0; c < state.w; c++) {
        const i = r * state.w + c;
        const x = c * s;
        const y = r * s;
        if (state.walls[i]) drawWall(x, y, s, r, c);
        else drawFloor(x, y, s, r, c);
      }
    }
    ctx = prev;
    return cache;
  }

  function draw(t) {
    if (!ctx) return;
    const s = state.cell;
    const anim = state.anim;
    let progress = 0;
    if (anim) {
      progress = Math.min(1, (t - anim.start) / anim.dur);
      if (progress >= 1) {
        state.anim = null;
      } else {
        progress = easeOutCubic(progress);
      }
    }
    ctx.clearRect(0, 0, state.cssW, state.cssH);

    if (!boardCache) boardCache = buildBoardCache();
    if (boardCache) ctx.drawImage(boardCache, 0, 0, state.cssW, state.cssH);

    for (const g of state.goals) {
      if (state.boxes.has(g)) continue;
      const r = (g / state.w) | 0;
      const c = g % state.w;
      drawNest(c * s, r * s, s, t);
    }

    for (const b of state.boxes) {
      const r = (b / state.w) | 0;
      const c = b % state.w;
      let x = c * s;
      let y = r * s;
      if (state.anim && state.anim.boxTo === b) {
        x = state.anim.boxFrom.x + (x - state.anim.boxFrom.x) * progress;
        y = state.anim.boxFrom.y + (y - state.anim.boxFrom.y) * progress;
      }
      drawDragon(x, y, s, state.goals.has(b), t);
    }

    {
      const r = (state.player / state.w) | 0;
      const c = state.player % state.w;
      let x = c * s;
      let y = r * s;
      if (state.anim && state.anim.playerTo === state.player) {
        x = state.anim.playerFrom.x + (x - state.anim.playerFrom.x) * progress;
        y = state.anim.playerFrom.y + (y - state.anim.playerFrom.y) * progress;
      }
      drawExplorer(x, y, s, t);
    }

    drawHintArrow(t);
  }

  // Keeps the canvas correct even if animation frames are throttled (background tab, battery saver).
  function redrawSoon() {
    draw(performance.now());
    setTimeout(() => draw(performance.now()), 140);
  }

  let hintTicker = null;

  function startHintTicker() {
    if (hintTicker) return;
    hintTicker = setInterval(() => {
      const now = performance.now();
      if (!state.hint.dir || now > state.hint.until) {
        clearInterval(hintTicker);
        hintTicker = null;
      }
      draw(now);
    }, 200);
  }

  // ---------------------------------------------------------------- movement
  function cellXY(i) {
    const s = state.cell;
    return { x: (i % state.w) * s, y: ((i / state.w) | 0) * s };
  }

  function move(dir) {
    if (state.solved || !state.data) return false;
    const d = DIR_VEC[dir];
    const r = (state.player / state.w) | 0;
    const c = state.player % state.w;
    const nr = r + d[0];
    const nc = c + d[1];
    if (nr < 0 || nc < 0 || nr >= state.h || nc >= state.w) return false;
    const target = nr * state.w + nc;
    if (state.walls[target]) {
      bump();
      return false;
    }
    let boxTo = null;
    if (state.boxes.has(target)) {
      const br = nr + d[0];
      const bc = nc + d[1];
      if (br < 0 || bc < 0 || br >= state.h || bc >= state.w) {
        bump();
        return false;
      }
      const dest = br * state.w + bc;
      if (state.walls[dest] || state.boxes.has(dest)) {
        bump();
        return false;
      }
      boxTo = dest;
    }

    state.history.push({
      player: state.player,
      boxes: [...state.boxes],
      moves: state.moves,
    });
    if (state.history.length > 200) state.history.shift();

    const playerFrom = cellXY(state.player);
    if (boxTo !== null) {
      const boxFrom = cellXY(target);
      state.boxes.delete(target);
      state.boxes.add(boxTo);
      state.anim = { start: performance.now(), dur: 115, playerFrom, playerTo: target, boxFrom, boxTo };
    } else {
      state.anim = { start: performance.now(), dur: 95, playerFrom, playerTo: target, boxFrom: null, boxTo: null };
    }
    state.player = target;
    state.moves += 1;
    state.hint = { dir: null, until: 0 };

    if (checkSolved()) {
      state.solved = true;
      completeLevel({ skipped: false });
    } else {
      updateHud();
      checkStuck();
    }
    redrawSoon();
    return true;
  }

  function bump() {
    // no-op visual feedback; keeps the game responsive without noisy toasts
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function checkSolved() {
    for (const b of state.boxes) {
      if (!state.goals.has(b)) return false;
    }
    return state.boxes.size === state.goals.size;
  }

  function undo(steps) {
    if (state.solved) return 0;
    let done = 0;
    while (done < steps && state.history.length) {
      const snap = state.history.pop();
      state.player = snap.player;
      state.boxes = new Set(snap.boxes);
      state.moves = snap.moves;
      done += 1;
    }
    state.anim = null;
    state.hint = { dir: null, until: 0 };
    updateHud();
    redrawSoon();
    return done;
  }

  function resetLevel(userInitiated) {
    if (!state.data) return;
    resetPositions();
    if (userInitiated) state.resetCount += 1;
    updateHud();
    redrawSoon();
    if (userInitiated) {
      showToast('關卡已重設');
      checkStuck();
    }
  }

  // ---------------------------------------------------------------- HUD
  function difficultyOf(index) {
    const n = index + 1;
    if (n <= 3) return { label: '入門', cls: '' };
    if (n <= 15) return { label: '進階', cls: 'medium' };
    return { label: '挑戰', cls: 'hard' };
  }

  function updateHud() {
    if (!state.data) return;
    el.statMoves.textContent = `${state.moves} / ${state.data.parMoves}`;
    const prog = Store.progressOf(state.data.id);
    el.statBest.textContent = prog && prog.bestMoves ? `${prog.bestMoves}` : '--';
    let onNest = 0;
    for (const b of state.boxes) if (state.goals.has(b)) onNest += 1;
    el.statNests.textContent = `${onNest} / ${state.boxes.size}`;
    el.levelName.textContent = `第 ${state.data.id} 關 · ${state.data.name}`;
    const diff = difficultyOf(state.index);
    el.difficultyBadge.textContent = diff.label;
    el.difficultyBadge.className = `difficulty-badge ${diff.cls}`.trim();
    const totals = Store.totals();
    el.statStars.textContent = totals.stars;
    el.statCoins.textContent = totals.coins;
    el.statCleared.textContent = totals.cleared;
    if (el.statTotal) el.statTotal.textContent = LEVELS.length;
    updateBadges();
    el.btnUndo.disabled = state.history.length === 0 || state.solved;
    el.btnHelp.disabled = state.solved;
    el.btnAutoUndo.disabled = state.solved;
    el.btnAdSkip.disabled = state.solved;
  }

  function badgeText(kind) {
    const left = Store.freeLeft(kind);
    return left > 0 ? `免費 ${left}` : '廣告';
  }

  function updateBadges() {
    el.helpBadge.textContent = badgeText('help');
    el.autoUndoBadge.textContent = badgeText('autoUndo');
    el.stuckHelpBadge.textContent = badgeText('help');
    el.stuckUndoBadge.textContent = badgeText('autoUndo');
    el.helpBadge.classList.toggle('is-empty', Store.freeLeft('help') <= 0);
    el.autoUndoBadge.classList.toggle('is-empty', Store.freeLeft('autoUndo') <= 0);
    el.stuckHelpBadge.classList.toggle('is-empty', Store.freeLeft('help') <= 0);
    el.stuckUndoBadge.classList.toggle('is-empty', Store.freeLeft('autoUndo') <= 0);
  }

  function buildLevelSelect() {
    el.levelSelect.innerHTML = '';
    for (let i = 0; i < LEVELS.length; i++) {
      const lv = LEVELS[i];
      const locked = i + 1 > Store.data.unlocked;
      const prog = Store.progressOf(lv.id);
      const opt = document.createElement('option');
      opt.value = String(i);
      let mark = locked ? '🔒' : '▶';
      if (prog && prog.skipped) mark = '📺';
      else if (prog) mark = '✅';
      opt.textContent = `${mark} 第${lv.id}關 ${lv.name}`;
      opt.disabled = locked;
      el.levelSelect.appendChild(opt);
    }
    el.levelSelect.value = String(state.index);
  }

  function updateLevelSelect() {
    buildLevelSelect();
  }

  // ---------------------------------------------------------------- toasts
  function showToast(text, ms) {
    el.floatToast.textContent = text;
    el.floatToast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.floatToast.classList.remove('show'), ms || 1800);
  }
  // ---------------------------------------------------------------- stuck hint
  function checkStuck() {
    if (state.solved || state.stuckShown || !state.data) return;
    const tooManyResets = state.resetCount >= cfg.stuck.resetThreshold;
    const tooManyMoves = state.moves > Math.ceil(state.data.parMoves * cfg.stuck.moveFactor);
    if (!tooManyResets && !tooManyMoves) return;
    state.stuckShown = true;
    el.stuckText.textContent = tooManyResets
      ? '重設了好幾次，讓小嚮導帶你走一步？'
      : '走了不少冤枉路，要不要看看下一步？';
    updateBadges();
    el.stuckSheet.classList.remove('hidden');
  }

  function hideStuck() {
    el.stuckSheet.classList.add('hidden');
  }

  // ---------------------------------------------------------------- ads
  async function consumeOrWatch(kind) {
    if (Store.freeLeft(kind) > 0) {
      Store.data.quota[kind] = (Store.data.quota[kind] || 0) + 1;
      Store.save();
      updateBadges();
      return true;
    }
    const ok = await window.DSAds.showRewarded();
    if (!ok) showToast('廣告未完成，未獲得獎勵');
    return ok;
  }

  async function runHint() {
    if (adBusyHint || state.solved) return;
    adBusyHint = true;
    hideStuck();
    showToast('小嚮導正在尋找下一步…', 900);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const res = window.DSSolver.solve(currentRows(), { maxNodes: 200000 });
    adBusyHint = false;
    if (!res || !res.moves) {
      showToast('這關已經沒有更快的提示了，再試試看！');
      return;
    }
    state.hint = { dir: res.moves[0], until: performance.now() + 4500 };
    startHintTicker();
    redrawSoon();
    showToast(`提示：往「${DIR_LABEL[res.moves[0]]}」移動`, 2200);
  }

  async function useHelp() {
    if (state.solved) return;
    const ok = await consumeOrWatch('help');
    if (!ok) return;
    await runHint();
  }

  async function useAutoUndo() {
    if (state.solved) return;
    if (state.history.length === 0) {
      showToast('已經是關卡開始位置了');
      return;
    }
    const ok = await consumeOrWatch('autoUndo');
    if (!ok) return;
    hideStuck();
    const done = undo(5);
    showToast(done > 0 ? `已自動退回 ${done} 步` : '沒有可退回的步數');
    if (done === 0) updateHud();
  }

  async function useSkipAd() {
    if (state.solved || window.DSAds.isBusy()) return;
    hideStuck();
    const ok = await window.DSAds.showRewarded();
    if (!ok) {
      showToast('廣告未完成，未能過關');
      return;
    }
    state.solved = true;
    completeLevel({ skipped: true });
  }

  // ---------------------------------------------------------------- completion
  function starsFor(moves, par) {
    const ratio = moves / Math.max(1, par);
    if (ratio <= cfg.scoring.starRatios.three) return 3;
    if (ratio <= cfg.scoring.starRatios.two) return 2;
    return 1;
  }

  function completeLevel(opts) {
    const data = state.data;
    const skipped = !!opts.skipped;
    hideStuck();
    const stars = skipped ? 0 : starsFor(state.moves, data.parMoves);
    const prev = Store.progressOf(data.id) || {};
    const bestMoves = skipped ? prev.bestMoves || 0 : Math.min(prev.bestMoves || Infinity, state.moves);
    const record = {
      bestMoves: Number.isFinite(bestMoves) ? bestMoves : state.moves,
      stars: Math.max(prev.stars || 0, stars),
      skipped: !!(prev.skipped || skipped),
    };
    Store.data.progress[data.id] = record;
    Store.data.unlocked = Math.min(LEVELS.length, Math.max(Store.data.unlocked, data.id + 1));
    Store.data.ads.levelsSinceInterstitial = (Store.data.ads.levelsSinceInterstitial || 0) + 1;
    Store.save();
    updateLevelSelect();
    updateHud();

    el.winEmoji.textContent = skipped ? '📺' : stars === 3 ? '🏆' : '🌟';
    el.winTitle.textContent = skipped ? '廣告過關！' : '過關！';
    el.winStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    el.winSummary.textContent = skipped
      ? `第 ${data.id} 關已解鎖，下一關等著你！`
      : `用了 ${state.moves} 步（標準 ${data.parMoves} 步）· 星巢 ${state.goals.size}/${state.goals.size}`;
    const coinGain = skipped ? cfg.scoring.coins.skip : coinsForStars(stars);
    const bestText = record.bestMoves > 0 ? `${record.bestMoves} 步` : '尚未記錄';
    el.winBest.textContent = `最佳紀錄：${bestText} · 本關金幣 +${coinGain}`;
    const isLast = state.index >= LEVELS.length - 1;
    el.btnNextLevel.textContent = isLast ? '全部完成，回第 1 關' : '下一關';
    el.winModal.classList.remove('hidden');
  }

  async function nextLevel() {
    el.winModal.classList.add('hidden');
    const target = state.index >= LEVELS.length - 1 ? 0 : state.index + 1;
    await maybeShowInterstitial(target + 1);
    parseLevel(target);
    showToast(`第 ${target + 1} 關 · ${LEVELS[target].name}`, 1500);
  }

  async function maybeShowInterstitial(levelNumber) {
    const rules = cfg.interstitial;
    if (levelNumber < rules.minLevelNumber) return;
    const ads = Store.data.ads;
    if ((ads.levelsSinceInterstitial || 0) < rules.everyNLevels) return;
    if (Date.now() - (ads.lastInterstitialAt || 0) < rules.cooldownMs) return;
    await window.DSAds.showInterstitial();
    Store.data.ads.lastInterstitialAt = Date.now();
    Store.data.ads.levelsSinceInterstitial = 0;
    Store.save();
  }

  function goToLevel(index) {
    if (index < 0 || index >= LEVELS.length) return;
    if (index + 1 > Store.data.unlocked) {
      showToast('先完成前面的關卡才能解鎖');
      el.levelSelect.value = String(state.index);
      return;
    }
    el.winModal.classList.add('hidden');
    hideStuck();
    parseLevel(index);
    showToast(`第 ${index + 1} 關 · ${LEVELS[index].name}`, 1400);
  }

  // ---------------------------------------------------------------- input
  function bindInputs() {
    const keyMap = {
      ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
      w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
    };
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (!state.solved && state.history.length === 0) {
          showToast('沒有可退回的步數');
        } else if (!state.solved) {
          undo(1);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetLevel(true);
      }
    });

    let touch = null;
    el.boardWrapper.addEventListener('pointerdown', (e) => {
      touch = { x: e.clientX, y: e.clientY };
    });
    el.boardWrapper.addEventListener('pointerup', (e) => {
      if (!touch) return;
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      touch = null;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L');
      else move(dy > 0 ? 'D' : 'U');
    });
    el.boardWrapper.addEventListener('pointercancel', () => {
      touch = null;
    });
    el.boardWrapper.addEventListener('touchmove', (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    const dpadButtons = document.querySelectorAll('.dpad-btn');
    dpadButtons.forEach((btn) => {
      const dir = btn.getAttribute('data-dir');
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        move(dir);
      });
      btn.addEventListener('click', (e) => {
        if (e.detail === 0) move(dir);
      });
    });

    el.btnHelp.addEventListener('click', useHelp);
    el.btnAutoUndo.addEventListener('click', useAutoUndo);
    el.btnAdSkip.addEventListener('click', useSkipAd);
    el.btnUndo.addEventListener('click', () => {
      if (state.solved) return;
      if (!undo(1)) showToast('沒有可退回的步數');
    });
    el.btnReset.addEventListener('click', () => resetLevel(true));

    el.levelSelect.addEventListener('change', () => {
      goToLevel(Number(el.levelSelect.value));
    });

    el.btnNextLevel.addEventListener('click', nextLevel);
    el.btnReplay.addEventListener('click', () => {
      el.winModal.classList.add('hidden');
      parseLevel(state.index);
      showToast('再試一次！', 1200);
    });
    el.btnOpenLevels.addEventListener('click', () => {
      el.winModal.classList.add('hidden');
      if (window.CSS && CSS.supports && CSS.supports('selector(:focus-visible)')) {
        el.levelSelect.focus({ preventScroll: false });
      } else {
        el.levelSelect.focus();
      }
      if (typeof el.levelSelect.showPicker === 'function') {
        try {
          el.levelSelect.showPicker();
        } catch (err) {
          /* picker needs a user gesture on some browsers */
        }
      }
      showToast('在右上角選擇關卡', 1600);
    });

    el.stuckHelp.addEventListener('click', async () => {
      hideStuck();
      await useHelp();
    });
    el.stuckUndo.addEventListener('click', async () => {
      hideStuck();
      await useAutoUndo();
    });
    el.stuckClose.addEventListener('click', hideStuck);

    const scheduleResize = () => {
      resizeCanvas();
      setTimeout(resizeCanvas, 120);
      setTimeout(resizeCanvas, 420);
    };
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 250));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleResize();
    });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => resizeCanvas());
      ro.observe(el.boardWrapper);
    }
  }

  // ---------------------------------------------------------------- init
  function init() {
    el.canvas = document.getElementById('gameCanvas');
    el.boardWrapper = document.getElementById('boardWrapper');
    el.floatToast = document.getElementById('floatToast');
    el.levelSelect = document.getElementById('levelSelect');
    el.levelName = document.getElementById('levelName');
    el.difficultyBadge = document.getElementById('difficultyBadge');
    el.statMoves = document.getElementById('statMoves');
    el.statBest = document.getElementById('statBest');
    el.statNests = document.getElementById('statNests');
    el.statStars = document.getElementById('statStars');
    el.statCoins = document.getElementById('statCoins');
    el.statCleared = document.getElementById('statCleared');
    el.statTotal = document.getElementById('statTotal');
    el.btnHelp = document.getElementById('btnHelp');
    el.btnAutoUndo = document.getElementById('btnAutoUndo');
    el.btnAdSkip = document.getElementById('btnAdSkip');
    el.btnUndo = document.getElementById('btnUndo');
    el.btnReset = document.getElementById('btnReset');
    el.helpBadge = document.getElementById('helpBadge');
    el.autoUndoBadge = document.getElementById('autoUndoBadge');
    el.winModal = document.getElementById('winModal');
    el.winEmoji = document.getElementById('winEmoji');
    el.winTitle = document.getElementById('winTitle');
    el.winStars = document.getElementById('winStars');
    el.winSummary = document.getElementById('winSummary');
    el.winBest = document.getElementById('winBest');
    el.btnNextLevel = document.getElementById('btnNextLevel');
    el.btnReplay = document.getElementById('btnReplay');
    el.btnOpenLevels = document.getElementById('btnOpenLevels');
    el.stuckSheet = document.getElementById('stuckSheet');
    el.stuckText = document.getElementById('stuckText');
    el.stuckHelp = document.getElementById('stuckHelp');
    el.stuckUndo = document.getElementById('stuckUndo');
    el.stuckClose = document.getElementById('stuckClose');
    el.stuckHelpBadge = document.getElementById('stuckHelpBadge');
    el.stuckUndoBadge = document.getElementById('stuckUndoBadge');

    ctx = el.canvas.getContext('2d');

    Store.load();
    Store.refreshDaily();
    bindInputs();

    const startIndex = Math.max(0, Math.min(LEVELS.length - 1, (Store.data.lastLevel || 1) - 1));
    const unlockedIndex = Math.max(0, Math.min(LEVELS.length - 1, Store.data.unlocked - 1));
    parseLevel(Math.min(startIndex, unlockedIndex));

    window.DSAds.init();

    document.body.setAttribute('tabindex', '-1');
    document.body.focus({ preventScroll: true });
    window.focus();

    const loop = (t) => {
      const sizeKey = `${el.boardWrapper.clientWidth}x${el.boardWrapper.clientHeight}`;
      if (sizeKey !== lastBoardSize) {
        lastBoardSize = sizeKey;
        resizeCanvas();
      }
      try {
        draw(t);
      } catch (err) {
        console.error('draw failed', err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
