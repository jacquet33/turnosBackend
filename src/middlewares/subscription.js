/**
 * subscription.js
 * Middleware que verifica si el usuario tiene acceso activo.
 * Se usa en todas las rutas del dashboard.
 *
 * Estados:
 *  trial    → acceso si trial_ends_at > NOW()
 *  active   → acceso siempre
 *  expired  → bloquear, redirigir a /subscribe
 *  cancelled→ bloquear
 */

const db = require('../config/db');

async function checkSubscription(req, res, next) {
  try {
    const [rows] = await db.query(
      `SELECT plan, subscription_status, trial_ends_at, subscription_ends_at, max_services
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = rows[0];
    const now  = new Date();

    // Trial activo
    if (user.subscription_status === 'trial') {
      const trialEnd = new Date(user.trial_ends_at);
      if (now > trialEnd) {
        // Trial expirado — actualizar en DB
        await db.query(
          'UPDATE users SET subscription_status = ? WHERE id = ?',
          ['expired', req.user.id]
        );
        return res.status(402).json({
          error: 'trial_expired',
          message: 'Tu período de prueba ha expirado. Elegí un plan para continuar.',
        });
      }
      // Trial vigente
      req.subscription = {
        plan:        user.plan,
        status:      'trial',
        maxServices: user.max_services,
        trialEndsAt: user.trial_ends_at,
        daysLeft:    Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)),
      };
      return next();
    }

    // Suscripción activa
    if (user.subscription_status === 'active') {
      req.subscription = {
        plan:        user.plan,
        status:      'active',
        maxServices: user.max_services,
        endsAt:      user.subscription_ends_at,
      };
      return next();
    }

    // Expirado o cancelado
    return res.status(402).json({
      error:   'subscription_required',
      message: 'Necesitás una suscripción activa para acceder.',
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Middleware que verifica si el usuario puede crear más servicios
 * según su plan.
 */
async function checkServiceLimit(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT COUNT(*) AS total FROM services WHERE user_id = ?',
      [req.user.id]
    );
    const total      = rows[0].total;
    const maxAllowed = req.subscription?.maxServices ?? 1;

    if (maxAllowed !== -1 && total >= maxAllowed) {
      return res.status(403).json({
        error:   'service_limit_reached',
        message: `Tu plan permite hasta ${maxAllowed} servicio${maxAllowed !== 1 ? 's' : ''}. Actualizá tu plan para crear más.`,
        current: total,
        max:     maxAllowed,
      });
    }
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { checkSubscription, checkServiceLimit };
