import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import worker, { formatUptimeForTelegram } from './worker.js';

// Match the placeholders in worker.js
const API_BASE_URL = "https://your-vortex-api.up.railway.app";
const CF_STATS_UNIQUE_ID = "YOUR_UNIQUE_ID_HERE";
const ANOTHER_UNIQUE_ID = "another-unique-id";
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

  // Mock for API /statscf/data/:id (default)
  http.get(`${API_BASE_URL}/statscf/data/${CF_STATS_UNIQUE_ID}`, () => {
    return HttpResponse.json({
      success: true,
      data: [{
        worker_stats: { requests: 12345, errors: 42, cpu_time_p90: 15.2 },
        zone_stats: { bandwidth_bytes: 1073741824 }, // 1 GB
      }],
    });
  }),

  // Mock for API /statscf/data/:id (dynamic)
  http.get(`${API_BASE_URL}/statscf/data/${ANOTHER_UNIQUE_ID}`, () => {
    return HttpResponse.json({
      success: true,
      data: [{
        worker_stats: { requests: 98765, errors: 10, cpu_time_p90: 5.5 },
        zone_stats: { bandwidth_bytes: 2147483648 }, // 2 GB
      }],
    });
  }),

  // Mock for API /health
  http.get(`${API_BASE_URL}/health`, ({ request }) => {
    const url = new URL(request.url);
    const proxy = url.searchParams.get('proxy');
    return HttpResponse.json({ success: true, proxy: proxy, latency_ms: 123, attempt: 1 });
  }),

  // Mock for API /statscf (registration)
  http.post(`${API_BASE_URL}/statscf`, async ({ request }) => {
    const body = await request.json();
    if (body.cf_api_token === 'valid-token') {
        return HttpResponse.json({ success: true, unique_id: 'new-generated-id' }, { status: 201 });
    } else {
        return HttpResponse.json({ success: false, error: 'Invalid credentials' }, { status: 403 });
    }
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
  it('should return the dashboard HTML with default stats', async () => {
    const req = new Request('http://localhost/');
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('12,345'); // Default worker requests
    expect(text).toContain('1.00 GB'); // Default zone bandwidth
  });

  it('should return the dashboard HTML with dynamic stats using ID from URL', async () => {
    const req = new Request(`http://localhost/?id=${ANOTHER_UNIQUE_ID}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('98,765'); // Dynamic worker requests
    expect(text).toContain('2.00 GB'); // Dynamic zone bandwidth
  });

  it('should handle proxy testing via /test endpoint', async () => {
    const proxy = '1.2.3.4:8080';
    const req = new Request(`http://localhost/test?proxy=${encodeURIComponent(proxy)}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should proxy registration requests to the backend', async () => {
    const req = new Request('http://localhost/register', {
      method: 'POST',
      body: JSON.stringify({ cf_api_token: 'valid-token' }),
    });
    const res = await worker.fetch(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.unique_id).toBe('new-generated-id');
  });

  it('should handle /stats command from Telegram webhook and send correct data', async () => {
    const req = new Request('http://localhost/telegram', {
      method: 'POST',
      body: JSON.stringify({ message: { text: '/stats', chat: { id: TELEGRAM_CHAT_ID } } }),
    });
    await worker.fetch(req);
    expect(telegramPayload).not.toBeNull();
    expect(telegramPayload.text).toContain('Bandwidth: 1.00 GB');
  });
});

describe('Scheduled handler', () => {
  it('should trigger daily report and send correct default data', async () => {
    const event = { cron: '0 17,23,5,11 * * *' };
    await worker.scheduled(event);
    expect(telegramPayload).not.toBeNull();
    expect(telegramPayload.text).toContain('Bandwidth: 1.00 GB');
  });
});