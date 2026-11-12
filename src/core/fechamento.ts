import { chave, compararNomes } from './normalizar';
import { classificarRegistro, cursando, emFechamento, reclassificacaoFeita, type SituacaoCalculada } from './regras';
import { SITUACOES_ALVO, type AlunoAtivo, type Aviso, type Boletim, type ListaAtivos, type Registro, type SituacaoAlvo } from './types';

/** Situação de um aluno ativo numa disciplina escolhida, calculada pelas regras. */
interface Linha {
  aluno: string;
  matricula: string;
  disciplina: string;
  notaFinal: number | null;
  faltas: number | null;
  /** Asterisco do boletim em PDF; null quando não conferido. */
  faltasAcima: boolean | null;
  reclassificacaoFeita: boolean;
  /** Resultado escrito no boletim pelo sistema. */
  resultadoSistema: string;
  motivo: string;
}

export interface Pendencia extends Linha {
  /** Situação pelas regras da secretaria. */
  situacao: SituacaoAlvo;
  /** O sistema diz outra coisa. */
  divergente: boolean;
}

export interface Divergencia extends Linha {
  regra: SituacaoCalculada | null;
}

export interface AlunoComPendencias {
  aluno: string;
  matricula: string;
  pendencias: Pendencia[];
}

export interface DisciplinaComPendencias {
  disciplina: string;
  pendencias: Pendencia[];
}

export interface Resultado {
  /** Pendências pelas regras, ordenadas por aluno e depois pela ordem da disciplina no boletim. */
  pendencias: Pendencia[];
  porAluno: AlunoComPendencias[];
  porDisciplina: DisciplinaComPendencias[];
  contagem: Record<SituacaoAlvo, number>;
  /**
   * Onde a regra e o sistema discordam (nos dois sentidos), entre ativos e disciplinas escolhidas.
   * Linhas "Em Fechamento" não contam: o sistema ainda não deu o resultado.
   */
  divergencias: Divergencia[];
  /** Disciplinas escolhidas com alunos ainda "Cursando" (regras não aplicadas a eles). */
  cursando: { disciplina: string; alunos: number }[];
}

export interface Conferencia {
  /** Alunos ativos que estão no boletim. */
  ativosNoBoletim: number;
  /** Ativos do PDF que não aparecem no boletim (provável arquivo de outra turma ou boletim desatualizado). */
  ativosSemBoletim: AlunoAtivo[];
  /** Alunos do boletim que não estão na lista de ativos (ficam fora do fechamento). */
  inativos: number;
  avisos: Aviso[];
}

/** Compara a lista de ativos com o boletim e aponta o que pode indicar arquivos trocados. */
export function conferir(boletim: Boletim, ativos: ListaAtivos): Conferencia {
  const avisos: Aviso[] = [];
  const ativosSemBoletim = ativos.alunos.filter((a) => !boletim.alunos.has(a.matricula));
  const ativosNoBoletim = ativos.alunos.length - ativosSemBoletim.length;
  const matAtivas = new Set(ativos.alunos.map((a) => a.matricula));
  const inativos = [...boletim.alunos.keys()].filter((m) => !matAtivas.has(m)).length;

  if (boletim.turma && ativos.turma && boletim.turma !== ativos.turma) {
    avisos.push({
      tipo: 'erro',
      mensagem: `Os arquivos são de turmas diferentes: boletim da turma ${boletim.turma} e lista de ativos da turma ${ativos.turma}.`,
    });
  } else if (ativosNoBoletim === 0) {
    avisos.push({
      tipo: 'erro',
      mensagem: 'Nenhum aluno da lista de ativos aparece no boletim. Confira se os dois arquivos são da mesma turma.',
    });
  }
  if (ativosSemBoletim.length > 0 && ativosNoBoletim > 0) {
    const nomes = ativosSemBoletim.map((a) => `${a.nome} [${a.matricula}]`).join(', ');
    avisos.push({
      tipo: 'aviso',
      mensagem: `${ativosSemBoletim.length} aluno(s) ativo(s) não estão no boletim e ficaram de fora: ${nomes}.`,
    });
  }
  if (ativos.totalDeclarado !== null && ativos.totalDeclarado !== ativos.alunos.length) {
    avisos.push({
      tipo: 'aviso',
      mensagem: `O PDF diz "Total de ${ativos.totalDeclarado} alunos", mas encontrei ${ativos.alunos.length}. Confira a lista.`,
    });
  }

  return { ativosNoBoletim, ativosSemBoletim, inativos, avisos };
}

/**
 * Aplica as regras a um registro. Vale também para "Em Fechamento", que é justamente o momento
 * do fechamento. Devolve null para "Cursando": a disciplina ainda não terminou para o aluno.
 */
function avaliar(r: Registro): { linha: Linha; regra: SituacaoCalculada | null } | null {
  if (cursando(r.resultado)) return null;
  const av = classificarRegistro(r);
  return {
    regra: av.situacao,
    linha: {
      aluno: r.aluno,
      matricula: r.matricula,
      disciplina: r.disciplina,
      notaFinal: r.notaFinal,
      faltas: r.faltas,
      faltasAcima: r.faltasAcima,
      reclassificacaoFeita: reclassificacaoFeita(r),
      resultadoSistema: r.resultado,
      motivo: av.motivo,
    },
  };
}

function bateComSistema(regra: SituacaoCalculada | null, r: Registro): boolean {
  if (emFechamento(r.resultado)) return true;
  if (regra === null) return false;
  if (regra === 'Aprovado') return chave(r.resultado) === 'aprovado';
  return r.situacao === regra;
}

/** Quantas pendências pelas regras (entre alunos ativos) cada disciplina tem, na ordem do boletim. */
export function pendenciasPorDisciplina(boletim: Boletim, ativos: ListaAtivos): Map<string, number> {
  const matAtivas = new Set(ativos.alunos.map((a) => a.matricula));
  const contagem = new Map<string, number>(boletim.disciplinas.map((d) => [d, 0]));
  const porChave = new Map(boletim.disciplinas.map((d) => [chave(d), d]));
  for (const r of boletim.registros) {
    if (!matAtivas.has(r.matricula)) continue;
    const av = avaliar(r);
    if (!av || av.regra === null || av.regra === 'Aprovado') continue;
    const nome = porChave.get(chave(r.disciplina));
    if (nome) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  return contagem;
}

/**
 * Lista os alunos ativos em Recuperação, Reclassificação ou Reprovado nas disciplinas escolhidas,
 * pela regra da secretaria, e aponta onde o sistema diz diferente.
 * `situacoes` permite esconder uma das três; por padrão entram todas.
 */
export function calcularFechamento(
  boletim: Boletim,
  ativos: ListaAtivos,
  disciplinas: string[],
  situacoes: readonly SituacaoAlvo[] = SITUACOES_ALVO,
): Resultado {
  const matAtivas = new Set(ativos.alunos.map((a) => a.matricula));
  const escolhidas = new Set(disciplinas.map(chave));
  const querSituacao = new Set<SituacaoCalculada>(situacoes);
  const ordemDisciplina = new Map(boletim.disciplinas.map((d, i) => [chave(d), i]));
  const ordem = (p: { disciplina: string }) => ordemDisciplina.get(chave(p.disciplina)) ?? Number.MAX_SAFE_INTEGER;
  const porNome = <T extends Linha>(a: T, b: T) =>
    compararNomes(a.aluno, b.aluno) || a.matricula.localeCompare(b.matricula) || ordem(a) - ordem(b);

  const pendencias: Pendencia[] = [];
  const divergencias: Divergencia[] = [];
  const emCurso = new Map<string, number>();

  for (const r of boletim.registros) {
    if (!matAtivas.has(r.matricula) || !escolhidas.has(chave(r.disciplina))) continue;
    const av = avaliar(r);
    if (!av) {
      emCurso.set(chave(r.disciplina), (emCurso.get(chave(r.disciplina)) ?? 0) + 1);
      continue;
    }
    const divergente = !bateComSistema(av.regra, r);
    if (divergente) divergencias.push({ ...av.linha, regra: av.regra });
    if (av.regra !== null && av.regra !== 'Aprovado' && querSituacao.has(av.regra)) {
      pendencias.push({ ...av.linha, situacao: av.regra, divergente });
    }
  }

  pendencias.sort(porNome);
  divergencias.sort(porNome);

  const porAlunoMapa = new Map<string, AlunoComPendencias>();
  for (const p of pendencias) {
    let item = porAlunoMapa.get(p.matricula);
    if (!item) {
      item = { aluno: p.aluno, matricula: p.matricula, pendencias: [] };
      porAlunoMapa.set(p.matricula, item);
    }
    item.pendencias.push(p);
  }

  const porDisciplinaMapa = new Map<string, DisciplinaComPendencias>();
  for (const p of [...pendencias].sort((a, b) => ordem(a) - ordem(b))) {
    const k = chave(p.disciplina);
    let item = porDisciplinaMapa.get(k);
    if (!item) {
      item = { disciplina: p.disciplina, pendencias: [] };
      porDisciplinaMapa.set(k, item);
    }
    item.pendencias.push(p);
  }
  for (const d of porDisciplinaMapa.values()) d.pendencias.sort((a, b) => compararNomes(a.aluno, b.aluno));

  const contagem = Object.fromEntries(SITUACOES_ALVO.map((s) => [s, 0])) as Record<SituacaoAlvo, number>;
  for (const p of pendencias) contagem[p.situacao]++;

  return {
    pendencias,
    porAluno: [...porAlunoMapa.values()],
    porDisciplina: [...porDisciplinaMapa.values()],
    contagem,
    divergencias,
    cursando: boletim.disciplinas
      .filter((d) => emCurso.has(chave(d)))
      .map((d) => ({ disciplina: d, alunos: emCurso.get(chave(d)) ?? 0 })),
  };
}
