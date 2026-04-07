-- ============================================================
--  Sistema de Turnos  |  schema.sql
--  PKs: DECIMAL(20,0) AUTO_INCREMENT
--  business_name es opcional
-- ============================================================

CREATE DATABASE IF NOT EXISTS turnos_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE turnos_db;

CREATE TABLE IF NOT EXISTS users (
  id            DECIMAL(20,0) NOT NULL AUTO_INCREMENT,
  business_name VARCHAR(120)  NULL,
  email         VARCHAR(180)  NOT NULL UNIQUE,
  phone         VARCHAR(30)   NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS services (
  id          DECIMAL(20,0) NOT NULL AUTO_INCREMENT,
  user_id     DECIMAL(20,0) NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  link_id     VARCHAR(8)    NOT NULL UNIQUE,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_svc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_days (
  id           DECIMAL(20,0) NOT NULL AUTO_INCREMENT,
  service_id   DECIMAL(20,0) NOT NULL,
  day_of_week  ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
  enabled      TINYINT(1)    NOT NULL DEFAULT 0,
  start_time   TIME          NULL,
  end_time     TIME          NULL,
  duration_min SMALLINT      NOT NULL DEFAULT 30,
  PRIMARY KEY (id),
  UNIQUE KEY uq_svc_day (service_id, day_of_week),
  CONSTRAINT fk_day_svc FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id              DECIMAL(20,0) NOT NULL AUTO_INCREMENT,
  schedule_day_id DECIMAL(20,0) NOT NULL,
  slot_time       TIME          NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_slot_day FOREIGN KEY (schedule_day_id) REFERENCES schedule_days(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id           DECIMAL(20,0) NOT NULL AUTO_INCREMENT,
  service_id   DECIMAL(20,0) NOT NULL,
  client_name  VARCHAR(120)  NOT NULL,
  client_dni   VARCHAR(20)   NOT NULL,
  client_phone VARCHAR(30)   NOT NULL,
  booking_date DATE          NOT NULL,
  booking_time TIME          NOT NULL,
  status       ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_booking_svc FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE INDEX idx_bookings_service_date ON bookings (service_id, booking_date);
CREATE INDEX idx_bookings_status       ON bookings (status);
CREATE INDEX idx_services_user         ON services (user_id);
