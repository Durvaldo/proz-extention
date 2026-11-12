import { describe, expect, it } from 'vitest';
import { interpretarAtivos } from '../../src/core/ativos';
import { interpretarBoletim, pareceBoletim, reconhecerSituacao } from '../../src/core/boletim';
import { numero } from '../../src/core/normalizar';
import { montarLinhas } from '../../src/core/pdf-linhas';
import { DISCIPLINAS, textoAtivos, textoBoletim } from '../fixtures/builder';

describe('números do boletim', () => {
  it('lê vírgula decimal e o asterisco de nota baixa', () => {
    expect(numero('6,80')).toBe(6.8);
    expect(numero('*3,0')).toBe(3);
    expect(numero('**3,0')).toBe(3);
    expect(numero('10,00')).toBe(10);
    expect(numero('')).toBeNull();
    expect(numero('abc')).toBeNull();
  });
});

describe('situações', () => {
  it('reconhece as três pendências sem depender de acento ou maiúscula', () => {
    expect(reconhecerSituacao('Recuperação')).toBe('Recuperação');
    expect(reconhecerSituacao('RECUPERACAO')).toBe('Recuperação');
    expect(reconhecerSituacao(' reclassificação ')).toBe('Reclassificação');
    expect(reconhecerSituacao('Reprovado')).toBe('Reprovado');
    expect(reconhecerSituacao('Aprovado')).toBeNull();
    expect(reconhecerSituacao('Em Fechamento')).toBeNull();
  });
});

describe('montagem das linhas do PDF', () => {
  it('junta pedaços da mesma altura e separa colunas distantes', () => {
    const p = (texto: string, x: number, y: number, largura: number) => ({ texto, x, y, largura, altura: 8 });
    const texto = montarLinhas([
      p('9,0', 686, 325, 9),
      p('Banco de Dados', 25, 325, 50),
      p('*', 733, 325, 3),
      p('20', 736, 325, 8),
      p('Nome', 25, 471, 21),
    ]);
    expect(texto).toBe('Nome\nBanco de Dados   9,0   *20');
  });
});

describe('boletim em PDF', () => {
  it('reconhece o boletim e não confunde com a lista de ativos', () => {
    expect(pareceBoletim(textoBoletim())).toBe(true);
    expect(pareceBoletim(textoAtivos())).toBe(false);
  });

  it('lê turma, curso, alunos, disciplinas, notas e o asterisco das faltas', () => {
    const leitura = interpretarBoletim(textoBoletim());
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    const b = leitura.valor;
    expect(leitura.avisos).toEqual([]);
    expect(b.turma).toBe('TTESTE01');
    expect(b.curso).toBe('TÉCNICO EM TESTES');
    expect(b.alunos.size).toBe(4);
    expect(b.disciplinas).toEqual(DISCIPLINAS);
    // O canhoto repete o aluno, mas as notas entram uma vez só.
    expect(b.registros).toHaveLength(16);
    const bruno = b.registros.find((x) => x.matricula === '100002' && x.disciplina === 'Programação Back-End');
    expect(bruno).toMatchObject({ aluno: 'Bruno Exemplo Silva', notaFinal: 7, faltas: 20, faltasAcima: true, situacao: 'Reclassificação' });
    const ursula = b.registros.find((x) => x.matricula === '100003' && x.disciplina === 'Banco de Dados');
    expect(ursula).toMatchObject({ notaFinal: 5, notaRecuperacao: 3, faltasAcima: false, resultado: 'Reprovado' });
  });

  it('acha o nome da disciplina mesmo quando vem separado das notas', () => {
    const leitura = interpretarBoletim(textoBoletim({ nomesSeparados: true }));
    expect(leitura.ok && leitura.valor.disciplinas).toEqual(DISCIPLINAS);
    expect(leitura.ok && leitura.valor.registros).toHaveLength(16);
  });

  it('recusa PDF sem linhas de notas', () => {
    expect(interpretarBoletim('Boletim Escolar\nNada aqui').ok).toBe(false);
  });
});

describe('lista de ativos (texto do PDF)', () => {
  it('lê nome, matrícula, turma e total', () => {
    const leitura = interpretarAtivos(textoAtivos());
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.valor.turma).toBe('TTESTE01');
    expect(leitura.valor.turmaCodigo).toBe('99999');
    expect(leitura.valor.totalDeclarado).toBe(3);
    expect(leitura.valor.alunos).toEqual([
      { nome: 'Ana Beatriz Teste', matricula: '100001' },
      { nome: 'Bruno Exemplo Silva', matricula: '100002' },
      { nome: 'Úrsula Fictícia', matricula: '100003' },
    ]);
  });

  it('pega o nome da linha anterior quando o PDF separa nome e matrícula', () => {
    const leitura = interpretarAtivos('Maria Teste da Silva\n[200001]   (XX) Polo\nJoão Teste [200002]');
    expect(leitura.ok && leitura.valor.alunos.map((a) => a.nome)).toEqual(['Maria Teste da Silva', 'João Teste']);
  });

  it('não repete matrícula que aparece duas vezes', () => {
    const leitura = interpretarAtivos('Ana [1001]\nAna [1001]');
    expect(leitura.ok && leitura.valor.alunos).toHaveLength(1);
  });

  it('recusa PDF sem matrículas', () => {
    expect(interpretarAtivos('Relatório qualquer\nsem alunos').ok).toBe(false);
  });
});
