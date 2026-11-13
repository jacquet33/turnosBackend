/**
 * Cliente mínimo de la API Georef (datos.gob.ar): pública, gratuita y sin API key.
 * Docs: https://www.argentina.gob.ar/georef
 *  - geocodeAddress: dirección → lat/lng (al guardar el perfil del negocio)
 *  - searchCities:   texto → localidades con centroide (buscador "tu ciudad")
 *  - reverse:        lat/lng → provincia/municipio (para completar ciudad desde GPS)
 * Resultados cacheados en memoria para no castigar la API pública.
 */
const BASE = 'https://apis.datos.gob.ar/georef/api/v2.0';
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.v;
}
function cacheSet(key, v) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { t: Date.now(), v });
}

async function getJson(path, params) {
  const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
  const cached = cacheGet(url);
  if (cached !== undefined) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Georef ${res.status}`);
    const data = await res.json();
    cacheSet(url, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<{lat:number,lng:number,city:string|null,province:string|null,normalized:string}|null>} */
async function geocodeAddress({ address, city, province }) {
  const params = { direccion: address, max: 1, aplanar: true, campos: 'completo' };
  if (province) params.provincia = province;
  if (city) params.localidad = city;
  let data = await getJson('direcciones', params);
  // Si la localidad no matchea exacto, reintentar solo con provincia
  if (!data?.direcciones?.length && city) {
    delete params.localidad;
    data = await getJson('direcciones', params);
  }
  const d = data?.direcciones?.[0];
  if (!d || d.ubicacion_lat == null || d.ubicacion_lon == null) return null;
  return {
    lat: Number(d.ubicacion_lat),
    lng: Number(d.ubicacion_lon),
    city: d.localidad_censal_nombre || d.departamento_nombre || city || null,
    province: d.provincia_nombre || province || null,
    normalized: d.nomenclatura || address,
  };
}

async function searchCities(q, max = 8) {
  const data = await getJson('localidades', {
    nombre: q, max, aplanar: true, campos: 'id,nombre,centroide,provincia.nombre,departamento.nombre',
    orden: 'nombre',
  });
  return (data?.localidades || []).map(l => ({
    id: l.id,
    name: l.nombre,
    province: l.provincia_nombre,
    department: l.departamento_nombre,
    lat: Number(l.centroide_lat),
    lng: Number(l.centroide_lon),
  }));
}

async function reverse(lat, lng) {
  const data = await getJson('ubicacion', { lat, lon: lng, aplanar: true });
  const u = data?.ubicacion;
  if (!u) return null;
  return {
    province: u.provincia_nombre || null,
    city: u.municipio_nombre || u.departamento_nombre || null,
  };
}

module.exports = { geocodeAddress, searchCities, reverse };
