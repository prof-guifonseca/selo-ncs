# Sumário Executivo – Dossiê de Propriedade Intelectual

Este sumário apresenta, de forma estruturada e objetiva, os elementos essenciais do dossiê de propriedade intelectual referentes ao **Programa de Verificação Independente: Meu Empreendimento Sustentável (MES)**.  O propósito é documentar a autoria e a titularidade do software, delimitar os ativos envolvidos e fornecer evidências que sustentam o registro de programa de computador no INPI.

## Objetivo do dossiê

- Registrar o estágio atual da **Plataforma Operacional do Programa MES**, utilizando o commit `f3ae298b4c1a82f7048fea1bedaf647026e2b63e` como referência imutável.
- Documentar a separação entre os **ativos institucionais da NCS** (marca, nome do programa e identidade visual), o **Arranjo do Programa** (metodologia, fluxos e documentos) e a **Plataforma** (software/código‑fonte).
- Consolidar inventário técnico, licenças de terceiros, scripts de snapshot e evidências de autoria, mantendo a rastreabilidade para futuras evoluções.

## Fundamentação contratual

- **Ativos institucionais da NCS** – conforme cláusula 6.1 do contrato de licenciamento, a NCS é titular exclusiva da marca “NCS”, do nome do Programa, da identidade visual, dos selos e demais sinais distintivos【689463090271669†L390-L404】.  Tais ativos não são objeto do registro de software.
- **Arranjo do Programa** – a metodologia, procedimentos, fluxos, critérios, templates e documentos que estruturam o Programa foram concebidos por Guilherme Fonseca de Oliveira; a cláusula 6.2 reconhece sua titularidade exclusiva【689463090271669†L405-L435】.
- **Plataforma (software)** – o código‑fonte, arquitetura, componentes e rotinas que viabilizam o Programa pertencem exclusivamente ao Operador, conforme cláusula 6.3【689463090271669†L428-L435】.
- **Licenças recíprocas** – a NCS recebe licença limitada para usar o Arranjo e a Plataforma no âmbito do Programa, e o Operador recebe licença limitada para usar os sinais distintivos da NCS enquanto operar o Programa (cláusulas 6.4 e 6.6).  A NCS compromete‑se a não registrar nem contestar esses ativos (cláusula 6.9)【689463090271669†L553-L560】.
- **Sucessão/cessão** – o contrato prevê a possibilidade de sucessão do Operador por pessoa jurídica controlada ou cessão a terceiro, mediante termo de assunção, sem necessidade de novo contrato (cláusulas 6.8 e 7)【689463090271669†L520-L603】.

## Estrutura do dossiê

O dossiê está organizado em diretórios e arquivos dentro de `docs/ip/dossie/` e `docs/ip/inpi/`:

1. **Titularidade e Ativos Institucionais** (`01_TITULARIDADE_E_ATIVOS_INSTITUCIONAIS_MES_NCS.md`) – descreve quem é titular de cada componente (marca, arranjo, plataforma) e as licenças recíprocas.
2. **Quadro de Delimitação** (`02_QUADRO_DE_DELIMITACAO_MES_ARRANJO_PLATAFORMA.md`) – tabela de uma página que separa o objeto do registro (Plataforma) dos demais ativos e orienta mitigação de riscos de confusão.
3. **Escopo do Software** (`03_ESCOPO_DO_SOFTWARE.md`) – define o que está incluído no registro (código, rotinas, scripts) e o que não está (marca, dados, segredos).
4. **Arquitetura e Componentes** (`04_ARQUITETURA_E_COMPONENTES.md`) – descrição resumida da arquitetura (SPA static‑first, Netlify Functions, Supabase) e seus componentes.
5. **Inventário de Arquivos** (`05_INVENTARIO_DE_ARQUIVOS.md`) – lista de diretórios e arquivos relevantes para o snapshot.
6. **Third‑Party e Licenças** (`06_THIRD_PARTY_E_LICENCAS.md`) – inventário de dependências externas, serviços e ativos de terceiros.
7. **Evidências de Autoria** (`07_EVIDENCIAS_DE_AUTORIA.md`) – registros de commits, contrato, logs e outras provas de criação.
8. **Registro de Mudanças e Hash** (`08_REGISTRO_DE_MUDANCAS_E_HASH.md`) – histórico de snapshots e seus hashes SHA‑512.
9. **Checklists e orientações INPI** (`../inpi/*`) – guias operacionais para protocolo no e‑Software.

## Uso e manutenção

Este dossiê deve ser mantido atualizado a cada evolução relevante do software.  Ao gerar um novo snapshot, registre o hash e a data em `08_REGISTRO_DE_MUDANCAS_E_HASH.md`.  Se novos terceiros ou logos forem incorporados, atualize `06_THIRD_PARTY_E_LICENCAS.md` e arquive as autorizações correspondentes.  Sempre consulte o quadro de delimitação para evitar confusão entre os ativos institucionais da NCS e o software a ser registrado.