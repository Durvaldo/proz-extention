/** Dados fictícios no mesmo formato dos PDFs exportados pelo sistema. Nenhum aluno real. */

export const DISCIPLINAS = ['Banco de Dados', 'Programação Back-End', 'Sistemas Inteligentes', 'Internet e Redes'];

export const ALUNOS = [
  { nome: 'Ana Beatriz Teste', matricula: '100001' },
  { nome: 'Bruno Exemplo Silva', matricula: '100002' },
  { nome: 'Úrsula Fictícia', matricula: '100003' },
  { nome: 'Carlos Inativo', matricula: '100004' },
];

export interface LinhaFicticia {
  aluno: string;
  matricula: string;
  disciplina: string;
  notaFinal: number;
  faltas: number;
  /** Asterisco nas faltas do boletim em PDF. */
  faltasAcima: boolean;
  recuperacao: number;
  reclassificacao: number;
  resultado: string;
}

type Celula = { nota: number; faltas?: number; acima?: boolean; rec?: number; reclas?: number; resultado: string };

/** Uma célula por disciplina, na ordem de DISCIPLINAS. */
const BOLETIM: Record<string, Celula[]> = {
  '100001': [
    { nota: 9, resultado: 'Aprovado' },
    { nota: 5, resultado: 'Recuperação' },
    // Passou por nota, mas as faltas estão marcadas: regra Reclassificação, sistema Aprovado → divergência.
    { nota: 8, faltas: 18, acima: true, resultado: 'Aprovado' },
    { nota: 7, resultado: 'Em Fechamento' },
  ],
  '100002': [
    { nota: 3.5, faltas: 20, acima: true, resultado: 'Reprovado' },
    { nota: 7, faltas: 20, acima: true, resultado: 'Reclassificação' },
    { nota: 5, faltas: 5, resultado: 'Recuperação' },
    // Em Fechamento: o sistema ainda não deu o resultado; pela regra, nota 5 é Recuperação.
    { nota: 5, resultado: 'Em Fechamento' },
  ],
  '100003': [
    // Já fez a recuperação e não passou.
    { nota: 5, rec: 3, resultado: 'Reprovado' },
    // Já fez a reclassificação: as faltas não contam mais.
    { nota: 7, faltas: 25, acima: true, reclas: 6, resultado: 'Aprovado' },
    // Nota 2: o sistema diz Recuperação, a regra diz Reprovado → divergência.
    { nota: 2, resultado: 'Recuperação' },
    { nota: 0, resultado: 'Cursando' },
  ],
  // Carlos não está na lista de ativos: nunca entra no resultado.
  '100004': [
    { nota: 2, resultado: 'Recuperação' },
    { nota: 3, faltas: 30, acima: true, resultado: 'Reprovado' },
    { nota: 1, resultado: 'Recuperação' },
    { nota: 0, resultado: 'Em Fechamento' },
  ],
};

export function linhasFicticias(): LinhaFicticia[] {
  return ALUNOS.flatMap((a) =>
    DISCIPLINAS.map((d, i) => {
      const c = BOLETIM[a.matricula]?.[i] ?? { nota: 9, resultado: 'Aprovado' };
      return {
        aluno: a.nome,
        matricula: a.matricula,
        disciplina: d,
        notaFinal: c.nota,
        faltas: c.faltas ?? 0,
        faltasAcima: c.acima ?? false,
        recuperacao: c.rec ?? 0,
        reclassificacao: c.reclas ?? 0,
        resultado: c.resultado,
      };
    }),
  );
}

const br = (n: number, casas = 2) => n.toFixed(casas).replace('.', ',');

/** Colunas de nota de uma linha do boletim em PDF, com os asteriscos do sistema. */
function colunasNotaPdf(l: LinhaFicticia): string[] {
  const abaixo = l.notaFinal < 6 ? '*' : '';
  return [
    br(l.notaFinal),
    '0,00',
    br(l.recuperacao, 1),
    br(l.reclassificacao, 1),
    `${abaixo}${br(l.notaFinal, 1)}`,
    br(l.notaFinal, 1),
    `${l.faltasAcima ? '*' : ''}${l.faltas}`,
    l.resultado,
  ];
}

const COL = '     ';

/**
 * Texto do boletim em PDF como a extensão monta (colunas separadas por espaços largos).
 * Por padrão o nome da disciplina fica na mesma linha das notas, como no PDF do sistema;
 * com `nomesSeparados`, os nomes vêm antes das linhas de notas (layout de outros extratores).
 */
export function textoBoletim(opcoes: { turma?: string; nomesSeparados?: boolean; linhas?: LinhaFicticia[] } = {}): string {
  const { turma = 'TTESTE01', nomesSeparados = false, linhas = linhasFicticias() } = opcoes;
  const saida: string[] = [];
  ALUNOS.forEach((a, i) => {
    const dele = linhas.filter((l) => l.matricula === a.matricula);
    const notas = dele.map((l) => colunasNotaPdf(l).join(COL));
    saida.push(
      'Escola Fictícia',
      'Boletim Escolar',
      `Nome${COL}Matrícula${COL}Curso`,
      `${a.nome}${COL}${a.matricula}${COL}TÉCNICO EM TESTES`,
      `Unidade/Polo${COL}Turma${COL}Ano/Semestre${COL}Módulo/Série`,
      `(XX) Polo Teste${COL}${turma}${COL}01/02/2025${COL}Único`,
      `Componente curricular${COL}Avaliações${COL}Atividades${COL}Recuperação${COL}Reclassificação${COL}Nota parcial${COL}Nota final${COL}Faltas${COL}Resultado`,
      `presenciais${COL}online`,
      ...(nomesSeparados ? [...dele.map((l) => l.disciplina), ...notas.map((n) => `${COL}${n}`)] : dele.map((l, j) => `${l.disciplina}${COL}${notas[j]}`)),
      `${i * 2 + 1}/${ALUNOS.length * 2}`,
      '• Faltas precedidas de um asterisco (*) estão acima do percentual permitido.',
      // Canhoto: repete o cabeçalho do aluno, sem notas.
      `Nome${COL}Matrícula${COL}Curso`,
      `${a.nome}${COL}${a.matricula}${COL}TÉCNICO EM TESTES`,
      `${i * 2 + 2}/${ALUNOS.length * 2}`,
    );
  });
  return saida.join('\n');
}

/** HTML que o Chromium imprime como boletim em PDF nos testes ponta a ponta. */
export function htmlBoletim(turma = 'TTESTE01', linhas = linhasFicticias()): string {
  const td = (c: string) => `<td>${c}</td>`;
  const paginas = ALUNOS.map((a) => {
    const dele = linhas.filter((l) => l.matricula === a.matricula);
    const notas = dele.map((l) => `<tr>${td(l.disciplina)}${colunasNotaPdf(l).map(td).join('')}</tr>`).join('');
    return `<section style="page-break-after:always">
      <p style="text-align:center">Boletim Escolar</p>
      <table><tr>${['Nome', 'Matrícula', 'Curso'].map(td).join('')}</tr>
      <tr>${[a.nome, a.matricula, 'TÉCNICO EM TESTES'].map(td).join('')}</tr></table>
      <table><tr>${['Unidade/Polo', 'Turma', 'Ano/Semestre', 'Módulo/Série'].map(td).join('')}</tr>
      <tr>${['(XX) Polo Teste', turma, '01/02/2025', 'Único'].map(td).join('')}</tr></table>
      <table><tr>${['Componente curricular', 'Avaliações', 'Atividades', 'Recuperação', 'Reclassificação', 'Nota parcial', 'Nota final', 'Faltas', 'Resultado'].map(td).join('')}</tr>${notas}</table>
      <p>• Faltas precedidas de um asterisco (*) estão acima do percentual permitido.</p></section>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>body{font:11px Arial}td{padding:2px 34px 2px 0;white-space:nowrap}</style><body>${paginas}</body>`;
}

/** Texto como sai da lista de ativos em PDF (só os três primeiros alunos estão ativos). */
export function textoAtivos(turma = 'TTESTE01', total = 3): string {
  return [
    '                                                ESCOLA FICTÍCIA LTDA',
    'Turma / Período:                                                    Unidade / Polo:',
    `99999 - ${turma} / 03/02/2025 - 03/02/2027                      (XX) Polo Teste]`,
    '                               Nome                        Polo             Observações',
    ...ALUNOS.slice(0, 3).map((a) => `${a.nome} [${a.matricula}]              (XX) Polo Teste`),
    `                                                                                         Total de ${total} alunos`,
  ].join('\n');
}

/** HTML que o Chromium imprime como lista de ativos em PDF nos testes ponta a ponta. */
export function htmlAtivos(turma = 'TTESTE01'): string {
  const linhas = ALUNOS.slice(0, 3)
    .map((a) => `<tr><td>${a.nome} [${a.matricula}]</td><td>(XX) Polo Teste</td><td></td></tr>`)
    .join('');
  return `<!doctype html><meta charset="utf-8"><body style="font:12px Arial">
    <p>ESCOLA FICTÍCIA LTDA</p>
    <p>Turma / Período: 99999 - ${turma} / 03/02/2025 - 03/02/2027</p>
    <table style="width:100%"><tr><th>Nome</th><th>Polo</th><th>Observações</th></tr>${linhas}</table>
    <p style="text-align:right">Total de 3 alunos</p></body>`;
}
