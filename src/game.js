(function () {
  'use strict';

  const cfg = window.DS_CONFIG;
  const LEVELS = window.DS_LEVELS;
  const DIR_VEC = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
  const DIR_LABEL = { U: '上', D: '下', L: '左', R: '右' };

  // ---------------------------------------------------------------- storage
  function todayKey() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function defaultStore() {
    return {
      version: 2,
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
        this.migrate(parsed);
      } catch (err) {
        console.warn('storage load failed', err);
        this.data = defaultStore();
      }
    },
    migrate(parsed) {
      const fromVersion = Math.max(1, Number(parsed && parsed.version) || 1);
      const before = `${this.data.version}|${this.data.unlocked}`;
      const record = this.data.progress && this.data.progress['30'];
      if (record) {
        this.data.unlocked = Math.max(this.data.unlocked || 1, Math.min(LEVELS.length, 31));
      }
      this.data.version = 2;
      this.data.unlocked = Math.max(1, Math.min(LEVELS.length, this.data.unlocked || 1));
      if (fromVersion < 2 || `${this.data.version}|${this.data.unlocked}` !== before) this.save();
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
  };

  const el = {};
  const board = window.DSBoard;
  let toastTimer = null;
  let adBusyHint = false;

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
    board.resizeBoard();
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

  // Keeps the canvas correct even if animation frames are throttled (background tab, battery saver).
  function redrawSoon() {
    board.renderBoard(performance.now());
    setTimeout(() => board.renderBoard(performance.now()), 140);
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
      board.renderBoard(now);
    }, 200);
  }

  // ---------------------------------------------------------------- movement
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

    if (boxTo !== null) {
      state.boxes.delete(target);
      state.boxes.add(boxTo);
      state.anim = {
        start: performance.now(),
        dur: 115,
        playerFromIdx: state.player,
        playerToIdx: target,
        boxFromIdx: target,
        boxToIdx: boxTo,
      };
    } else {
      state.anim = { start: performance.now(), dur: 95, playerFromIdx: state.player, playerToIdx: target };
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
    setWinModalVisible(false);
    hideStuck();
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
  // 以龍數（箱數）＋標準步數估算難度，插入新關卡亦不會影響標籤
  function difficultyOf(index) {
    const lv = LEVELS[index] || {};
    const dragons = Math.max(1, Number(lv.boxes) || 1);
    const par = Math.max(1, Number(lv.parMoves) || 1);
    const load = dragons * 12 + par;
    if (load <= 30) return { label: '入門', cls: '' };
    if (load <= 70) return { label: '進階', cls: 'medium' };
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
  }

  function badgeText(kind) {
    const left = Store.freeLeft(kind);
    return left > 0 ? `免費 ${left}` : '廣告';
  }

  // 卡關底欄與主畫面按鈕共用同一份每日免費額度狀態
  function updateBadges() {
    const helpFree = Store.freeLeft('help');
    const undoFree = Store.freeLeft('autoUndo');

    if (el.helpBadge) {
      el.helpBadge.textContent = badgeText('help');
      el.helpBadge.classList.toggle('is-empty', helpFree <= 0);
    }
    if (el.autoUndoBadge) {
      el.autoUndoBadge.textContent = badgeText('autoUndo');
      el.autoUndoBadge.classList.toggle('is-empty', undoFree <= 0);
    }

    if (el.stuckHelpLabel) el.stuckHelpLabel.textContent = helpFree > 0 ? '使用免費提示' : '看廣告拿提示';
    if (el.stuckHelpBadge) {
      el.stuckHelpBadge.textContent = badgeText('help');
      el.stuckHelpBadge.classList.toggle('is-empty', helpFree <= 0);
    }
    if (el.stuckUndoLabel) el.stuckUndoLabel.textContent = undoFree > 0 ? '免費自動退 5 步' : '看廣告自動退 5 步';
    if (el.stuckUndoBadge) {
      el.stuckUndoBadge.textContent = badgeText('autoUndo');
      el.stuckUndoBadge.classList.toggle('is-empty', undoFree <= 0);
    }

    // 「看廣告過關」永遠走獎勵廣告，只跟關卡狀態連動
    if (el.btnAdSkip) {
      el.btnAdSkip.disabled = state.solved;
      const adBadge = el.btnAdSkip.querySelector('.badge-ad');
      if (adBadge) adBadge.textContent = '廣告';
    }
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
    setStuckSheetVisible(true);
  }

  function setStuckSheetVisible(visible) {
    if (!el.stuckSheet) return;
    el.stuckSheet.classList.toggle('hidden', !visible);
  }

  function hideStuck() {
    setStuckSheetVisible(false);
  }

  // Win modal owns the reset/level controls so the board cannot mutate behind it.
  function setWinModalVisible(visible) {
    const show = Boolean(visible);
    if (el.winModal) el.winModal.classList.toggle('hidden', !show);
    if (el.btnReset) el.btnReset.disabled = show;
    if (el.levelSelect) el.levelSelect.disabled = show;
  }

  // Native AdMob banners live above the WebView; reserve room so the D-Pad stays tappable.
  function setNativeBannerSpace(active) {
    document.body.classList.toggle('native-banner-active', Boolean(active));
  }

  function setBannerVisible(visible) {
    const show = Boolean(visible);
    if (el.adBanner) el.adBanner.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-banner', show);
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

  const HINT_MAX_NODES = 200000;
  const HINT_SLOW_MS = 120;

  async function runHint() {
    if (adBusyHint || state.solved) return false;
    adBusyHint = true;
    hideStuck();
    showToast('小嚮導正在尋找下一步…', 900);
    const levelIndex = state.index;
    let res = null;
    let elapsed = 0;
    let failed = false;
    try {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const started = performance.now();
      try {
        res = window.DSSolver.solve(currentRows(), { maxNodes: HINT_MAX_NODES });
      } catch (err) {
        console.warn('hint solve failed', err);
        res = null;
        failed = true;
      } finally {
        elapsed = performance.now() - started;
      }
    } finally {
      adBusyHint = false;
    }
    if (state.index !== levelIndex || state.solved) return false;
    if (!res || !res.moves || !res.moves.length) {
      if (failed) showToast('提示搜尋出錯，請再試一次');
      else if (elapsed >= HINT_SLOW_MS) showToast('提示搜尋超出節點上限／逾時，請重試');
      else showToast('這一關找不到可行的下一步');
      return false;
    }
    state.hint = { dir: res.moves[0], until: performance.now() + 4500 };
    startHintTicker();
    redrawSoon();
    showToast(`提示：往「${DIR_LABEL[res.moves[0]]}」移動`, 2200);
    return true;
  }

  async function useHelp() {
    if (state.solved || window.DSAds.isBusy()) return;
    const useFree = Store.freeLeft('help') > 0;
    if (!useFree) {
      const ok = await window.DSAds.showRewarded();
      if (!ok) {
        showToast('廣告未完成，未獲得獎勵');
        return;
      }
    }
    const hinted = await runHint();
    if (!hinted || !useFree) return;
    Store.data.quota.help = (Store.data.quota.help || 0) + 1;
    Store.save();
    updateBadges();
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
    setStuckSheetVisible(false);
    setWinModalVisible(true);
  }

  async function nextLevel() {
    if (window.DSAds.isBusy()) {
      showToast('廣告播放中，請稍候');
      return;
    }
    const currentIndex = state.index;
    const target = currentIndex >= LEVELS.length - 1 ? 0 : currentIndex + 1;
    setWinModalVisible(false);
    await maybeShowInterstitial(target + 1);
    if (window.DSAds.isBusy()) return;
    const selected = Number(el.levelSelect.value);
    const picked = Number.isInteger(selected) &&
      selected !== currentIndex &&
      selected >= 0 &&
      selected < LEVELS.length
      ? selected
      : target;
    parseLevel(picked);
    showToast(`第 ${picked + 1} 關 · ${LEVELS[picked].name}`, 1500);
  }

  async function maybeShowInterstitial(levelNumber) {
    const rules = cfg.interstitial;
    if (levelNumber < rules.minLevelNumber) return;
    const ads = Store.data.ads;
    if ((ads.levelsSinceInterstitial || 0) < rules.everyNLevels) return;
    if (Date.now() - (ads.lastInterstitialAt || 0) < rules.cooldownMs) return;
    const shown = await window.DSAds.showInterstitial();
    if (!shown) return;
    Store.data.ads.lastInterstitialAt = Date.now();
    Store.data.ads.levelsSinceInterstitial = 0;
    Store.save();
  }

  function goToLevel(index) {
    if (index < 0 || index >= LEVELS.length) return;
    if (window.DSAds.isBusy()) {
      showToast('廣告播放中，請稍候');
      el.levelSelect.value = String(state.index);
      return;
    }
    if (index + 1 > Store.data.unlocked) {
      showToast('先完成前面的關卡才能解鎖');
      el.levelSelect.value = String(state.index);
      return;
    }
    setWinModalVisible(false);
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
      if (window.DSAds.isBusy()) {
        showToast('廣告播放中，請稍候');
        el.levelSelect.value = String(state.index);
        return;
      }
      goToLevel(Number(el.levelSelect.value));
    });

    el.btnNextLevel.addEventListener('click', nextLevel);
    el.btnReplay.addEventListener('click', () => {
      setWinModalVisible(false);
      parseLevel(state.index);
      showToast('再試一次！', 1200);
    });
    el.btnOpenLevels.addEventListener('click', () => {
      setWinModalVisible(false);
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
      board.resizeBoard();
      setTimeout(() => board.resizeBoard(), 120);
      setTimeout(() => board.resizeBoard(), 420);
    };
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 250));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleResize();
    });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => board.resizeBoard());
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
    el.stuckHelpLabel = document.getElementById('stuckHelpLabel');
    el.stuckUndoLabel = document.getElementById('stuckUndoLabel');
    el.stuckHelpBadge = document.getElementById('stuckHelpBadge');
    el.stuckUndoBadge = document.getElementById('stuckUndoBadge');
    el.adBanner = document.getElementById('adBanner');
    el.adOverlay = document.getElementById('adOverlay');

    board.initBoardRenderer({ canvas: el.canvas, wrapper: el.boardWrapper, getState: () => state });

    Store.load();
    Store.refreshDaily();
    bindInputs();
    setBannerVisible(false);

    // 廣告播放器（由 adService 控制）一打開就收起卡關底欄，避免疊層
    if (el.adOverlay && window.MutationObserver) {
      new MutationObserver(() => {
        if (!el.adOverlay.classList.contains('hidden')) hideStuck();
      }).observe(el.adOverlay, { attributes: true, attributeFilter: ['class'] });
    }

    const startIndex = Math.max(0, Math.min(LEVELS.length - 1, (Store.data.lastLevel || 1) - 1));
    const unlockedIndex = Math.max(0, Math.min(LEVELS.length - 1, Store.data.unlocked - 1));
    parseLevel(Math.min(startIndex, unlockedIndex));

    Promise.resolve(window.DSAds.init()).then(
      () => {
        const native = window.DSAds.isNative();
        setBannerVisible(!native);
        setNativeBannerSpace(native);
      },
      () => {
        setBannerVisible(false);
        setNativeBannerSpace(false);
      }
    );

    document.body.setAttribute('tabindex', '-1');
    document.body.focus({ preventScroll: true });
    window.focus();

    const loop = (t) => {
      try {
        board.renderBoard(t);
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
