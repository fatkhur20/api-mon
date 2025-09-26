// worker.js — versi FINAL: cron terpisah + ping 10 menit + laporan 4x sehari WIB + status dari /ping + uptime format Xd Yh Zm

const RAILWAY_BASE = "https://badakterbangx-api.up.railway.app"; // ✅ WAJIB https://
const TELEGRAM_BOT_TOKEN = "7872111732:AAEfGshwnMYPeF3H2-0mvuEyiuTipgiKCxg";      // 👈 GANTI
const TELEGRAM_CHAT_ID = "5361605327";                   // 👈 GANTI

export default {
  // 👇 Handle HTTP: dashboard + Telegram webhook
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ✅ Handle Telegram Webhook (untuk /stats command)
    if (url.pathname === "/telegram" && request.method === "POST") {
      const update = await request.json();
      if (update.message?.text === "/stats") {
        await handleStatsCommand(update.message.chat.id);
      }
      return new Response("OK", { status: 200 });
    }

    // 👇 Endpoint test proxy (dipanggil dari form dashboard)
    if (url.pathname === "/test" && url.searchParams.has("proxy")) {
      const proxy = url.searchParams.get("proxy");
      const healthData = await fetchHealth(proxy);
      return new Response(JSON.stringify(healthData, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 👇 Tampilkan dashboard
    const stats = await fetchStats();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🚀 Proxy Health Dashboard</title>
  <style>
    :root { --bg: #ffffff; --text: #2c3e50; --card: #f8f9fa; --shadow: rgba(0,0,0,0.1); }
    .dark { --bg: #121212; --text: #f5f5f5; --card: #1e1e1e; --shadow: rgba(0,0,0,0.3); }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: var(--bg); color: var(--text); transition: background 0.3s; }
    .container { max-width: 700px; margin: 20px auto; padding: 30px; background: var(--card); border-radius: 16px; box-shadow: 0 8px 20px var(--shadow); }
    h1 { text-align: center; margin-bottom: 30px; color: var(--text); }
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat { background: var(--bg); padding: 24px; border-radius: 12px; text-align: center; box-shadow: 0 4px 8px var(--shadow); transition: transform 0.2s; }
    .stat:hover { transform: translateY(-4px); }
    .stat-value { font-size: 28px; font-weight: bold; color: #007bff; }
    .status-dot { display: inline-block; width: 16px; height: 16px; border-radius: 50%; background: #dc3545; }
    .status-dot.up { background: #28a745; }
    form { text-align: center; margin: 30px 0; }
    input { padding: 14px; width: 300px; border: 2px solid #ddd; border-radius: 12px; font-size: 16px; background: var(--bg); color: var(--text); }
    .dark input { border-color: #444; }
    button { padding: 14px 28px; background: #28a745; color: white; border: none; border-radius: 12px; font-size: 16px; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #218838; }
    #result { margin-top: 24px; padding: 24px; background: var(--bg); border-radius: 12px; display: none; font-family: monospace; white-space: pre-wrap; border: 1px solid #ddd; }
    .dark #result { border-color: #444; }
    .success { color: #28a745; }
    .error { color: #dc3545; }
    .footer { text-align: center; margin-top: 40px; font-size: 14px; color: var(--text); }
    #themeToggle { position: fixed; top: 20px; right: 20px; background: var(--card); border: none; border-radius: 50%; width: 50px; height: 50px; font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px var(--shadow); }
  </style>
</head>
<body>
  <button id="themeToggle">🌙</button>
  <div class="container">
    <h1>🚀 Proxy Health Checker</h1>

    <div class="stats">
      <div class="stat">
        <div>Total Requests</div>
        <div class="stat-value">${stats.total_requests?.toLocaleString() || 0}</div>
      </div>
      <div class="stat">
        <div>Success Rate</div>
        <div class="stat-value">${stats.success_rate_percent || 0}%</div>
      </div>
      <div class="stat">
        <div>Uptime</div>
        <div class="stat-value" id="uptime-counter">00:00:00:00</div>
      </div>
      <div class="stat">
        <div>Status</div>
        <div class="stat-value">
          <span class="status-dot ${stats.service !== "Offline" ? "up" : ""}"></span>
        </div>
      </div>
    </div>

    <form id="testForm">
      <input type="text" id="proxyInput" placeholder="Contoh: 1.1.1.1:80" required>
      <button type="submit">CHECK PROXY</button>
    </form>

    <div id="result"></div>

    <div class="footer">
      Cron terakhir: <span id="lastCron">belum ada</span>
    </div>
  </div>

  <script>
    // Dark Mode Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (localStorage.getItem('dark') === 'true') {
      document.body.classList.add('dark');
      themeToggle.textContent = '☀️';
    }
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('dark', isDark);
      themeToggle.textContent = isDark ? '☀️' : '🌙';
    });

    // Uptime Counter
    const serverUptimeSeconds = ${stats.uptime_seconds || 0};
    function formatUptime(totalSeconds) {
      const days = Math.floor(totalSeconds / (24 * 3600));
      const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [
        days.toString().padStart(2, '0'),
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        seconds.toString().padStart(2, '0')
      ].join(':');
    }
    let currentUptime = serverUptimeSeconds;
    const uptimeElement = document.getElementById('uptime-counter');
    uptimeElement.textContent = formatUptime(currentUptime);
    setInterval(() => {
      currentUptime++;
      uptimeElement.textContent = formatUptime(currentUptime);
    }, 1000);

    // Test Proxy Form
    const form = document.getElementById('testForm');
    const proxyInput = document.getElementById('proxyInput');
    const resultDiv = document.getElementById('result');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const proxy = proxyInput.value.trim();
      if (!proxy) return;
      resultDiv.innerHTML = '⏳ Testing...';
      resultDiv.style.display = 'block';
      try {
        const res = await fetch('/test?proxy=' + encodeURIComponent(proxy));
        const data = await res.json();
        if (data.success) {
          resultDiv.innerHTML = \`✅ <span class="success">UP</span>\\nProxy: \${data.proxy}\\nLatency: \${data.latency_ms}ms\\nAttempt: \${data.attempt}\`;
        } else {
          resultDiv.innerHTML = \`❌ <span class="error">DOWN</span>\\nProxy: \${data.proxy}\\nError: \${data.error}\\nAttempt: \${data.attempt}\`;
        }
      } catch (error) {
        resultDiv.innerHTML = '❌ <span class="error">Request failed</span>';
      }
    });

    // Auto refresh (diam-diam, tanpa ditampilkan ke user)
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },

  // 👇 Cron Trigger: handle multiple cron jobs
  async scheduled(event, env, ctx) {
    console.log(`[CRON] Triggered: ${event.cron} at ${new Date().toISOString()}`);

    if (event.cron === "*/10 * * * *") {
      // ✅ Ping Railway tiap 10 menit
      await pingRailway();
    } else if (event.cron === "0 17,23,5,11 * * *") {
      // ✅ Kirim laporan 4x sehari (00, 06, 12, 18 WIB)
      await sendDailyReport();
    }
  },
};

// ✅ Fungsi: format uptime untuk Telegram → "Xd Yh Zm"
export function formatUptimeForTelegram(totalSeconds) {
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

// ✅ Fungsi: ping Railway tiap 10 menit — pakai /ping (ringan)
async function pingRailway() {
  try {
    const now = new Date();
    const response = await fetch(`${RAILWAY_BASE}/ping`);
    if (response.ok) {
      console.log(`✅ [PING] Railway tetap hidup via /ping - ${now.toISOString()}`);
    } else {
      console.warn(`⚠️ [PING] Railway merespons tapi tidak OK: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ [PING] Gagal ping Railway:", error.message);
  }
}

// ✅ Fungsi: kirim laporan otomatis 4x sehari — uptime format Xd Yh Zm
async function sendDailyReport() {
  try {
    const stats = await fetchStats();
    const now = new Date();
    const wibTime = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    let statusEmoji = "🔴";
    if (stats.service !== "Offline") statusEmoji = "🟢";

    const message = `
📊 *LAPORAN PROXY HEALTH (WIB)*
⏰ Waktu: ${wibTime}
${statusEmoji} Status: ${stats.service}
⏳ Uptime: ${formatUptimeForTelegram(stats.uptime_seconds)}
📈 Total Request: ${stats.total_requests?.toLocaleString()}
✅ Success Rate: ${stats.success_rate_percent}%
⏱️ Trigger UTC: ${now.toISOString()}

_Dikirim otomatis oleh Cloudflare Worker_
    `.trim();

    // ✅ PERBAIKAN KRITIS — hapus spasi setelah /bot
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const tgRes = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (tgRes.ok) {
      console.log("✅ [REPORT] Laporan dikirim ke Telegram - " + now.toISOString());
    } else {
      console.warn("⚠️ [REPORT] Gagal kirim laporan:", await tgRes.text());
    }
  } catch (error) {
    console.error("❌ [REPORT] Error kirim laporan:", error.message);
  }
}

// ✅ Fungsi: handle /stats command dari Telegram — uptime format Xd Yh Zm
async function handleStatsCommand(chatId) {
  try {
    const stats = await fetchStats();
    const now = new Date();
    const wibTime = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    let statusEmoji = "🔴";
    if (stats.service !== "Offline") statusEmoji = "🟢";

    const message = `
🤖 *STATS MANUAL REQUEST*
📅 Requested at: ${wibTime}
${statusEmoji} Status: ${stats.service}
⏳ Uptime: ${formatUptimeForTelegram(stats.uptime_seconds)}
📈 Total Request: ${stats.total_requests?.toLocaleString()}
✅ Success Rate: ${stats.success_rate_percent}%

_Manual request via /stats_
    `.trim();

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (error) {
    console.error("❌ Gagal kirim stats ke Telegram:", error.message);
  }
}

// ✅ Fungsi utama: gabung data dari /ping (status) + /stats (angka)
async function fetchStats() {
  try {
    // Ambil status dari /ping — lebih ringan & akurat
    const pingRes = await fetch(`${RAILWAY_BASE}/ping`);
    const pingData = pingRes.ok ? await pingRes.json() : null;

    // Ambil statistik angka dari /stats
    const statsRes = await fetch(`${RAILWAY_BASE}/stats`);
    const statsData = statsRes.ok ? await statsRes.json() : {};

    // Gabungkan: status dari /ping, statistik dari /stats
    return {
      service: pingData?.status === 'Alive' ? 'Online' : 'Offline',
      uptime_seconds: statsData.uptime_seconds || 0,
      total_requests: statsData.total_requests || 0,
      success_rate_percent: statsData.success_rate_percent || 0,
    };
  } catch (e) {
    console.error("Gagal ambil stats:", e.message);
    return { service: "Offline", uptime_seconds: 0, total_requests: 0, success_rate_percent: 0 };
  }
}

// ✅ Fungsi bantu: test proxy
async function fetchHealth(proxy) {
  try {
    const res = await fetch(`${RAILWAY_BASE}/health?proxy=${encodeURIComponent(proxy)}&retries=2`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Gagal test proxy:", e.message);
  }
  return { success: false, error: "Network error", proxy: proxy, attempt: 1 };
}
