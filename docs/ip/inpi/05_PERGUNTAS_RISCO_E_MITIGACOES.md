# Perguntas Frequentes, Riscos e Mitigações

Este documento reúne dúvidas recorrentes e recomendações para reduzir riscos no processo de registro do software e na gestão de propriedade intelectual relacionada ao Programa MES.  As respostas baseiam‑se no contrato de licenciamento e na legislação de programas de computador.

## O registro no INPI transfere a propriedade do software?

**Não.** O registro de programa de computador tem natureza **declaratória** e serve como mecanismo de prova de autoria e data de criação.  A titularidade continua sendo do LICENCIANTE/OPERADOR, conforme cláusulas 6.2 e 6.3 do contrato【689463090271669†L405-L435】.  O INPI não analisa originalidade nem inovação, apenas formaliza a declaração.

## É obrigatório depositar o código‑fonte no INPI?

**Não.** O INPI aceita o **resumo digital** (hash SHA‑512) como substituto do código‑fonte.  O snapshot do software deve ser guardado pelo titular e a cadeia de custódia mantida em arquivo interno.  Apenas o valor do hash é protocolado.

## O que evitar ao gerar o snapshot?

Exclua do snapshot arquivos que possam conter dados pessoais, credenciais, chaves de API ou outras informações confidenciais.  Não inclua a pasta `node_modules`, a pasta `dist/` ou arquivos temporários.  Utilize o script `ip_snapshot.mjs` para filtrar corretamente.

## Como separar a marca “MES” do software?

Conforme a cláusula 6.1, a **marca**, o **nome do programa** e os **sinais distintivos** são ativos institucionais da CONTRATANTE【689463090271669†L390-L404】.  O registro do software não confere direitos sobre esses ativos.  Utilize o quadro de delimitação (`../dossie/02_QUADRO_DE_DELIMITACAO_MES_ARRANJO_PLATAFORMA.md`) para descrever claramente o que pertence à NCS e o que pertence ao Operador.

## Quem deve assinar a Declaração de Veracidade?

A DV deve ser assinada pelo titular do software (Guilherme Fonseca de Oliveira) ou por seu procurador.  Se houver sucessão/cessão para pessoa jurídica controlada, o Termo de Assunção deve ser anexado e a DV deve refletir o novo titular【689463090271669†L520-L603】.

## O contrato impede que a NCS registre o arranjo ou a plataforma?

Sim.  A cláusula 6.9 prevê a **não contestação** e a vedação de registros conflitantes: a CONTRATANTE compromete‑se a não registrar ou reivindicar direitos sobre o Arranjo do Programa ou a Plataforma, que pertencem ao Operador【689463090271669†L553-L560】.

## O Operador pode vender ou licenciar o software para terceiros?

Sim.  A cláusula 6.7 afirma que nada impede o Operador de vender, licenciar ou comercializar o Arranjo do Programa e/ou a Plataforma, desde que não use a marca “NCS” e não divulgue informações confidenciais【689463090271669†L498-L514】.  Isso reforça a importância de separar o nome e os sinais distintivos da NCS do software.

## Como lidar com dependências de terceiros?

Liste todas as bibliotecas, serviços e assets em `../dossie/06_THIRD_PARTY_E_LICENCAS.md`, com as licenças correspondentes.  Guarde evidências de permissão de uso para marcas e logos.  Remova dependências não utilizadas para reduzir exposição a riscos de supply chain.