# Decisões de arquitetura (ADR-lite)

Este arquivo registra decisões importantes para evitar “esquecimento de contexto”.

## 2026-01-04 — Static-first + Netlify Functions (mantido)
- O build é determinístico (`build.js`) e gera `/dist`.
- Evita bundler pesado; reduz custo operacional.

## 2026-01-04 — Cookie-first (mantido)
- Sessão por cookies HttpOnly (`ncs_at`, `ncs_rt`).
- Front não persiste tokens.

## 2026-01-04 — RLS obrigatório (remoção do modo baseline)
- O backend não suporta mais o modo baseline.  Toda lógica de autorização e
  isolamento de tenants é implementada via políticas de banco de dados
  (RLS).  A variável de ambiente `NCS_USE_RLS` agora é apenas uma
  verificação de misconfiguração: qualquer valor diferente de `1` faz com
  que a API retorne um erro `503`.  O uso da chave de service role foi
  restrito a operações administrativas, nunca para leitura multi‑tenant.

> Adicione novas decisões aqui conforme evoluir.
