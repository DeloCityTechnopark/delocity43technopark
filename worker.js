
const TG_API = (token) => `https://api.telegram.org/bot${token}/sendMessage`;


const buckets = new Map();
function ratelimit(ip, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  buckets.set(ip, arr);
  return arr.length <= limit;
}



function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isValidContact(s) {
  if (!s) return false;
  // телефон (любые цифры, +, скобки, пробелы, дефисы, мин. 7 цифр) ИЛИ e-mail
  const phoneLike = /^[+\d()\-\s]{7,}$/.test(s) && (s.match(/\d/g) || []).length >= 7;
  const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return phoneLike || emailLike;
}

function buildMessage(d) {
  return [
    '🔔 Новая заявка с сайта Технопарка Делосити',
    '',
    `👤 Имя: ${d.name || '—'}`,
    `📞 Контакт: ${d.contact || '—'}`,
    `🏢 Интересует: ${d.type || '—'}`,
    `💬 Комментарий: ${d.message || '—'}`,
  ].join('\n');
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowed) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(allowed) });
    }

    // простая CORS-проверка
    if (allowed && origin && origin !== allowed) {
      return new Response('Forbidden origin', { status: 403, headers: corsHeaders(allowed) });
    }

    // ratelimit по IP
    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    // const ok = await ratelimitKV(ip, env);
    const ok = ratelimit(ip);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Слишком много заявок. Попробуйте позже.' }),
        { status: 429, headers: corsHeaders(allowed) });
    }

    // парсим и валидируем
    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ ok: false, error: 'Bad JSON' }),
      { status: 400, headers: corsHeaders(allowed) }); }

    // honeypot — скрытое поле, которое бот заполнит, человек — нет
    if (body.website || body.phone2) {
      // тихо делаем вид, что всё ок, чтобы не палить защиту
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders(allowed) });
    }

    // минимальная валидация
    const data = {
      name:    escapeHtml((body.name    || '').toString().trim().slice(0, 100)),
      contact: escapeHtml((body.contact || '').toString().trim().slice(0, 200)),
      type:    escapeHtml((body.type    || '').toString().trim().slice(0, 100)),
      message: escapeHtml((body.message || '').toString().trim().slice(0, 1000)),
    };

    if (!data.name || !data.contact || !isValidContact(data.contact)) {
      return new Response(JSON.stringify({ ok: false, error: 'Заполните имя и корректный контакт.' }),
        { status: 400, headers: corsHeaders(allowed) });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return new Response(JSON.stringify({ ok: false, error: 'Сервер не настроен' }),
        { status: 500, headers: corsHeaders(allowed) });
    }

    // отправляем в Telegram
    try {
      const r = await fetch(TG_API(env.TELEGRAM_BOT_TOKEN), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: buildMessage(data) }),
      });
      if (!r.ok) {
        const t = await r.text();
        return new Response(JSON.stringify({ ok: false, error: 'Telegram error', detail: t.slice(0, 200) }),
          { status: 502, headers: corsHeaders(allowed) });
      }
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'Telegram unreachable' }),
        { status: 502, headers: corsHeaders(allowed) });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders(allowed) });
  },
};
