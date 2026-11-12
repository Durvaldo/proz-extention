export const SITUACOES_ALVO = ['Recuperação', 'Reclassificação', 'Reprovado'] as const;
export type SituacaoAlvo = (typeof SITUACOES_ALVO)[number];

/** Uma linha do boletim: um aluno em uma disciplina. */
export interface Registro {
  aluno: string;
  matricula: string;
  disciplina: string;
  notaFinal: number | null;
  faltas: number | null;
  /** Nota da prova de recuperação (coluna Recuperação); > 0 indica que ela já foi feita. */
  notaRecuperacao: number | null;
  /** Nota da prova de reclassificação (coluna Reclassificação); > 0 indica que ela já foi feita. */
  notaReclassificacao: number | null;
  /**
   * Faltas acima do percentual permitido, como o sistema marca com asterisco no boletim em PDF.
   * null quando não se sabe (PDF não carregado ou linha não conferida).
   */
  faltasAcima: boolean | null;
  /** Texto original da coluna Resultado. */
  resultado: string;
  /** Resultado reconhecido como pendência; null para Aprovado, Cursando, Em Fechamento etc. */
  situacao: SituacaoAlvo | null;
}

export interface Boletim {
  /** Código da turma lido do título (ex.: TABC123XYZ), quando existir. */
  turma: string | null;
  curso: string | null;
  registros: Registro[];
  /** Disciplinas na ordem em que aparecem no boletim (ordem da grade). */
  disciplinas: string[];
  /** matrícula → nome */
  alunos: Map<string, string>;
}

export interface AlunoAtivo {
  nome: string;
  matricula: string;
}

export interface ListaAtivos {
  /** Código numérico da turma (ex.: 12345). */
  turmaCodigo: string | null;
  /** Código da turma (ex.: TABC123XYZ). */
  turma: string | null;
  /** "Total de N alunos" impresso no rodapé, quando existir. */
  totalDeclarado: number | null;
  alunos: AlunoAtivo[];
}

export interface Aviso {
  tipo: 'erro' | 'aviso' | 'ok';
  mensagem: string;
}

export type Leitura<T> = { ok: true; valor: T; avisos: Aviso[] } | { ok: false; erro: string };
