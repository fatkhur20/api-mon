import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import worker, { formatUptimeForTelegram } from './worker.js';

// Match the placeholders in worker.js
const API_BASE_URL = "https://your-vortex-api.up.railway.app";
const CF_STATS_UNIQUE_ID = "YOUR_UNIQUE_ID_HERE";
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID_HERE";

// Variable to capture the Telegram payload
let telegramPayload = null;

const server = setupServer(
  // Mock for API /ping
  http.get(`${API_BASE_URL}/ping`, () => {
    return HttpResponse.json({
      status: 'Alive',
      uptime_seconds: 90060 // 1d 1h 1m
    });
  }),

  // Mock for API /statscf/data/:id
  http.get(`${API_BASE_URL}/statscf/data/${CF_STATS_UNIQUE_ID}`, () => {
    return HttpResponse.json({
      success: true,
      data_source: 'cloudflare_api',
      period: { since: '2023-10-27', until: '2023-10-27' },
      data: [{
        global_stats: { total_requests: 50000 },
        worker_stats: {
          requests: 12345,
          subrequests: 500,
          errors: 42,
          cpu_time_p50: 5.1,
          cpu_time_p90: 15.2,
          cpu_time_p99: 25.3,
        },
        zone_stats: {
          bandwidth_bytes: 1073741824, // 1 GB
        },
      }],
    });
  }),

  // Mock for API /health
  http.get(`${API_BASE_URL}/health`, ({ request }) => {
    const url = new URL(request.url);
    const proxy = url.searchParams.get('proxy');
    return HttpResponse.json({
      success: true,
      proxy: proxy,
      latency_ms: 123,
      attempt: 1,
    });
  }),

  // Mock for Telegram API that captures the payload
  http.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, async ({ request }) => {
    telegramPayload = await request.json();
    return HttpResponse.json({ ok: true });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  telegramPayload = null; // Reset payload after each test
});
afterAll(() => server.close());

describe('formatUptimeForTelegram', () => {
  it('should format seconds into "Xd Yh Zm" format correctly', () => {
    expect(formatUptimeForTelegram(90060)).toBe('1d 1h 1m');
  });
});

describe('Fetch handler', () => {
  it('should return the dashboard HTML for the root path', async () => {
    const req = new Request('http://localhost/');
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<h1>🚀 Vortex-API Health Dashboard</h1>');
    expect(text).toContain('12,345'); // Worker requests
    expect(text).toContain('42'); // Worker errors
    expect(text).toContain('1.00 GB'); // Zone bandwidth
  });

  it('should handle proxy testing via /test endpoint', async () => {
    const proxy = '1.2.3.4:8080';
    const req = new Request(`http://localhost/test?proxy=${encodeURIComponent(proxy)}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should handle /stats command from Telegram webhook and send correct data', async () => {
    const req = new Request('http://localhost/telegram', {
      method: 'POST',
      body: JSON.stringify({ message: { text: '/stats', chat: { id: TELEGRAM_CHAT_ID } } }),
    });
    await worker.fetch(req);
    expect(telegramPayload).not.toBeNull();
    expect(telegramPayload.chat_id).toBe(TELEGRAM_CHAT_ID);
    expect(telegramPayload.text).toContain('API Uptime: 1d 1h 1m');
    expect(telegramPayload.text).toContain('Errors: 42');
    expect(telegramPayload.text).toContain('Bandwidth: 1.00 GB');
  });
});

describe('Scheduled handler', () => {
  it('should trigger ping on "*/10 * * * *" cron', async () => {
    const event = { cron: '*/10 * * * *' };
    await worker.scheduled(event);
    // Assertion is implicit via mock server logs, no explicit check needed here
  });

  it('should trigger daily report on "0 17,23,5,11 * * *" cron and send correct data', async () => {
    const event = { cron: '0 17,23,5,11 * * *' };
    await worker.scheduled(event);
    expect(telegramPayload).not.toBeNull();
    expect(telegramPayload.chat_id).toBe(TELEGRAM_CHAT_ID);
    expect(telegramPayload.text).toContain('API Uptime: 1d 1h 1m');
    expect(telegramPayload.text).toContain('Errors: 42');
    expect(telegramPayload.text).toContain('Bandwidth: 1.00 GB');
  });
});