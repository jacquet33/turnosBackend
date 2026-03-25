const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

/** POST /api/auth/register */
async function register(req, res) {
  try {
    const { business_name, email, phone, password } = req.body;

    if (!business_name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'Este email ya está registrado' });
    }

    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'INSERT INTO users (business_name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [business_name, email, phone, hash]
    );

    return res.status(201).json({ message: 'Cuenta creada exitosamente. Ahora podés iniciar sesión.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** POST /api/auth/login */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, business_name: user.business_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      user: {
        id:            user.id,
        business_name: user.business_name,
        email:         user.email,
        phone:         user.phone,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** GET /api/auth/me */
async function me(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id, business_name, email, phone, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { register, login, me };
