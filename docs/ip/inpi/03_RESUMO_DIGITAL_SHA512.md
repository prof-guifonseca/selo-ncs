# Resumo Digital — Hash SHA‑512

Este documento registra o **resumo digital (SHA‑512)** do snapshot do software correspondente ao estágio de referência `f3ae298b4c1a82f7048fea1bedaf647026e2b63e`.  O resumo digital substitui o depósito do código‑fonte no INPI, garantindo integridade sem divulgar o conteúdo.  Para reproduzir o mesmo hash, siga o procedimento abaixo.

## Como gerar o snapshot

1. A partir da raiz do repositório, execute o script:

   ```bash
   node scripts/ip_snapshot.mjs
   ```

   O script cria um arquivo chamado `snapshot.tar` no diretório `docs/ip/inpi/` contendo apenas arquivos e pastas permitidos (código, scripts, documentação relevante).  Diretórios temporários, dependências de terceiros (`node_modules`), pasta `dist/`, arquivos `.env` e demais credenciais são excluídos.

2. Em seguida, execute:

   ```bash
   node scripts/ip_sha512.mjs
   ```

   Este segundo script lê o arquivo `snapshot.tar`, calcula o hash SHA‑512 e atualiza automaticamente este documento e `../dossie/08_REGISTRO_DE_MUDANCAS_E_HASH.md` com o valor calculado.

## Hash atual

**Valor do hash SHA‑512 do snapshot (commit f3ae298...):**

```
2ee24cc12dd553793f4ee2539b4971f16d9a8b0081c7ddfa14eca6e9fd8e04543594d982fa67ef2768cededce4a8d6bd930ecaa98b197b2e99abc0180e301cc0
```

> Atualize o bloco acima executando `node scripts/ip_sha512.mjs` após gerar o snapshot.  O valor deve ser copiado para o campo “Resumo Digital” do formulário e‑Software.