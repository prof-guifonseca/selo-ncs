/**
 * @file src/types/brand.js
 * @description Tipos JSDoc para configuração de marca (white‑label).
 *
 * Este módulo define as estruturas de dados utilizadas pelo runtime de marcas
 * no front‑end do Selo NCS.  Ao formalizar esses contratos via JSDoc
 * conseguimos habilitar o `checkJs` do TypeScript sem migrar o código
 * para arquivos .ts.  Os tipos aqui descritos documentam as chaves
 * aceitas no `config.json` de cada marca e a forma normalizada
 * retornada por `normalizeBrandConfig()` em `src/brand.js`.  Todos os
 * campos são opcionais para preservar compatibilidade com marcas
 * legadas e permitir expansão futura sem quebras.
 */

// Declaramos um módulo ES para que outros arquivos possam importar
// tipos deste arquivo via `import('./types/brand.js').Tipo` nas
// anotações JSDoc.  A exportação vazia não altera o runtime.
export {};

/**
 * Configuração da marca no formato V0 (flat).
 *
 * No formato V0 todas as chaves ficam no nível superior do JSON.  Os
 * nomes devem ser snake_case conforme a infraestrutura de white‑label
 * original.  Cada campo é opcional; quando ausente, o valor padrão
 * definido no dicionário de traduções será utilizado.  Ver
 * docs/front/WHITE_LABEL_V0.md para mais detalhes.
 *
 * @typedef {Object} BrandConfigV0
 * @property {string} [program_name_full] Nome completo do programa
 *   (instituição/metodologia).
 * @property {string} [program_name_short] Nome curto do programa.
 * @property {string} [seal_name] Nome do selo/programa utilizado em
 *   divulgações.
 * @property {string} [operator_name_full] Nome completo da
 *   operação/plataforma (empresa responsável).
 * @property {string} [operator_name_short] Nome curto da operação/plataforma.
 * @property {string} [support_email] Endereço de e‑mail de suporte.
 * @property {string} [support_whatsapp] Canal/WhatsApp de suporte.
 * @property {string} [legal_base_url] Base URL para documentos legais e
 *   termos.  Usado para construir links de políticas e termos de uso.
 * @property {string} [logo_primary] Caminho para o logo principal
 *   exibido no cabeçalho.
 * @property {string} [logo_partner] Caminho para o logo de parceiro
 *   (opcional).  Quando vazio, o logo de parceiro é ocultado.
 * @property {string} [location_label] Rótulo de localização mostrado
 *   no rodapé (ex.: "Londrina, PR • NCS (INTUEL/UEL)").
 * @property {string} [footer_copyright] Texto de copyright exibido
 *   no rodapé.
 */

/**
 * Configuração da marca no formato V1 (aninhado).
 *
 * A versão 1 da infraestrutura de white‑label agrupa as chaves por
 * domínio (program, operator, support, legal, logo, location e
 * footer).  Estes objetos são opcionais; quando presentes, suas
 * propriedades substituem as equivalentes do formato V0.  Ver
 * docs/front/WHITE_LABEL_V1.md para a descrição completa.
 *
 * @typedef {Object} BrandConfigV1
 * @property {Object} [program] Identidade do Programa
 *   (instituição/metodologia).
 * @property {string} [program.name_full] Nome completo do programa.
 * @property {string} [program.name_short] Nome curto do programa.
 * @property {string} [program.seal_name] Nome do selo/programa.
 * @property {Object} [operator] Identidade da operação/plataforma.
 * @property {string} [operator.name_full] Nome completo da operação/plataforma.
 * @property {string} [operator.name_short] Nome curto da operação/plataforma.
  * @property {string} [operator.legal_name] Nome legal da operação/plataforma.
 * @property {Object} [support] Canais de suporte da marca.
 * @property {string} [support.email] Endereço de e‑mail de suporte.
 * @property {string} [support.whatsapp] Canal/WhatsApp de suporte.
 * @property {Object} [legal] Informações legais da marca.
 * @property {string} [legal.base_url] Base URL para documentos legais e termos.
 * @property {Object} [logo] Logos a serem exibidos no front.
 * @property {string} [logo.primary] Caminho para o logo principal.
 * @property {string} [logo.partner] Caminho para o logo de parceiro.
 * @property {Object} [location] Dados de localização exibidos no rodapé.
 * @property {string} [location.label] Rótulo de localização.
 * @property {Object} [footer] Informações de rodapé.
 * @property {string} [footer.copyright] Texto de copyright do rodapé.

  * @property {Object} [meta] Informações adicionais utilizadas em
  *   metas sociais.  Atualmente suporta somente a imagem padrão.
  * @property {string} [meta.image] URL ou caminho relativo para a
  *   imagem utilizada nas metas OG/Twitter.
 */

/**
 * Configuração de marca normalizada utilizada pelo runtime.
 *
 * A função `normalizeBrandConfig()` em `src/brand.js` aceita entradas
 * nos formatos V0 ou V1 e produz um objeto flat cujas chaves snake_case
 * correspondem às propriedades utilizadas no DOM e no dicionário de
 * i18n.  A configuração normalizada também preserva os objetos
 * aninhados originais (quando fornecidos) para compatibilidade com
 * chamadas existentes.  Todas as propriedades são opcionais.
 *
 * @typedef {BrandConfigV0 & BrandConfigV1} NormalizedBrand
 */