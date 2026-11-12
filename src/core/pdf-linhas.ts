/** Um pedaço de texto do PDF com a posição na página (unidades do PDF; y cresce para cima). */
export interface Pedaco {
  texto: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Vão entre pedaços que vira separador de coluna (três espaços) na linha montada. */
export const SEPARADOR_COLUNA = '   ';

/**
 * Junta os pedaços de uma página em linhas de texto, pela posição.
 * Pedaços na mesma altura formam uma linha; vãos grandes viram três espaços, para separar colunas.
 * No boletim, isso deixa o nome da disciplina e as notas dela na mesma linha.
 */
export function montarLinhas(pedacos: Pedaco[]): string {
  const ordenados = [...pedacos].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Pedaco[][] = [];
  for (const p of ordenados) {
    const atual = linhas[linhas.length - 1];
    const ref = atual?.[0];
    if (atual && ref && Math.abs(ref.y - p.y) <= Math.max(ref.altura, p.altura) * 0.5) atual.push(p);
    else linhas.push([p]);
  }
  return linhas
    .map((linha) => {
      linha.sort((a, b) => a.x - b.x);
      let texto = '';
      let fim = -Infinity;
      for (const p of linha) {
        const vao = p.x - fim;
        // Pedaços colados formam uma palavra; um vão maior vira espaço ou separador de coluna.
        if (texto && vao > p.altura * 0.15) texto += vao > p.altura * 2 ? SEPARADOR_COLUNA : ' ';
        texto += p.texto;
        fim = p.x + p.largura;
      }
      return texto;
    })
    .join('\n');
}
