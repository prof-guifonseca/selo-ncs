# Dependências de Terceiros e Licenças

Este documento lista as plataformas, bibliotecas e assets de terceiros utilizados pela Plataforma Operacional do Programa MES, bem como suas licenças conhecidas.  Manter um inventário atualizado de dependências é essencial para auditoria de supply chain, conformidade legal e registro de software.

## Plataformas e serviços

| Serviço | Uso | Licença / observações |
| --- | --- | --- |
| **Netlify** | Hospedagem estática da SPA e execução de funções serverless (`netlify/functions/`). | Serviço comercial com termos próprios de uso; a plataforma não é distribuída no snapshot. |
| **Supabase** | Banco de dados PostgreSQL, autenticação (JWT) e armazenamento de arquivos.  A aplicação utiliza as APIs REST de Supabase via `fetch`. | Plano free tier; uso regido pelos termos da Supabase. |
| **OpenAI API** (opcional) | Fornece funcionalidades de chat IA para a rota `/api/chat`.  Ativado apenas se a variável de ambiente `OPENAI_API_KEY` estiver presente. | API proprietária; consumo sujeito a custos variáveis e termos de serviço da OpenAI.  O snapshot não inclui a chave de API. |

## Bibliotecas npm

No commit de referência (`f3ae298…`) o projeto **não possui dependências de produção** declaradas em `package.json`.  As únicas dependências listadas são `typescript` e `eslint` como ferramentas de desenvolvimento.  O código do backend utiliza apenas módulos nativos do Node.js (`crypto`, `url`, `http`, `fs`, etc.).

## Assets e marcas de terceiros

| Asset | Localização | Titularidade / licença |
| --- | --- | --- |
| Logos da NCS, UEL, INTUEL, AINTEC | `images/` e `public.html` | São ativos institucionais da NCS ou de parceiros acadêmicos; o uso é autorizado apenas no contexto do Programa.  Não fazem parte do objeto de registro de software【689463090271669†L390-L404】. |
| Ícones e imagens genéricas | `images/` | Até a data do snapshot, não foram identificadas bibliotecas de ícones externas.  Caso sejam adicionadas, registrar a fonte e a licença. |

## Recomendações

- Antes de adicionar novas dependências, avalie se a funcionalidade realmente exige a biblioteca.  Dependências desnecessárias aumentam a superfície de ataque e a complexidade de auditoria.
- Para cada nova biblioteca ou asset, registre a fonte, a licença e o local de utilização neste inventário.  Guarde evidências (prints, termos, e‑mails) em arquivo seguro fora do repositório.
- Caso o projeto venha a utilizar bibliotecas populares (p.ex. `openai`, `@supabase/supabase-js`), mantenha o lockfile (`package-lock.json`) atualizado para assegurar reprodutibilidade.