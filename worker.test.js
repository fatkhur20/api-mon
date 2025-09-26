import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import worker, { formatUptimeForTelegram } from './worker.js';

const RAILWAY_BASE = "https://badakterbangx-api.up.railway.app";
const TELEGRAM_BOT_TOKEN = "7872111732:AAEfGshwnMYPeF3H2-0mvuEyiuTipgiKCxg";
const TELEGRAM_CHAT_ID = "5361605327";

const server = setupServer(
  // Mock for Railway API /ping
  http.get(`${RAILWAY_BASE}/ping`, () => {
    return HttpResponse.json({ status: 'Alive' });
  }),

  // Mock for Railway API /stats
  http.get(`${RAILWAY_BASE}/stats`, () => {
    return HttpResponse.json({
      uptime_seconds: 86400 + 3600 * 2 + 60 * 5, // 1d 2h 5m
      total_requests: 12345,
      success_rate_percent: 99.8,
    });
  }),

  // Mock for Railway API /health
  http.get(`${RAILWAY_BASE}/health`, ({ request }) => {
    const url = new URL(request.url);
    const proxy = url.searchParams.get('proxy');
    return HttpResponse.json({
      success: true,
      proxy: proxy,
      latency_ms: 123,
      attempt: 1,
    });
  }),

  // Mock for Telegram API
  http.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, () => {
    return HttpResponse.json({ ok: true });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('formatUptimeForTelegram', () => {
  it('should format seconds into "Xd Yh Zm" format correctly', () => {
    expect(formatUptimeForTelegram(90061)).toBe('1d 1h 1m');
    expect(formatUptimeForTelegram(86400)).toBe('1d 0h 0m');
    expect(formatUptimeForTelegram(3600)).toBe('0d 1h 0m');
    expect(formatUptimeForTelegram(60)).toBe('0d 0h 1m');
    expect(formatUptimeForTelegram(0)).toBe('0d 0h 0m');
    expect(formatUptimeForTelegram(172800 + 18000 + 180)).toBe('2d 5h 3m');
  });
});

describe('Fetch handler', () => {
  it('should return the dashboard HTML for the root path', async () => {
    const req = new Request('http://localhost/');
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('<h1>🚀 Proxy Health Checker</h1>');
  });

  it('should handle proxy testing via /test endpoint', async () => {
    const proxy = '1.2.3.4:8080';
    const req = new Request(`http://localhost/test?proxy=${encodeURIComponent(proxy)}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.proxy).toBe(proxy);
  });

  it('should handle /stats command from Telegram webhook', async () => {
    const req = new Request('http://localhost/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          text: '/stats',
          chat: { id: TELEGRAM_CHAT_ID },
        },
      }),
    });
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('OK');
  });
});

describe('Scheduled handler', () => {
  it('should trigger ping on "*/10 * * * *" cron', async () => {
    const event = { cron: '*/10 * * * *' };
    await worker.scheduled(event);
  });

  it('should trigger daily report on "0 17,23,5,11 * * *" cron', async () => {
    const event = { cron: '0 17,23,5,11 * * *' };
    await worker.scheduled(event);
  });
});