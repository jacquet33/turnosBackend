const db = require('../config/db');
const { randomUUID } = require('crypto');
const { buildScheduleResponse } = require('./schedule.controller');

// ── PÚBLICO ────────────────────────────────────────────────────────────────

/** GET /api/book/:linkId */
async function getBookingPage(req, res) {
  try {
    const [svcs] = await db.query(
      'SELECT id, name FROM services WHERE link_id = ?',
      [req.params.linkId]
    );
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const service = svcs[0];
    const { schedule, dayConfig } = await buildScheduleResponse(service.id);

    const [pending] = await db.query(
      `SELECT id, booking_date AS date, booking_time AS time, status
       FROM bookings WHERE service_id = ? AND status = 'pending'`,
      [service.id]
    );

    const bookedSlots = pending.map(b => ({
      id:     b.id,
      date:   b.date,
      time:   typeof b.time === 'string' ? b.time.slice(0, 5) : b.time,
      status: b.status,
    }));

    return res.json({ service: { id: service.id, name: service.name }, schedule, dayConfig, bookedSlots });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** POST /api/book/:linkId */
async function createBooking(req, res) {
  try {
    const { name, dni, phone, date, time } = req.body;

    if (!name || !dni || !phone || !date || !time) {
      return res.status(400).json({ error: 'Todos los campos son requeridos: name, dni, phone, date, time' });
    }

    const [svcs] = await db.query(
      'SELECT id FROM services WHERE link_id = ?',
      [req.params.linkId]
    );
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const serviceId = svcs[0].id;

    // Verificar que el slot no esté ocupado
    const [conflict] = await db.query(
      `SELECT id FROM bookings
       WHERE service_id = ? AND booking_date = ? AND booking_time = ? AND status = 'pending'`,
      [serviceId, date, time]
    );
    if (conflict.length) return res.status(409).json({ error: 'Ese horario ya está reservado' });

    const bookingId = randomUUID();
    await db.query(
      `INSERT INTO bookings (id, service_id, client_name, client_dni, client_phone, booking_date, booking_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bookingId, serviceId, name, dni, phone, date, time]
    );

    return res.status(201).json({
      id:        bookingId,
      serviceId,
      date,
      time,
      status:    'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ── PRIVADO ────────────────────────────────────────────────────────────────

/** GET /api/bookings?date=&status= */
async function listBookings(req, res) {
  try {
    const { date, status } = req.query;

    let query = `
      SELECT
        b.id,
        b.service_id   AS serviceId,
        s.name         AS serviceName,
        b.client_name  AS clientName,
        b.client_dni   AS clientDNI,
        b.client_phone AS clientPhone,
        b.booking_date AS date,
        b.booking_time AS time,
        b.status,
        b.created_at   AS createdAt
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      WHERE s.user_id = ?
    `;
    const params = [req.user.id];

    if (date)   { query += ' AND b.booking_date = ?'; params.push(date); }
    if (status) { query += ' AND b.status = ?';       params.push(status); }
    query += ' ORDER BY b.booking_date ASC, b.booking_time ASC';

    const [rows] = await db.query(query, params);

    return res.json(rows.map(r => ({
      ...r,
      time: typeof r.time === 'string' ? r.time.slice(0, 5) : r.time,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** PATCH /api/bookings/:id/status */
async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['pending','completed','cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const [rows] = await db.query(
      `SELECT b.id FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE b.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Turno no encontrado' });

    await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
    return res.json({ message: 'Estado actualizado', status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** GET /api/clients */
async function listClients(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT
         b.client_name  AS name,
         b.client_phone AS phone,
         b.client_dni   AS dni,
         COUNT(*)       AS totalBookings,
         MAX(b.created_at) AS lastBooking
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE s.user_id = ?
       GROUP BY b.client_name, b.client_phone, b.client_dni
       ORDER BY MAX(b.created_at) DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { getBookingPage, createBooking, listBookings, updateStatus, listClients };
