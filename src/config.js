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
    // USE_TEST_ADS: true → Google 官方測試單元；false → 正式單元（admob.prod）
    // 需與 android/app/build.gradle 的 USE_TEST_ADS 保持一致（AndroidManifest 的 app id）
    useTestAds: true,
    mock: {
      rewardedSeconds: 4,
      interstitialSeconds: 3,
      bannerText: '廣告 · 支持萌寵推龍',
    },
    admob: {
      // 正式單元（USE_TEST_ADS = false）
      prod: {
        android: {
          banner: 'ca-app-pub-1948382835033139/4119177474',
          interstitial: 'ca-app-pub-1948382835033139/2623417920',
          rewarded: 'ca-app-pub-1948382835033139/5958872754',
        },
        // iOS 正式 ID 未提供，暫沿用 Google 測試單元，上架前替換
        ios: {
          banner: 'ca-app-pub-3940256099942544/2934735716',
          interstitial: 'ca-app-pub-3940256099942544/4411468910',
          rewarded: 'ca-app-pub-3940256099942544/1712486757',
        },
      },
      // Google AdMob 官方測試單元（USE_TEST_ADS = true）
      test: {
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
  },
};
