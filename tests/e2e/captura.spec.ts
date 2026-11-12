import { resolve } from 'node:path';
import { chromium, test } from '@playwright/test';
import { htmlAtivos, htmlBoletim } from '../fixtures/builder';

/**
 * Gera as imagens do README com os dados fictícios dos testes.
 * Só roda quando pedido: `CAPTURA=1 npx playwright test captura` (depois de `npm run build`).
 */
test.skip(!process.env.CAPTURA, 'Só gera imagens com CAPTURA=1');

test('captura do painel para o README', async () => {
  const dist = resolve('dist');
  for (const tema of ['light', 'dark'] as const) {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 380, height: 1000 },
      colorScheme: tema,
      deviceScaleFactor: 2,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;

    const imprimir = async (html: string) => {
      const p = await context.newPage();
      await p.setContent(html);
      const arquivo = await p.pdf({ format: 'A4', landscape: true });
      await p.close();
      return arquivo;
    };
    const boletim = await imprimir(htmlBoletim());
    const ativos = await imprimir(htmlAtivos());

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${id}/panel/index.html`);
    await panel.setInputFiles('#input-boletim', [
      { name: 'boletim_turma_exemplo.pdf', mimeType: 'application/pdf', buffer: boletim },
      { name: 'alunos_ativos.pdf', mimeType: 'application/pdf', buffer: ativos },
    ]);
    for (const d of ['Banco de Dados', 'Programação Back-End', 'Sistemas Inteligentes']) {
      await panel.locator('.checklist li', { hasText: d }).locator('input').check();
    }
    await panel.locator('#resultado .grupo').first().waitFor();
    await panel.locator('#divergencias summary').click();
    // Barra de exportar volta ao fluxo normal só para a captura de página inteira.
    await panel.addStyleTag({ content: '.start-bar{position:static}' });
    await panel.screenshot({ path: `docs/img/painel-${tema === 'light' ? 'claro' : 'escuro'}.png`, fullPage: true });
    await context.close();
  }
});
