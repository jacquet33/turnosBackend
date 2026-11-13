-- ============================================================
--  Fase 3: Directorio público + búsqueda en mapa (app mobile)
--  Ejecutar UNA vez sobre turnos_db (MySQL 5.7+/8 o MariaDB 10.3+)
--  Todas las columnas son NULL/DEFAULT → no rompe la web actual.
-- ============================================================

USE turnos_db;

ALTER TABLE users
  ADD COLUMN public_id     VARCHAR(12)   NULL DEFAULT NULL           AFTER id,
  ADD COLUMN category      VARCHAR(40)   NULL DEFAULT NULL           COMMENT 'slug, ver src/config/categories.js',
  ADD COLUMN description   VARCHAR(500)  NULL DEFAULT NULL,
  ADD COLUMN address       VARCHAR(200)  NULL DEFAULT NULL           COMMENT 'calle y altura',
  ADD COLUMN city          VARCHAR(100)  NULL DEFAULT NULL,
  ADD COLUMN province      VARCHAR(100)  NULL DEFAULT NULL,
  ADD COLUMN lat           DECIMAL(9,6)  NULL DEFAULT NULL,
  ADD COLUMN lng           DECIMAL(9,6)  NULL DEFAULT NULL,
  ADD COLUMN public_phone  VARCHAR(30)   NULL DEFAULT NULL           COMMENT 'WhatsApp visible al público (opcional)',
  ADD COLUMN photo_url     VARCHAR(300)  NULL DEFAULT NULL,
  ADD COLUMN is_listed     TINYINT(1)    NOT NULL DEFAULT 0          COMMENT '1 = aparece en el mapa de la app';

ALTER TABLE users ADD UNIQUE KEY uq_users_public_id (public_id);

-- Índice para el prefiltro por bounding box del buscador
CREATE INDEX idx_users_geo      ON users (is_listed, lat, lng);
CREATE INDEX idx_users_category ON users (category);
CREATE INDEX idx_users_city     ON users (city);
