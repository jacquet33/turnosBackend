const db = require('../config/db');
const { randomUUID } = require('crypto');

const ALL_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DEFAULT_ENABLED = ['monday','tuesday','wednesday','thursday','friday'];

function generateLinkId() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

async function list(req, res) {
  try {
    const [services] = await db.query(
      'SELECT id, user_id, name, link_id, created_at FROM services WHERE user_id = ? ORDER BY created_at ASC',
      [req.user.id]
    );
    const result = [];
    for (const svc of services) {
      const [days] = await db.query(
        'SELECT id FROM schedule_days WHERE service_id = ? AND enabled = 1 LIMIT 1',
        [svc.id]
      );
      result.push({
        id:          svc.id.toString(),
        userId:      svc.user_id.toString(),
        name:        svc.name,
        linkId:      svc.link_id,
        createdAt:   svc.created_at,
        hasSchedule: days.length > 0,
      });
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function create(req, res) {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const linkId = generateLinkId();
    const [result] = await db.query(
      'INSERT INTO services (user_id, name, link_id) VALUES (?, ?, ?)',
      [req.user.id, name.trim(), linkId]
    );
    const serviceId = result.insertId.toString();

    for (const day of ALL_DAYS) {
      await db.query(
        `INSERT INTO schedule_days (service_id, day_of_week, enabled, start_time, end_time, duration_min)
         VALUES (?, ?, ?, '09:00', '18:00', 30)`,
        [serviceId, day, DEFAULT_ENABLED.includes(day) ? 1 : 0]
      );
    }

    return res.status(201).json({
      id:          serviceId,
      userId:      req.user.id,
      name:        name.trim(),
      linkId,
      createdAt:   new Date().toISOString(),
      hasSchedule: false,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function update(req, res) {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    const [result] = await db.query(
      'UPDATE services SET name = ? WHERE id = ? AND user_id = ?',
      [name.trim(), req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Servicio no encontrado' });
    return res.json({ message: 'Servicio actualizado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function remove(req, res) {
  try {
    const [result] = await db.query(
      'DELETE FROM services WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Servicio no encontrado' });
    return res.json({ message: 'Servicio eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { list, create, update, remove };
