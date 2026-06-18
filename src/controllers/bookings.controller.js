const db = require('../config/db');
const { buildScheduleResponse } = require('./schedule.controller');

// ── PÚBLICO ────────────────────────────────────────────────────────────────

async function getBookingPage(req, res) {
  try {
    const [svcs] = await db.query('SELECT id, name FROM services WHERE link_id = ?', [req.params.linkId]);
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const service = svcs[0];
    const { schedule, dayConfig } = await buildScheduleResponse(service.id);

    const [pending] = await db.query(
      `SELECT id, booking_date AS date, booking_time AS time, status
       FROM bookings WHERE service_id = ? AND status = 'pending'`,
      [service.id]
    );

    return res.json({
      service: { id: service.id.toString(), name: service.name },
      schedule,
      dayConfig,
      bookedSlots: pending.map(b => ({
        id:     b.id.toString(),
        date:   b.date,
        time:   typeof b.time === 'string' ? b.time.slice(0, 5) : b.time,
        status: b.status,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function createBooking(req, res) {
  try {
    const { name, dni, phone, date, time } = req.body;
    if (!name || !date || !time)
      return res.status(400).json({ error: 'Nombre, fecha y hora son requeridos' });

    const [svcs] = await db.query('SELECT id FROM services WHERE link_id = ?', [req.params.linkId]);
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const serviceId = svcs[0].id;
    const [conflict] = await db.query(
      `SELECT id FROM bookings WHERE service_id = ? AND booking_date = ? AND booking_time = ? AND status = 'pending'`,
      [serviceId, date, time]
    );
    if (conflict.length) return res.status(409).json({ error: 'Ese horario ya está reservado' });

    // Verificar anticipación mínima
    const [serviceRows] = await db.query('SELECT min_advance_hours FROM services WHERE id = ?', [serviceId]);
    if (serviceRows.length) {
      const minHours = serviceRows[0].min_advance_hours || 24;
      const bookingDateTime = new Date(`${date}T${time}:00`);
      const minAllowed = new Date(Date.now() + minHours * 60 * 60 * 1000);
      if (bookingDateTime < minAllowed) {
        return res.status(400).json({
          error: `Este servicio requiere reservar con al menos ${minHours >= 24 ? minHours/24 + ' día(s)' : minHours + ' hora(s)'} de anticipación.`
        });
      }
    }

    const [result] = await db.query(
      `INSERT INTO bookings (service_id, client_name, client_dni, client_phone, booking_date, booking_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [serviceId, name, dni || null, phone || null, date, time]
    );

    return res.status(201).json({
      id:        result.insertId.toString(),
      serviceId: serviceId.toString(),
      date, time, status: 'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ── PRIVADO ────────────────────────────────────────────────────────────────

async function listBookings(req, res) {
  try {
    const { date, status, serviceId } = req.query;

    let query = `
      SELECT b.id, b.service_id AS serviceId, s.name AS serviceName,
             b.client_name AS clientName, b.client_dni AS clientDNI,
             b.client_phone AS clientPhone, b.booking_date AS date,
             b.booking_time AS time, b.status, b.created_at AS createdAt
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      WHERE s.user_id = ?
    `;
    const params = [req.user.id];

    if (date)      { query += ' AND b.booking_date = ?'; params.push(date); }
    if (status)    { query += ' AND b.status = ?';       params.push(status); }
    if (serviceId) { query += ' AND b.service_id = ?';   params.push(serviceId); }

    query += ' ORDER BY b.booking_date ASC, b.booking_time ASC';

    const [rows] = await db.query(query, params);
    return res.json(rows.map(r => ({
      ...r,
      id:          r.id.toString(),
      serviceId:   r.serviceId.toString(),
      clientDNI:   r.clientDNI   || '',
      clientPhone: r.clientPhone || '',
      time:        typeof r.time === 'string' ? r.time.slice(0, 5) : r.time,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function createBookingAdmin(req, res) {
  try {
    const { serviceId, clientName, clientDNI, clientPhone, date, time, status = 'pending' } = req.body;

    if (!serviceId || !clientName || !date || !time)
      return res.status(400).json({ error: 'Servicio, nombre, fecha y hora son requeridos' });

    const [svcs] = await db.query(
      'SELECT id FROM services WHERE id = ? AND user_id = ?',
      [serviceId, req.user.id]
    );
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const [conflict] = await db.query(
      `SELECT id FROM bookings WHERE service_id = ? AND booking_date = ? AND booking_time = ? AND status = 'pending'`,
      [serviceId, date, time]
    );
    if (conflict.length) return res.status(409).json({ error: 'Ese horario ya está reservado' });

    const [result] = await db.query(
      `INSERT INTO bookings (service_id, client_name, client_dni, client_phone, booking_date, booking_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [serviceId, clientName, clientDNI || null, clientPhone || null, date, time, status]
    );

    return res.status(201).json({ id: result.insertId.toString(), message: 'Turno creado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function updateBooking(req, res) {
  try {
    const { clientName, clientDNI, clientPhone, date, time, status } = req.body;

    if (!clientName || !date || !time || !status)
      return res.status(400).json({ error: 'Nombre, fecha, hora y estado son requeridos' });

    const [rows] = await db.query(
      `SELECT b.id, b.service_id FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE b.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Turno no encontrado' });

    const [conflict] = await db.query(
      `SELECT id FROM bookings
       WHERE service_id = ? AND booking_date = ? AND booking_time = ? AND status = 'pending' AND id != ?`,
      [rows[0].service_id, date, time, req.params.id]
    );
    if (conflict.length) return res.status(409).json({ error: 'Ese horario ya está reservado' });

    await db.query(
      `UPDATE bookings SET client_name = ?, client_dni = ?, client_phone = ?,
       booking_date = ?, booking_time = ?, status = ? WHERE id = ?`,
      [clientName, clientDNI || null, clientPhone || null, date, time, status, req.params.id]
    );

    return res.json({ message: 'Turno actualizado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['pending','completed','cancelled'].includes(status))
      return res.status(400).json({ error: 'Estado inválido' });

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

async function deleteBooking(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT b.id FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE b.id = ? AND s.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Turno no encontrado' });

    await db.query('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Turno eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function listClients(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT b.client_name AS name, b.client_phone AS phone, b.client_dni AS dni,
              COUNT(*) AS totalBookings, MAX(b.created_at) AS lastBooking
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE s.user_id = ?
       GROUP BY b.client_name, b.client_phone, b.client_dni
       ORDER BY MAX(b.created_at) DESC`,
      [req.user.id]
    );
    return res.json(rows.map(r => ({
      ...r,
      phone: r.phone || '',
      dni:   r.dni   || '',
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  getBookingPage, createBooking,
  listBookings, createBookingAdmin, updateBooking, updateStatus, deleteBooking,
  listClients,
};
