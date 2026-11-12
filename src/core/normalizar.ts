/** Chave de comparação: sem acentos, sem diferença de maiúsculas e com espaços simples. */
export function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Espaços simples nas pontas e no meio, mantendo acentos e maiúsculas. */
export function limpar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Lê "6,80", "*3,0", 9 ou "" → número ou null. O asterisco do boletim marca nota abaixo da média. */
export function numero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;
  const texto = valor.replace(/\*/g, '').trim();
  if (texto === '') return null;
  const normal = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Matrícula sempre como texto só com dígitos (o Excel pode trazer 123456 como número). */
export function matricula(valor: unknown): string {
  if (typeof valor === 'number') return String(Math.trunc(valor));
  return typeof valor === 'string' ? valor.replace(/\D/g, '') : '';
}

const FORMATO_NOTA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function formatarNota(n: number | null): string {
  return n === null ? '–' : FORMATO_NOTA.format(n);
}

export function compararNomes(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}
