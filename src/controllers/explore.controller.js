/**
 * Directorio público de negocios para la app mobile (modo cliente).
 * Sin auth. Solo expone negocios con is_listed=1, coordenadas, suscripción
 * vigente y al menos un servicio con agenda habilitada.
 */
const db = require('../config/db');
const { randomUUID } = require('crypto');
const georef = require('../services/georef');
const { CATEGORY_GROUPS, CATEGORY_IDS, GROUP_OF } = require('../config/categories');

const MAX_RADIUS_KM = 50;
const DEFAULT_RADIUS_KM = 10;
const MAX_LIMIT = 100;

// Negocio visible: listado, geolocalizado y con suscripción vigente
const VISIBLE_SQL = `
  u.is_listed = 1 AND u.lat IS NOT NULL AND u.lng IS NOT NULL
  AND (u.subscription_status = 'active'
       OR (u.subscription_status = 'trial' AND u.trial_ends_at > NOW()))
  AND EXISTS (
    SELECT 1 FROM services s JOIN schedule_days d ON d.service_id = s.id
    WHERE s.user_id = u.id AND d.enabled = 1
  )`;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPublicBusiness(r) {
  return {
    id:          r.public_id,
    name:        r.business_name || 'Sin nombre',
    category:    r.category,
    group:       GROUP_OF[r.category] || null,
    description: r.description || '',
    address:     r.address || '',
    city:        r.city || '',
    province:    r.province || '',
    lat:         Number(r.lat),
    lng:         Number(r.lng),
    phone:       r.public_phone || null,
    photoUrl:    r.photo_url || null,
    distanceKm:  r.distance_km != null ? Math.round(Number(r.distance_km) * 10) / 10 : null,
  };
}

async function servicesFor(userIds) {
  if (!userIds.length) return {};
  const [rows] = await db.query(
    `SELECT s.user_id, s.name, s.link_id
     FROM services s
     WHERE s.user_id IN (?) AND EXISTS (
       SELECT 1 FROM schedule_days d WHERE d.service_id = s.id AND d.enabled = 1)
     ORDER BY s.created_at ASC`,
    [userIds]
  );
  const out = {};
  for (const r of rows) {
    (out[r.user_id] ||= []).push({ name: r.name, linkId: r.link_id });
  }
  return out;
}

// GET /explore/categories
function categories(_req, res) {
  res.set('Cache-Control', 'public, max-age=3600');
  return res.json(CATEGORY_GROUPS);
}

// GET /explore/cities?q=colon
async function cities(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    return res.json(await georef.searchCities(q.slice(0, 60)));
  } catch (err) {
    console.error('georef cities', err.message);
    return res.status(502).json({ error: 'No se pudo buscar la ciudad. Probá de nuevo.' });
  }
}

// GET /explore/reverse?lat=&lng=
async function reverse(req, res) {
  const lat = num(req.query.lat), lng = num(req.query.lng);
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat y lng requeridos' });
  try {
    return res.json((await georef.reverse(lat, lng)) || {});
  } catch (err) {
    console.error('georef reverse', err.message);
    return res.json({});
  }
}

/**
 * GET /explore?lat=-32.22&lng=-58.14&radiusKm=10&category=peluqueria&group=belleza&q=texto&limit=50
 * Sin lat/lng pero con city= → busca por ciudad (texto).
 */
async function search(req, res) {
  try {
    const lat = num(req.query.lat), lng = num(req.query.lng);
    const radiusKm = Math.min(Math.max(num(req.query.radiusKm) ?? DEFAULT_RADIUS_KM, 0.5), MAX_RADIUS_KM);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_LIMIT);
    const category = req.query.category && CATEGORY_IDS.has(req.query.category) ? req.query.category : null;
    const group = CATEGORY_GROUPS.find(g => g.id === req.query.group);
    const q = String(req.query.q || '').trim().slice(0, 60);
    const city = String(req.query.city || '').trim().slice(0, 100);

    if ((lat == null || lng == null) && !city)
      return res.status(400).json({ error: 'Indicá lat/lng o city' });

    const params = [];
    let distanceSql = 'NULL';
    let where = VISIBLE_SQL;

    if (lat != null && lng != null) {
      // Haversine (portable MySQL/MariaDB) + prefiltro por bounding box que usa idx_users_geo
      distanceSql = `(6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(u.lat - ?) / 2), 2) +
        COS(RADIANS(?)) * COS(RADIANS(u.lat)) * POWER(SIN(RADIANS(u.lng - ?) / 2), 2))))`;
      params.push(lat, lat, lng);
      const dLat = radiusKm / 111.32;
      const dLng = radiusKm / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));
      where += ' AND u.lat BETWEEN ? AND ? AND u.lng BETWEEN ? AND ?';
      params.push(lat - dLat, lat + dLat, lng - dLng, lng + dLng);
    } else {
      where += ' AND u.city = ?';
      params.push(city);
    }

    if (category) { where += ' AND u.category = ?'; params.push(category); }
    else if (group) {
      where += ' AND u.category IN (?)';
      params.push(group.categories.map(c => c.id));
    }
    if (q) {
      where += ` AND (u.business_name LIKE ? OR EXISTS (
        SELECT 1 FROM services s2 WHERE s2.user_id = u.id AND s2.name LIKE ?))`;
      params.push(`%${q}%`, `%${q}%`);
    }

    let sql = `
      SELECT u.id, u.public_id, u.business_name, u.category, u.description, u.address,
             u.city, u.province, u.lat, u.lng, u.public_phone, u.photo_url,
             ${distanceSql} AS distance_km
      FROM users u
      WHERE ${where}`;
    if (lat != null && lng != null) {
      sql += ' HAVING distance_km <= ? ORDER BY distance_km ASC';
      params.push(radiusKm);
    } else {
      sql += ' ORDER BY u.business_name ASC';
    }
    sql += ' LIMIT ?';
    params.push(limit);

    const [rows] = await db.query(sql, params);
    const svc = await servicesFor(rows.map(r => r.id));
    return res.json({
      radiusKm,
      count: rows.length,
      results: rows.map(r => ({ ...toPublicBusiness(r), services: svc[r.id] || [] })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /explore/business/:publicId
async function business(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.public_id, u.business_name, u.category, u.description, u.address,
              u.city, u.province, u.lat, u.lng, u.public_phone, u.photo_url, NULL AS distance_km
       FROM users u WHERE u.public_id = ? AND ${VISIBLE_SQL}`,
      [req.params.publicId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    const svc = await servicesFor([rows[0].id]);
    return res.json({ ...toPublicBusiness(rows[0]), services: svc[rows[0].id] || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// ── PRIVADO: perfil público del negocio ─────────────────────────────────────

const PROFILE_FIELDS = `public_id, business_name, category, description, address, city, province,
  lat, lng, public_phone, photo_url, is_listed`;

function toProfile(r) {
  return {
    publicId:     r.public_id,
    businessName: r.business_name || '',
    category:     r.category,
    description:  r.description || '',
    address:      r.address || '',
    city:         r.city || '',
    province:     r.province || '',
    lat:          r.lat != null ? Number(r.lat) : null,
    lng:          r.lng != null ? Number(r.lng) : null,
    publicPhone:  r.public_phone || '',
    photoUrl:     r.photo_url || '',
    isListed:     !!r.is_listed,
  };
}

// GET /profile
async function getProfile(req, res) {
  try {
    const [rows] = await db.query(`SELECT ${PROFILE_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json(toProfile(rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT /profile
 * body: { businessName, category, description, address, city, province,
 *         publicPhone, photoUrl, isListed, lat?, lng? }
 * Si vienen lat/lng (pin ajustado en el mapa) se usan; si no, se geocodifica con Georef.
 */
async function updateProfile(req, res) {
  try {
    const b = req.body || {};
    const str = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);

    // Actualización parcial: los campos ausentes del body conservan su valor actual
    const [curRows] = await db.query(`SELECT ${PROFILE_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    if (!curRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const cur = curRows[0];
    const pick = (key, col, max) => (key in b ? str(b[key], max) : cur[col]);

    const businessName = pick('businessName', 'business_name', 120);
    const category     = 'category' in b ? (b.category ? String(b.category) : null) : cur.category;
    const description  = pick('description', 'description', 500);
    const address      = pick('address', 'address', 200);
    let   city         = pick('city', 'city', 100);
    let   province     = pick('province', 'province', 100);
    const publicPhone  = pick('publicPhone', 'public_phone', 30);
    const photoUrl     = pick('photoUrl', 'photo_url', 300);
    const isListed     = 'isListed' in b ? !!b.isListed : !!cur.is_listed;

    if (category && !CATEGORY_IDS.has(category))
      return res.status(400).json({ error: 'Rubro inválido' });
    if (photoUrl && !/^https:\/\//i.test(photoUrl))
      return res.status(400).json({ error: 'La foto debe ser una URL https' });

    let lat = num(b.lat), lng = num(b.lng);
    const pinProvided = lat != null && lng != null;
    if ((lat != null || lng != null) &&
        (!pinProvided || lat < -90 || lat > 90 || lng < -180 || lng > 180))
      return res.status(400).json({ error: 'Coordenadas inválidas' });

    let geocodeWarning = null;
    if (!pinProvided) {
      const prevLat = cur.lat != null ? Number(cur.lat) : null;
      const prevLng = cur.lng != null ? Number(cur.lng) : null;
      const locationChanged = address !== cur.address || city !== cur.city || province !== cur.province;
      lat = prevLat; lng = prevLng; // por defecto, conservar la ubicación anterior
      if (address && (locationChanged || prevLat == null)) {
        try {
          const g = await georef.geocodeAddress({ address, city, province });
          if (g) {
            lat = g.lat; lng = g.lng;
            city = city || g.city; province = province || g.province;
          } else {
            geocodeWarning = 'No encontramos la dirección. Ubicá el negocio moviendo el pin en el mapa.';
          }
        } catch (e) {
          console.error('georef geocode', e.message);
          geocodeWarning = 'El servicio de mapas no respondió. Ubicá el negocio moviendo el pin en el mapa.';
        }
      }
    }

    if (isListed && (!businessName || !category || lat == null || lng == null))
      return res.status(400).json({
        error: 'Para aparecer en el mapa necesitás nombre, rubro y ubicación.',
        geocodeWarning,
      });

    // public_id se genera la primera vez
    const publicId = cur.public_id || randomUUID().replace(/-/g, '').slice(0, 10);

    await db.query(
      `UPDATE users SET public_id = ?, business_name = ?, category = ?, description = ?,
         address = ?, city = ?, province = ?, lat = ?, lng = ?, public_phone = ?,
         photo_url = ?, is_listed = ?
       WHERE id = ?`,
      [publicId, businessName, category, description, address, city, province,
       lat, lng, publicPhone, photoUrl, isListed ? 1 : 0, req.user.id]
    );

    const [rows] = await db.query(`SELECT ${PROFILE_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    return res.json({ ...toProfile(rows[0]), geocodeWarning });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { categories, cities, reverse, search, business, getProfile, updateProfile };
