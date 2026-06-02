import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    type = 'lead',
    name = '',
    phone = '',
    service = '',
    experience = '',
    previousSalon = '',
    eventId = '',
    userAgent = '',
    eventSourceUrl = ''
  } = req.body || {};

  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    '';

  const timestamp = new Date().toLocaleString('fr-MA', {
    timeZone: 'Africa/Casablanca',
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const normalizePhone = (p) => {
    const digits = p.replace(/\D/g, '');
    if (digits.startsWith('212')) return digits;
    if (digits.startsWith('0')) return '212' + digits.slice(1);
    return '212' + digits;
  };

  const sha256 = (s) =>
    crypto.createHash('sha256').update(s.toLowerCase().trim()).digest('hex');

  // ── Telegram ──────────────────────────────────────────────
  const sendTelegram = async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    let text;
    if (type === 'recrutement') {
      text =
        `💼 <b>طلب توظيف جديد — Oimaroc</b>\n\n` +
        `👤 الاسم: <b>${name}</b>\n` +
        `📞 الهاتف: <b>${phone}</b>\n` +
        `🔧 التخصص: <b>${service || experience}</b>\n` +
        `📅 الخبرة: <b>${experience}</b>\n` +
        `🏪 صالون سابق: <b>${previousSalon || '—'}</b>\n` +
        `🕐 التوقيت: ${timestamp}`;
    } else {
      text =
        `🌸 <b>طلب جديد — Oimaroc نجارة</b>\n\n` +
        `👤 الاسم: <b>${name}</b>\n` +
        `📞 الهاتف: <b>${phone}</b>\n` +
        `🪚 المنتج: <b>${service}</b>\n` +
        `🕐 التوقيت: ${timestamp}`;
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  };

  // ── Google Sheets ─────────────────────────────────────────
  const sendSheets = async () => {
    const url = process.env.SHEETS_WEBHOOK_URL;
    if (!url) return;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type, name, phone, service, experience, previousSalon,
        timestamp
      })
    });
  };

  // ── Meta CAPI ─────────────────────────────────────────────
  const sendMeta = async () => {
    const pixelId = process.env.META_PIXEL_ID;
    const token   = process.env.META_ACCESS_TOKEN;
    if (!pixelId || !token) return;

    const eventName = type === 'recrutement' ? 'CompleteRegistration' : 'Lead';
    const normalPhone = normalizePhone(phone);

    await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            event_source_url: eventSourceUrl,
            action_source: 'website',
            user_data: {
              ph: [sha256(normalPhone)],
              fn: [sha256(name)],
              client_ip_address: clientIp,
              client_user_agent: userAgent
            }
          }]
        })
      }
    );
  };

  await Promise.allSettled([sendTelegram(), sendSheets(), sendMeta()]);

  return res.status(200).json({ ok: true });
}
