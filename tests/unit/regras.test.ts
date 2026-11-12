import { describe, expect, it } from 'vitest';
import { classificar, cursando, emFechamento, type EntradaRegra } from '../../src/core/regras';

function entrada(notaFinal: number | null, faltasAcima: boolean | null, extra: Partial<EntradaRegra> = {}): EntradaRegra {
  return { notaFinal, faltas: faltasAcima ? 20 : 0, faltasAcima, notaRecuperacao: 0, notaReclassificacao: 0, ...extra };
}

describe('regras da secretaria', () => {
  it.each([
    // nota, faltas acima do limite (asterisco), situação
    [10, false, 'Aprovado'],
    [6, false, 'Aprovado'],
    [6, true, 'Reclassificação'],
    [10, true, 'Reclassificação'],
    [5.99, false, 'Recuperação'],
    [4, false, 'Recuperação'],
    [4, true, 'Reprovado'],
    [5, true, 'Reprovado'],
    [3.99, false, 'Reprovado'],
    [0, false, 'Reprovado'],
  ] as const)('nota %s, faltas acima do limite: %s → %s', (nota, acima, esperado) => {
    expect(classificar(entrada(nota, acima)).situacao).toBe(esperado);
  });

  it('recuperação já feita e nota abaixo de 6 → Reprovado', () => {
    expect(classificar(entrada(5, false, { notaRecuperacao: 3 })).situacao).toBe('Reprovado');
    expect(classificar(entrada(6, false, { notaRecuperacao: 6 })).situacao).toBe('Aprovado');
  });

  it('reclassificação já feita: as faltas não contam mais', () => {
    expect(classificar(entrada(7, true, { notaReclassificacao: 6 })).situacao).toBe('Aprovado');
    expect(classificar(entrada(5, true, { notaReclassificacao: 6 })).situacao).toBe('Recuperação');
  });

  it('sem a marca de faltas julga só pela nota', () => {
    const av = classificar(entrada(8, null));
    expect(av.situacao).toBe('Aprovado');
    expect(av.faltasConsideradas).toBe(false);
  });

  it('sem nota final não classifica', () => {
    expect(classificar(entrada(null, false)).situacao).toBeNull();
  });

  it('explica o motivo', () => {
    expect(classificar(entrada(7, true)).motivo).toBe('nota 7,0, mas 20 faltas acima do limite');
    expect(classificar(entrada(3.5, false)).motivo).toBe('nota 3,5 abaixo de 4');
    expect(classificar(entrada(5, false)).motivo).toBe('nota 5,0 entre 4 e 6');
    expect(classificar(entrada(5, false, { notaRecuperacao: 2 })).motivo).toBe('nota 5,0 abaixo de 6 depois da recuperação');
  });

  it('reconhece Cursando (fora das regras) e Em Fechamento (regras valem)', () => {
    expect(cursando('CURSANDO')).toBe(true);
    expect(cursando('Em Fechamento')).toBe(false);
    expect(emFechamento('em fechamento')).toBe(true);
    expect(emFechamento('Recuperação')).toBe(false);
  });
});
