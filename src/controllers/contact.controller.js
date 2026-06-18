const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendContact(req, res) {
  try {
    const { name, email, subject, message, captchaToken } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    // Verificar hCaptcha
    if (!captchaToken) {
      return res.status(400).json({ error: 'Captcha requerido' });
    }

    const captchaRes = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.HCAPTCHA_SECRET}&response=${captchaToken}`,
    });
    const captchaData = await captchaRes.json();
    if (!captchaData.success) {
      return res.status(400).json({ error: 'Captcha inválido. Intentá de nuevo.' });
    }

    // Email al admin con el mensaje del contacto
    await resend.emails.send({
      from:    'TurnReserved <contact@turnreserved.com>',
      to:      ['alejandrojacquet@gmail.com'],
      subject: `[Contacto] ${subject} — ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#111;border-radius:12px;padding:24px;margin-bottom:24px">
            <h2 style="color:white;margin:0;font-size:20px">📬 Nuevo mensaje de contacto</h2>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px">TurnReserved</p>
          </div>
          <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:16px">
            <p style="margin:0 0 8px"><strong>Nombre:</strong> ${name}</p>
            <p style="margin:0 0 8px"><strong>Email:</strong> ${email}</p>
            <p style="margin:0 0 8px"><strong>Asunto:</strong> ${subject}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;white-space:pre-wrap">${message}</p>
          </div>
          <p style="font-size:12px;color:#999;text-align:center">
            Este mensaje fue enviado desde el formulario de contacto de turnreserved.com
          </p>
        </div>
      `,
    });

    // Email de confirmación al usuario
    await resend.emails.send({
      from:    'TurnReserved <contact@turnreserved.com>',
      to:      [email],
      subject: 'Recibimos tu mensaje — TurnReserved',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#111;border-radius:12px;padding:24px;margin-bottom:24px">
            <h2 style="color:white;margin:0;font-size:20px">✅ Recibimos tu mensaje</h2>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px">TurnReserved</p>
          </div>
          <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:16px">
            <p style="margin:0 0 12px">Hola <strong>${name}</strong>,</p>
            <p style="margin:0 0 12px">Recibimos tu consulta sobre <strong>${subject}</strong>.</p>
            <p style="margin:0 0 12px">Te respondemos en menos de <strong>24 horas hábiles</strong>.</p>
            <p style="margin:0;color:#666;font-size:13px">Si tenés alguna urgencia podés escribirnos directamente a support@turnreserved.com</p>
          </div>
          <p style="font-size:12px;color:#999;text-align:center">
            TurnReserved © 2026 — turnreserved.com
          </p>
        </div>
      `,
    });

    return res.json({ message: 'Mensaje enviado correctamente. Te respondemos en menos de 24 horas.' });

  } catch (err) {
    console.error('Error enviando email:', err);
    return res.status(500).json({ error: 'Error al enviar el mensaje. Intentá de nuevo.' });
  }
}

module.exports = { sendContact };