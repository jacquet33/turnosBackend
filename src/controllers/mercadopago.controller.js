/**
 * mercadopago.controller.js
 *
 * Endpoints:
 *  POST /api/subscription/create-preference  → crea preferencia de pago en MP
 *  POST /api/subscription/webhook            → recibe notificaciones de MP
 *  GET  /api/subscription/status             → estado actual de la suscripción
 *  POST /api/subscription/cancel             → cancelar suscripción
 */

const db = require('../config/db');

const PLANS = {
  basic:    { name: 'Basic',    price: 9,  maxServices: 1,  currency: 'USD' },
  pro:      { name: 'Pro',      price: 19, maxServices: 3,  currency: 'USD' },
  business: { name: 'Business', price: 39, maxServices: -1, currency: 'USD' }, // -1 = ilimitados
};

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * POST /api/subscription/create-preference
 * Crea una preferencia de pago en MercadoPago y devuelve la URL de pago.
 */
async function createPreference(req, res) {
  try {
    const { plan } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Plan inválido. Opciones: basic, pro, business' });
    }

    const selectedPlan = PLANS[plan];

    const preference = {
      items: [{
        title:       `TurnReserved - Plan ${selectedPlan.name}`,
        description: `Suscripción mensual al plan ${selectedPlan.name}`,
        quantity:    1,
        unit_price:  selectedPlan.price,
        currency_id: 'USD',
      }],
      payment_methods: {
        installments: 1,
      },
      payer: {
        email: req.user.email,
      },
      back_urls: {
        success: `${FRONTEND_URL}/dashboard?payment=success&plan=${plan}`,
        failure: `${FRONTEND_URL}/subscribe?payment=failed`,
        pending: `${FRONTEND_URL}/subscribe?payment=pending`,
      },
      //auto_return:          'approved',
      notification_url:     `${process.env.BACKEND_URL || 'https://turnreserved.com'}/api/subscription/webhook`,
      external_reference:   `${req.user.id}|${plan}`,
      statement_descriptor: 'TURNRESERVED',
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('MP error:', err);
      return res.status(502).json({ error: 'Error al crear preferencia de pago' });
    }

    const data = await response.json();

    // Registrar el intento de pago
    await db.query(
      'INSERT INTO payments (user_id, plan, amount_usd, status) VALUES (?, ?, ?, ?)',
      [req.user.id, plan, selectedPlan.price, 'pending']
    );

    return res.json({
      preferenceId: data.id,
      initPoint:    data.init_point,      // URL de pago productivo
      sandboxUrl:   data.sandbox_init_point, // URL de prueba
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/subscription/webhook
 * MercadoPago notifica los pagos aquí.
 * Este endpoint es público (sin autenticación JWT).
 */
async function webhook(req, res) {
  try {
    const { type, data } = req.body;

    // Solo procesamos pagos
    if (type !== 'payment') return res.sendStatus(200);

    const paymentId = data?.id;
    if (!paymentId) return res.sendStatus(200);

    // Consultar el pago a MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) return res.sendStatus(200);

    const payment = await mpRes.json();
    const { status, external_reference } = payment;

    if (!external_reference) return res.sendStatus(200);

    const [userId, plan] = external_reference.split('|');
    if (!userId || !plan || !PLANS[plan]) return res.sendStatus(200);

    const selectedPlan = PLANS[plan];

    if (status === 'approved') {
      const subscriptionEnd = new Date();
      subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

      // Activar suscripción
      await db.query(
        `UPDATE users SET
          plan = ?,
          subscription_status = 'active',
          subscription_ends_at = ?,
          max_services = ?
         WHERE id = ?`,
        [plan, subscriptionEnd, selectedPlan.maxServices, userId]
      );

      // Actualizar registro de pago
      await db.query(
        `UPDATE payments SET mp_payment_id = ?, status = 'approved'
         WHERE user_id = ? AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [paymentId.toString(), userId]
      );

      console.log(`✅ Pago aprobado — user: ${userId}, plan: ${plan}`);
    } else if (['rejected', 'cancelled'].includes(status)) {
      await db.query(
        `UPDATE payments SET mp_payment_id = ?, status = ?
         WHERE user_id = ? AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [paymentId.toString(), status, userId]
      );
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error('Webhook error:', err);
    return res.sendStatus(500);
  }
}

/**
 * GET /api/subscription/status
 * Devuelve el estado actual de la suscripción del usuario.
 */
async function getStatus(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT plan, subscription_status, trial_ends_at, subscription_ends_at, max_services
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = rows[0];
    const now  = new Date();

    let daysLeft = null;
    if (user.subscription_status === 'trial' && user.trial_ends_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(user.trial_ends_at) - now) / (1000 * 60 * 60 * 24)));
    }

    return res.json({
      plan:               user.plan,
      status:             user.subscription_status,
      maxServices:        user.max_services,
      trialEndsAt:        user.trial_ends_at,
      subscriptionEndsAt: user.subscription_ends_at,
      daysLeft,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/subscription/cancel
 */
async function cancelSubscription(req, res) {
  try {
    await db.query(
      "UPDATE users SET subscription_status = 'cancelled' WHERE id = ?",
      [req.user.id]
    );
    return res.json({ message: 'Suscripción cancelada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { createPreference, webhook, getStatus, cancelSubscription };
