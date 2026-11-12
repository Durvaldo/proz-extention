import { chave, limpar, numero } from './normalizar';
import { SITUACOES_ALVO, type Aviso, type Boletim, type Leitura, type Registro, type SituacaoAlvo } from './types';

/**
 * Lê o boletim da turma em PDF, como sai do sistema acadêmico (uma página por aluno + canhoto).
 *
 * Recebe o texto já montado em linhas (`montarLinhas`), onde colunas são separadas por 3+ espaços:
 *
 *   Nome   Matrícula   Curso
 *   Ana Beatriz Teste   100001   TÉCNICO EM ...
 *   Unidade/Polo   Turma   Ano/Semestre   Módulo/Série
 *   (XX) Polo   TABC123XYZ   01/02/2025   Único
 *   Componente curricular   Avaliações ...
 *   Banco de Dados   7,50   1,70   0,0   0,0   9,2   9,0   *20   Aprovado
 *
 * Colunas da linha de notas: avaliações presenciais, atividades online, recuperação, reclassificação,
 * nota parcial, nota final, faltas e resultado. Asterisco na nota = abaixo da média;
 * asterisco nas faltas = acima do percentual permitido.
 */

const COLUNA = /\s{3,}/;
const NUM = String.raw`\*{0,2}\d+(?:,\d+)?`;
const RESULTADO = String.raw`Aprovado|Recupera\S*|Reprovado|Reclassifica\S*|Em Fechamento|Cursando`;
const LINHA_NOTAS = new RegExp(
  String.raw`(?:^|\s)(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(\*?\s?\d+)\s+(${RESULTADO})\s*$`,
  'i',
);
/** Palavras do cabeçalho da tabela que podem cair numa linha sozinhas. */
const CABECALHO_TABELA = new Set(['presenciais', 'online', 'presenciais online', 'componente curricular']);

const SITUACAO_POR_CHAVE = new Map<string, SituacaoAlvo>(SITUACOES_ALVO.map((s) => [chave(s), s]));

export function reconhecerSituacao(resultado: string): SituacaoAlvo | null {
  return SITUACAO_POR_CHAVE.get(chave(resultado)) ?? null;
}

/** Reconhece o texto de um boletim (para separar do PDF de alunos ativos). */
export function pareceBoletim(texto: string): boolean {
  return /Boletim Escolar/i.test(texto) && texto.split(/\r?\n/).some((l) => LINHA_NOTAS.test(l));
}

function colunas(linha: string): string[] {
  return linha
    .trim()
    .split(COLUNA)
    .map(limpar)
    .filter(Boolean);
}

export function interpretarBoletim(texto: string): Leitura<Boletim> {
  const linhas = texto.split(/\r?\n/);
  const registros: Registro[] = [];
  const disciplinas: string[] = [];
  const vistas = new Set<string>();
  const alunos = new Map<string, string>();
  const jaLidos = new Set<string>();
  let turma: string | null = null;
  let curso: string | null = null;

  let aluno: { nome: string; matricula: string } | null = null;
  let lerAluno = false;
  let colunaTurma = -1;
  let naTabela = false;
  /** Nomes de disciplina que vieram numa linha separada das notas (layout de alguns PDFs). */
  const nomesSoltos: string[] = [];
  let semNome = 0;

  for (const bruta of linhas) {
    const linha = bruta.replace(/\t/g, '   ');
    const cols = colunas(linha);
    if (cols.length === 0) continue;

    // Cabeçalho do aluno: "Nome  Matrícula  Curso"; a próxima linha traz os valores.
    if (/^Nome$/i.test(cols[0] ?? '') && cols.some((c) => /^Matr[ií]cula$/i.test(c))) {
      lerAluno = true;
      naTabela = false;
      continue;
    }
    if (lerAluno) {
      lerAluno = false;
      const mat = cols.find((c) => /^\d{4,}$/.test(c)) ?? null;
      if (mat) {
        // O canhoto repete o cabeçalho do mesmo aluno: as notas dele já foram lidas.
        aluno = jaLidos.has(mat) ? null : { nome: cols[0] ?? mat, matricula: mat };
        if (aluno) {
          jaLidos.add(mat);
          alunos.set(mat, aluno.nome);
          curso ??= cols.length > 2 ? (cols[cols.length - 1] ?? null) : null;
        }
      }
      continue;
    }

    // "Unidade/Polo  Turma  Ano/Semestre ..." → a próxima linha traz o código da turma na mesma coluna.
    const iTurma = cols.findIndex((c) => /^Turma$/i.test(c));
    if (iTurma >= 0 && cols.some((c) => /Unidade|Polo/i.test(c))) {
      colunaTurma = iTurma;
      continue;
    }
    if (colunaTurma >= 0) {
      turma ??= cols[colunaTurma]?.toUpperCase() ?? null;
      colunaTurma = -1;
      continue;
    }

    if (/^Componente curricular/i.test(cols[0] ?? '')) {
      naTabela = aluno !== null;
      nomesSoltos.length = 0;
      continue;
    }
    if (!naTabela || !aluno) continue;
    // Fim da tabela: rodapé com as observações do boletim.
    if (/^[•·]|detalhamento|Disciplinas com asterisco/i.test(linha.trim())) {
      naTabela = false;
      continue;
    }

    const m = LINHA_NOTAS.exec(linha);
    if (!m) {
      const texto = limpar(cols.join(' '));
      if (!CABECALHO_TABELA.has(chave(texto)) && !/^\d+\/\d+$/.test(texto)) nomesSoltos.push(texto);
      continue;
    }

    // Nome da disciplina: o que vem antes das notas na mesma linha (primeira coluna).
    const antes = colunas(linha.slice(0, m.index));
    let disciplina = antes.filter((c) => !CABECALHO_TABELA.has(chave(c)))[0] ?? nomesSoltos.shift() ?? '';
    if (!disciplina) {
      semNome++;
      disciplina = `Disciplina sem nome ${semNome}`;
    }

    const faltasTxt = (m[7] ?? '').replace(/\s/g, '');
    const resultado = limpar(m[8] ?? '');
    registros.push({
      aluno: aluno.nome,
      matricula: aluno.matricula,
      disciplina,
      notaFinal: numero(m[6] ?? ''),
      faltas: Number(faltasTxt.replace('*', '')),
      notaRecuperacao: numero(m[3] ?? ''),
      notaReclassificacao: numero(m[4] ?? ''),
      faltasAcima: faltasTxt.startsWith('*'),
      resultado,
      situacao: reconhecerSituacao(resultado),
    });
    const k = chave(disciplina);
    if (!vistas.has(k)) {
      vistas.add(k);
      disciplinas.push(disciplina);
    }
  }

  if (registros.length === 0) {
    return {
      ok: false,
      erro: 'Não encontrei as notas neste PDF. Use o boletim da turma em PDF, como sai do sistema acadêmico.',
    };
  }

  const avisos: Aviso[] = [];
  if (semNome > 0) {
    avisos.push({ tipo: 'aviso', mensagem: `${semNome} linha(s) de notas vieram sem o nome da disciplina. Confira o PDF do boletim.` });
  }
  const porAluno = new Map<string, number>();
  for (const r of registros) porAluno.set(r.matricula, (porAluno.get(r.matricula) ?? 0) + 1);
  const quantidades = new Set(porAluno.values());
  if (quantidades.size > 1) {
    const max = Math.max(...quantidades);
    const faltando = [...porAluno].filter(([, n]) => n < max).map(([mat]) => alunos.get(mat) ?? mat);
    avisos.push({
      tipo: 'aviso',
      mensagem: `Alguns alunos têm menos disciplinas que os outros no boletim: ${faltando.join(', ')}. Confira se o PDF está completo.`,
    });
  }

  return { ok: true, valor: { turma, curso, registros, disciplinas, alunos }, avisos };
}
