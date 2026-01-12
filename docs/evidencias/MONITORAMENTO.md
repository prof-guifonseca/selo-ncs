# Monitoramento básico “zero infra”

Este documento descreve uma configuração de monitoramento simples para o selo NCS que não requer infraestrutura dedicada.  Ele serve como **evidência operacional** para diligência e auditorias, demonstrando que o serviço está sendo acompanhado e que alertas são disparados quando algo sai do ar.

## O que monitorar

O alvo principal do monitoramento deve ser a **página inicial pública** da aplicação hospedada em Netlify.  A URL oficial de produção é:

```
https://selo‑ncs.netlify.app/
```

A requisição pode ser feita com método `GET` ou `HEAD` e deve retornar status `200 OK`.  Esse endpoint indireta‑mente valida tanto o front‑end quanto o backend, já que o HTML de entrada importa os assets compilados e inicializa a aplicação.  Opcionalmente, pode‑se monitorar também o endpoint de saúde da API (`/api/health`) que retorna um JSON com campos simples (`ok`, `time`, `context` etc.).

## Frequência sugerida

- **Intervalo:** 5 minutos (ou o menor intervalo permitido pelo serviço escolhido).  Isso equilibra custo e tempo de detecção.
- **Retentativas:** defina pelo menos **2 falhas consecutivas** antes de notificar, para evitar falsos positivos causados por problemas de rede temporários.

## Critério de alerta

- Notifique quando houver **duas respostas consecutivas não‑200** (status ≥ 400 ou timeout).
- Trate respostas 301/302 como sucesso apenas se redirecionarem para a mesma origem; redirecionamentos para páginas de erro devem contar como falha.

## Checklist de configuração

Estas instruções assumem o uso do **UptimeRobot**, mas qualquer serviço equivalente (StatusCake, Better Uptime etc.) pode ser utilizado.

1. **Criar monitor HTTP(s)**
   - Tipo: *HTTP(s) monitor*.
   - Nome: `selo‑ncs`.
   - URL: `https://selo‑ncs.netlify.app/`.
   - Método: `GET` ou `HEAD`.
   - Intervalo: 5 minutos.
   - Timeout: 10 s (ajuste conforme estabilidade da rede).
   - Confirmar falha após 2 tentativas.
2. **Configurar alertas**
   - Destinos recomendados: e‑mail da equipe responsável, canal de alerta em Slack/Teams e (opcional) telefone via SMS.
   - No painel do UptimeRobot, adicione os contatos e associe‑os ao monitor criado.
3. **Ativar Netlify Status Alerts**
   - Acesse o dashboard do site no Netlify.
   - Vá em *Site notifications* → *Status notifications*.
   - Cadastre os mesmos e‑mails ou webhooks utilizados no UptimeRobot.
4. **Criar alertas de disponibilidade no Supabase**
   - Embora a API funcione sem banco de dados durante o health check, é recomendável monitorar a instância do Supabase para latência e disponibilidade.
   - No painel do Supabase, acesse *Projects → Settings → Alerts*.
   - Configure alertas para tempo de resposta alto (>1 s) e quedas de conexão.

> **Nota de sigilo:** não inclua tokens ou URLs assinadas nos campos de monitoramento.  O endpoint `/api/health` é público e não exige autenticação.

## Como validar

1. **Simular falha em staging**
   - Em um ambiente de staging (por exemplo `selo‑ncs‑staging.netlify.app`), altere temporariamente o conteúdo do `index.html` para retornar um erro 500 ou 404.  Alternativamente, configure uma regra de redirecionamento que aponte para uma página inexistente.
   - Aguarde 2 ciclos de monitoramento (10 min) e verifique se os alertas do UptimeRobot e do Netlify foram disparados para os destinatários configurados.
2. **Restaurar o serviço**
   - Revertido o erro de staging, confirme que o monitor volta a exibir status **UP** e que as notificações de recuperação foram recebidas.
3. **Registrar evidências**
   - Capture capturas de tela ou logs das notificações (e‑mail, Slack) demonstrando que o alerta foi recebido e anexe a este repositório (ou forneça na due diligence).  Lembre‑se de ocultar endereços de e‑mail ou URLs sensíveis.

## Referência rápida para operação

- Para verificar manualmente a saúde da API via CLI, utilize:

  ```sh
  curl -s https://selo‑ncs.netlify.app/.netlify/functions/api/health | jq .
  ```

  A resposta deve ter `"ok": true` e incluir outras informações como horário (`time`) e contexto de build (`context`).
- Para automatizar verificações locais durante o desenvolvimento, consulte o script `scripts/health_check.mjs` incluído neste repositório.
