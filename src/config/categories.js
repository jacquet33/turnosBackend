/**
 * Rubros disponibles en el buscador de la app (lanzamiento: Belleza y Salud).
 * Se guardan como slug en users.category. Para agregar un rubro, sumarlo acá:
 * no requiere migración.
 */
const CATEGORY_GROUPS = [
  {
    id: 'belleza',
    name: 'Belleza',
    categories: [
      { id: 'peluqueria',     name: 'Peluquería',          icon: 'scissors' },
      { id: 'barberia',       name: 'Barbería',            icon: 'mustache' },
      { id: 'unas',           name: 'Manicura y uñas',     icon: 'hand' },
      { id: 'estetica',       name: 'Estética facial',     icon: 'sparkles' },
      { id: 'depilacion',     name: 'Depilación',          icon: 'leaf' },
      { id: 'pestanas_cejas', name: 'Pestañas y cejas',    icon: 'eye' },
    ],
  },
  {
    id: 'salud',
    name: 'Salud',
    categories: [
      { id: 'consultorio',    name: 'Consultorio médico',  icon: 'stethoscope' },
      { id: 'odontologia',    name: 'Odontología',         icon: 'tooth' },
      { id: 'kinesiologia',   name: 'Kinesiología',        icon: 'figure' },
      { id: 'nutricion',      name: 'Nutrición',           icon: 'apple' },
      { id: 'psicologia',     name: 'Psicología',          icon: 'brain' },
    ],
  },
  {
    id: 'legal',
    name: 'Legal',
    categories: [
      { id: 'abogado_laboral',     name: 'Abogado laboral',              icon: 'briefcase' },
      { id: 'abogado_familia',     name: 'Abogado de familia',           icon: 'family' },
      { id: 'abogado_penal',       name: 'Abogado penal',                icon: 'shield' },
      { id: 'abogado_civil',       name: 'Abogado civil y comercial',    icon: 'doc' },
      { id: 'abogado_previsional', name: 'Abogado previsional',          icon: 'pension' },
      { id: 'abogado_sucesiones',  name: 'Sucesiones',                   icon: 'scroll' },
      { id: 'abogado_accidentes',  name: 'Accidentes y daños',           icon: 'car' },
      { id: 'escribania',          name: 'Escribanía',                   icon: 'stamp' },
    ],
  },
];

const CATEGORY_IDS = new Set(CATEGORY_GROUPS.flatMap(g => g.categories.map(c => c.id)));
const GROUP_OF = Object.fromEntries(
  CATEGORY_GROUPS.flatMap(g => g.categories.map(c => [c.id, g.id]))
);

module.exports = { CATEGORY_GROUPS, CATEGORY_IDS, GROUP_OF };
