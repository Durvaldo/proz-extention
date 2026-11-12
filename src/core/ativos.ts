import { limpar } from './normalizar';
import type { AlunoAtivo, Leitura, ListaAtivos } from './types';

const MATRICULA = /\[(\d{3,})\]/g;

/**
 * Interpreta o texto da lista de alunos ativos (PDF de relação de alunos da turma).
 * Cada aluno aparece como "Nome Completo [123456]". Se o PDF separar o nome da matrícula,
 * o nome é buscado na linha anterior; o cruzamento com o boletim é sempre pela matrícula.
 */
export function interpretarAtivos(texto: string): Leitura<ListaAtivos> {
  // Três ou mais espaços (ou tab) separam colunas; o nome é o último trecho antes da matrícula.
  const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\t/g, '   ').trim());
  const alunos: AlunoAtivo[] = [];
  const vistas = new Set<string>();

  linhas.forEach((linha, i) => {
    let inicio = 0;
    for (const m of linha.matchAll(MATRICULA)) {
      const mat = m[1] ?? '';
      let nome = limpar(linha.slice(inicio, m.index).split(/\s{3,}/).pop() ?? '');
      if (!nome) nome = limpar((linhas[i - 1] ?? '').split(/\s{3,}/).pop() ?? '');
      inicio = (m.index ?? 0) + m[0].length;
      if (vistas.has(mat)) continue;
      vistas.add(mat);
      alunos.push({ nome, matricula: mat });
    }
  });

  if (alunos.length === 0) {
    return {
      ok: false,
      erro: 'Não encontrei nenhum aluno neste PDF. A lista de ativos precisa trazer a matrícula entre colchetes, como "Nome do Aluno [123456]".',
    };
  }

  const tudo = limpar(linhas.join(' '));
  const turmaMatch = /(\d{3,})\s*-\s*([A-Z0-9]{5,})\s*\//.exec(tudo);
  const total = /Total de\s*(\d+)\s*alunos?/i.exec(tudo);

  return {
    ok: true,
    valor: {
      turmaCodigo: turmaMatch?.[1] ?? null,
      turma: turmaMatch?.[2] ?? null,
      totalDeclarado: total ? Number(total[1]) : null,
      alunos,
    },
    avisos: [],
  };
}
