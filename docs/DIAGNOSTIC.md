# Diagnóstico clínico do repositório (stubs + inconsistências + ganhos rápidos)

**Data:** 2026-01-06  
**Escopo:** análise baseada exclusivamente no conteúdo do ZIP do repo.

## 1) Inconsistências de contrato (o que causa bugs “inexplicáveis”)

### 1.1 Rota legacy `/api/auditor/*` removida

No estado atual do repositório não existe mais uma rota `/api/auditor/*`.
O arquivo `routes_auditor.js` foi removido e o roteador (`netlify/functions/api/index.js`)
não encaminha mais nenhuma chamada com prefixo `auditor`.  Isso elimina a
recursão e os timeouts descritos anteriormente.  Qualquer requisição para
`/api/auditor/*` agora retorna 404 imediatamente.

**Ação aplicada:** remover completamente a rota e suas referências.  A
documentação e testes foram alinhados para refletir essa remoção.

---

### 1.2 Re-exportação de handlers inexistentes

O arquivo `netlify/functions/api.js` anteriormente re‑exportava handlers
relacionados ao auditor (`handleAuditor*`), mas esses handlers não existiam na
implementação real (`netlify/functions/api/index.js`).  O reexportador foi
corrigido para deixar de expor funções que não existem.  Agora somente os
handlers reais (`handleHealth`, `handleAuth`, `handleAppState`, etc.) são
reexportados.

**Impacto:** reduz ruído de manutenção e previne armadilhas para quem
importar handlers inexistentes.

---

### 1.3 Telemetria unificada

O endpoint principal de telemetria (`netlify/functions/telemetry.js`) no MVP atual **não persiste** eventos.  Ele valida o payload JSON e retorna um `204` como **ACK** sem gravar registros em banco; serve como gancho para futuras melhorias de observabilidade.  A função
legacy `telemetry-batch.js` foi removida deste repositório; qualquer
chamada ao endpoint antigo resultará em **404** imediato.  Os redirects em
`netlify.toml` apontam `/api/telemetry` para `/.netlify/functions/telemetry`
como canal único de coleta desse ACK de telemetria.

**Impacto:** há um canal único para telemetria real, e chamadas ao endpoint
antigo falham de forma controlada.

---

## 2) Stubs / legado que pesam no valuation (superfície e custo cognitivo)

### 2.1 Camadas “compat” no front
As antigas camadas de compatibilidade no front foram praticamente eliminadas:
- `src/services/api.js` agora delega todas as chamadas via `remoteDriver.js` ao backend, sem stubs antigos.
- `src/state.js` atua como store simples e não importa mais nenhuma store legada.
- `src/ui.js` mantém apenas alguns helpers e não injeta funções críticas em `window`.

**Ganho realizado:** a fonte de dados única é o backend; o risco de regressão silenciosa caiu significativamente.

---

### 2.2 Dependências NPM potencialmente não usadas
As dependências `openai` e `@supabase/supabase-js` foram removidas do `package.json`. O chat usa `fetch` com a API da OpenAI quando configurada, e o acesso ao Supabase é via REST/Storage.

**Ganho realizado:** a cadeia de dependências ficou menor e mais previsível.

---

### 2.3 Reprodutibilidade: ausência de lockfile
Agora há `package-lock.json` com versões travadas. O script `npm run ci` usa `npm ci` para garantir builds determinísticos.

**Ganho realizado:** builds e CI tornaram‑se reproduzíveis.

### 2.4 Dashboards antes da revisão (problemas e correção)

Os três painéis (participante, avaliador e gestor) haviam sido implementados de forma heterogênea, com mensagens genéricas e alguns pontos técnicos que quebravam o fluxo de JavaScript:

- importações duplicadas e variáveis globais ausentes no `auditor.js` (por exemplo, `showToast` duplicado e uso de `state` sem import) ocasionavam erros em tempo de execução;
- ausência de feedback de carregamento/erro em telas com grande dependência de chamadas assíncronas, gerando páginas vazias quando o backend falhava;
- stubs silenciosos que não informavam ao usuário que determinada ação ainda não estava disponível.

**Correções aplicadas:**

- Os dashboards foram revisitados, normalizando as importações (removidas duplicações e adicionadas dependências explícitas como `state` em `auditor.js`), tornando a inicialização idempotente e prevenindo múltiplos *event listeners*;
- Foi criado um elemento `announcer` em cada dashboard para anunciar estados de carregamento e erro, garantindo acessibilidade e feedback imediato;
- Mensagens de toast e callouts foram reescritas com base no regulamento: avisos de prazo, impedimento de consultoria, princípio de deferência técnica etc.;
- Stubs agora trazem `// TODO(stub)` no código e exibem callouts orientando o usuário sobre a ausência temporária de determinada funcionalidade e citando o artigo correspondente nos documentos.

Com essas correções, o fluxo de JS não quebra mais e o MVP pode ser demonstrado sem travamentos, mesmo quando o backend não responde ou certas rotas não existem.

---

## 3) Robustez e “valor percebido”: alavancas objetivas

### 3.1 RLS hard gate em staging
Quando `NCS_USE_RLS=1` + `NCS_REQUIRE_AUTH=1`:
- cross‑tenant deve falhar consistentemente (defensável)
- 401/503 devem ser previsíveis (fail‑closed)

**Por que isso muda o jogo:** reduz risco reputacional e jurídico (vazamento) e aumenta confiabilidade em pilotos.

---

### 3.2 Audit trail persistente (mínimo)
Você já tem a base (`ncs_audit_log`). O salto é padronizar eventos essenciais:
- publish
- decisão final
- mudança de assignment
- commit de evidência

**Por que importa:** “governança demonstrável” vira entregável.

---

### 3.3 Disciplina de release
- SemVer consistente
- `CHANGELOG` real
- smoke como gate

**Por que importa:** reduz regressão e aumenta confiança de terceiros.

---

## 4) Lista curta de correções prioritárias (ordem sugerida)

1) Remover/arrumar `/api/auditor/*` (evitar recursão)  
2) Alinhar `ROUTE_MAP.md` / `docs/API.md` com o router real  
3) Commitar `package-lock.json` e migrar CI para `npm ci`  
4) Unificar “telemetry vs audit” (ou renomear/explicitar)  
5) Reduzir compat/legado no front conforme DoD de cada passo  
6) Remover deps não usadas (se confirmado em revisão final)

> **Observação:** o prognóstico (previsão de tarefas futuras) e os critérios de aceite (Definition of Done) não estão mais mantidos em um roadmap separado.  As prioridades e a lista de pendências atuais estão consolidadas em `STATUS.md`, e o checklist de release em `RELEASE_CHECKLIST.md` traz os passos necessários para preparar e publicar uma nova versão.  Consulte esses documentos para orientar o planejamento sem recorrer a roadmaps legados.
