import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { interpretarAtivos } from '../../src/core/ativos';
import { interpretarBoletim } from '../../src/core/boletim';
import { calcularFechamento } from '../../src/core/fechamento';
import { gerarRelatorioPdf } from '../../src/core/relatorio-pdf';
import { montarRelatorios, quantidade, type Cabecalho } from '../../src/core/relatorios';
import { textoAtivos, textoBoletim } from '../fixtures/builder';

const CABECALHO: Cabecalho = { linhas: ['PROZ – UNIDADE TESTE', 'RESULTADOS FINAIS'], desistentesAntes: 0, desistentesDurante: 1 };

function relatorios() {
  const b = interpretarBoletim(textoBoletim({ turma: 'TTESTE01' }));
  const a = interpretarAtivos(textoAtivos('TTESTE01', 3));
  if (!b.ok || !a.ok) throw new Error('fixture inválida');
  const r = calcularFechamento(b.valor, a.valor, ['Sistemas Inteligentes', 'Banco de Dados', 'Programação Back-End']);
  return montarRelatorios(r, 'TTESTE01', CABECALHO);
}

describe('relatórios para os professores', () => {
  it('gera os três arquivos com o nome dos modelos', () => {
    expect(relatorios().map((r) => [r.arquivo, r.titulo])).toEqual([
      ['REPROVADOS - TTESTE01.pdf', 'ALUNOS REPROVADOS'],
      ['RECUPERAÇÃO - TTESTE01.pdf', 'ALUNOS EM RECUPERAÇÃO'],
      ['RECLASSIFICAÇÃO - TTESTE01.pdf', 'ALUNOS EM RECLASSIFICAÇÃO'],
    ]);
  });

  it('separa reprovado por notas e faltas de reprovado por notas, com as disciplinas na ordem do boletim', () => {
    const [reprovados] = relatorios();
    expect(reprovados?.alunos).toEqual([
      { nome: 'Bruno Exemplo Silva', linhas: ['Banco de Dados – Reprovado por notas e faltas'] },
      { nome: 'Úrsula Fictícia', linhas: ['Banco de Dados – Reprovado por notas', 'Sistemas Inteligentes – Reprovado por notas'] },
    ]);
    expect(reprovados?.totais.map((t) => `${t.antes}${t.sublinhado}: ${t.valor}`)).toEqual([
      'Total de alunos reprovados por notas e faltas: 01 aluno',
      'Total de alunos reprovados por notas: 01 aluno',
      'Total de alunos desistentes antes do início do módulo/disciplina: 00 aluno',
      'Total de alunos desistentes durante o módulo/disciplina: 01 aluno',
    ]);
  });

  it('usa os textos dos modelos para recuperação e reclassificação', () => {
    const [, recuperacao, reclassificacao] = relatorios();
    expect(recuperacao?.alunos).toEqual([
      { nome: 'Ana Beatriz Teste', linhas: ['Programação Back-End – Reprovado por notas'] },
      { nome: 'Bruno Exemplo Silva', linhas: ['Sistemas Inteligentes – Reprovado por notas'] },
    ]);
    expect(recuperacao?.totais).toEqual([{ antes: 'Total de alunos em ', sublinhado: 'recuperação', valor: '02 alunos' }]);
    expect(reclassificacao?.alunos).toEqual([
      { nome: 'Ana Beatriz Teste', linhas: ['Sistemas Inteligentes – Reprovado por faltas'] },
      { nome: 'Bruno Exemplo Silva', linhas: ['Programação Back-End – Reprovado por faltas'] },
    ]);
  });

  it('escreve as quantidades com dois dígitos', () => {
    expect([0, 1, 2, 12].map(quantidade)).toEqual(['00 aluno', '01 aluno', '02 alunos', '12 alunos']);
  });

  it('desenha um PDF A4, com logo, e quebra a página quando a lista é longa', async () => {
    const [reprovados] = relatorios();
    if (!reprovados) throw new Error('sem relatório');
    const logo = new Uint8Array(readFileSync('src/assets/img/logo-proz.png'));
    const curto = await PDFDocument.load(await gerarRelatorioPdf(reprovados, CABECALHO.linhas, logo));
    expect(curto.getPageCount()).toBe(1);
    expect(curto.getPage(0).getSize().width).toBeCloseTo(595.3, 0);

    const muitos = { ...reprovados, alunos: Array.from({ length: 40 }, (_, i) => ({ nome: `Aluno ${i} – ẞ ✓`, linhas: ['Banco de Dados – Reprovado por notas'] })) };
    const longo = await PDFDocument.load(await gerarRelatorioPdf(muitos, CABECALHO.linhas, null));
    expect(longo.getPageCount()).toBeGreaterThan(1);
  });
});
