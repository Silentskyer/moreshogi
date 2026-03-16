# WebShogi

瀏覽器版日式將棋，支援單機、AI 與線上對戰（Ably）。

## 功能
- 完整將棋規則與升變
- AI 對弈（深度可選）
- 線上對戰：房間制、同步狀態
- 視角切換（自動 / 先手 / 後手）

## 本地執行
建議使用簡單的靜態伺服器來開啟 `public/` 目錄：

```bash
# 其一：Python
python -m http.server 5173

# 其二：Node (若有)
npx serve public -p 5173
```

開啟瀏覽器：
```
http://localhost:5173/public/
```

## 線上對戰（Ably）
- 需要設定 `ABLY_API_KEY`
- `api/ably-auth.js` 會向 Ably 取得 token

## 部署到 Vercel
- 靜態資源放在 `public/`
- `/api/ably-auth` 為 Serverless Function

## 備註
- Vercel 不支援常駐 WebSocket，線上模式透過 Ably 完成同步