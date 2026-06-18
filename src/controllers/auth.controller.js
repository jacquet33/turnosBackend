const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

async function register(req, res) {
  try {
    const { email, phone, password } = req.body;
    if (!email || !phone || !password)
      return res.status(400).json({ error: 'Email, teléfono y contraseña son requeridos' });
    if (password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length)
      return res.status(409).json({ error: 'Este email ya está registrado' });

    const hash = await bcrypt.hash(password, 12);

    // Verificar hCaptcha
    const { captchaToken } = req.body;
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

    // Trial de 5 días
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 5);

    await db.query(
      `INSERT INTO users (email, phone, password_hash, plan, subscription_status, trial_ends_at, max_services)
       VALUES (?, ?, ?, 'trial', 'trial', ?, 1)`,
      [email, phone, hash, trialEnd]
    );

    // Email de bienvenida
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      await resend.emails.send({
        from:    'Alejandro de TurnReserved <contact@turnreserved.com>',
        to:      [email],
        subject: `Bienvenido a TurnReserved, ${email.split('@')[0]} 👋`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333">
            
            <div style="background:#111;border-radius:16px;padding:32px;margin-bottom:24px;text-align:center">
              <div style="width:56px;height:56px;background:linear-gradient(135deg,#fff,#ccc);border-radius:14px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center">
                📅
              </div>
              <h1 style="color:white;margin:0;font-size:24px;font-weight:600">Bienvenido a TurnReserved</h1>
              <p style="color:rgba(255,255,255,0.5);margin:8px 0 0;font-size:14px">Tu sistema de gestión de turnos</p>
            </div>

            <p style="font-size:15px;line-height:1.6;margin-bottom:16px">
              Hola 👋,
            </p>
            <p style="font-size:15px;line-height:1.6;margin-bottom:24px">
              Soy Alejandro, creador de TurnReserved. Gracias por registrarte — tenés <strong>5 días de prueba gratuita</strong> para explorar todo el sistema sin restricciones.
            </p>

            <div style="text-align:center;margin-bottom:32px">
              <a href="https://turnreserved.com"
                style="display:inline-block;background:#111;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px">
                Ir a mi panel →
              </a>
            </div>

            <div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px">
              <h2 style="margin:0 0 16px;font-size:17px;color:#111">Primeros pasos</h2>
              
              <div style="display:flex;gap:12px;margin-bottom:12px">
                <div style="width:28px;height:28px;background:#111;border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">1</div>
                <div>
                  <p style="margin:0;font-weight:600;font-size:14px;color:#111">Creá tu primer servicio</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#666">Andá a "Mis Servicios" y hacé clic en "Nuevo Servicio"</p>
                </div>
              </div>

              <div style="display:flex;gap:12px;margin-bottom:12px">
                <div style="width:28px;height:28px;background:#111;border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">2</div>
                <div>
                  <p style="margin:0;font-weight:600;font-size:14px;color:#111">Configurá tus horarios</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#666">Definí los días y horarios en que atendés</p>
                </div>
              </div>

              <div style="display:flex;gap:12px">
                <div style="width:28px;height:28px;background:#111;border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">3</div>
                <div>
                  <p style="margin:0;font-weight:600;font-size:14px;color:#111">Compartí tu link</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#666">Copiá el link único y pegalo en tu bio de Instagram</p>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:12px;margin-bottom:32px">
              <a href="https://turnreserved.com/docs"
                style="flex:1;display:block;text-align:center;background:#f0f0f0;color:#111;padding:12px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600">
                📚 Documentación
              </a>
              <a href="https://www.instagram.com/turnosapp.turnreserved" target="_blank" rel="noopener noreferrer"
                style="flex:1;display:block;text-align:center;background:#f0f0f0;color:#111;padding:12px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600">
                📸 Instagram
              </a>
              <a href="mailto:support@turnreserved.com"
                style="flex:1;display:block;text-align:center;background:#f0f0f0;color:#111;padding:12px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600">
                🛟 Soporte
              </a>
            </div>

            <p style="font-size:13px;color:#999;line-height:1.6">
              Cualquier duda escribime directamente a 
              <a href="mailto:support@turnreserved.com" style="color:#111">support@turnreserved.com</a> — 
              respondo en menos de 24 horas hábiles.
            </p>

            <p style="font-size:14px;color:#333;margin-top:24px">
              Alejandro<br/>
              <span style="color:#999;font-size:13px">Fundador, TurnReserved</span>
            </p>

            <div style="border-top:1px solid #eee;margin-top:32px;padding-top:16px;text-align:center">
              <p style="font-size:11px;color:#bbb;margin:0">
                TurnReserved © 2026 · 
                <a href="https://turnreserved.com/legal" style="color:#bbb">Términos y Privacidad</a>
              </p>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Error enviando email de bienvenida:', emailErr);
      // No fallar el registro si el email falla
    }

    return res.status(201).json({ message: 'Cuenta creada. Tenés 5 días de prueba gratuita.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const token = jwt.sign(
      { id: user.id.toString(), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      user: {
        id:    user.id.toString(),
        email: user.email,
        phone: user.phone,
        plan:                user.plan,
        subscriptionStatus:  user.subscription_status,
        trialEndsAt:         user.trial_ends_at,
        subscriptionEndsAt:  user.subscription_ends_at,
        maxServices:         user.max_services,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function me(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT id, email, phone, plan, subscription_status, trial_ends_at,
              subscription_ends_at, max_services, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const u = rows[0];
    return res.json({ ...u, id: u.id.toString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { register, login, me };
