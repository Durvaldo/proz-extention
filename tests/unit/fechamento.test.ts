import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { interpretarAtivos } from '../../src/core/ativos';
import { interpretarBoletim } from '../../src/core/boletim';
import { gerarCsv, gerarTexto, gerarXlsx, nomeArquivo, type Contexto } from '../../src/core/exportar';
import { calcularFechamento, conferir, pendenciasPorDisciplina } from '../../src/core/fechamento';
import type { Boletim, ListaAtivos } from '../../src/core/types';
import { textoAtivos, textoBoletim } from '../fixtures/builder';

function carregar(turmaBoletim = 'TTESTE01', turmaAtivos = 'TTESTE01', total = 3): { boletim: Boletim; ativos: ListaAtivos } {
  const b = interpretarBoletim(textoBoletim({ turma: turmaBoletim }));
  const a = interpretarAtivos(textoAtivos(turmaAtivos, total));
  if (!b.ok || !a.ok) throw new Error('fixture inválida');
  return { boletim: b.valor, ativos: a.valor };
}

describe('fechamento pelas regras', () => {
  it('lista só alunos ativos com pendência nas disciplinas escolhidas', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Programação Back-End']);
    expect(r.pendencias.map((p) => [p.aluno, p.situacao, p.divergente])).toEqual([
      ['Ana Beatriz Teste', 'Recuperação', false],
      ['Bruno Exemplo Silva', 'Reclassificação', false],
    ]);
    // Úrsula já fez a reclassificação (Aprovado) e Carlos não está ativo.
    expect(r.pendencias.some((p) => p.matricula === '100003' || p.matricula === '100004')).toBe(false);
    expect(r.divergencias).toEqual([]);
  });

  it('usa a regra e não o sistema, e aponta as divergências', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Sistemas Inteligentes']);
    expect(r.pendencias.map((p) => [p.aluno, p.situacao, p.resultadoSistema, p.divergente])).toEqual([
      // Passou por nota mas as faltas têm asterisco: o sistema diz Aprovado.
      ['Ana Beatriz Teste', 'Reclassificação', 'Aprovado', true],
      ['Bruno Exemplo Silva', 'Recuperação', 'Recuperação', false],
      // Nota 2: o sistema diz Recuperação, a regra diz Reprovado.
      ['Úrsula Fictícia', 'Reprovado', 'Recuperação', true],
    ]);
    expect(r.divergencias.map((d) => [d.aluno, d.regra, d.resultadoSistema])).toEqual([
      ['Ana Beatriz Teste', 'Reclassificação', 'Aprovado'],
      ['Úrsula Fictícia', 'Reprovado', 'Recuperação'],
    ]);
  });

  it('recuperação já feita e nota abaixo de 6 entra como Reprovado, sem divergência', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Banco de Dados']);
    expect(r.pendencias.map((p) => [p.aluno, p.situacao, p.divergente])).toEqual([
      ['Bruno Exemplo Silva', 'Reprovado', false],
      ['Úrsula Fictícia', 'Reprovado', false],
    ]);
  });

  it('aplica a regra em Em Fechamento sem marcar divergência, e deixa Cursando de fora com aviso', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Internet e Redes']);
    // Bruno: nota 5, "Em Fechamento" no sistema → Recuperação pela regra.
    expect(r.pendencias.map((p) => [p.aluno, p.situacao, p.resultadoSistema, p.divergente])).toEqual([
      ['Bruno Exemplo Silva', 'Recuperação', 'Em Fechamento', false],
    ]);
    expect(r.divergencias).toHaveLength(0);
    // Úrsula ainda está "Cursando": fica fora das regras.
    expect(r.cursando).toEqual([{ disciplina: 'Internet e Redes', alunos: 1 }]);
  });

  it('junta duas disciplinas, agrupa por aluno na ordem da grade e conta por situação', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Sistemas Inteligentes', 'Banco de Dados']);
    const bruno = r.porAluno.find((a) => a.matricula === '100002');
    expect(bruno?.pendencias.map((p) => p.disciplina)).toEqual(['Banco de Dados', 'Sistemas Inteligentes']);
    expect(r.contagem).toEqual({ Recuperação: 1, Reclassificação: 1, Reprovado: 3 });
    expect(r.porDisciplina.map((d) => d.disciplina)).toEqual(['Banco de Dados', 'Sistemas Inteligentes']);
  });

  it('filtra por situação sem esconder divergências', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Sistemas Inteligentes'], ['Reprovado']);
    expect(r.pendencias.map((p) => p.matricula)).toEqual(['100003']);
    expect(r.divergencias).toHaveLength(2);
  });

  it('compara o nome da disciplina sem acento e maiúscula', () => {
    const { boletim, ativos } = carregar();
    expect(calcularFechamento(boletim, ativos, ['programacao back-end']).pendencias).toHaveLength(2);
  });

  it('conta pendências por disciplina só entre ativos, pelas regras', () => {
    const { boletim, ativos } = carregar();
    expect([...pendenciasPorDisciplina(boletim, ativos)]).toEqual([
      ['Banco de Dados', 2],
      ['Programação Back-End', 2],
      ['Sistemas Inteligentes', 3],
      ['Internet e Redes', 1],
    ]);
  });
});

describe('conferência dos arquivos', () => {
  it('passa quando os arquivos batem', () => {
    const { boletim, ativos } = carregar();
    const c = conferir(boletim, ativos);
    expect(c.avisos).toEqual([]);
    expect(c.ativosNoBoletim).toBe(3);
    expect(c.inativos).toBe(1);
  });

  it('bloqueia turmas diferentes', () => {
    const { boletim, ativos } = carregar('TTESTE01', 'OUTRA99');
    expect(conferir(boletim, ativos).avisos[0]?.tipo).toBe('erro');
  });

  it('avisa ativo que não está no boletim e total diferente do impresso', () => {
    const { boletim, ativos } = carregar('TTESTE01', 'TTESTE01', 4);
    ativos.alunos.push({ nome: 'Novo Aluno', matricula: '999999' });
    const c = conferir(boletim, ativos);
    expect(c.ativosSemBoletim.map((a) => a.matricula)).toEqual(['999999']);
    expect(c.avisos.every((a) => a.tipo === 'aviso')).toBe(true);
    expect(c.avisos).toHaveLength(1);
    ativos.totalDeclarado = 10;
    expect(conferir(boletim, ativos).avisos).toHaveLength(2);
  });
});

describe('exportação', () => {
  const data = new Date(2026, 10, 12);
  const ctx = (disciplinas: string[], turma: string | null = 'TTESTE01'): Contexto => ({ turma, disciplinas, data });

  it('gera CSV com ponto e vírgula, vírgula decimal, BOM e conferência com o sistema', () => {
    const { boletim, ativos } = carregar();
    const csv = gerarCsv(calcularFechamento(boletim, ativos, ['Sistemas Inteligentes']));
    expect(csv.startsWith('﻿Aluno;Matrícula;Disciplina;Situação;Nota final;Faltas;Faltas acima do limite;Resultado no sistema;Confere com o sistema\r\n')).toBe(true);
    expect(csv).toContain('Ana Beatriz Teste;100001;Sistemas Inteligentes;Reclassificação;8,0;18;Sim;Aprovado;Não');
    expect(csv).toContain('Bruno Exemplo Silva;100002;Sistemas Inteligentes;Recuperação;5,0;5;Não;Recuperação;Sim');
  });

  it('gera Excel com as abas Fechamento, Divergências e Resumo', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Sistemas Inteligentes']);
    const livro = XLSX.read(gerarXlsx(r, ctx(['Sistemas Inteligentes'])), { type: 'array' });
    expect(livro.SheetNames).toEqual(['Fechamento', 'Divergências', 'Resumo']);
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets.Fechamento!, { header: 1 });
    expect(linhas).toHaveLength(4);
    expect(linhas[1]).toEqual(['Ana Beatriz Teste', '100001', 'Sistemas Inteligentes', 'Reclassificação', 8, 18, 'Sim', 'Aprovado', 'Não']);
    const div = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets['Divergências']!, { header: 1 });
    expect(div).toHaveLength(3);
    const resumo = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets.Resumo!, { header: 1 });
    expect(resumo).toContainEqual(['Divergências com o sistema', 2]);
  });

  it('gera texto agrupado por aluno com a situação pela regra', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Banco de Dados', 'Sistemas Inteligentes']);
    const texto = gerarTexto(r, ctx(['Banco de Dados', 'Sistemas Inteligentes']));
    expect(texto).toContain('Fechamento – Turma TTESTE01 – 12/11/2026');
    expect(texto).toContain('Bruno Exemplo Silva (100002)\n• Banco de Dados: Reprovado (nota 3,5, 20 faltas)\n• Sistemas Inteligentes: Recuperação (nota 5,0, 5 faltas)');
    expect(texto).toContain('Úrsula Fictícia (100003)\n• Banco de Dados: Reprovado (nota 5,0)\n• Sistemas Inteligentes: Reprovado (nota 2,0)');
    expect(texto).toContain('Total: 3 aluno(s) – 1 em Recuperação, 1 em Reclassificação, 3 em Reprovado.');
  });

  it('texto avisa quando não há pendências', () => {
    const { boletim, ativos } = carregar();
    const r = calcularFechamento(boletim, ativos, ['Internet e Redes'], ['Reclassificação']);
    expect(gerarTexto(r, ctx(['Internet e Redes'], null))).toContain('Nenhum aluno ativo');
  });

  it('nomeia o arquivo com turma e data', () => {
    expect(nomeArquivo(ctx([]), 'xlsx')).toBe('fechamento_TTESTE01_2026-11-12.xlsx');
  });
});
