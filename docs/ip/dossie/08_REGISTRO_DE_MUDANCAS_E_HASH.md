# Registro de Mudanças e Hashes

Este arquivo mantém um histórico das versões registradas do software e os respectivos hashes SHA‑512 dos snapshots.  Cada linha da tabela representa um ciclo de registro no INPI ou uma evolução relevante do código.  Ao gerar um novo snapshot com `node scripts/ip_snapshot.mjs` e calcular o hash com `node scripts/ip_sha512.mjs`, adicione uma nova entrada abaixo.

| Data (ISO) | Commit / Descrição | Arquivo de snapshot | Hash SHA‑512 | Observações |
| --- | --- | --- | --- | --- |
| 2026‑01‑05 | `f3ae298b4c1a82f7048fea1bedaf647026e2b63e` – estágio atual do Programa MES | `docs/ip/inpi/snapshot.tar` | `2ee24cc12dd553793f4ee2539b4971f16d9a8b0081c7ddfa14eca6e9fd8e04543594d982fa67ef2768cededce4a8d6bd930ecaa98b197b2e99abc0180e301cc0` | Primeiro snapshot do dossiê MES.  Inclui código‑fonte, scripts e documentação. |

> Mantenha esta tabela atualizada.  Não substitua entradas antigas; adicione novas linhas para cada nova versão registrada.