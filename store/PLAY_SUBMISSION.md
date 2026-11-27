# Play Console 上架指引（萌寵推龍 · 倉庫番）

> 送審與帳戶操作必須由你本人喺 Play Console 完成。以下步驟、答案草稿同檢查清單已備妥，照住做即可。
> ⚠️ 本檔案唔可以包含 keystore 密碼；密碼只保存喺你私人備份。

## 0. 前置條件

- [ ] Google Play 開發者帳號（一次性 US$25，需身份驗證）
- [ ] 已簽署 AAB：`android/app/build/outputs/bundle/release/app-release.aab`
- [ ] 上傳金鑰（upload key）：`android/sokoban-release.jks`，alias `sokoban-release`
      SHA-256：`75:B1:D0:EE:53:02:18:59:07:E5:68:0D:E2:08:83:F0:76:1F:96:80:57:CB:34:57:F1:D3:48:98:4E:7B:62:C7`
- [ ] 私隱政策可公開瀏覽：https://sokoban.marllee.com/privacy.html
- [ ] 商店素材：`store/play-store-icon-512.png`、`store/feature-graphic-1024x500.png`、`store/screenshots/*.png`

## 1. 重新建置 AAB（每次改動後）

```powershell
$env:JAVA_HOME='C:\Users\user\jdk21'
cd 'K:\My Drive\ai-system\ai-games\Sokoban'
npm run cap:sync
cd android
.\gradlew bundleRelease
```

驗證簽章：

```powershell
C:\Users\user\jdk21\bin\jarsigner.exe -verify -verbose -certs `
  app\build\outputs\bundle\release\app-release.aab | Select-String 'CN='
```

應該只見到 `CN=Sokoban Release`，唔應該出現 `CN=Android Debug`。

## 2. Play Console 流程

1. **建立應用程式**：Play Console → 所有應用程式 → 建立應用程式
   - 名稱：`萌寵推龍 · 倉庫番`
   - 預設語言：繁體中文（zh-TW）
   - 類型：應用程式 → 遊戲 → 免費
   - 接受開發者計畫政策
2. **設定 → 應用程式完整性**：首次上傳時選擇啟用 **Play App Signing**（建議）；
   我們持有的是 upload key，Google 會保管 app signing key。
3. **測試 → 內部測試**：
   - 建立新版本 → 上傳 `app-release.aab`
   - 版本名稱：`1.0.0 (1)`；發行說明用 `STORE_LISTING.zh-TW.md` 內文案
   - 加入測試人員電郵 → 儲存 → 開始推出
   - 用測試連結安裝，確認：關卡可玩、廣告正常、`隱私政策` 連結可開
4. **商店設定 → 主要商店資訊**：貼上 `STORE_LISTING.zh-TW.md` 內容，上傳圖示、Feature graphic、4 張截圖
5. **政策 → 應用程式內容**，逐項填寫：
   - 私隱權政策：`https://sokoban.marllee.com/privacy.html`
   - 應用程式存取權：所有功能無需登入（無帳號）
   - 廣告：**是，含有廣告**
   - 內容評分：見第 3 節草稿
   - 目標客群：建議 **13 歲以上**（見第 4 節）
   - 新聞應用程式：否
   - 資料安全：見第 5 節草稿
   - 政府應用程式：否
   - 金融功能：否
   - 健康應用程式：否
6. **設定 → 商店設定**：類別「休閒」、聯絡電郵 `info@marlleegroup.com`、外部行銷「否」
7. **發佈 → 正式版**：建立版本 → 上傳同一個 AAB → 版本說明 → 100% 推出 → 送審
8. 審核一般 1–7 個工作天；首次上架通常較久。

## 3. 內容評分問卷草稿（IARC）

| 問題 | 答案 |
|---|---|
| 類別 | 遊戲 → 益智 |
| 暴力／血腥 | 無 |
| 恐怖／驚嚇 | 無 |
| 性／裸露 | 無 |
| 粗言穢語 | 無 |
| 受管制物質（煙酒毒） | 無 |
| 賭博（含模擬賭博） | 無 |
| 使用者互動／分享個人資料 | 無（無聊天、無帳號、無社交功能） |
| 分享位置 | 無 |
| 數位購買 | 無 |
| 廣告 | 有 |

預期結果：適合所有年齡（3+ / Everyone）。

## 4. 目標客群建議

- 建議選 **13 歲以上**（避免 Google Families 政策對兒童導向 App 的額外廣告限制與審核要求）。
- 若你堅持以兒童為目標客群，必須：
  - 於 AdMob 將應用程式標記為兒童導向（child-directed），只可放非個人化廣告；
  - 符合 Families 廣告政策，並確認私隱政策內容一致；
  - 審核時間會明顯較長。

## 5. 資料安全表草稿（Data safety）

| 資料類型 | 收集 | 分享 | 用途 | 來源 |
|---|---|---|---|---|
| 裝置或其他 ID（廣告 ID） | 是 | 是 | 廣告或行銷 | Google AdMob |
| 大約位置（由 IP 推估） | 是 | 是 | 廣告或行銷 | Google AdMob |
| 應用程式活動（廣告互動） | 是 | 是 | 廣告或行銷、分析 | Google AdMob |
| 應用程式資訊與效能（診斷） | 是 | 是 | 分析 | Google AdMob |
| 姓名、電郵、電話、精確位置、檔案、訊息、健康、財務 | 否 | – | – | 遊戲本體不收集 |

- 傳輸中加密：**是**
- 資料刪除請求：**是**（可電郵 `info@marlleegroup.com`；遊戲無帳號資料）
- 必須與 `https://sokoban.marllee.com/privacy.html` 第 3 節描述一致。
- 如日後加入分析 SDK，須同步更新此表。

## 6. 版本遞增（每次重新上傳）

`android/app/build.gradle`：

```gradle
versionCode 2          // 每次上傳 +1，不可重複
versionName "1.0.1"    // 對外顯示版本
```

## 7. 送審前自我檢查

- [ ] AAB 只帶 `CN=Sokoban Release` 簽章（非 debug）
- [ ] `versionCode` 大於 Play 上已存在版本
- [ ] 圖示 512×512、Feature graphic 1024×500（32-bit PNG）
- [ ] 至少 2 張手機截圖（現有 4 張 1080×1920）
- [ ] 私隱政策 URL 可開啟且提及 AdMob
- [ ] 資料安全表與私隱政策一致
- [ ] 廣告聲明為「有」
- [ ] 內部測試已實際安裝並玩過至少一關
- [ ] `android/sokoban-release.jks` 及密碼已離線備份（遺失即無法更新同一 App）
