// Central tuning + ad configuration. Replace the test unit IDs with production ones before release.
window.DS_CONFIG = {
  storageKey: 'dragon-sokoban-v1',
  dailyFree: { help: 1, autoUndo: 1 },
  interstitial: {
    minLevelNumber: 4,      // never on levels 1-3
    everyNLevels: 2,
    cooldownMs: 45000,
  },
  stuck: {
    resetThreshold: 2,
    moveFactor: 1.8,
  },
  scoring: {
    starRatios: { three: 1.15, two: 1.6 },
    coins: { three: 10, two: 6, one: 3, skip: 2 },
  },
  ads: {
    // 'auto' uses Capacitor AdMob when available, otherwise the browser mock.
    provider: 'auto',
    mock: {
      rewardedSeconds: 4,
      interstitialSeconds: 3,
      bannerText: '廣告 · 支持萌寵推龍',
    },
    // Google AdMob official test unit IDs. Swap before shipping.
    admob: {
      android: {
        banner: 'ca-app-pub-3940256099942544/6300978111',
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        rewarded: 'ca-app-pub-3940256099942544/5224354917',
      },
      ios: {
        banner: 'ca-app-pub-3940256099942544/2934735716',
        interstitial: 'ca-app-pub-3940256099942544/4411468910',
        rewarded: 'ca-app-pub-3940256099942544/1712486757',
      },
    },
  },
};
