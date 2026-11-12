import type { Pendencia, Resultado } from './fechamento';
import { compararNomes } from './normalizar';
import type { SituacaoAlvo } from './types';

/**
 * Os três relatórios que a secretaria manda aos professores (Reprovados, Recuperação e Reclassificação),
 * no formato dos modelos em Word que ela usava: logo, cabeçalho, título roxo, um bloco por aluno
 * (nome + "Disciplina – motivo" em roxo) e o relatório de totais no fim.
 *
 * Aqui só o conteúdo; o desenho do PDF fica em `relatorio-pdf.ts`.
 */

export interface Cabecalho {
  /** Linhas centralizadas abaixo do logo (unidade, "RESULTADOS FINAIS", curso, turma...). */
  linhas: string[];
  /** Total de desistentes, que só aparece no relatório de reprovados (não vem do boletim). */
  desistentesAntes: number;
  desistentesDurante: number;
}

export interface LinhaTotal {
  /** Texto antes da parte sublinhada. */
  antes: string;
  sublinhado: string;
  /** "05 alunos". */
  valor: string;
}

export interface AlunoRelatorio {
  nome: string;
  /** "Programação Back-End – Reprovado por notas", uma por disciplina. */
  linhas: string[];
}

export interface Relatorio {
  situacao: SituacaoAlvo;
  titulo: string;
  /** Nome do arquivo, como nos modelos: "REPROVADOS - TURMA.pdf". */
  arquivo: string;
  alunos: AlunoRelatorio[];
  tituloTotais: string;
  totais: LinhaTotal[];
}

/** Ordem em que os arquivos são gerados e baixados. */
export const ORDEM_RELATORIOS: SituacaoAlvo[] = ['Reprovado', 'Recuperação', 'Reclassificação'];

export const CABECALHO_PADRAO = ['PROZ – UNIDADE MONTES CLAROS', 'RESULTADOS FINAIS'];

/** "00 aluno", "01 aluno", "05 alunos", como nos modelos. */
export function quantidade(n: number): string {
  return `${String(n).padStart(2, '0')} ${n <= 1 ? 'aluno' : 'alunos'}`;
}

/** Reprovado com faltas acima do limite (e sem reclassificação feita) é "por notas e faltas". */
function porFaltas(p: Pendencia): boolean {
  return p.faltasAcima === true && !p.reclassificacaoFeita;
}

function motivo(p: Pendencia): string {
  if (p.situacao === 'Reclassificação') return 'Reprovado por faltas';
  if (p.situacao === 'Reprovado' && porFaltas(p)) return 'Reprovado por notas e faltas';
  // Os modelos usam "Reprovado por notas" também na recuperação.
  return 'Reprovado por notas';
}

function alunosDa(resultado: Resultado, situacao: SituacaoAlvo): { aluno: AlunoRelatorio; pendencias: Pendencia[] }[] {
  // `porAluno` já vem em ordem alfabética, e as disciplinas de cada aluno na ordem do boletim.
  return resultado.porAluno
    .map((a) => ({ nome: a.aluno, pendencias: a.pendencias.filter((p) => p.situacao === situacao) }))
    .filter((a) => a.pendencias.length > 0)
    .sort((a, b) => compararNomes(a.nome, b.nome))
    .map((a) => ({
      aluno: { nome: a.nome, linhas: a.pendencias.map((p) => `${p.disciplina} – ${motivo(p)}`) },
      pendencias: a.pendencias,
    }));
}

function nomeArquivo(prefixo: string, turma: string | null): string {
  const t = (turma ?? '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `${prefixo}${t ? ` - ${t}` : ''}.pdf`;
}

/**
 * Monta os três relatórios a partir do resultado completo do fechamento (as três situações,
 * independentemente do filtro da tela). Um relatório sem alunos sai mesmo assim, com total 00.
 */
export function montarRelatorios(resultado: Resultado, turma: string | null, cabecalho: Cabecalho): Relatorio[] {
  return ORDEM_RELATORIOS.map((situacao): Relatorio => {
    const itens = alunosDa(resultado, situacao);
    const alunos = itens.map((i) => i.aluno);

    if (situacao === 'Reprovado') {
      const notasEFaltas = itens.filter((i) => i.pendencias.some(porFaltas)).length;
      const soNotas = itens.filter((i) => i.pendencias.some((p) => !porFaltas(p))).length;
      return {
        situacao,
        titulo: 'ALUNOS REPROVADOS',
        arquivo: nomeArquivo('REPROVADOS', turma),
        alunos,
        tituloTotais: 'RELATÓRIO MÓDULO/UNIDADE CURRICULAR:',
        totais: [
          { antes: 'Total de alunos reprovados por ', sublinhado: 'notas e faltas', valor: quantidade(notasEFaltas) },
          { antes: 'Total de alunos reprovados por ', sublinhado: 'notas', valor: quantidade(soNotas) },
          { antes: 'Total de alunos ', sublinhado: 'desistentes antes do início do módulo/disciplina', valor: quantidade(cabecalho.desistentesAntes) },
          { antes: 'Total de alunos ', sublinhado: 'desistentes durante o módulo/disciplina', valor: quantidade(cabecalho.desistentesDurante) },
        ],
      };
    }

    const recuperacao = situacao === 'Recuperação';
    return {
      situacao,
      titulo: recuperacao ? 'ALUNOS EM RECUPERAÇÃO' : 'ALUNOS EM RECLASSIFICAÇÃO',
      arquivo: nomeArquivo(recuperacao ? 'RECUPERAÇÃO' : 'RECLASSIFICAÇÃO', turma),
      alunos,
      tituloTotais: 'RELATÓRIO MÓDULO',
      totais: [{ antes: 'Total de alunos em ', sublinhado: recuperacao ? 'recuperação' : 'reclassificação', valor: quantidade(alunos.length) }],
    };
  });
}
