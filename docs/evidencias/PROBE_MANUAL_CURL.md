# PROBE_MANUAL_CURL — Prova de isolamento sem Bearer (cookie jar)

Use este modo quando o staging **não aceita** `Authorization: Bearer ...` (comum quando o Netlify está em contexto “production”).

Aqui, a autenticação acontece via **cookies HttpOnly** retornados por `/api/auth/login`.

> ✅ Vantagem: funciona mesmo quando Bearer está bloqueado.  
> ⚠️ Atenção: o arquivo de cookies é sensível. Não commite. Apague ao final.

---

## 1) Preparar variáveis (sem imprimir segredos)

```bash
API="https://<seu-staging>.netlify.app/.netlify/functions/api"

EMAIL_A="ncs+tenant-a@SEU_DOMINIO.com"
PASS_A="SENHA_FORTE_AQUI"

EMAIL_B="ncs+tenant-b@SEU_DOMINIO.com"
PASS_B="SENHA_FORTE_AQUI"
```

> Dica de sigilo: evite `set -x` no shell.

---

## 2) Login + cookie jars

```bash
JAR_A="/tmp/ncs_tenant_a.cookies"
JAR_B="/tmp/ncs_tenant_b.cookies"

# Login Tenant A (salva cookies no jar)
curl -sS -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -c "$JAR_A" \
  -d "{"email":"$EMAIL_A","password":"$PASS_A"}" > /dev/null

# Login Tenant B (salva cookies no jar)
curl -sS -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -c "$JAR_B" \
  -d "{"email":"$EMAIL_B","password":"$PASS_B"}" > /dev/null
```

Teste rápido (deve dar 200):
```bash
curl -sS -o /dev/null -w "Tenant A /me => %{http_code}\n" -b "$JAR_A" "$API/auth/me"
curl -sS -o /dev/null -w "Tenant B /me => %{http_code}\n" -b "$JAR_B" "$API/auth/me"
```

---

## 3) Criar 1 processo por tenant (e pegar o ID)

```bash
PROC_A=$(curl -sS -X POST "$API/processes" \
  -b "$JAR_A" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "tenant-a",
    "stage": "draft",
    "title": "RLS Probe - Tenant A",
    "indicators": []
  }' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.id||'')})")
echo "PROC_A=$PROC_A"

PROC_B=$(curl -sS -X POST "$API/processes" \
  -b "$JAR_B" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "tenant-b",
    "stage": "draft",
    "title": "RLS Probe - Tenant B",
    "indicators": []
  }' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.id||'')})")
echo "PROC_B=$PROC_B"
```

Se `PROC_A`/`PROC_B` vierem vazios, veja `TROUBLESHOOTING.md`.

---

## 4) Prova de isolamento (requests e expectativas)

### 4.1) Mesmo tenant (deve ser 200)

```bash
curl -sS -o /dev/null -w "Tenant A lê PROC_A => %{http_code}\n" -b "$JAR_A" "$API/processes/$PROC_A"
curl -sS -o /dev/null -w "Tenant B lê PROC_B => %{http_code}\n" -b "$JAR_B" "$API/processes/$PROC_B"
```

### 4.2) Cross-tenant (deve ser 401/403/404; nunca 200)

```bash
curl -sS -o /dev/null -w "Tenant B lê PROC_A => %{http_code}\n" -b "$JAR_B" "$API/processes/$PROC_A"
curl -sS -o /dev/null -w "Tenant A lê PROC_B => %{http_code}\n" -b "$JAR_A" "$API/processes/$PROC_B"
```

---

## 5) Como registrar evidência em `RLS_PROBE_RESULT.txt`

- Copie o output dos comandos de status (as linhas `=> 200`/`=> 404`, etc.)
- Cole na seção “Output” do `docs/evidencias/RLS_PROBE_RESULT.txt`
- Não cole conteúdos do cookie jar e não cole payloads completos se tiverem PII desnecessária.

---

## 6) Limpeza (recomendado)

```bash
rm -f "$JAR_A" "$JAR_B"
unset PASS_A PASS_B
```
