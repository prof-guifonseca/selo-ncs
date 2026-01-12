// src/brand.js — Loader e runtime de marcas
//
// Este módulo implementa a mecânica de white‑label para o Selo NCS. A ideia é
// separar configuração de marca (nomes, cores, logos, links) da lógica e
// layout principal. Cada marca vive dentro de brands/<name>/ com um
// config.json e um brand.css. A função initBrand() resolve a marca
// corrente, carrega a configuração, injeta o CSS e aplica alterações no DOM.

// Habilita verificação de tipos em arquivos JavaScript via TypeScript.  Essa
// diretiva faz com que `npm run typecheck:front` valide este módulo com base
// nas anotações JSDoc, reduzindo o risco de regressões silenciosas sem
// exigir migração para arquivos .ts.
// @ts-check

/**
 * Mapeia hostnames para marcas. Caso precise servir múltiplos domínios
 * apontando para diferentes marcas, adicione entradas aqui. Se um hostname
 * não existir no mapa, cai para a marca default.
 * @type {Record<string, string>}
 */
const HOST_BRAND_MAP = Object.freeze({});

// Marca padrão (neutra) da plataforma. Passa a ser 'cs' em vez de 'default'.
let _brand = 'cs';
/** @type {any|null} */
let _config = null;
/** @type {Promise<any>|null} */
let _ready = null;

// -----------------------------------------------------------------------------
// Normalização de configuração
// -----------------------------------------------------------------------------
// As marcas podem definir sua configuração em dois formatos: V0 (chaves snake_case
// no nível superior) e V1 (objetos aninhados por domínio, ex.: program,
// operator, support, legal, logo, location, footer).  A função abaixo
// converte uma configuração arbitrária para a forma flat esperada pelo
// restante do runtime.  Chaves existentes em V0 são preservadas; valores
// definidos em objetos V1 sobrescrevem os equivalentes snake_case.  Chaves
// vazias ou ausentes são ignoradas.  O retorno mantém as propriedades
// aninhadas originais para compatibilidade, mas garante que campos
// program_name_full, program_name_short, seal_name, operator_name_full,
// operator_name_short, support_email, support_whatsapp, legal_base_url,
// logo_primary, logo_partner, location_label e footer_copyright estejam
// presentes quando fornecidos pelo usuário.

/**
 * Normaliza uma configuração de marca V0/V1 para a forma flat usada internamente.
 * Chaves V1 (objetos aninhados) são mapeadas para chaves snake_case e
 * adicionadas ao objeto retornado.  Chaves V0 pré-existentes permanecem
 * intactas.  Objetos aninhados originais são preservados para backward
 * compatibility.
 *
 * @param {any} cfg
 *   Configuração bruta lida do arquivo JSON.  Aceita tanto o formato
 *   V0 (chaves snake_case) quanto o formato V1 (objetos aninhados).  Se
 *   `cfg` for `null` ou não for um objeto, um objeto vazio será
 *   retornado.
 * @returns {import('./types/brand.js').NormalizedBrand} Configuração
 *   normalizada contendo as chaves snake_case e preservando objetos
 *   aninhados quando fornecidos.
 */
export function normalizeBrandConfig(cfg) {
  // Copia superficial para não mutar a origem
  const normalized = cfg && typeof cfg === 'object' ? { ...cfg } : {};
  if (!cfg || typeof cfg !== 'object') return normalized;
  // Program
  if (cfg.program && typeof cfg.program === 'object') {
    const p = cfg.program;
    if (p.name_full != null && p.name_full !== '') normalized.program_name_full = p.name_full;
    if (p.name_short != null && p.name_short !== '') normalized.program_name_short = p.name_short;
    if (p.seal_name != null && p.seal_name !== '') normalized.seal_name = p.seal_name;
  }
  // Operator
  if (cfg.operator && typeof cfg.operator === 'object') {
    const o = cfg.operator;
    if (o.name_full != null && o.name_full !== '') normalized.operator_name_full = o.name_full;
    if (o.name_short != null && o.name_short !== '') normalized.operator_name_short = o.name_short;
  }
  // Support
  if (cfg.support && typeof cfg.support === 'object') {
    const s = cfg.support;
    if (s.email != null && s.email !== '') normalized.support_email = s.email;
    if (s.whatsapp != null && s.whatsapp !== '') normalized.support_whatsapp = s.whatsapp;
  }
  // Legal
  if (cfg.legal && typeof cfg.legal === 'object') {
    const l = cfg.legal;
    if (l.base_url != null && l.base_url !== '') normalized.legal_base_url = l.base_url;
  }
  // Logo
  if (cfg.logo && typeof cfg.logo === 'object') {
    const lg = cfg.logo;
    if (lg.primary != null && lg.primary !== '') normalized.logo_primary = lg.primary;
    if (lg.partner != null && lg.partner !== '') normalized.logo_partner = lg.partner;
  }
  // Location
  if (cfg.location && typeof cfg.location === 'object') {
    const loc = cfg.location;
    if (loc.label != null && loc.label !== '') normalized.location_label = loc.label;
  }
  // Footer
  if (cfg.footer && typeof cfg.footer === 'object') {
    const f = cfg.footer;
    if (f.copyright != null && f.copyright !== '') normalized.footer_copyright = f.copyright;
  }
  return normalized;
}

// -----------------------------------------------------------------------------
// Integração com i18n
// -----------------------------------------------------------------------------
// Importamos apenas as funções necessárias do módulo de i18n.  Isto permite
// alimentar os overrides de tradução com base na configuração de marca e
// expor a função de tradução para uso geral.
import { setBrandOverrides, t as i18nT } from './i18n/index.js';

/**
 * Converte uma configuração de marca em um conjunto de chaves de tradução.
 * O objeto de configuração usa campos snake_case (ex.: program_name_full) e
 * aqui mapeamos explicitamente esses campos para as chaves do dicionário
 * flat utilizado pelo i18n (ex.: 'program.name_full').  Somente chaves
 * relevantes a textos institucionais são mapeadas.  Campos vazios ou
 * ausentes são ignorados.
 *
 * @param {any} cfg
 * @returns {Record<string, any>}
 */
function mapConfigToTranslations(cfg) {
  const overrides = {};
  if (!cfg || typeof cfg !== 'object') return overrides;
  const mapping = {
    program_name_full: 'program.name_full',
    program_name_short: 'program.name_short',
    seal_name: 'program.seal_name',
    support_email: 'support.email',
    support_whatsapp: 'support.whatsapp',
    legal_base_url: 'legal.base_url',
    logo_primary: 'logo.primary',
    logo_partner: 'logo.partner',
    location_label: 'location.label',
    footer_copyright: 'footer.copyright',
    operator_name_full: 'operator.name_full',
    operator_name_short: 'operator.name_short',
  };
  for (const [cfgKey, i18nKey] of Object.entries(mapping)) {
    const val = cfg?.[cfgKey];
    if (val != null && val !== '') overrides[i18nKey] = val;
  }
  return overrides;
}

/**
 * Expõe a configuração carregada. Se initBrand() ainda não foi chamado,
 * retorna null.
 * @returns {import('./types/brand.js').NormalizedBrand | null}
 */
export function getBrandConfig() {
  return _config;
}

/**
 * Retorna uma promessa que resolve quando a marca estiver pronta. Se
 * initBrand() ainda não foi chamado, a promessa será resolvida de imediato.
 * @returns {Promise<any>}
 */
export function brandReady() {
  return _ready || Promise.resolve();
}

/**
 * Resolve o nome da marca a partir de três origens, na seguinte ordem de
 * precedência:
 * 1) Querystring ?brand=<slug>
 * 2) data-brand no elemento <html>
 * 3) Hostname mapeado em HOST_BRAND_MAP
 * 4) 'default' como fallback
 * @returns {string}
 */
export function resolveBrand() {
  try {
    // 1) Query param: brand=foo
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const qsBrand = params.get('brand');
      if (qsBrand) return qsBrand.trim();
    }
    // 2) data-brand no <html>
    if (typeof document !== 'undefined' && document.documentElement) {
      const dataBrand = document.documentElement.dataset && document.documentElement.dataset.brand;
      if (dataBrand) return String(dataBrand).trim();
    }
    // 3) hostname mapeado
    if (typeof location !== 'undefined' && location.hostname) {
      const host = String(location.hostname).toLowerCase();
      if (HOST_BRAND_MAP[host]) return HOST_BRAND_MAP[host];
    }
  } catch {
    // silencia erros e cai para default
  }
  return 'cs';
}

/**
 * Carrega o JSON de configuração para a marca especificada. Se o fetch
 * falhar ou o JSON for inválido, tenta carregar a configuração da marca
 * 'default'. A chamada sempre resolve, retornando um objeto (possivelmente
 * vazio) mesmo em caso de erro.
 * @param {string} brand
 * @returns {Promise<any>}
 */
export async function loadBrandConfig(brand) {
  const tryFetch = async (b) => {
    const url = `/brands/${b}/config.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json || {};
    } catch {
      return null;
    }
  };
  let cfg = await tryFetch(brand);
  if (!cfg) {
    // Se a marca solicitada não existir, tenta carregar a marca padrão 'cs'.
    cfg = await tryFetch('cs');
  }
  return cfg || {};
}

/**
 * Injeta o CSS correspondente à marca. Caso exista window.__NCS_BUILD.version,
 * acrescenta ?v=<version> ao href para evitar cache stale. A injeção é
 * idempotente: se o CSS da mesma marca já foi carregado, a chamada não
 * adiciona novamente.
 * @param {string} brand
 */
export function applyBrandCss(brand) {
  if (typeof document === 'undefined') return;
  try {
    const id = `ncs-brand-css-${brand}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = id;
    const baseHref = `/brands/${brand}/brand.css`;
    const v = typeof window !== 'undefined' && window.__NCS_BUILD && window.__NCS_BUILD.version;
    link.href = v ? `${baseHref}?v=${window.__NCS_BUILD.version}` : baseHref;
    document.head.appendChild(link);
  } catch {
    // melhor esforço
  }
}

/**
 * Aplica ajustes em tempo de execução ao DOM com base na configuração de
 * marca. Atualiza logos, textos e links do navbar e footer utilizando
 * seletores estáveis (IDs). Caso algum elemento não exista, a função
 * simplesmente ignora sem lançar erro.
 * @param {import('./types/brand.js').NormalizedBrand} config
 *   Configuração de marca já normalizada.  Propriedades ausentes são
 *   ignoradas.  Campos vazios ocultam elementos opcionais (por exemplo,
 *   logo de parceiro).
 * @returns {void}
 */
export function applyBrandRuntime(config) {
  if (!config || typeof document === 'undefined') return;
  try {
    // As logos legadas foram removidas do navbar.  Se houver elementos
    // declarados com IDs de logos, eles serão preenchidos via
    // data-brand-src/href no template HTML em vez de manipulação direta
    // aqui.  Manter compatibilidade silenciosa ao não tocar em
    // elementos inexistentes evita erros.
    // Navbar: nome curto do programa
    const navName = document.getElementById('navbar-program-name');
    if (navName && config.program_name_short) {
      navName.textContent = config.program_name_short;
    }
    // Navbar: nome curto da operação (ancora opcional)
    const opNav = document.getElementById('navbar-operator-name');
    if (opNav && config.operator_name_short) {
      opNav.textContent = config.operator_name_short;
    }
    // Footer: título completo
    const footerTitle = document.getElementById('footer-program-title');
    if (footerTitle && config.program_name_full) {
      footerTitle.textContent = config.program_name_full;
      // também atualiza atributo title se existir
      footerTitle.setAttribute('title', config.program_name_full);
    }
    // Footer: título completo da operação (ancora opcional).  Se
    // existir um elemento id="footer-operator-title", atualiza o
    // conteúdo com o nome completo da operação e o atributo title.
    const footerOpTitle = document.getElementById('footer-operator-title');
    if (footerOpTitle && config.operator_name_full) {
      footerOpTitle.textContent = config.operator_name_full;
      footerOpTitle.setAttribute('title', config.operator_name_full);
    }
    // Footer: e‑mail de suporte.  Se houver valor, atualiza o href e o texto;
    // caso contrário, limpa o conteúdo e oculta o elemento para não
    // vazar a marca padrão.  Considera tanto a forma flat quanto o
    // formato aninhado (config.support?.email).
    const footerEmail = document.getElementById('footer-email');
    if (footerEmail) {
      const email = config.support_email || (config.support && config.support.email);
      if (email) {
        const trimmed = String(email).trim();
        if (footerEmail.tagName === 'A') {
          footerEmail.setAttribute('href', `mailto:${trimmed}`);
          footerEmail.textContent = trimmed;
        } else {
          footerEmail.textContent = trimmed;
        }
        footerEmail.style.display = '';
      } else {
        // sem e‑mail: oculta
        footerEmail.textContent = '';
        try {
          footerEmail.removeAttribute('href');
        } catch {}
        footerEmail.style.display = 'none';
      }
    }
    // Footer: WhatsApp de suporte.  O elemento pode existir com id
    // "footer-whatsapp".  Se houver valor, preenche; caso contrário,
    // oculta.
    const footerWhats = document.getElementById('footer-whatsapp');
    if (footerWhats) {
      const whatsapp = config.support_whatsapp || (config.support && config.support.whatsapp);
      if (whatsapp) {
        const trimmed = String(whatsapp).trim();
        // Quando o elemento contiver um link interno (<a>), atualiza
        // tanto o href quanto o texto.  Caso contrário, apenas o texto.
        const anchor = footerWhats.querySelector('a');
        if (anchor) {
          anchor.textContent = trimmed;
          // Para WhatsApp, não antepõe protocolo automaticamente.  O
          // atributo data-brand-href pode ser usado para customizar.
        } else {
          footerWhats.textContent = trimmed;
        }
        footerWhats.style.display = '';
      } else {
        footerWhats.textContent = '';
        // remove link se houver
        const anchor = footerWhats.querySelector('a');
        if (anchor) {
          anchor.textContent = '';
          try {
            anchor.removeAttribute('href');
          } catch {}
        }
        footerWhats.style.display = 'none';
      }
    }
    // Footer: localização.  Se presente, atualiza; senão oculta.
    const footerLoc = document.getElementById('footer-location');
    if (footerLoc) {
      const loc = config.location_label || (config.location && config.location.label);
      if (loc) {
        footerLoc.textContent = String(loc);
        footerLoc.style.display = '';
      } else {
        footerLoc.textContent = '';
        footerLoc.style.display = 'none';
      }
    }
    // Footer: copyright.  Preenche e oculta quando vazio.
    const footerCopyright = document.getElementById('footer-copyright');
    if (footerCopyright) {
      const cpr = config.footer_copyright || (config.footer && config.footer.copyright);
      if (cpr) {
        footerCopyright.textContent = String(cpr);
        footerCopyright.style.display = '';
      } else {
        footerCopyright.textContent = '';
        footerCopyright.style.display = 'none';
      }
    }

    // Footer: operador legal (Operado por ...).  O elemento contém um
    // span com data-brand-text="operator.legal_name"; contudo, quando
    // nenhuma marca define operator.legal_name, a frase vazia vaza o
    // prefixo "Operado por".  Portanto, explicitamente oculta o elemento
    // inteiro quando não há valor definido.  Considera tanto o formato
    // aninhado quanto o plano (operator_name_full).
    const footerOperator = document.getElementById('footer-operator');
    if (footerOperator) {
      const legalName = (config.operator && config.operator.legal_name);
      const opFull = (config.operator && config.operator.name_full) || config.operator_name_full;
      const effective = legalName || opFull;
      if (effective) {
        footerOperator.style.display = '';
      } else {
        footerOperator.style.display = 'none';
      }
    }

    // Título do documento e metas OG/Twitter
    // A marca pode definir program_name_full ou program_name_short; usa‑se
    // prioridade para program_name_full.  O título da página e os
    // campos de meta (og:title/twitter:title) são atualizados
    // dinamicamente.  A descrição OG/Twitter reaproveita o conteúdo
    // da meta[name="description"] como fallback quando não houver
    // valor específico na configuração.  Campos adicionais são
    // calculados conforme a origem da página (location.href) e
    // imagens definidas em config.meta.image ou config.logo.primary.
    try {
      // Resolve novos títulos de programa
      const programFull = config.program_name_full || (config.program && config.program.name_full);
      const programShort = config.program_name_short || (config.program && config.program.name_short);
      const newTitle = programFull || programShort;
      if (newTitle) {
        document.title = String(newTitle);
      }
      // Helper para atualizar meta by ID or selector
      /**
       * @param {string} id
       * @param {string} selector
       * @param {string} value
       */
      function updateMeta(id, selector, value) {
        if (!value) return;
        let el = document.getElementById(id);
        if (!el) {
          el = document.querySelector(selector);
        }
        if (el && typeof el.setAttribute === 'function') {
          try {
            el.setAttribute('content', value);
          } catch {}
        }
      }
      // Descrição base: lê meta[name="description"]
      const metaDescEl = document.querySelector('meta[name="description"]');
      const desc = metaDescEl ? String(metaDescEl.getAttribute('content') || '').trim() : '';
      // Og:title e Twitter:title
      if (newTitle) {
        updateMeta('meta-og-title', 'meta[property="og:title"]', String(newTitle));
        updateMeta('meta-twitter-title', 'meta[name="twitter:title"]', String(newTitle));
      }
      // Og:description e Twitter:description
      if (desc) {
        updateMeta('meta-og-desc', 'meta[property="og:description"]', desc);
        updateMeta('meta-twitter-desc', 'meta[name="twitter:description"]', desc);
      }
      // Og:url: usa a URL absoluta da página atual
      try {
        const url = typeof location !== 'undefined' && location.href ? String(location.href) : '';
        updateMeta('meta-og-url', 'meta[property="og:url"]', url);
      } catch {}
      // Og:site_name: usa program_name_full ou queda para título
      const siteName = programFull || newTitle;
      if (siteName) {
        updateMeta('meta-og-site', 'meta[property="og:site_name"]', String(siteName));
      }
      // Og:image e Twitter:image: usa config.meta.image > config.logo.primary
      let img = '';
      try {
        const meta = config.meta || {};
        if (meta && meta.image) {
          img = String(meta.image);
        }
      } catch {}
      if (!img) {
        img = config.logo_primary || (config.logo && config.logo.primary) || '';
      }
      if (img) {
        // resolve relative path para absoluto (prefixa location.origin se começar com '/').
        let resolved = img;
        try {
          if (img.startsWith('/')) {
            const origin = typeof location !== 'undefined' && location.origin ? location.origin : '';
            resolved = origin + img;
          } else if (!/^https?:\/\//i.test(img) && typeof location !== 'undefined' && location.origin) {
            resolved = location.origin.replace(/\/+$/, '') + '/' + img.replace(/^\/+/, '');
          }
        } catch {
          // fallback: use raw
          resolved = img;
        }
        updateMeta('meta-og-image', 'meta[property="og:image"]', resolved);
        updateMeta('meta-twitter-image', 'meta[name="twitter:image"]', resolved);
      }
    } catch {
      // ignora falhas em atualização de título/metas
    }
  } catch {
    // nunca explode
  }
}

/**
 * Aplica conteúdos de marca em slots declarativos no DOM.  Elementos que
 * declaram o atributo `data-brand-text="path"` terão seu `textContent`
 * substituído quando a propriedade correspondente existir na
 * configuração.  Da mesma forma, elementos com `data-brand-html="path"`
 * receberão `innerHTML` do valor fornecido.  Este mecanismo permite
 * customizar textos e trechos de HTML sem alterar o layout principal,
 * mantendo um fallback no markup.  Use `data-brand-html` apenas para
 * conteúdos oriundos de configurações confiáveis, pois a inserção de
 * HTML arbitrário pode introduzir vulnerabilidades XSS ou quebrar a
 * acessibilidade do componente.  Campos inexistentes ou vazios no
 * objeto de configuração são ignorados, preservando o conteúdo
 * original no HTML.
 *
 * @param {import('./types/brand.js').NormalizedBrand} config
 *   Configuração de marca normalizada, possivelmente contendo
 *   propriedades aninhadas para uso nos caminhos declarados.
 */
export function applyBrandSlots(config) {
  // Não faz nada se não houver DOM ou config não for objeto
  if (!config || typeof document === 'undefined') return;
  // Resolve um caminho "foo.bar.baz" dentro de um objeto arbitrário.
  /**
   * @param {any} obj
   * @param {string} path
   * @returns {any}
   */
  function resolvePath(obj, path) {
    if (!obj || typeof obj !== 'object' || !path) return undefined;
    const parts = String(path).split('.');
    let current = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }
  try {
    // Slots de texto simples: substitui textContent
    const textNodes = document.querySelectorAll('[data-brand-text]');
    textNodes.forEach((el) => {
      const path = el.getAttribute('data-brand-text');
      if (!path) return;
      const val = resolvePath(config, path);
      if (val != null && val !== '') {
        el.textContent = String(val);
      }
    });
    // Slots de HTML: substitui innerHTML (conteúdo confiável)
    const htmlNodes = document.querySelectorAll('[data-brand-html]');
    htmlNodes.forEach((el) => {
      const path = el.getAttribute('data-brand-html');
      if (!path) return;
      const val = resolvePath(config, path);
      if (val != null && val !== '') {
        // Aviso: inserção de HTML confiável.  O valor deve vir de
        // configuração conhecida para evitar XSS ou markup inválido.
        el.innerHTML = String(val);
      }
    });

    // Slots de atributo src: substitui o valor do atributo 'src' quando
    // houver uma configuração correspondente.  Elementos com
    // `data-brand-src="foo.bar"` terão seu atributo `src` atualizado
    // somente quando o valor existir na configuração; valores ausentes
    // preservam o atributo original.  Isso permite injetar logos ou
    // imagens da marca sem alterar o markup padrão.
    const srcNodes = document.querySelectorAll('[data-brand-src]');
    srcNodes.forEach((el) => {
      const path = el.getAttribute('data-brand-src');
      if (!path) return;
      const val = resolvePath(config, path);
      if (val != null && val !== '') {
        try {
          el.setAttribute('src', String(val));
        } catch {
          // best‑effort: ignora se não puder definir
        }
      }
    });
    // Slots de atributo href: substitui o valor do atributo 'href' quando
    // houver uma configuração correspondente.  Elementos com
    // `data-brand-href="foo.bar"` terão seu atributo `href` atualizado
    // somente quando o valor existir na configuração; valores ausentes
    // preservam o atributo original.  Pode ser usado para links de
    // contato ou documentos.
    const hrefNodes = document.querySelectorAll('[data-brand-href]');
    hrefNodes.forEach((el) => {
      const path = el.getAttribute('data-brand-href');
      if (!path) return;
      const val = resolvePath(config, path);
      if (val != null && val !== '') {
        try {
          el.setAttribute('href', String(val));
        } catch {
          // melhor esforço
        }
      }
    });
  } catch {
    // melhor esforço: falhas de substituição não devem interromper
    // renderização ou causar exceções globais
  }
}

/**
 * Inicializa o carregamento da marca. Esta função deve ser chamada o mais
 * cedo possível no bootstrap da aplicação (antes de hidratar sessão ou
 * inicializar o router) para que estilos e textos sejam aplicados antes
 * da renderização. Em caso de erro, a função resolve sem modificar o DOM.
 *
 * @returns {Promise<any>}
 */
export function initBrand() {
  if (_ready) return _ready;
  _ready = (async () => {
    // resolve e carrega
    _brand = resolveBrand();
    const rawCfg = await loadBrandConfig(_brand);
    // Normaliza V0/V1 para uma estrutura flat.  Em caso de erro, usa objeto vazio.
    let cfg;
    try {
      cfg = normalizeBrandConfig(rawCfg);
    } catch {
      cfg = rawCfg || {};
    }
    _config = cfg || {};
    // Atualiza dicionário de traduções com overrides de marca antes de
    // aplicar CSS ou DOM, para que t() já reflita o valor correto.
    try {
      const overrides = mapConfigToTranslations(_config);
      setBrandOverrides(overrides);
    } catch {
      // ignora falhas de mapeamento/override; usa base
    }
    // injeta CSS
    applyBrandCss(_brand);
    // aplica runtime
    applyBrandRuntime(_config);
    // aplica slots de texto/HTML quando disponíveis.
    try {
      // applyBrandSlots depende do DOM estar pronto; chama imediatamente
      // pois os elementos do landing já estão presentes no momento
      // do bootstrap.  Falhas internas são tratadas pela própria função.
      applyBrandSlots(_config);
    } catch {
      // ignora falhas em slots
    }
    return _config;
  })().catch((err) => {
    // loga o erro mas não interrompe bootstrap
    try {
      console.error('[brand] falha ao inicializar marca:', err);
    } catch {}
    _config = {};
  });
  return _ready;
}

// Reexporta a função de tradução (t) proveniente de i18n.  Isto permite
// que outros módulos importem t() de ./brand.js sem depender
// explicitamente de ./i18n/index.js, simplificando a integração.  Por
// exemplo: import { t } from './brand.js';
export const t = i18nT;
