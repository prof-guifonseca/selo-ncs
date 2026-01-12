# REDACTION_POLICY — Sanitização rápida (sem segredos)

Este repositório contém evidências **auditáveis**, mas **não pode** conter segredos.

## Nunca incluir (proibido)

- JWTs completos (`eyJ...`)
- `Authorization: Bearer ...`
- `Set-Cookie: ncs_at=...` / `ncs_rt=...`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `JWT secret` (qualquer segredo/assinatura local)
- Dumps de `netlify env:list` ou `.env` com valores reais

## Pode incluir (permitido)

- URLs do staging (site + API)
- IDs/UUIDs de processos/usuários/empresas (sem PII extra)
- E‑mails de contas de teste (preferencialmente aliases dedicados)
- Status codes (200/401/403/404/503) e mensagens de erro **sem** dados sensíveis
- Trechos de logs que não contenham credenciais

## Regras práticas para capturar terminal

1) **Não grave a tela** enquanto digita senhas/tokens.  
2) Se for copiar/colar output:
   - copie **apenas** as linhas do probe (`[probe] ...`, `PASS/FAIL`, `=> 200`, etc.)
   - não copie comandos `export TOKEN=...` / `PASS=...`
3) Se aparecer algo sensível por acidente:
   - apague do arquivo imediatamente
   - commit “fix” removendo o segredo
   - **rotacione** o segredo comprometido (se for key/token real)

## “Máscara” mínima (se precisar citar algo)

Se for indispensável citar um identificador sensível, mas você quer manter referência:
- Token/JWT: `eyJ...<REDACTED>...abc123` (somente 3–6 chars finais)
- Key: `****<últimos 4>`

> Preferência: **não** citar tokens, mesmo mascarados.
