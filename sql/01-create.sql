-- =============================================================
-- Script 01 — Criação do banco de dados e tabelas
-- Banco: MySQL 8+
-- Execute este script primeiro, antes do 02-seed.sql
-- =============================================================

-- Cria o banco se não existir e seleciona ele
CREATE DATABASE IF NOT EXISTS contatos_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE contatos_db;

-- =============================================================
-- Tabela: users
-- =============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`        VARCHAR(36)   NOT NULL,
  `name`      VARCHAR(255)  NOT NULL,
  `email`     VARCHAR(255)  NOT NULL,
  `password`  VARCHAR(255)  NOT NULL,
  `role`      VARCHAR(50)   NOT NULL DEFAULT 'user',
  `createdAt` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)   NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- Tabela: contacts
-- =============================================================
CREATE TABLE IF NOT EXISTS `contacts` (
  `id`        VARCHAR(36)   NOT NULL,
  `name`      VARCHAR(255)  NOT NULL,
  `email`     VARCHAR(255)  NULL,
  `phone`     VARCHAR(50)   NOT NULL,
  `createdAt` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)   NOT NULL,
  `userId`    VARCHAR(36)   NOT NULL,

  PRIMARY KEY (`id`),
  KEY `contacts_userId_fkey` (`userId`),
  CONSTRAINT `contacts_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
