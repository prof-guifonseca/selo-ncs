# PROBE_SETUP — Como fazer o teste acontecer (Staging)

Este guia monta, do zero, os **inputs** necessários para rodar a prova de isolamento multi‑tenant (RLS) e produzir evidências auditáveis.

> Objetivo prático: sair com `docs/evidencias/RLS_PROBE_RESULT.txt` em **PASS** e com o checklist + E2E preenchidos.

---

## 0) Pré‑requisitos (o que você precisa ter em mãos)

- URL do site staging (SPA): `https://<...>.netlify.app`
- API base do staging (Netlify Functions):
  - `PROBE_API_BASE=https://<...>.netlify.app/.netlify/functions/api`
- **2 contas de teste** (Tenant A e Tenant B), cada uma com **senha conhecida** (não commitar).
- Acesso ao **Supabase do staging** (para ver/confirmar usuários, se o fluxo exigir confirmação de e‑mail).

> Importante: em alguns ambientes Netlify, *Bearer token* pode ser bloqueado quando o contexto é “production”.  
> Se isso acontecer, use o **modo cookie jar** descrito em `PROBE_MANUAL_CURL.md`.

---

## 1) Escolher o modo de autenticação para o probe

### Modo 1 — Bearer token (preferido)
Use quando o staging **aceita** `Authorization: Bearer <jwt>`.

Sinais de que está OK:
- `GET /api/auth/me` com Bearer retorna 200.
- O probe `scripts/rls_probe.mjs` não retorna 401 logo no primeiro request.

### Modo 2 — Cookie jar (fallback)
Use quando o ambiente **não** aceita Bearer (tende a acontecer em contexto Netlify “production”).

- Você faz login via `/api/auth/login`, salva cookies num arquivo (jar) e reusa esses cookies nos requests.
- Passo a passo: `PROBE_MANUAL_CURL.md`

---

## 2) Criar contas de teste (Tenant A e Tenant B)

Você pode fazer de duas formas.

### Opção A (mais “produto”) — via `/api/auth/register` ou UI

1) (UI) Abra a página de staging e registre duas contas:
- Tenant A: `ncs+tenant-a@SEU_DOMINIO.com`
- Tenant B: `ncs+tenant-b@SEU_DOMINIO.com`

2) (API) Alternativa via curl (sem registrar a senha em arquivo):
```bash
API="$PROBE_API_BASE"

curl -sS -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Tenant A (Probe)",
    "email": "ncs+tenant-a@SEU_DOMINIO.com",
    "password": "SENHA_FORTE_AQUI",
    "accept_terms_platform": true,
    "accept_terms_process": true
  }'
```

> Se o staging exigir confirmação de e‑mail, confirme o usuário (via e‑mail) **ou** no Supabase Dashboard (Auth → Users → Confirm).

Repita para o Tenant B (empresa e e‑mail diferentes).

### Opção B (mais rápida) — criar usuários direto no Supabase (staging)

No Supabase Dashboard (staging):
- Auth → Users → Add user
- Defina e‑mail e senha
- Marque como **confirmed** (ou confirme manualmente depois)

> Essa opção é ótima para acelerar o probe, mas não valida (por si só) o fluxo de “aceite de termos” do `/auth/register`.

---

## 3) Obter tokens (JWT) com segurança (sem expor no log)

Se você usar **Modo Bearer**, você precisa de 2 JWTs: `TOKEN_A` e `TOKEN_B`.

### 3.1) Token via Supabase Auth API (password grant)

Pré‑requisito: ter `SUPABASE_URL` e `SUPABASE_ANON_KEY` do **staging**.

Com `jq` (recomendado):
```bash
TOKEN_A=$(curl -sS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{"email":"$EMAIL_A","password":"$PASS_A"}" | jq -r .access_token)
```

Sem `jq` (Node):
```bash
TOKEN_A=$(curl -sS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{"email":"$EMAIL_A","password":"$PASS_A"}" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).access_token||'')}catch(e){process.exit(1)}})")
```

Repita para `TOKEN_B`.

> **Higiene:** não cole os comandos de export/definição de senhas/tokens em arquivos versionados e não grave terminal com o token visível.

---

## 4) Criar 1 processo por tenant (para ter os IDs)

O probe precisa de:
- `PROBE_TENANT_A_PROCESS_ID`
- `PROBE_TENANT_B_PROCESS_ID`

### 4.1) Criar processo (Modo Bearer)

```bash
API="$PROBE_API_BASE"

PROC_A=$(curl -sS -X POST "$API/processes" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "tenant-a",
    "stage": "draft",
    "title": "RLS Probe - Tenant A",
    "indicators": []
  }' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.id||'')})")
echo "PROC_A=$PROC_A"

PROC_B=$(curl -sS -X POST "$API/processes" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "tenant-b",
    "stage": "draft",
    "title": "RLS Probe - Tenant B",
    "indicators": []
  }' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.id||'')})")
echo "PROC_B=$PROC_B"
```

> Se `PROC_A`/`PROC_B` vierem vazios, veja `TROUBLESHOOTING.md`.

### 4.2) Criar processo (Modo Cookie jar)

Se você estiver no modo cookie jar, siga `PROBE_MANUAL_CURL.md` — lá tem a versão do POST usando `-b/-c` com cookies.

---

## 5) Rodar o probe e capturar evidência

### 5.1) Execução (Modo Bearer)

> Dica: rode o probe “inline” (variáveis só naquele comando), para não deixar token exportado no shell.

```bash
PROBE_API_BASE="$PROBE_API_BASE" \
PROBE_TENANT_A_TOKEN="$TOKEN_A" \
PROBE_TENANT_A_PROCESS_ID="$PROC_A" \
PROBE_TENANT_B_TOKEN="$TOKEN_B" \
PROBE_TENANT_B_PROCESS_ID="$PROC_B" \
node scripts/rls_probe.mjs
```

### 5.2) Captura segura para o arquivo de evidência

- O script **não imprime** tokens.
- Ainda assim: **não** inclua no arquivo as linhas onde você definiu tokens/senhas.

Sugestão de fluxo:
1) Rode o comando acima.
2) Copie **somente** o output do probe.
3) Cole em `docs/evidencias/RLS_PROBE_RESULT.txt` (abaixo do cabeçalho).

---

## 6) Preencher os demais documentos

1) `SECURITY_STAGING_CHECKLIST.md`  
   - Confirme env vars no Netlify (seção 1)
   - Confirme bucket privado (seção 2)
   - Confirme JWT/integração (seção 3)
   - Revise CSP/headers (seção 4)

2) `E2E_STAGING_RUN.txt`  
   - Execute um E2E manual simples e registre passos + fricções

3) `PROBE_INPUTS.md`  
   - Preencha com e‑mails e IDs (sem tokens)

---

## 7) DoD (o que precisa existir no final)

- `docs/evidencias/RLS_PROBE_RESULT.txt` preenchido e com **PASS** nos casos esperados
- `docs/evidencias/SECURITY_STAGING_CHECKLIST.md` marcado
- `docs/evidencias/E2E_STAGING_RUN.txt` preenchido
