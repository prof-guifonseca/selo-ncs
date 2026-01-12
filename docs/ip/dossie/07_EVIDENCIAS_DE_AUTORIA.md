# Evidências de Autoria e Titularidade

Para sustentar a autoria do software e demonstrar a cadeia de titularidade, este dossiê reúne as principais evidências disponíveis no momento do registro.  A preservação dessas evidências é indispensável em eventual disputa ou questionamento.

## 1. Histórico de desenvolvimento

- **Commit de referência:** `f3ae298b4c1a82f7048fea1bedaf647026e2b63e` (hash informado pelo repositório).  Esse commit representa o estágio exato usado no snapshot e pode ser verificado no histórico do Git local (não incluído no snapshot).
- **Logs de commit:** o controle de versão registra as alterações realizadas por Guilherme Fonseca de Oliveira e eventuais colaboradores, com data, mensagem e autoria digital (assinatura).  Exportar esses logs (`git log --pretty=fuller`) e guardar em arquivo interno.
- **Scripts de build e testes:** os scripts `build.js`, `scripts/smoke.mjs` e `scripts/smoke_backend.mjs` demonstram domínio técnico sobre a arquitetura e suportam a alegação de autoria.  Eles devem ser preservados juntamente com suas saídas (logs de execução).

## 2. Documentação legal

- **Contrato de licenciamento NCS × Operador:** documento assinado em 2025 (anexado externamente) que estabelece a titularidade dos ativos institucionais da NCS e do Arranjo/Plataforma, bem como as licenças recíprocas【689463090271669†L390-L404】【689463090271669†L405-L435】.
- **COPYRIGHT.md, LICENSE e NOTICE:** arquivos no repositório que declaram a titularidade do software e indicam que o código é proprietário do Operador.
- **Declaração de Veracidade (DV):** a DV assinada digitalmente no momento do protocolo atesta a veracidade das informações fornecidas ao INPI e deve ser arquivada.

## 3. Evidências funcionais

- **Capturas de tela (prints):** imagens das principais telas (login, dashboards, envio de evidências, geração de relatório) demonstram a existência e o funcionamento do software no estado registrado.  Guardar as capturas com carimbo de data/hora.
- **Relatórios gerados:** exportar um relatório de teste via `netlify/functions/report.js` e armazenar a versão HTML/JSON como prova de funcionalidade.
- **Contrato de API:** captura das rotas da API em execução (por exemplo, via `curl` ou Insomnia), incluindo status de saúde (`/api/health`), para comprovar o comportamento das funções.

## 4. Evidências de terceiros e autorizações

- **Permissões de uso de marca:** conservar termo ou e‑mail da NCS autorizando o uso de logo e nome do Programa na aplicação (cláusula 6.6)【689463090271669†L483-L491】.
- **Autorizações de logos parceiros:** se houver logos de UEL/INTUEL/AINTEC, registrar as anuências correspondentes.
- **Licenças de bibliotecas:** armazenar cópia das licenças das bibliotecas utilizadas, especialmente se vierem a ser adicionadas dependências externas no futuro.

> As evidências listadas acima devem ser mantidas em local seguro e sob responsabilidade do titular.  Apenas uma parte delas (contrato, DV e resumo digital) precisa ser apresentada ao INPI.  As demais compõem o dossiê interno de PI.