require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const routes     = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Seguridad: headers HTTP ───────────────────────────────────────────────
app.use(helmet());

// ── Seguridad: CORS estricto ──────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://turnreserved.com',
    'https://www.turnreserved.com',
  ],
  credentials: true,
}));

// ── Rate limiting general: 100 requests por 15 minutos por IP ─────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Rate limiting estricto para login: 10 intentos por 15 minutos por IP ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Rate limiting para registro: 5 intentos por hora por IP ───────────────
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de registro. Intentá de nuevo en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json());

// Aplicar rate limiting específico a rutas sensibles
app.use('/api/auth/login',    loginLimiter);
app.use('/api/auth/register', registerLimiter);

// Rate limiting general al resto de la API
app.use('/api', generalLimiter);

app.use('/api', routes);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

app.listen(PORT, () => console.log(`🚀  API corriendo en http://localhost:${PORT}`));
app.set('trust proxy', 1);