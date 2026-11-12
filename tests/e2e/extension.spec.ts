import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { htmlAtivos, htmlBoletim } from '../fixtures/builder';

/** Roda a extensão de verdade num Chromium com PDFs fictícios. Nenhum arquivo real de aluno é usado. */
const dist = resolve('dist');
let context: BrowserContext;
let extensionId: string;
let panel: Page;
const pdf: Record<'boletim' | 'ativos' | 'ativosOutraTurma', Buffer> = {} as never;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;

  // Os PDFs são impressos pelo próprio Chromium a partir de HTML fictício.
  const imprimir = async (html: string) => {
    const p = await context.newPage();
    await p.setContent(html);
    const arquivo = await p.pdf({ format: 'A4', landscape: true });
    await p.close();
    return arquivo;
  };
  pdf.boletim = await imprimir(htmlBoletim());
  pdf.ativos = await imprimir(htmlAtivos());
  pdf.ativosOutraTurma = await imprimir(htmlAtivos('OUTRA99'));
});

test.afterAll(async () => {
  await context.close();
});

test.beforeEach(async () => {
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/panel/index.html`);
  await panel.evaluate(() => chrome.storage.local.clear());
  await panel.reload();
});

test.afterEach(async () => {
  await panel.close();
});

const arquivo = (nome: string, buffer: Buffer) => ({ name: nome, mimeType: 'application/pdf', buffer });

/** Solta os dois PDFs juntos na área do boletim: cada um tem que ir para o lugar certo. */
async function carregarArquivos(ativos = pdf.ativos): Promise<void> {
  await panel.setInputFiles('#input-boletim', [arquivo('alunos.pdf', ativos), arquivo('boletim.pdf', pdf.boletim)]);
}

test('fluxo completo: dois PDFs, disciplinas, resultado e exportação', async () => {
  await carregarArquivos();
  await expect(panel.locator('[data-slot="boletim"] .file-meta')).toHaveText('Turma TTESTE01 · 4 alunos · 4 disciplinas');
  await expect(panel.locator('[data-slot="boletim"] .file-name')).toHaveText('boletim.pdf');
  await expect(panel.locator('[data-slot="ativos"] .file-meta')).toHaveText('3 alunos ativos · turma 99999 - TTESTE01');
  await expect(panel.locator('.message.ok')).toContainText('3 de 3 alunos ativos encontrados no boletim');

  const backEnd = panel.locator('.checklist li', { hasText: 'Programação Back-End' });
  await expect(backEnd.locator('.contador')).toHaveText('2');
  await expect(panel.locator('#resultado')).toContainText('Marque uma ou mais disciplinas');
  await expect(panel.locator('#exportar-xlsx')).toBeDisabled();

  await backEnd.locator('input').check();
  await panel.locator('.checklist li', { hasText: 'Banco de Dados' }).locator('input').check();
  const grupos = panel.locator('#resultado .grupo');
  await expect(grupos).toHaveCount(3);
  await expect(grupos.nth(0)).toContainText('Ana Beatriz Teste');
  await expect(grupos.nth(1)).toContainText('Bruno Exemplo Silva');
  await expect(grupos.nth(1).locator('.item-num.acima').first()).toHaveText('20');
  await expect(grupos.nth(1).locator('li:not(.cab)')).toHaveCount(2);
  await expect(grupos.nth(2)).toContainText('Úrsula Fictícia');
  await expect(panel.locator('#resultado')).not.toContainText('Carlos Inativo');
  await expect(panel.locator('#divergencias')).toBeHidden();

  // Por disciplina
  await panel.getByRole('button', { name: 'Por disciplina' }).click();
  await expect(grupos.nth(0).locator('.grupo-nome')).toHaveText('Banco de Dados');

  // Filtro de situação
  await panel.locator('.filtro', { hasText: 'Reprovado' }).click();
  await expect(panel.locator('#resultado')).not.toContainText('Reprovado');
  await panel.locator('.filtro', { hasText: 'Reprovado' }).click();

  // Exportar Excel
  const [download] = await Promise.all([panel.waitForEvent('download'), panel.locator('#exportar-xlsx').click()]);
  expect(download.suggestedFilename()).toMatch(/^fechamento_TTESTE01_\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(readFileSync(await download.path()).subarray(0, 2).toString()).toBe('PK');

  // Exportar CSV
  const [csv] = await Promise.all([panel.waitForEvent('download'), panel.locator('#exportar-csv').click()]);
  expect(readFileSync(await csv.path(), 'utf8')).toContain('Bruno Exemplo Silva;100002;Banco de Dados;Reprovado;3,5;20;Sim;Reprovado;Sim');

  // Copiar texto: o Playwright não libera a área de transferência para extensões; capturamos o texto enviado a ela.
  await panel.evaluate(() => {
    const w = window as unknown as { copiado: string };
    navigator.clipboard.writeText = async (t: string) => {
      w.copiado = t;
    };
  });
  await panel.locator('#copiar-texto').click();
  await expect(panel.locator('#hint-exportar')).toContainText('Texto copiado');
  const copiado = await panel.evaluate(() => (window as unknown as { copiado: string }).copiado);
  expect(copiado).toContain('Bruno Exemplo Silva (100002)');
});

test('cada PDF vai para o lugar certo mesmo solto na área errada', async () => {
  await panel.setInputFiles('#input-ativos', arquivo('qualquer-nome.pdf', pdf.boletim));
  await expect(panel.locator('[data-slot="boletim"] .file-name')).toHaveText('qualquer-nome.pdf');
  await expect(panel.locator('[data-slot="ativos"] .dropzone')).toBeVisible();
});

test('divergências com o sistema aparecem marcadas e listadas', async () => {
  await carregarArquivos();
  await panel.locator('.checklist li', { hasText: 'Sistemas Inteligentes' }).locator('input').check();
  const ana = panel.locator('#resultado .grupo', { hasText: 'Ana Beatriz Teste' });
  await expect(ana).toContainText('Reclassificação');
  await expect(ana).not.toContainText('sistema:');
  await expect(panel.locator('#divergencias summary')).toHaveText('Divergências com o sistema (2)');
  await panel.locator('#divergencias summary').click();
  await expect(panel.locator('#lista-divergencias li').nth(1)).toContainText('Regra: Reprovado · Sistema: Recuperação');
});

test('Em Fechamento passa pelas regras; Cursando fica de fora com aviso', async () => {
  await carregarArquivos();
  await panel.locator('.checklist li', { hasText: 'Internet e Redes' }).locator('input').check();
  const grupos = panel.locator('#resultado .grupo');
  await expect(grupos).toHaveCount(1);
  await expect(grupos.nth(0)).toContainText('Bruno Exemplo Silva');
  await expect(grupos.nth(0)).toContainText('Recuperação');
  await expect(panel.locator('#divergencias')).toBeHidden();
  await expect(panel.locator('#avisos-resultado')).toContainText('Internet e Redes: 1 aluno ainda está como Cursando no sistema');
});

test('busca filtra a lista de disciplinas', async () => {
  await carregarArquivos();
  await panel.fill('#busca', 'programacao');
  await expect(panel.locator('.checklist li')).toHaveCount(1);
});

test('turmas diferentes bloqueiam o fechamento', async () => {
  await carregarArquivos(pdf.ativosOutraTurma);
  await expect(panel.locator('.message.erro')).toContainText('turmas diferentes');
  await expect(panel.locator('#passo-disciplinas')).toBeHidden();
});

test('arquivo que não é PDF mostra erro', async () => {
  await panel.setInputFiles('#input-boletim', { name: 'planilha.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(panel.locator('[data-slot="boletim"].err .file-meta')).toContainText('Use o arquivo em PDF');
});
