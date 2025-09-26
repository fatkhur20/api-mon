// worker.js — Integrated with Vortex-API backend

const API_BASE_URL = "https://your-vortex-api.up.railway.app"; // 👈 GANTI DENGAN URL API ANDA
const CF_STATS_UNIQUE_ID = "YOUR_UNIQUE_ID_HERE"; // 👈 GANTI DENGAN ID UNIK ANDA
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE"; // 👈 GANTI
const TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID_HERE"; // 👈 GANTI

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
    const workerStats = stats.worker_stats || {};
    const zoneStats = stats.zone_stats || {};

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🚀 Vortex-API Health Dashboard</title>
  <style>
    :root { --bg: #ffffff; --text: #2c3e50; --card: #f8f9fa; --shadow: rgba(0,0,0,0.1); --error-text: #dc3545; }
    .dark { --bg: #121212; --text: #f5f5f5; --card: #1e1e1e; --shadow: rgba(0,0,0,0.3); --error-text: #ff8a80; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: var(--bg); color: var(--text); transition: background 0.3s; }
    .container { max-width: 800px; margin: 20px auto; padding: 30px; background: var(--card); border-radius: 16px; box-shadow: 0 8px 20px var(--shadow); }
    h1 { text-align: center; margin-bottom: 30px; color: var(--text); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat { background: var(--bg); padding: 24px; border-radius: 12px; text-align: center; box-shadow: 0 4px 8px var(--shadow); transition: transform 0.2s; }
    .stat:hover { transform: translateY(-4px); }
    .stat-title { font-size: 16px; color: var(--text); opacity: 0.8; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #007bff; }
    .stat-value.error { color: var(--error-text); }
    .status-dot { display: inline-block; width: 16px; height: 16px; border-radius: 50%; background: #dc3545; vertical-align: middle; margin-left: 8px; }
    .status-dot.up { background: #28a745; }
    form { text-align: center; margin: 30px 0; }
    input { padding: 14px; width: 300px; border: 2px solid #ddd; border-radius: 12px; font-size: 16px; background: var(--bg); color: var(--text); }
    .dark input { border-color: #444; }
    button { padding: 14px 28px; background: #28a745; color: white; border: none; border-radius: 12px; font-size: 16px; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #218838; }
    #result { margin-top: 24px; padding: 24px; background: var(--bg); border-radius: 12px; display: none; font-family: monospace; white-space: pre-wrap; border: 1px solid #ddd; }
    .dark #result { border-color: #444; }
    .success { color: #28a745; }
    .footer { text-align: center; margin-top: 40px; font-size: 14px; color: var(--text); }
    #themeToggle { position: fixed; top: 20px; right: 20px; background: var(--card); border: none; border-radius: 50%; width: 50px; height: 50px; font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px var(--shadow); }
  </style>
</head>
<body>
  <button id="themeToggle">🌙</button>
  <div class="container">
    <h1>🚀 Vortex-API Health Dashboard</h1>

    <div class="stats-grid">
      <div class="stat">
        <div class="stat-title">API Status</div>
        <div class="stat-value">${stats.service}<span class="status-dot ${stats.service === "Online" ? "up" : ""}"></span></div>
      </div>
      <div class="stat">
        <div class="stat-title">API Uptime</div>
        <div class="stat-value" id="uptime-counter">0d 0h 0m</div>
      </div>
       <div class="stat">
        <div class="stat-title">Worker Requests</div>
        <div class="stat-value">${workerStats.requests?.toLocaleString() || 'N/A'}</div>
      </div>
      <div class="stat">
        <div class="stat-title">Worker Errors</div>
        <div class="stat-value error">${workerStats.errors?.toLocaleString() || 'N/A'}</div>
      </div>
      <div class="stat">
        <div class="stat-title">CPU Time (p90)</div>
        <div class="stat-value">${workerStats.cpu_time_p90?.toFixed(2) || 'N/A'} ms</div>
      </div>
      <div class="stat">
        <div class="stat-title">Zone Bandwidth (Today)</div>
        <div class="stat-value">${formatBytes(zoneStats.bandwidth_bytes)}</div>
      </div>
    </div>

    <form id="testForm">
      <input type="text" id="proxyInput" placeholder="Contoh: 1.1.1.1:80" required>
      <button type="submit">CHECK PROXY</button>
    </form>

    <div id="result"></div>

    <div class="footer">
      Data provided by Vortex-API. Auto-refresh in 30s.
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
        return \`\${days}d \${hours}h \${minutes}m\`;
    }
    let currentUptime = serverUptimeSeconds;
    const uptimeElement = document.getElementById('uptime-counter');
    if (uptimeElement) {
        uptimeElement.textContent = formatUptime(currentUptime);
        setInterval(() => {
            currentUptime += 60; // Increment by a minute
            uptimeElement.textContent = formatUptime(currentUptime);
        }, 60000); // Update every minute
    }

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

    // Auto refresh
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
      // ✅ Ping API tiap 10 menit
      await pingApi();
    } else if (event.cron === "0 17,23,5,11 * * *") {
      // ✅ Kirim laporan 4x sehari (00, 06, 12, 18 WIB)
      await sendDailyReport();
    }
  },
};

// ✅ Fungsi: format bytes
function formatBytes(bytes, decimals = 2) {
    if (!+bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(dm)} ${sizes[i]}`;
}

// ✅ Fungsi: format uptime untuk Telegram → "Xd Yh Zm"
export function formatUptimeForTelegram(totalSeconds) {
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

// ✅ Fungsi: ping API tiap 10 menit — pakai /ping (ringan)
async function pingApi() {
  try {
    const now = new Date();
    const response = await fetch(`${API_BASE_URL}/ping`);
    if (response.ok) {
      console.log(`✅ [PING] API tetap hidup via /ping - ${now.toISOString()}`);
    } else {
      console.warn(`⚠️ [PING] API merespons tapi tidak OK: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ [PING] Gagal ping API:", error.message);
  }
}

// ✅ Fungsi: kirim laporan otomatis 4x sehari
async function sendDailyReport() {
  try {
    const stats = await fetchStats();
    const now = new Date();
    const wibTime = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const statusEmoji = stats.service === "Online" ? "🟢" : "🔴";
    const workerStats = stats.worker_stats || {};
    const zoneStats = stats.zone_stats || {};

    const workerPart = workerStats.requests !== undefined ? `
*Worker Stats*
- Invokes: ${workerStats.requests?.toLocaleString() || 'N/A'}
- Errors: ${workerStats.errors?.toLocaleString() || 'N/A'}
- CPU p90: ${workerStats.cpu_time_p90?.toFixed(2) || 'N/A'} ms
` : '';

    const zonePart = zoneStats.bandwidth_bytes !== undefined ? `
*Zone Stats*
- Bandwidth: ${formatBytes(zoneStats.bandwidth_bytes)}
` : '';

    const message = `
📊 *Vortex-API Daily Report (WIB)*
⏰ Waktu: ${wibTime}
${statusEmoji} API Status: *${stats.service}*
⏳ API Uptime: ${formatUptimeForTelegram(stats.uptime_seconds)}
${workerPart}
${zonePart}
_Laporan otomatis via Cloudflare Worker_
    `.trim().replace(/\n\n+/g, '\n');

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
      const errorText = await tgRes.text();
      console.warn(`⚠️ [REPORT] Gagal kirim laporan: ${errorText}`);
    }
  } catch (error) {
    console.error("❌ [REPORT] Error kirim laporan:", error.message);
  }
}

// ✅ Fungsi: handle /stats command dari Telegram
async function handleStatsCommand(chatId) {
  try {
    const stats = await fetchStats();
    const now = new Date();
    const wibTime = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const statusEmoji = stats.service === "Online" ? "🟢" : "🔴";
    const workerStats = stats.worker_stats || {};
    const zoneStats = stats.zone_stats || {};

    const workerPart = workerStats.requests !== undefined ? `
*Worker Stats*
- Invokes: ${workerStats.requests?.toLocaleString() || 'N/A'}
- Subrequests: ${workerStats.subrequests?.toLocaleString() || 'N/A'}
- Errors: ${workerStats.errors?.toLocaleString() || 'N/A'}
- CPU p50: ${workerStats.cpu_time_p50?.toFixed(2) || 'N/A'} ms
- CPU p90: ${workerStats.cpu_time_p90?.toFixed(2) || 'N/A'} ms
- CPU p99: ${workerStats.cpu_time_p99?.toFixed(2) || 'N/A'} ms
` : '';

    const zonePart = zoneStats.bandwidth_bytes !== undefined ? `
*Zone Stats*
- Bandwidth: ${formatBytes(zoneStats.bandwidth_bytes)}
` : '';

    const message = `
🤖 *Manual Stats Request (WIB)*
📅 Waktu: ${wibTime}
${statusEmoji} API Status: *${stats.service}*
⏳ API Uptime: ${formatUptimeForTelegram(stats.uptime_seconds)}
${workerPart}
${zonePart}
_Request manual via /stats_
    `.trim().replace(/\n\n+/g, '\n');

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

// ✅ Fungsi utama: Ambil statistik dari backend Vortex-API
async function fetchStats() {
  try {
    // 1. Cek status layanan dengan endpoint /ping
    const pingRes = await fetch(`${API_BASE_URL}/ping`);
    if (!pingRes.ok) {
      // Jika ping gagal, anggap layanan offline
      return { service: "Offline", uptime_seconds: 0, worker_stats: null, zone_stats: null };
    }
    const pingData = await pingRes.json();

    // 2. Ambil statistik detail dari endpoint /statscf
    const statsRes = await fetch(`${API_BASE_URL}/statscf/data/${CF_STATS_UNIQUE_ID}`);
    if (!statsRes.ok) {
      // Jika stats gagal tapi ping berhasil, layanan online tapi ada masalah data
      return { service: "Online (Data Error)", uptime_seconds: pingData.uptime_seconds || 0, worker_stats: null, zone_stats: null };
    }
    const statsData = await statsRes.json();

    // 3. Ekstrak data yang relevan dari respons API
    const cfData = statsData.success && statsData.data && statsData.data[0] ? statsData.data[0] : {};
    const workerStats = cfData.worker_stats || {};
    const zoneStats = cfData.zone_stats || {};

    // 4. Gabungkan semua data menjadi satu objek
    return {
      service: "Online",
      uptime_seconds: pingData.uptime_seconds || 0,
      worker_stats: workerStats,
      zone_stats: zoneStats,
    };

  } catch (e) {
    console.error("Gagal ambil stats:", e.message);
    // Jika ada error network, anggap layanan offline
    return { service: "Offline", uptime_seconds: 0, worker_stats: null, zone_stats: null };
  }
}

// ✅ Fungsi bantu: test proxy
async function fetchHealth(proxy) {
  try {
    const res = await fetch(`${API_BASE_URL}/health?proxy=${encodeURIComponent(proxy)}&retries=2`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Gagal test proxy:", e.message);
  }
  return { success: false, error: "Network error", proxy: proxy, attempt: 1 };
}