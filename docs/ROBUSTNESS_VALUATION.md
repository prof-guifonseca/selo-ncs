# Robustez & Valuation — alavancas técnicas (sem fantasia)

**Data:** 2026-01-04  
Este documento traduz “ganhos técnicos” em sinais que aumentam confiança (e portanto valor percebido).

## 1) Sinais fortes (muito baratos de obter)

### 1.1 Build determinístico
- `package-lock.json` + `npm ci`
- smoke como gate em CI

**Por que conta:** reduz risco de “não consigo reproduzir”, melhora onboarding e auditoria.

### 1.2 Isolamento multi‑tenant defensável
- RLS hard gate em staging (`NCS_USE_RLS=1`, `NCS_REQUIRE_AUTH=1`)
- políticas claras (comentadas) em `20_security.sql`

**Por que conta:** risco reputacional/jurídico cai, e você consegue “vender segurança” sem prometer milagre.

### 1.3 Supply chain enxuto
- remover deps NPM não usadas
- minimizar o runtime (fetch + crypto)

**Por que conta:** auditoria de terceiros fica simples; ataque de dependência cai.

## 2) Sinais médios (já elevam maturidade)

### 2.1 Audit trail persistente
- eventos essenciais com shape consistente
- consultas por processo/tenant/período

**Por que conta:** governança e compliance viram entregável; suporte e incidentes ficam “operáveis”.

### 2.2 Disciplina de release
- SemVer + CHANGELOG real + checklist
- versão consistente no front (cache bust controlado)

**Por que conta:** reduz regressão, facilita manutenção e gestão de risco.

## 3) Sinais avançados (para 90+ dias)

### 3.1 Observabilidade mínima
- logs estruturados por request_id
- métricas básicas (latência/erro) sem custo alto

### 3.2 Testes de contrato leves
- auth/tenant/publish cobertos por testes automatizados

## Anti‑sinais (o que derruba confiança)
- rotas legacy quebradas (ex.: caminho que recursa/timeout)
- docs divergentes do código
- dependências “fantasma”
- IA no core path sem feature flag e sem limite

> O backlog de melhorias e critérios de aceite está agora consolidado em `docs/DIAGNOSTIC.md`.
