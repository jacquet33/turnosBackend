-- ============================================================
--  Fase 2: SaaS con suscripciones
--  Ejecutar sobre la base de datos existente (turnos_db)
-- ============================================================

USE turnos_db;

-- Agregar campos de suscripción a users
ALTER TABLE users
  ADD COLUMN plan               ENUM('trial','basic','pro','business') NOT NULL DEFAULT 'trial' AFTER phone,
  ADD COLUMN subscription_status ENUM('trial','active','expired','cancelled') NOT NULL DEFAULT 'trial' AFTER plan,
  ADD COLUMN trial_ends_at      TIMESTAMP NULL DEFAULT NULL AFTER subscription_status,
  ADD COLUMN subscription_ends_at TIMESTAMP NULL DEFAULT NULL AFTER trial_ends_at,
  ADD COLUMN max_services       INT NOT NULL DEFAULT 3 AFTER subscription_ends_at;

-- Setear trial_ends_at en usuarios existentes
UPDATE users SET trial_ends_at = DATE_ADD(created_at, INTERVAL 5 DAY) WHERE trial_ends_at IS NULL;

-- Tabla de pagos
CREATE TABLE IF NOT EXISTS payments (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  user_id           BIGINT        NOT NULL,
  mp_payment_id     VARCHAR(100)  NULL COMMENT 'ID del pago en MercadoPago',
  mp_subscription_id VARCHAR(100) NULL COMMENT 'ID de suscripción recurrente en MP',
  plan              ENUM('basic','pro','business') NOT NULL,
  amount_usd        DECIMAL(10,2) NOT NULL,
  status            ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_payments_user   ON payments (user_id);
CREATE INDEX idx_payments_mp_id  ON payments (mp_payment_id);
CREATE INDEX idx_payments_status ON payments (status);
