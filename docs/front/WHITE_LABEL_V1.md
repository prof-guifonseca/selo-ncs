# White Label – Versão 1 (Separação de Programa e Operação)

Este documento descreve a evolução do *white label* e da infraestrutura de
internacionalização (i18n) para o Selo NCS.  A versão 1 adiciona uma
separação explícita entre o **Programa** (instituição/metodologia) e a
**Operação** (plataforma técnica/comercial), permitindo maior flexibilidade na
personalização sem alterar a lógica de núcleo.  A compatibilidade com a
estrutura da versão 0 (flat) é mantida: chaves superiores continuam válidas,
mas recomenda‑se utilizar a estrutura aninhada descrita abaixo.

## Estrutura da configuração de marca (V1)

Cada marca vive em `brands/&lt;marca&gt;/` com dois arquivos: `config.json` e
`brand.css`.  O `config.json` pode seguir o formato V0 (todas as chaves no
nível superior) ou o formato V1, que agrupa informações por domínio.

### Objetos aninhados

| Grupo      | Chaves                              | Descrição curta                                                |
|------------|--------------------------------------|----------------------------------------------------------------|
| `program`  | `name_full`, `name_short`, `seal_name` | Identidade do Programa (gestora/decisão e metodologia).        |
| `operator` | `name_full`, `name_short`             | Identidade da Operação (plataforma técnica/comercial).         |
| `support`  | `email`, `whatsapp`                   | Canais de suporte da marca (e‑mail, WhatsApp).                 |
| `legal`    | `base_url`                            | Base URL para documentos legais e termos.                      |
| `logo`     | `primary`, `partner`                  | Logos (principal e de parceiro).                               |
| `location` | `label`                               | Rótulo de localização exibido no rodapé.                       |
| `footer`   | `copyright`                           | Texto de copyright exibido no rodapé.                          |

Os nomes acima são case‑sensitive.  As chaves V0 equivalentes (por exemplo,
`program_name_full` ou `support_email`) continuam funcionais; quando as duas
formas são fornecidas, a estrutura V1 tem precedência.

### Exemplo de `config.json` V1

```json
{
  "program": {
    "name_full": "Meu Programa",
    "name_short": "Programa X",
    "seal_name": "Selo X"
  },
  "operator": {
    "name_full": "Empresa Operadora X",
    "name_short": "Operação X"
  },
  "support": {
    "email": "suporte@exemplo.com",
    "whatsapp": "+55 11 99999-9999"
  },
  "legal": {
    "base_url": "/docs"
  },
  "logo": {
    "primary": "/images/logo-meu-programa.png",
    "partner": ""
  },
  "location": {
    "label": "São Paulo, SP • Minha Organização"
  },
  "footer": {
    "copyright": "© 2026 Meu Programa."
  }
}
```

### Dicionário de traduções

O módulo `src/i18n/ptBR.js` define as chaves padrão usadas no front.  Na versão 1
foram adicionadas as chaves:

- `operator.name_full` – nome completo da operação/plataforma;
- `operator.name_short` – nome curto da operação/plataforma.

Os valores padrão são “Operação da Plataforma” e “Operação”, respectivamente.
Estas chaves permitem que textos institucionais e legais distingam o Programa
da Operação.  Outros grupos (program, support, legal, logo, location e
footer) continuam idênticos à versão anterior.

### Como funciona a normalização

Durante o bootstrap (`initBrand()`), o front carrega o `config.json` e
executa uma função interna (`normalizeBrandConfig()`) que converte tanto V0
quanto V1 para uma forma flat.  Isso garante que:

- Chaves de V0 (ex.: `program_name_full`) continuam reconhecidas;
- Chaves aninhadas de V1 (ex.: `program.name_full`) têm precedência e são
  expostas também como `program_name_full` para compatibilidade;
- O dicionário de i18n recebe overrides para todas as chaves conhecidas,
  incluindo `operator.name_full` e `operator.name_short`.

Se elementos do DOM com IDs `navbar-operator-name` ou `footer-operator-title`
estiverem presentes, o runtime de marca (`applyBrandRuntime()`) os preenche
com os valores correspondentes.  Caso não existam, nada é alterado.

## Migrando da versão 0 para a versão 1

1. **Estrutura do arquivo**: em vez de listar todas as chaves no nível
   superior, agrupe os campos conforme a tabela acima.  Manter as chaves
   antigas é opcional, mas não prejudica.
2. **Adicionar a operação**: defina `operator.name_full` e
   `operator.name_short` para identificar quem opera tecnicamente a
   plataforma (empresa responsável pela operação).  Na marca cs (padrão), estes
   valores são “CS Hub Tecnologia de Validação LTDA”/“CS Hub” (exemplo).
3. **Revisar textos institucionais**: se utilizar tokens como
   `{operator.name_full}` em documentos ou modais, verifique o dicionário
   de traduções para garantir que as chaves existam.

Com estas mudanças, a infraestrutura mantém compatibilidade com marcas V0
enquanto oferece maior flexibilidade e conformidade com a arquitetura de
segregação de funções (casca vs. núcleo) do Selo NCS.

## Contratos tipados (checkJs)

Para reduzir o risco de “drift” e facilitar o refactor do white‑label,
formalizamos os contratos de configuração de marca via JSDoc com
`checkJs` habilitado.  Os tipos vivem no arquivo
`src/types/brand.js` e documentam as propriedades aceitas pelo
`config.json` de cada marca.  O runtime importa esses tipos nas
anotações JSDoc de `src/brand.js` e o pipeline de CI (`npm run
typecheck:front`) verifica que a implementação está em conformidade.

- **Onde ficam os tipos?** — O módulo `src/types/brand.js` define
  `BrandConfigV0`, `BrandConfigV1` e `NormalizedBrand`.  O primeiro
  representa o formato flat (V0), o segundo corresponde à estrutura
  aninhada (V1) e o terceiro descreve a forma normalizada que o runtime
  utiliza internamente.
- **Como adicionar campos sem quebrar compatibilidade?** — Ao
  introduzir um novo campo na configuração de marca, declare a
  propriedade como opcional no tipo apropriado (`BrandConfigV0` ou
  `BrandConfigV1`).  Em seguida, mapeie a chave no helper
  `normalizeBrandConfig()` e, se aplicável, atualize
  `applyBrandRuntime()` para refletir o valor no DOM.  Como todos os
  campos dos contratos são opcionais, chaves adicionais serão
  ignoradas em versões antigas, preservando compatibilidade com marcas
  legadas.