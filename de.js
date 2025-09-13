// decodeToken.js
// 用法: node decodeToken.js "auth_token=xxxxx; Path=/; HttpOnly; Expires=... "

import querystring from 'querystring'

function extractToken(cookieString) {
  // 先抓出 auth_token=xxxx
  const match = cookieString.match(/auth_token=([^;]+)/);
  if (!match) {
    console.error("❌ 找不到 auth_token");
    process.exit(1);
  }

  // URL decode
  let decoded = querystring.unescape(match[1]);

  // 去掉前面的 "s:" (如果有)
  if (decoded.startsWith("s:")) {
    decoded = decoded.slice(2);
  }

  // 如果多於 3 段，僅保留前 3 段 (JWT 應該是 header.payload.signature)
  const parts = decoded.split('.');
  if (parts.length > 3) {
    decoded = parts.slice(0, 3).join('.');
  }

  return decoded;
}

// 從命令列參數讀 cookie
const cookieInput = process.argv[2];
if (!cookieInput) {
  console.error("⚠️ 請輸入 cookie，例如：\nnode decodeToken.js \"auth_token=xxx; Path=/; HttpOnly\"");
  process.exit(1);
}

const token = extractToken(cookieInput);
console.log("✅ 乾淨的 JWT：\n" + token);
