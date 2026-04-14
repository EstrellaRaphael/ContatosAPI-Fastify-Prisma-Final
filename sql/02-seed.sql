-- =============================================================
-- Script 02 — Popular o banco com dados de exemplo
-- Execute APÓS o 01-create.sql
--
-- Usuários criados e suas senhas em texto puro:
--   admin@sistema.com   → senhaAdmin123  (role: admin)
--   joao@email.com      → senha123       (role: user)
--   maria@email.com     → senha456       (role: user)
--   pedro@email.com     → senha789       (role: user)
-- =============================================================

USE contatos_db;

-- Desativa o safe update mode temporariamente para permitir DELETE sem WHERE
SET SQL_SAFE_UPDATES = 0;

-- Limpa os dados existentes respeitando a FK (contacts antes de users)
DELETE FROM `contacts`;
DELETE FROM `users`;

-- Reativa o safe update mode
SET SQL_SAFE_UPDATES = 1;

-- =============================================================
-- Usuários
-- =============================================================
INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `createdAt`, `updatedAt`) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'Administrador',
  'admin@sistema.com',
  '$2b$10$6OpZfgYd6Vk9ip9/8qvRT.xwLGa3v/YmouUK0C5R/bv.1Z87eTm82', -- senhaAdmin123
  'admin',
  '2026-04-14 10:00:00.000',
  '2026-04-14 10:00:00.000'
),
(
  'a0000000-0000-0000-0000-000000000002',
  'João Silva',
  'joao@email.com',
  '$2b$10$p3/wWdVBQdtdYz8YYNCVYOfBnadOoZ7Mu0xst2PhDkbV6lQMA07AG', -- senha123
  'user',
  '2026-04-14 10:01:00.000',
  '2026-04-14 10:01:00.000'
),
(
  'a0000000-0000-0000-0000-000000000003',
  'Maria Souza',
  'maria@email.com',
  '$2b$10$Uj2p.PJvKm2Wm5Zw/TRTFuyCiPfQsS1HncX1VINOGQGA9KpSwV6Aa', -- senha456
  'user',
  '2026-04-14 10:02:00.000',
  '2026-04-14 10:02:00.000'
),
(
  'a0000000-0000-0000-0000-000000000004',
  'Pedro Costa',
  'pedro@email.com',
  '$2b$10$da/ytpnRbSceJiLGek/EuulYYAczViBOITg1BE09RSm.2kCeITrky', -- senha789
  'user',
  '2026-04-14 10:03:00.000',
  '2026-04-14 10:03:00.000'
);

-- =============================================================
-- Contatos do João (3 contatos)
-- =============================================================
INSERT INTO `contacts` (`id`, `name`, `email`, `phone`, `createdAt`, `updatedAt`, `userId`) VALUES
(
  'c0000000-0000-0000-0000-000000000001',
  'Ana Lima',
  'ana.lima@email.com',
  '11999990001',
  '2026-04-14 10:10:00.000',
  '2026-04-14 10:10:00.000',
  'a0000000-0000-0000-0000-000000000002'
),
(
  'c0000000-0000-0000-0000-000000000002',
  'Carlos Mendes',
  NULL,
  '11999990002',
  '2026-04-14 10:11:00.000',
  '2026-04-14 10:11:00.000',
  'a0000000-0000-0000-0000-000000000002'
),
(
  'c0000000-0000-0000-0000-000000000003',
  'Beatriz Alves',
  'beatriz@email.com',
  '11999990003',
  '2026-04-14 10:12:00.000',
  '2026-04-14 10:12:00.000',
  'a0000000-0000-0000-0000-000000000002'
);

-- =============================================================
-- Contatos da Maria (2 contatos)
-- =============================================================
INSERT INTO `contacts` (`id`, `name`, `email`, `phone`, `createdAt`, `updatedAt`, `userId`) VALUES
(
  'c0000000-0000-0000-0000-000000000004',
  'Rafael Souza',
  'rafael@email.com',
  '21988880001',
  '2026-04-14 10:13:00.000',
  '2026-04-14 10:13:00.000',
  'a0000000-0000-0000-0000-000000000003'
),
(
  'c0000000-0000-0000-0000-000000000005',
  'Fernanda Torres',
  NULL,
  '21988880002',
  '2026-04-14 10:14:00.000',
  '2026-04-14 10:14:00.000',
  'a0000000-0000-0000-0000-000000000003'
);

-- =============================================================
-- Contatos do Pedro (1 contato)
-- =============================================================
INSERT INTO `contacts` (`id`, `name`, `email`, `phone`, `createdAt`, `updatedAt`, `userId`) VALUES
(
  'c0000000-0000-0000-0000-000000000006',
  'Juliana Neves',
  'juliana@email.com',
  '31977770001',
  '2026-04-14 10:15:00.000',
  '2026-04-14 10:15:00.000',
  'a0000000-0000-0000-0000-000000000004'
);

-- =============================================================
-- Verificação rápida
-- =============================================================
SELECT 'users' AS tabela, COUNT(*) AS total FROM `users`
UNION ALL
SELECT 'contacts', COUNT(*) FROM `contacts`;
