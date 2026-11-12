import * as XLSX from 'xlsx';
import type { Resultado } from './fechamento';
import { formatarNota } from './normalizar';
import { NOTA_APROVACAO, NOTA_RECUPERACAO } from './regras';
import { SITUACOES_ALVO } from './types';

export interface Contexto {
  turma: string | null;
  disciplinas: string[];
  /** Data de geração; fica no nome do arquivo e no cabeçalho do texto. */
  data: Date;
}

const COLUNAS = ['Aluno', 'Matrícula', 'Disciplina', 'Situação', 'Nota final', 'Faltas', 'Faltas acima do limite', 'Resultado no sistema', 'Confere com o sistema'] as const;
const COLUNAS_DIVERGENCIA = ['Aluno', 'Matrícula', 'Disciplina', 'Pela regra', 'No sistema', 'Nota final', 'Faltas', 'Faltas acima do limite', 'Motivo'] as const;

function dataIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dataBr(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

function decimal(n: number | null): string {
  return n === null ? '' : Number.isInteger(n) ? String(n) : formatarNota(n);
}

/** Texto da coluna "Faltas acima do limite". */
export function textoFaltasAcima(l: { faltasAcima: boolean | null; reclassificacaoFeita: boolean }): string {
  if (l.faltasAcima === null) return 'não conferido';
  const base = l.faltasAcima ? 'Sim' : 'Não';
  return l.faltasAcima && l.reclassificacaoFeita ? `${base} (reclassificação feita)` : base;
}

export function nomeArquivo(ctx: Contexto, extensao: 'xlsx' | 'csv'): string {
  const turma = (ctx.turma ?? 'turma').replace(/[^A-Za-z0-9_-]/g, '');
  return `fechamento_${turma}_${dataIso(ctx.data)}.${extensao}`;
}

function resumoContagem(resultado: Resultado): string {
  return SITUACOES_ALVO.filter((s) => resultado.contagem[s] > 0)
    .map((s) => `${resultado.contagem[s]} em ${s}`)
    .join(', ');
}

/** Planilha com as abas "Fechamento" (uma linha por pendência), "Divergências" e "Resumo". */
export function gerarXlsx(resultado: Resultado, ctx: Contexto): ArrayBuffer {
  const linhas = resultado.pendencias.map((p) => [
    p.aluno,
    p.matricula,
    p.disciplina,
    p.situacao,
    p.notaFinal ?? '',
    p.faltas ?? '',
    textoFaltasAcima(p),
    p.resultadoSistema,
    p.divergente ? 'Não' : 'Sim',
  ]);
  const aba = XLSX.utils.aoa_to_sheet([[...COLUNAS], ...linhas]);
  aba['!cols'] = [{ wch: 38 }, { wch: 11 }, { wch: 36 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];
  aba['!autofilter'] = { ref: `A1:I${linhas.length + 1}` };

  const div = XLSX.utils.aoa_to_sheet([
    [...COLUNAS_DIVERGENCIA],
    ...resultado.divergencias.map((d) => [
      d.aluno,
      d.matricula,
      d.disciplina,
      d.regra ?? 'Sem nota',
      d.resultadoSistema,
      d.notaFinal ?? '',
      d.faltas ?? '',
      textoFaltasAcima(d),
      d.motivo,
    ]),
  ]);
  div['!cols'] = [{ wch: 38 }, { wch: 11 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 50 }];

  const resumo = XLSX.utils.aoa_to_sheet([
    ['Turma', ctx.turma ?? ''],
    ['Gerado em', dataBr(ctx.data)],
    ['Disciplinas', ctx.disciplinas.join('; ')],
    ['Alunos com pendência', resultado.porAluno.length],
    ...SITUACOES_ALVO.map((s) => [s, resultado.contagem[s]]),
    ['Divergências com o sistema', resultado.divergencias.length],
    [],
    ['Regras aplicadas'],
    ['Aprovado', `nota final ≥ ${NOTA_APROVACAO} e faltas dentro do limite`],
    ['Reclassificação', `nota final ≥ ${NOTA_APROVACAO} e faltas acima do limite`],
    ['Recuperação', `nota final de ${NOTA_RECUPERACAO} a menos de ${NOTA_APROVACAO} e faltas dentro do limite`],
    ['Reprovado', `nota final abaixo de ${NOTA_RECUPERACAO}, ou abaixo de ${NOTA_APROVACAO} com faltas acima do limite`],
    ['Faltas acima do limite', 'marcadas com asterisco (*) no boletim em PDF do sistema'],
    ['Reclassificação já feita', 'com nota na coluna Reclassificação, vale só a nota final'],
    ['Em Fechamento', 'as regras valem; não conta como divergência (o sistema ainda não deu o resultado)'],
    ['Cursando', 'fora das regras: a disciplina ainda não terminou para o aluno'],
  ]);
  resumo['!cols'] = [{ wch: 36 }, { wch: 80 }];

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, 'Fechamento');
  XLSX.utils.book_append_sheet(livro, div, 'Divergências');
  XLSX.utils.book_append_sheet(livro, resumo, 'Resumo');
  return XLSX.write(livro, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
}

function campoCsv(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** CSV com ponto e vírgula e vírgula decimal, que o Excel em português abre direto. Tem BOM para manter os acentos. */
export function gerarCsv(resultado: Resultado): string {
  const linhas = [
    COLUNAS.join(';'),
    ...resultado.pendencias.map((p) =>
      [
        p.aluno,
        p.matricula,
        p.disciplina,
        p.situacao,
        p.notaFinal === null ? '' : formatarNota(p.notaFinal),
        decimal(p.faltas),
        textoFaltasAcima(p),
        p.resultadoSistema,
        p.divergente ? 'Não' : 'Sim',
      ]
        .map(campoCsv)
        .join(';'),
    ),
  ];
  return `﻿${linhas.join('\r\n')}\r\n`;
}

/** Texto para colar no WhatsApp ou e-mail, agrupado por aluno. Mostra a situação pela regra. */
export function gerarTexto(resultado: Resultado, ctx: Contexto): string {
  const cabecalho = [
    `Fechamento${ctx.turma ? ` – Turma ${ctx.turma}` : ''} – ${dataBr(ctx.data)}`,
    `Disciplinas: ${ctx.disciplinas.join(', ')}`,
  ];
  if (resultado.porAluno.length === 0) {
    return [...cabecalho, '', 'Nenhum aluno ativo em recuperação, reclassificação ou reprovado nessas disciplinas.'].join('\n');
  }
  const blocos = resultado.porAluno.map((a) =>
    [
      `${a.aluno} (${a.matricula})`,
      ...a.pendencias.map((p) => {
        const detalhes = [`nota ${formatarNota(p.notaFinal)}`];
        if (p.faltas) detalhes.push(`${p.faltas} faltas`);
        return `• ${p.disciplina}: ${p.situacao} (${detalhes.join(', ')})`;
      }),
    ].join('\n'),
  );
  const total = `Total: ${resultado.porAluno.length} aluno(s) – ${resumoContagem(resultado)}.`;
  return [...cabecalho, '', blocos.join('\n\n'), '', total].join('\n');
}
