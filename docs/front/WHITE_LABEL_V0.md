# White Label – Versão 0 (Mínimo Viável)

> **Atenção:** Este documento descreve a infraestrutura de white‑label da
> versão 0.  Uma versão mais recente (V1) com separação entre Programa e
> Operação está disponível em [WHITE_LABEL_V1.md](WHITE_LABEL_V1.md).  A
> estrutura V0 continua suportada para compatibilidade, mas recomenda‑se
> a leitura da versão 1 para novos desenvolvimentos.

Este documento descreve a infraestrutura de *white label* e internacionalização (i18n) implementada no MVP do Selo NCS.  O objetivo é reduzir trechos de texto hardcoded no front‑end, centralizando as mensagens institucionais e permitindo que cada marca personalize facilmente nomes, logos e textos de contato sem alterar o código‐fonte.

## Conceitos principais

- **Dicionário de traduções (`src/i18n/ptBR.js`)** – Um objeto flat (chaves com ponto) contendo as mensagens padrão em português.  Estas chaves representam conceitos institucionais (nome do programa, e‑mail de suporte, selo, localização etc.).  As chaves disponíveis são:

  | Chave (key)                  | Descrição                                    | Valor padrão      |
  |------------------------------|-----------------------------------------------|-------------------|
  | `program.name_full`          | Nome completo do programa                    | `NCS: Governança & Impacto` |
  | `program.name_short`         | Nome curto do programa                       | `NCS`             |
  | `program.seal_name`          | Nome do selo/programa para divulgação         | `Selo NCS`        |
  | `support.email`              | E‑mail de suporte                            | `coordenacao@comunidade-ncs.org` |
  | `support.whatsapp`           | Canal/WhatsApp de suporte (pode ser vazio)   | `''` (vazio)      |
  | `legal.base_url`             | Base URL para documentos legais              | `/docs`           |
  | `logo.primary`               | Caminho para o logo principal                | `/images/ncs-logo.png` |
  | `logo.partner`               | Caminho para o logo de parceiro (opcional)   | `/images/logo-intuel.png` |
  | `location.label`             | Rótulo de localização mostrado no rodapé      | `Londrina, PR • NCS (INTUEL/UEL)` |
  | `footer.copyright`           | Texto de copyright exibido no rodapé         | `© 2026 NCS — Governança & Impacto.` |

- **Função `t(key, vars?)`** – Expõe uma API simples de i18n.  Dada uma chave, retorna a mensagem correspondente.  Se a chave não existir, retorna a própria chave.  Quando um objeto `vars` é fornecido, tokens `{name}` dentro da mensagem são substituídos pelos valores de `vars.name` (ex.: `t('hello', { name: 'Ana' })` → `Olá Ana`).

- **Overrides de marca** – O arquivo `brands/<marca>/config.json` pode definir campos como `program_name_full`, `support_email`, `location_label` etc.  Ao inicializar a marca (`initBrand()`), esses campos são automaticamente mapeados para as chaves do dicionário de i18n.  As chaves do dicionário têm precedência sobre o padrão.  Para alterar o nome do programa e e‑mail no front, basta editar o `config.json` da marca:

```json
{
  "program_name_full": "Meu Programa X",
  "program_name_short": "Programa X",
  "seal_name": "Selo X",
  "support_email": "suporte@exemplo.com",
  "location_label": "Cidade, UF • Organização X",
  "footer_copyright": "© 2026 Programa X."
}
```

- **Helper `applyTemplateDeep(obj)`** – Percorre objetos/arrays e substitui tokens no formato `{alguma.chave}` pelo valor de `t('alguma.chave')`.  É utilizado internamente nos conteúdos dos modais (`src/ui.js`) para interpolar o nome do programa/seal sem reescrever todos os textos.

## Como personalizar sua marca

1. Crie uma nova pasta em `brands/<sua-marca>/` contendo um `config.json` (com as chaves acima) e um `brand.css` para sua identidade visual.  O build já procura e injeta ambos com base no hostname, no parâmetro `?brand=` ou no atributo `data-brand` do `<html>`.
2. Preencha `config.json` com os valores desejados.  Apenas os campos presentes serão sobrescritos; os demais continuam com os valores padrão do dicionário.
3. Durante o carregamento (`initBrand()`), o front: (a) lê o `config.json`, (b) injeta o CSS da marca, (c) atualiza o dicionário de i18n com os overrides e (d) substitui logos/textos no DOM.
4. Para utilizar textos personalizados em seus próprios componentes, importe `t()` do módulo `src/i18n/index.js` ou de `src/brand.js` e chame `t('program.name_full')` ou a chave desejada.

## Exemplos de uso

- No HTML/JS estático você pode usar tokens dentro de strings que serão processadas pelo helper.  No exemplo abaixo, a chave do modal "Critérios e Metodologia" inclui `{program.name_full}` e será substituída pelo nome completo definido na marca:

```js
// src/ui.js (fragmento)
const modalContent = {
  criteria: {
    title: 'Critérios e Metodologia',
    body: 'Esta seção resume como funciona o Programa de Verificação Independente — {program.name_full} (E/S/G) ...',
  },
  // ...
};
```

- Em scripts ou componentes, importe `t()` e use diretamente:

```js
import { t } from './brand.js';

const pageTitle = t('program.name_full');
document.title = pageTitle;
```

Com essa infraestrutura, todas as referências institucionais ficam centralizadas e podem ser facilmente atualizadas pelo time responsável pela marca sem necessidade de alterações no código.