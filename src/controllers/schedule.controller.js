const db = require('../config/db');

const ALL_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

async function buildScheduleResponse(serviceId) {
  const [dayRows] = await db.query(
    'SELECT * FROM schedule_days WHERE service_id = ?',
    [serviceId]
  );

  const schedule  = {};
  const dayConfig = {};

  for (const day of ALL_DAYS) {
    const row = dayRows.find(d => d.day_of_week === day);
    if (row) {
      const [slots] = await db.query(
        'SELECT slot_time FROM schedule_slots WHERE schedule_day_id = ? ORDER BY slot_time',
        [row.id]
      );
      schedule[day] = {
        enabled: !!row.enabled,
        slots: slots.map(s => s.slot_time.slice(0, 5)),
      };
      dayConfig[day] = {
        startTime: row.start_time ? row.start_time.slice(0, 5) : '09:00',
        endTime:   row.end_time   ? row.end_time.slice(0, 5)   : '18:00',
        duration:  row.duration_min,
      };
    } else {
      schedule[day]  = { enabled: false, slots: [] };
      dayConfig[day] = { startTime: '09:00', endTime: '18:00', duration: 30 };
    }
  }

  return { schedule, dayConfig };
}

/** GET /api/services/:id/schedule */
async function getSchedule(req, res) {
  try {
    const [svcs] = await db.query(
      'SELECT id FROM services WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const result = await buildScheduleResponse(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** PUT /api/services/:id/schedule */
async function saveSchedule(req, res) {
  try {
    const { schedule, dayConfig } = req.body;
    if (!schedule || !dayConfig) {
      return res.status(400).json({ error: 'schedule y dayConfig son requeridos' });
    }

    const [svcs] = await db.query(
      'SELECT id FROM services WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!svcs.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      for (const day of ALL_DAYS) {
        const daySchedule = schedule[day] || { enabled: false, slots: [] };
        const cfg         = dayConfig[day]  || { startTime: '09:00', endTime: '18:00', duration: 30 };

        await conn.query(`
          INSERT INTO schedule_days (service_id, day_of_week, enabled, start_time, end_time, duration_min)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            enabled      = VALUES(enabled),
            start_time   = VALUES(start_time),
            end_time     = VALUES(end_time),
            duration_min = VALUES(duration_min)
        `, [req.params.id, day, daySchedule.enabled ? 1 : 0, cfg.startTime, cfg.endTime, cfg.duration]);

        const [[dayRow]] = await conn.query(
          'SELECT id FROM schedule_days WHERE service_id = ? AND day_of_week = ?',
          [req.params.id, day]
        );

        await conn.query('DELETE FROM schedule_slots WHERE schedule_day_id = ?', [dayRow.id]);

        if (daySchedule.enabled && daySchedule.slots?.length) {
          const values = daySchedule.slots.map(t => [dayRow.id, t]);
          await conn.query('INSERT INTO schedule_slots (schedule_day_id, slot_time) VALUES ?', [values]);
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return res.json({ message: 'Horarios guardados correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { getSchedule, saveSchedule, buildScheduleResponse };
