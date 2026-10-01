# 五人十三支 Online

朋友只要打開網址就能玩,不需要任何帳號。零依賴(只用 Node 內建模組)。

## 檔案
- `server.js`:伺服器(提供頁面 + 即時房間資料,用 SSE 推送)
- `public/index.html`:遊戲頁面(所有規則都在這裡)
- `render.yaml`:Render 部署設定(可選)

## 本機測試
```
node server.js
```
瀏覽器開 http://localhost:3000 ,用兩個分頁/手機當不同玩家。

## 部署到 GitHub + Render
1. GitHub 新增 repository,把這個資料夾的所有檔案上傳(保持 `public/` 資料夾結構)。
2. Render:New → Web Service → 連結該 repository。
   - Runtime:Node
   - Build Command:留空或填 `echo ok`
   - Start Command:`node server.js`
   - Instance Type:Free
3. 部署完成後把 Render 給你的網址(`https://xxx.onrender.com`)傳給朋友。

## 注意
- Render 免費方案閒置約 15 分鐘會休眠,第一次連線要等 30~60 秒。
- 房間資料存在伺服器記憶體:重新部署或休眠重啟後,進行中的房間會消失(8 小時沒動靜也會自動清除)。
- 房主要保持頁面開啟(發牌與結算由房主頁面負責)。
- 目前沒有防作弊:每個人的手牌存在同一份房間資料中,懂技術者可從瀏覽器工具看到。

## 邀請連結
房主進入等待室後,按「💬 傳到 LINE」或「📤 分享 / 複製」,朋友點連結(`https://你的網址/?room=ABCD`)輸入暱稱即可加入;曾經輸入過暱稱的朋友會直接進房。
