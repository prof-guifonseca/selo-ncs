import { test, expect } from '@playwright/test';
// Importação de módulos Node via require para compatibilidade com CommonJS.
const fs = require('fs');
const path = require('path');

/**
 * Teste de marca (white‑label): garante que o título do documento e
 * as meta tags Open Graph são atualizadas de acordo com a configuração
 * carregada para a marca.  Verifica o comportamento para a marca
 * `cs` (marca padrão) e, se existir, para a marca `demo`.
 */

// Helper para carregar a configuração de uma marca em tempo de execução.
// Quando o JSON não existir, retorna null.
function loadBrandConfig(brand: string): any | null {
  try {
    const cfgPath = path.join(__dirname, '..', 'brands', brand, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const json = fs.readFileSync(cfgPath, 'utf8');
      return JSON.parse(json);
    }
  } catch {
    // ignore
  }
  return null;
}

// Extrai o nome completo da marca a partir da configuração.  Considera
// tanto o formato aninhado (program.name_full) quanto o formato flat.
function extractProgramFullName(cfg: any): string {
  if (!cfg || typeof cfg !== 'object') return '';
  // V1: program.name_full
  if (cfg.program && typeof cfg.program === 'object' && cfg.program.name_full) {
    return String(cfg.program.name_full);
  }
  // V0: program_name_full
  if (cfg.program_name_full) {
    return String(cfg.program_name_full);
  }
  return '';
}

// Testa uma única marca.  Recebe o slug da marca e a configuração
// correspondente.  O teste navega para `/?brand=<slug>`, aguarda
// aplicação da marca e então compara título e metas OG.
async function testBrand(page, brand: string, config: any) {
  const expectedTitle = extractProgramFullName(config);
  // Intercepta requisições à API para não depender de backend.
  await page.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`/?brand=${brand}`);
  // Aguarda que o runtime de marca atualize o título.  Utiliza waitForFunction
  // para observar mudança de title.
  await page.waitForFunction(() => document.title && document.title.length > 0);
  // Verifica título
  await expect(page).toHaveTitle(expectedTitle);
  // Verifica meta og:title
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
  expect(ogTitle).toBe(expectedTitle);
  // Verifica meta og:description (cai no meta description quando não há descrição
  // específica de marca).  Carrega o valor da meta description do documento.
  const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
  const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
  expect(ogDesc).toBe(metaDesc);
}

// Descrição dos testes de marcas
test.describe('white‑label: título e metas OG por marca', () => {
  // Teste para a marca cs (padrão obrigatória)
  const csCfg = loadBrandConfig('cs');
  test('marca cs atualiza título e metas OG', async ({ page }) => {
    await testBrand(page, 'cs', csCfg);
  });
  // Teste opcional para a marca demo: executa somente se o JSON existir
  const demoCfg = loadBrandConfig('demo');
  if (demoCfg) {
    test('marca demo atualiza título e metas OG', async ({ page }) => {
      await testBrand(page, 'demo', demoCfg);
    });
    
    // Teste adicional: verifica que a marca demo substitui trechos da landing
    // usando os atributos data-brand-text/data-brand-html.  Este teste navega
    // para a landing com brand=demo, aguarda a aplicação da marca e compara
    // o título principal (hero) com o valor definido em config.json.
    test('marca demo substitui slots de texto na landing', async ({ page }) => {
      // A função resolve o valor esperado do título da hero a partir da
      // configuração.  Usa path aninhado conforme definido no JSON da marca.
      const expectedHero = demoCfg?.landing?.hero?.title;
      // Se não houver valor no config da marca, não executa assertiva.
      if (!expectedHero) return;
      // Stub backend API
      await page.route('**/api/**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
      await page.goto(`/?brand=demo`);
      // Aguarda a presença do elemento com o slot de título e que seu
      // conteúdo tenha sido substituído.  Playwright espera automaticamente
      // até que o texto corresponda.
      const heroLocator = page.locator('[data-brand-text="landing.hero.title"]');
      await expect(heroLocator).toHaveText(expectedHero);
    });
  }

  // Teste adicional: a marca cs (neutra) não deve vazar "NCS" no título,
  // navbar ou footer.  Este teste navega para a raiz sem parâmetro de
  // marca (fallback para cs) e verifica que o texto "NCS" não aparece.
  test('marca cs não vaza NCS no frame', async ({ page }) => {
    // Stub API
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await page.waitForFunction(() => document.title && document.title.length > 0);
    // Verifica título não contém NCS
    const title = await page.title();
    expect(title).not.toMatch(/NCS/i);
    // Navbar
    const navText = await page.locator('nav').innerText();
    expect(navText).not.toMatch(/NCS/i);
    // Footer
    const footerText = await page.locator('footer').innerText();
    expect(footerText).not.toMatch(/NCS/i);
  });

  // Teste para a marca ncs: verifica que o programa NCS aparece e que o
  // operador CS Hub também está presente no rodapé.  A configuração da
  // marca ncs é uma cópia da marca original, mas a operadora vem do
  // núcleo neutro (cs).  Este teste garante que o runtime combina
  // corretamente os dados da marca com o operador padrão.
  const ncsCfg = loadBrandConfig('ncs');
  if (ncsCfg) {
    test('marca ncs exibe programa NCS e operador CS Hub', async ({ page }) => {
      await page.route('**/api/**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
      await page.goto('/?brand=ncs');
      await page.waitForFunction(() => document.title && document.title.length > 0);
      const title = await page.title();
      // O título deve conter NCS
      expect(title).toMatch(/NCS/i);
      // Rodapé deve conter CS Hub
      const footerText = await page.locator('footer').innerText();
      expect(footerText).toMatch(/CS Hub/i);
    });
  }
});