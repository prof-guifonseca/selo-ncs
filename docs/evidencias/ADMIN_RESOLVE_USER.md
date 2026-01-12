# ADMIN_RESOLVE_USER — Resolução de usuário por e‑mail

Esta evidência documenta a nova rota administrativa `POST /api/admin/resolve-user` adicionada ao backend para simplificar o onboarding de vínculos no painel do gestor.  A funcionalidade permite que o administrador digite o e‑mail de um usuário e obtenha automaticamente o `user_id` correspondente, eliminando a necessidade de consultar manualmente a tabela `auth.users` via painel do Supabase.

## Descrição

* **Endpoint:** `POST /api/admin/resolve-user`  
* **Autorização:** Requer sessão autenticada com papel **admin**.  Usuários sem sessão ou com papel diferente recebem 401/403.  
* **Entrada:** JSON com o campo `email` (string). O e‑mail é normalizado (trim, lower‑case) e validado de forma simples (`foo@bar.com`).  
* **Processamento:** A função chama a RPC segura `ncs_resolve_user_by_email(p_email text)` via chave `service_role` para consultar `auth.users`.  
* **Saída (sucesso):** Objeto JSON `{ ok: true, user: { id: <uuid>, email: <string> } }` quando encontrado.  
* **Saída (não encontrado):** Objeto JSON `{ ok: false, code: "USER_NOT_FOUND", message: "Usuário não encontrado." }` com status 404.  
* **Falhas:** Erros de validação retornam 400 com código `VALIDATION`. Erros internos retornam 500 com código `INTERNAL`, sem expor detalhes do Supabase.

## Payload de Exemplo

Solicitação para buscar o usuário `joao@example.com`:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -b "$JAR_ADMIN" \# cookie jar com sessão admin
  -d '{"email":"joao@example.com"}' \
  https://<seu-site>.netlify.app/.netlify/functions/api/admin/resolve-user
```

Exemplo de resposta de sucesso:

```json
{
  "ok": true,
  "user": {
    "id": "0e7b19d6-77a0-4f70-8f3a-2c1c67b9f58d",
    "email": "joao@example.com"
  }
}
```

Exemplo de resposta quando o usuário não existe:

```json
{
  "ok": false,
  "code": "USER_NOT_FOUND",
  "message": "Usuário não encontrado."
}
```

## Passos Manuais para Testar

1. Faça login como administrador no portal.  
2. Navegue até o **Painel do Gestor** (`#admin-dashboard`).  
3. Na seção **Criar vínculo**, digite o e‑mail do usuário no campo “Email do usuário” e clique em **Buscar ID**.  
4. Se o usuário existir, o campo “ID do usuário” será preenchido automaticamente com o UUID retornado e um toast de sucesso aparecerá.  
5. Se o e‑mail não estiver cadastrado, um toast informará “Usuário não encontrado” e o campo de ID permanecerá em branco.  
6. Complete o formulário de vínculo selecionando empresa e perfil, e clique em **Salvar** para criar a associação.

## Observações

- A RPC `ncs_resolve_user_by_email` reside no schema público e tem `SECURITY DEFINER`, mas suas permissões de execução estão limitadas ao papel `service_role`.  Usuários autenticados não têm acesso direto a ela.  
- A rota `/api/admin/resolve-user` não expõe mensagens ou códigos de erro do Supabase ao front-end, garantindo encapsulamento da camada de persistência.  
- Este mecanismo elimina o gargalo de copiar o `user_id` manualmente da tabela `auth.users` e reduz erros operacionais durante o onboarding.