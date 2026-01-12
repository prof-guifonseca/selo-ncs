-- 00_extensions.sql (sanitized)
--
-- Este arquivo habilita extensões PostgreSQL indispensáveis ao
-- funcionamento do esquema do Programa de Verificação Independente NCS.
--
-- * `pgcrypto` provê funções de geração de UUIDs (`gen_random_uuid()`),
--   utilizadas como chaves primárias nas tabelas do programa.
-- * `citext` fornece um tipo de texto case-insensitive, usado em
--   slugs de empresas e páginas públicas para evitar problemas de
--   comparação com maiúsculas/minúsculas.
--
-- A criação de extensões é idempotente: chamar este script
-- repetidamente não ocasionará erros se as extensões já existirem.
begin;
create extension if not exists pgcrypto;
create extension if not exists citext;
commit;
