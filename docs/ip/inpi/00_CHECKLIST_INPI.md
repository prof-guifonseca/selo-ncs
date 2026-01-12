# Checklist para Registro de Programa de Computador (INPI/e‑Software)

Este checklist reúne, em formato operacional, os passos necessários para formalizar o registro do estágio atual do software no Instituto Nacional de Propriedade Intelectual (INPI) pelo sistema **e‑Software**.  O objetivo do registro é gerar prova pública de autoria e titularidade sobre a **Plataforma Operacional do Programa MES (Meu Empreendimento Sustentável)** e mitigar riscos de confusão com os ativos institucionais da NCS.

## Antes de iniciar

- Confirme que o **estágio de referência** para registro corresponde ao commit fixado `f3ae298b4c1a82f7048fea1bedaf647026e2b63e` do repositório.  Todas as evidências, snapshots e hashes devem ser derivados desse estado.
- Prepare um **snapshot reproducível** do código (ver script `scripts/ip_snapshot.mjs`) e calcule o **hash SHA‑512** do snapshot (ver `scripts/ip_sha512.mjs`).  O resumo digital calculado deve constar em `03_RESUMO_DIGITAL_SHA512.md`.
- Reúna os documentos que comprovam a **titularidade** e a **licença**: contrato de licenciamento assinado, comprovante de autoria (histórico de commits, copyright/notice).
- Leia atentamente o **quadro de delimitação** (`../dossie/02_QUADRO_DE_DELIMITACAO_MES_ARRANJO_PLATAFORMA.md`) para evitar incluir ativos institucionais da NCS (marca, nome do programa, selos) no escopo de software a ser registrado.

## Preenchimento do formulário e‑Software

1. **Dados do software** – utilize o rascunho em `01_CAMPOS_ESOFTWARE_RASCUNHO.md` para preencher campos como nome do programa, titular, autores, data de criação e categoria.
2. **Resumo técnico** – inclua no campo correspondente o texto de `02_RESUMO_TECNICO.md`.  Este resumo deve descrever, em linguagem clara e sem revelar segredos, a finalidade e a arquitetura do software.
3. **Resumo digital (hash)** – copie o valor do SHA‑512 calculado conforme `03_RESUMO_DIGITAL_SHA512.md` no campo “Resumo Digital” do formulário.
4. **Declaração de Veracidade (DV)** – anexe a DV assinada digitalmente com certificado ICP‑Brasil.  O modelo e orientações estão em `04_DV_E_PROCURAÇÃO_ORIENTACOES.md`.
5. **Procuração (se aplicável)** – caso o registro seja protocolado por procurador, anexe a procuração com poderes específicos para o ato.  Consulte o item 6.8 do contrato para tratar de sucessão ou cessão de direitos【689463090271669†L498-L535】.
6. **Comprovantes internos** – mantenha fora do protocolo, mas arquive internamente: contrato, comprovantes de autoria, logs de builds, prints de dashboards, capturas de API e outras evidências listadas em `../dossie/07_EVIDENCIAS_DE_AUTORIA.md`.

## Após o protocolo

- Monitore o despacho do INPI e guarde o protocolo/e‑Certidão em local seguro.
- Atualize `08_REGISTRO_DE_MUDANCAS_E_HASH.md` com a data de registro e o número do processo.
- Se o software evoluir, repita o processo gerando novo snapshot e novo hash, mantendo a rastreabilidade entre versões.

> **Importante:** O registro de programa de computador no INPI tem natureza **declaratória**.  O INPI não avalia a originalidade do código e não necessita do código‑fonte completo; o resumo digital (hash) é suficiente para comprovar o estado da obra.  Guarde internamente o snapshot e as evidências para assegurar a cadeia de autoria.