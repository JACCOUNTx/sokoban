// Ad abstraction: browser mock (default) + Capacitor AdMob bridge.
// Native usage: `npm i @capacitor-community/admob`, add the plugin to the Capacitor shell,
// then this module picks up window.Capacitor.Plugins.AdMob automatically.
window.DSAds = (function () {
  const cfg = window.DS_CONFIG.ads;
  let busy = false;
  let dom = null;
  let nativeBannerShown = false;

  function plugin() {
    const cap = window.Capacitor;
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins.AdMob) return cap.Plugins.AdMob;
    if (typeof cap.registerPlugin === 'function') {
      try {
        return cap.registerPlugin('AdMob');
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function platform() {
    const cap = window.Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      const p = cap.getPlatform();
      if (p === 'ios' || p === 'android') return p;
    }
    return 'android';
  }

  function unitId(kind) {
    const mode = cfg.useTestAds ? 'test' : 'prod';
    const set = cfg.admob[mode] || cfg.admob.test;
    const units = set[platform()] || cfg.admob.test[platform()];
    return units[kind];
  }

  function useNative() {
    return cfg.provider !== 'mock' && !!plugin();
  }

  function ensureDom() {
    if (dom) return dom;
    dom = {
      overlay: document.getElementById('adOverlay'),
      title: document.getElementById('adTitle'),
      timer: document.getElementById('adTimer'),
      progress: document.getElementById('adProgress'),
      close: document.getElementById('adClose'),
      visual: document.getElementById('adVisual'),
      banner: document.getElementById('adBanner'),
      bannerInner: document.getElementById('adBannerInner'),
    };
    if (dom.close) {
      dom.close.addEventListener('click', () => {
        if (dom.overlay && dom.overlay.classList.contains('is-mock') && dom._resolve) {
          const resolve = dom._resolve;
          const earned = !!dom._rewardReady;
          dom._resolve = null;
          dom._rewardReady = false;
          dom.overlay.classList.add('hidden');
          dom.overlay.classList.remove('is-mock');
          resolve(earned);
        }
      });
    }
    return dom;
  }

  function mockPlay(kind, seconds) {
    const ui = ensureDom();
    return new Promise((resolve) => {
      const total = Math.max(1, seconds);
      const start = Date.now();
      const rewardLabel = kind === 'rewarded' ? '獲得獎勵' : '繼續遊戲';
      ui.overlay.classList.remove('hidden');
      ui.overlay.classList.add('is-mock');
      ui.title.textContent = kind === 'rewarded' ? '獎勵廣告（模擬）' : '插頁廣告（模擬）';
      ui.visual.textContent = kind === 'rewarded' ? '🎬' : '📺';
      ui.close.disabled = true;
      ui.close.textContent = '播放中…';
      ui.progress.style.width = '0%';
      dom._resolve = resolve;
      dom._rewardReady = false;
      const tick = () => {
        const elapsed = (Date.now() - start) / 1000;
        const left = Math.max(0, Math.ceil(total - elapsed));
        ui.timer.textContent = `${left}s`;
        ui.progress.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
        if (elapsed < total) {
          requestAnimationFrame(tick);
          return;
        }
        ui.timer.textContent = '✓';
        ui.progress.style.width = '100%';
        ui.close.disabled = false;
        ui.close.textContent = rewardLabel;
        dom._rewardReady = true;
        setTimeout(() => {
          if (!dom._resolve) return;
          const done = dom._resolve;
          dom._resolve = null;
          dom._rewardReady = false;
          ui.overlay.classList.add('hidden');
          ui.overlay.classList.remove('is-mock');
          done(true);
        }, 420);
      };
      requestAnimationFrame(tick);
    });
  }

  async function nativeRewarded() {
    const p = plugin();
    let earned = false;
    const listeners = [];
    try {
      listeners.push(
        await p.addListener('onRewardedVideoAdReward', () => {
          earned = true;
        })
      );
      await p.prepareRewardVideoAd({ adId: unitId('rewarded'), isTesting: cfg.useTestAds });
      await p.showRewardVideoAd();
    } catch (err) {
      console.warn('rewarded ad failed', err);
      earned = false;
    } finally {
      for (const l of listeners) {
        try {
          await l.remove();
        } catch (err) {
          /* ignore */
        }
      }
    }
    return earned;
  }

  async function nativeInterstitial() {
    const p = plugin();
    try {
      await p.prepareInterstitial({ adId: unitId('interstitial'), isTesting: cfg.useTestAds });
      await p.showInterstitial();
      return true;
    } catch (err) {
      console.warn('interstitial failed', err);
      return false;
    }
  }

  async function init() {
    const ui = ensureDom();
    if (useNative()) {
      const p = plugin();
      try {
        await p.initialize({ initializeForTesting: cfg.useTestAds });
      } catch (err) {
        console.warn('AdMob initialize failed', err);
      }
      if (ui.banner) ui.banner.classList.add('hidden');
      showBanner();
    } else if (ui.bannerInner) {
      ui.bannerInner.textContent = cfg.mock.bannerText;
      ui.banner.classList.remove('hidden');
    }
  }

  async function showBanner() {
    const ui = ensureDom();
    if (!useNative()) {
      if (ui.banner) ui.banner.classList.remove('hidden');
      return;
    }
    if (nativeBannerShown) return;
    const p = plugin();
    try {
      await p.showBanner({
        adId: unitId('banner'),
        position: 'BOTTOM_CENTER',
        adSize: 'BANNER',
        margin: 0,
        isTesting: cfg.useTestAds,
      });
      nativeBannerShown = true;
      if (ui.banner) ui.banner.classList.add('hidden');
    } catch (err) {
      console.warn('banner failed', err);
    }
  }

  async function hideBanner() {
    const ui = ensureDom();
    if (useNative() && nativeBannerShown) {
      try {
        await plugin().hideBanner();
      } catch (err) {
        /* ignore */
      }
      nativeBannerShown = false;
    }
    if (ui.banner) ui.banner.classList.add('hidden');
  }

  async function showRewarded() {
    if (busy) return false;
    busy = true;
    try {
      if (useNative()) return await nativeRewarded();
      return await mockPlay('rewarded', cfg.mock.rewardedSeconds);
    } finally {
      busy = false;
    }
  }

  async function showInterstitial() {
    if (busy) return false;
    busy = true;
    try {
      if (useNative()) return await nativeInterstitial();
      return await mockPlay('interstitial', cfg.mock.interstitialSeconds);
    } finally {
      busy = false;
    }
  }

  return {
    init,
    showRewarded,
    showInterstitial,
    showBanner,
    hideBanner,
    isNative: useNative,
    isBusy: () => busy,
  };
})();
