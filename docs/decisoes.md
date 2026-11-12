# Decisões

## 2026-11-12 — Entrada: só os dois PDFs do sistema

- **Boletim em PDF + lista de ativos em PDF.** São os arquivos que a secretaria já gera; pedir um terceiro (o Excel do boletim) foi descartado por dar trabalho a mais.
- O boletim em PDF traz tudo o que o fechamento usa: aluno, matrícula, turma, disciplina, notas, recuperação, reclassificação, faltas e resultado. Além disso, **só o PDF marca as faltas acima do limite** (asterisco), o que o Excel não faz.
- O texto é extraído com pdf.js e remontado em linhas pela posição (`src/core/pdf-linhas.ts`). No PDF do sistema, nome da disciplina e notas ficam na mesma altura, então cada linha sai completa.
- Validação com uma turma real: as 748 linhas (aluno × disciplina) lidas do PDF pelo código da extensão ficaram idênticas às do Excel exportado pelo sistema (nota final, faltas, recuperação, reclassificação e resultado), com as mesmas 71 faltas marcadas.
- **Cruzamento pela matrícula**, nunca pelo nome.
- O boletim inclui alunos inativos (numa turma real, metade dos alunos do boletim já não estava ativa). Por isso o filtro de ativos é obrigatório.

## 2026-11-12 — Situação calculada pelas regras da secretaria

A situação é calculada pela nota final e pelas faltas, não lida da coluna *Resultado*:

- nota ≥ 6 e faltas sem asterisco → Aprovado;
- nota ≥ 6 e faltas com asterisco → **Reclassificação**;
- 4 ≤ nota < 6 e faltas sem asterisco → **Recuperação**;
- 4 ≤ nota < 6 e faltas com asterisco → **Reprovado**;
- nota < 4 → **Reprovado**.

Provas já feitas (nota > 0 na coluna correspondente):

- recuperação feita e nota < 6 → Reprovado. Na turma real, os 2 casos assim estavam Reprovado no sistema e os outros 42 que fizeram recuperação passaram;
- reclassificação feita → faltas não contam mais. Na turma real, 7 alunos com asterisco já tinham feito a reclassificação e estavam Aprovado.

O "limite de faltas" vem do asterisco do sistema. Uma versão intermediária pedia a carga horária de cada disciplina para calcular 25%; foi descartada porque o boletim já traz a marca.

Divergências entre regra e sistema ficam listadas no fim do resultado e na aba do Excel. Um selo em cada linha ("sistema: …") foi removido por poluir a lista. Na turma real, as únicas divergências entre ativos são de nota < 4, que o sistema marca como Recuperação e a regra classifica como Reprovado; a decisão de seguir a regra foi da secretaria.

*Em Fechamento* passa pelas regras: é exatamente o momento do fechamento (a disciplina terminou e o sistema ainda não deu o resultado), e por isso não conta como divergência. *Cursando* fica fora das regras, com aviso: a disciplina ainda não terminou para o aluno.

## 2026-11-12 — PDFs para os professores

A secretaria mandava aos professores três documentos montados à mão no Word (Reprovados, Recuperação e Reclassificação). A extensão passou a gerá-los com um botão, no mesmo layout:

- **Medidas tiradas dos PDFs originais:** A4, logo centralizado no topo, cabeçalho em 14 pt, título em 23 pt e textos das disciplinas na cor roxa do modelo (`#7030A0`), relatório de totais em 12 pt com a parte sublinhada. O logo saiu do próprio PDF modelo (PNG com transparência, em `src/assets/img`).
- **Fonte Helvetica** (padrão do PDF, sem embutir arquivo de fonte). Os modelos usam Calibri, que não pode ser distribuída.
- **pdf-lib** desenha os arquivos no navegador; nada sai do computador.
- **Textos iguais aos modelos**, inclusive "Reprovado por notas" no relatório de recuperação e "Reprovado por faltas" no de reclassificação. No de reprovados, "por notas e faltas" quando as faltas estão acima do limite (asterisco) e a reclassificação não foi feita.
- **Totais contam alunos.** Um aluno reprovado por notas e faltas numa disciplina e só por notas em outra entra nos dois totais, como no modelo (2 e 5 numa turma com 6 alunos reprovados).
- **Os três arquivos saem sempre**, mesmo vazios (total 00), e com as três situações, independentemente do filtro da tela.
- **Cabeçalho editável e salvo por turma:** o boletim não traz o nome do grupo/programa (ex.: "TRILHAS DE FUTURO V") nem a forma abreviada do curso. Desistentes também não estão no boletim e são digitados (não ficam salvos).

## Outras

- **Uma turma por vez.** Se o boletim e a lista de ativos forem de turmas diferentes, o fechamento é bloqueado.
- **Exportação:** os 3 PDFs dos professores (botão principal), Excel (abas Fechamento, Divergências e Resumo), CSV (`;` e vírgula decimal, com BOM, que o Excel em português abre direto) e texto agrupado por aluno. Modelo de mensagem fica para depois.
- **Não guardar a seleção de disciplinas** entre usos. As disciplinas mudam a cada mês, e uma seleção antiga carregada sozinha pode passar despercebida. Só a visão (por aluno / por disciplina) é lembrada.
- **Sem `host_permissions`.** Este módulo não acessa nenhum site. Permissões: `sidePanel`, `storage`, `clipboardWrite`.
- Base copiada do SSG: tema (tokens de `panel.css`), esbuild, Vitest, Playwright e versões das dependências. O pdf.js (`pdfjs-dist` 6.4.299) foi adicionado e o worker vai junto no `dist/`, porque a CSP de extensão não permite carregar de CDN.
