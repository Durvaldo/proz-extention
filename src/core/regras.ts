import { chave, formatarNota } from './normalizar';
import type { Registro, SituacaoAlvo } from './types';

/**
 * Regras da secretaria para a situação do aluno numa disciplina fechada:
 *
 * | Nota final | Faltas acima do limite | Situação        |
 * |------------|------------------------|-----------------|
 * | ≥ 6        | não                    | Aprovado        |
 * | ≥ 6        | sim                    | Reclassificação |
 * | 4 a < 6    | não                    | Recuperação     |
 * | 4 a < 6    | sim                    | Reprovado       |
 * | < 4        | qualquer               | Reprovado       |
 *
 * Provas já feitas (nota maior que zero na coluna do Excel):
 * - Recuperação já feita e nota final abaixo de 6 → Reprovado (não há outra recuperação).
 * - Reclassificação já feita → as faltas já foram tratadas; vale só a nota final.
 *
 * "Faltas acima do limite" é o asterisco que o sistema põe nas faltas do boletim em PDF.
 */
export const NOTA_APROVACAO = 6;
export const NOTA_RECUPERACAO = 4;

export type SituacaoCalculada = SituacaoAlvo | 'Aprovado';

export interface Avaliacao {
  /** null quando não há nota final para calcular. */
  situacao: SituacaoCalculada | null;
  /** As faltas entraram na conta? false quando não se sabe (sem PDF) ou a reclassificação já foi feita. */
  faltasConsideradas: boolean;
  motivo: string;
}

export interface EntradaRegra {
  notaFinal: number | null;
  faltas: number | null;
  faltasAcima: boolean | null;
  notaRecuperacao: number | null;
  notaReclassificacao: number | null;
}

export function recuperacaoFeita(e: Pick<EntradaRegra, 'notaRecuperacao'>): boolean {
  return (e.notaRecuperacao ?? 0) > 0;
}

export function reclassificacaoFeita(e: Pick<EntradaRegra, 'notaReclassificacao'>): boolean {
  return (e.notaReclassificacao ?? 0) > 0;
}

export function classificar(e: EntradaRegra): Avaliacao {
  if (e.notaFinal === null) return { situacao: null, faltasConsideradas: false, motivo: 'sem nota final no boletim' };

  const feita = reclassificacaoFeita(e);
  const acima = !feita && e.faltasAcima === true;
  const faltasConsideradas = !feita && e.faltasAcima !== null;
  const nota = formatarNota(e.notaFinal);
  const faltasTxt = `${e.faltas ?? ''} faltas acima do limite`.trim();
  const sufixo = feita ? ' (reclassificação já feita)' : '';

  if (e.notaFinal >= NOTA_APROVACAO) {
    if (acima) return { situacao: 'Reclassificação', faltasConsideradas, motivo: `nota ${nota}, mas ${faltasTxt}` };
    return { situacao: 'Aprovado', faltasConsideradas, motivo: `nota ${nota}${sufixo}` };
  }
  if (e.notaFinal < NOTA_RECUPERACAO) {
    return { situacao: 'Reprovado', faltasConsideradas, motivo: `nota ${nota} abaixo de ${NOTA_RECUPERACAO}${acima ? ` e ${faltasTxt}` : ''}${sufixo}` };
  }
  if (acima) {
    return { situacao: 'Reprovado', faltasConsideradas, motivo: `nota ${nota} abaixo de ${NOTA_APROVACAO} e ${faltasTxt}` };
  }
  if (recuperacaoFeita(e)) {
    return { situacao: 'Reprovado', faltasConsideradas, motivo: `nota ${nota} abaixo de ${NOTA_APROVACAO} depois da recuperação` };
  }
  return { situacao: 'Recuperação', faltasConsideradas, motivo: `nota ${nota} entre ${NOTA_RECUPERACAO} e ${NOTA_APROVACAO}${sufixo}` };
}

export function classificarRegistro(r: Registro): Avaliacao {
  return classificar(r);
}

/** "Cursando": a disciplina ainda não terminou para o aluno; as regras não se aplicam. */
export function cursando(resultadoSistema: string): boolean {
  return chave(resultadoSistema) === 'cursando';
}

/**
 * "Em Fechamento": a disciplina terminou e o sistema ainda não deu o resultado.
 * É exatamente o caso do fechamento mensal: as regras se aplicam, mas não há com o que comparar.
 */
export function emFechamento(resultadoSistema: string): boolean {
  return chave(resultadoSistema) === 'em fechamento';
}
