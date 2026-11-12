import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Relatorio } from './relatorios';

/**
 * Desenha um relatório no layout dos modelos em Word (A4, medidas tiradas dos PDFs originais).
 * As fontes são as padrão do PDF (Helvetica), que não precisam ser embutidas; os modelos usam Calibri.
 */

const LARGURA = 595.3;
const ALTURA = 841.9;
const MARGEM_X = 18;
const MARGEM_TOPO = 40;
const MARGEM_BAIXO = 40;

const ROXO = rgb(0x70 / 255, 0x30 / 255, 0xa0 / 255);
const PRETO = rgb(0, 0, 0);

const LOGO = { x: 219.65, topo: 7.05, largura: 156, altura: 50.25 };
const CORPO = 14;
const ENTRELINHA = 16.8;
const TITULO = 23;
const TOTAIS = 12;
const ENTRELINHA_TOTAIS = 14.4;

interface Fontes {
  normal: PDFFont;
  negrito: PDFFont;
}

/** Troca caracteres que a fonte padrão não tem (WinAnsi) pela letra sem acento, ou remove. */
function seguro(texto: string, fonte: PDFFont): string {
  let saida = '';
  for (const c of texto.normalize('NFC')) {
    try {
      fonte.encodeText(c);
      saida += c;
    } catch {
      const base = c.normalize('NFD').replace(/\p{M}/gu, '');
      try {
        fonte.encodeText(base);
        saida += base;
      } catch {
        // caractere sem equivalente: fica de fora
      }
    }
  }
  return saida;
}

/** Quebra o texto em linhas que caibam na largura. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (atual && fonte.widthOfTextAtSize(teste, tamanho) > largura) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

class Pagina {
  page: PDFPage;
  /** Distância do topo da folha até o topo da próxima linha. */
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fontes: Fontes,
  ) {
    this.page = doc.addPage([LARGURA, ALTURA]);
    this.y = MARGEM_TOPO;
  }

  /** Garante espaço para `altura` pontos; senão começa outra página. */
  reservar(altura: number): void {
    if (this.y + altura > ALTURA - MARGEM_BAIXO) {
      this.page = this.doc.addPage([LARGURA, ALTURA]);
      this.y = MARGEM_TOPO;
    }
  }

  texto(t: string, o: { tamanho: number; cor?: typeof PRETO; negrito?: boolean; x?: number; centro?: boolean }): number {
    const fonte = o.negrito ? this.fontes.negrito : this.fontes.normal;
    const s = seguro(t, fonte);
    const largura = fonte.widthOfTextAtSize(s, o.tamanho);
    const x = o.centro ? (LARGURA - largura) / 2 : (o.x ?? MARGEM_X);
    // Linha de base ~ 0,8 do tamanho abaixo do topo da linha.
    this.page.drawText(s, { x, y: ALTURA - this.y - o.tamanho * 0.8, size: o.tamanho, font: fonte, color: o.cor ?? PRETO });
    return x + largura;
  }

  sublinhar(x1: number, x2: number, tamanho: number): void {
    const y = ALTURA - this.y - tamanho * 0.8 - 1.4;
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: PRETO });
  }
}

export async function gerarRelatorioPdf(relatorio: Relatorio, cabecalho: string[], logo: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${relatorio.titulo}${relatorio.arquivo ? ` – ${relatorio.arquivo.replace(/\.pdf$/i, '')}` : ''}`);
  doc.setProducer('Proz Secretaria');
  doc.setCreator('Proz Secretaria');
  const fontes: Fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const p = new Pagina(doc, fontes);
  const larguraUtil = LARGURA - 2 * MARGEM_X;

  // Logo e cabeçalho
  let imagem: PDFImage | null = null;
  if (logo) imagem = await doc.embedPng(logo);
  if (imagem) {
    p.page.drawImage(imagem, { x: LOGO.x, y: ALTURA - LOGO.topo - LOGO.altura, width: LOGO.largura, height: LOGO.altura });
  }
  p.y = 79;
  for (const linha of cabecalho.map((l) => l.trim()).filter(Boolean)) {
    for (const parte of quebrar(seguro(linha, fontes.normal), fontes.normal, CORPO, larguraUtil)) {
      p.texto(parte, { tamanho: CORPO, centro: true });
      p.y += ENTRELINHA;
    }
  }

  p.y += 19;
  p.texto(relatorio.titulo, { tamanho: TITULO, cor: ROXO, centro: true });
  p.y += 47;

  // Um bloco por aluno: nome em preto e "Disciplina – motivo" em roxo, sem quebrar entre páginas.
  if (relatorio.alunos.length === 0) {
    p.texto('Nenhum aluno.', { tamanho: CORPO });
    p.y += ENTRELINHA + 33;
  }
  for (const aluno of relatorio.alunos) {
    const linhas = aluno.linhas.flatMap((l) => quebrar(seguro(l, fontes.normal), fontes.normal, CORPO, larguraUtil));
    p.reservar(ENTRELINHA * (linhas.length + 1));
    p.texto(aluno.nome, { tamanho: CORPO });
    for (const l of linhas) {
      p.y += ENTRELINHA;
      p.texto(l, { tamanho: CORPO, cor: ROXO });
    }
    p.y += 33.3;
  }

  // Totais
  p.y += 15;
  p.reservar(28 + ENTRELINHA_TOTAIS * relatorio.totais.length);
  p.texto(relatorio.tituloTotais, { tamanho: TOTAIS, cor: ROXO, negrito: true });
  p.y += 28;
  for (const t of relatorio.totais) {
    const fim = p.texto(t.antes, { tamanho: TOTAIS });
    // Os modelos têm um espaço a mais antes da parte sublinhada.
    const inicioSub = fim + 3;
    const fimSub = p.texto(t.sublinhado, { tamanho: TOTAIS, x: inicioSub });
    p.sublinhar(inicioSub, fimSub, TOTAIS);
    const dois = p.texto(':  ', { tamanho: TOTAIS, x: fimSub });
    p.texto(t.valor, { tamanho: TOTAIS, x: dois, cor: ROXO, negrito: true });
    p.y += ENTRELINHA_TOTAIS;
  }

  return doc.save();
}
