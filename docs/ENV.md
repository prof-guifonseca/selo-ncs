# Variáveis de ambiente (fonte única de verdade)

Este repo foi desenhado para operar com **um conjunto congelado** de variáveis.  
Se você adicionar aliases, você reabre a porta para divergências e “bug de ambiente”.

## Supabase

### `SUPABASE_URL` *(obrigatória)*
- Ex.: `https://xxxxxxxx.supabase.co`

### `SUPABASE_SERVICE_ROLE_KEY` *(obrigatória em operações administrativas)*
- Usada internamente em operações administrativas específicas (como geração de URLs assinadas).  Nunca deve ser usada para leituras multi‑tenant.

### `SUPABASE_ANON_KEY` *(sempre obrigatória)*
- Usada para todas as requisições de dados.  O backend opera sempre com RLS ativado e requer a chave anônima e o JWT do usuário para autenticar.

### `SUPABASE_BUCKET` *(opcional)*
- Default: `ncs-evidences`
- Bucket onde as evidências são armazenadas.

## Gates e segurança

### `NCS_REQUIRE_AUTH` *(0/1)*
- Default: `1`
- Se `1`, rotas protegidas respondem `401` sem sessão válida.

### `NCS_USE_RLS` *(fail‑fast / RLS‑only)*
- **Default:** `1` (ou omitido)
- Se definido como `0`, `false` ou `no`, o backend **recusa executar** e a API retorna **503** com erro `MISCONFIG_RLS_DISABLED`.
- Recomendação: mantenha `NCS_USE_RLS=1` em todos os ambientes (ou simplesmente omita).

### `NCS_CORS_ORIGIN`
- Origem permitida quando CORS com credenciais está ativo.
- Use origem explícita em ambientes reais (não `*`).

### `NCS_LOGIN_RATE_LIMIT`
- Default: `10`
- Limite por janela (ver implementação no backend) para proteger login.

### `NCS_REFRESH_COOKIE_MAX_AGE`
- Default: `1209600` (14 dias, em segundos)
- Max‑Age do cookie de refresh.

### `NCS_COOKIE_SAMESITE`
- Default: `Lax`
- Valores típicos: `Lax`, `Strict`, `None` (se `None`, normalmente requer `Secure`).

### `NCS_SECURE_COOKIES` *(0/1)*
- Default: `1`
- Se `1`, cookies são setados com `Secure` (recomendado em HTTPS).

## Chat (opcional)

A interface de chat funciona em dois modos: FAQ local ou IA.  O comportamento é controlado pela flag `NCS_AI_ENABLED`:

### `NCS_AI_ENABLED` *(0/1)*
- **Default:** `0` (IA desativada).
- Se `0` ou vazio, a função `chat.js` no backend **nunca** chama a OpenAI, mesmo que `OPENAI_API_KEY` esteja definido.  O usuário recebe respostas heurísticas a partir de um FAQ local.
- Se `1`, a IA é habilitada e a função tenta usar a API da OpenAI quando `OPENAI_API_KEY` está configurada.  Neste modo o backend registra logs mínimos de uso (timestamp, ator, rota, modelo, tamanho das mensagens), sem armazenar o conteúdo integral.

Para usar IA, defina:

- `NCS_AI_ENABLED=1`
- `OPENAI_API_KEY` — chave secreta da OpenAI Responses API.

As variáveis `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` e `OPENAI_BASE_URL` foram removidas; o modelo e demais parâmetros são fixados no código para garantir previsibilidade e evitar divergência entre configuração e documentação.

> Recomendação de custo/risco: mantenha `NCS_AI_ENABLED=0` na maioria dos ambientes e ative apenas quando existir um orçamento claro para IA.

## Nota importante: reprodutibilidade

Se você quer pipeline previsível:
- commite `package-lock.json` e use `npm ci` em CI.
