// api/send-email.js — Vercel serverless function (CommonJS)
// Recuperación de ID por email usando Resend.
// Variables requeridas: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

const { Resend } = require('resend');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL             = process.env.APP_URL || 'https://kair.app';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, action } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email_required' });
  }

  const emailNorm = email.trim().toLowerCase();

  // Buscar perfil por email en Supabase (usando service role key)
  let perfil = null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/perfiles?email=eq.${encodeURIComponent(emailNorm)}&limit=1`;
    const r = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    const data = await r.json();
    if (Array.isArray(data) && data.length > 0) {
      perfil = data[0];
    }
  } catch (e) {
    console.error('Supabase error:', e);
    return res.status(500).json({ error: 'db_error' });
  }

  if (!perfil) {
    // No revelar si el email existe o no — respuesta neutral
    return res.status(200).json({ ok: true });
  }

  // Enviar email con el ID usando Resend
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'Kair <no-reply@kair.app>',
      to:   emailNorm,
      subject: 'Tu ID de Kair',
      text: [
        'Hola,',
        '',
        'Has solicitado recuperar tu ID de Kair.',
        '',
        `Tu ID es: ${perfil.uid}`,
        '',
        `Accede a la app aquí: ${APP_URL}`,
        '',
        '— El equipo de Kair',
        '',
        'Este email es transaccional. No te enviaremos comunicaciones de marketing.',
      ].join('\n'),
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Tu ID de Kair</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#FAFAF8;margin:0;padding:40px 16px;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e8e8e4;padding:32px 28px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
      <svg width="26" height="26" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <line x1="34" y1="15" x2="34" y2="85" stroke="#1B3A2A" stroke-width="7" stroke-linecap="round"/>
        <line x1="41" y1="38" x2="72" y2="15" stroke="#1B3A2A" stroke-width="7" stroke-linecap="round"/>
        <line x1="41" y1="62" x2="72" y2="85" stroke="#1B3A2A" stroke-width="7" stroke-linecap="round"/>
        <circle cx="54" cy="50" r="7.5" fill="#2ac6a8"/>
      </svg>
      <span style="font-size:1rem;font-weight:200;letter-spacing:0.28em;color:#111820;">kair</span>
    </div>
    <p style="font-size:0.9rem;color:#6b7280;margin:0 0 20px;line-height:1.6;">Has solicitado recuperar tu ID de Kair.</p>
    <div style="background:rgba(27,58,42,0.05);border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.14em;color:#9ca3af;margin-bottom:8px;">Tu ID personal</div>
      <div style="font-size:1.5rem;font-weight:400;color:#1B3A2A;letter-spacing:0.1em;">${perfil.uid}</div>
    </div>
    <a href="${APP_URL}" style="display:block;text-align:center;padding:11px 20px;background:#1B3A2A;color:#ffffff;text-decoration:none;border-radius:8px;font-size:0.84rem;font-weight:500;letter-spacing:0.04em;margin-bottom:20px;">Acceder a la app</a>
    <p style="font-size:0.72rem;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">Este email es transaccional. No recibirás comunicaciones de marketing.</p>
  </div>
</body>
</html>
      `.trim(),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend error:', e);
    return res.status(500).json({ error: 'email_send_error' });
  }
};
