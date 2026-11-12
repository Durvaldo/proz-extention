import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { montarLinhas, type Pedaco } from '../../core/pdf-linhas';

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('panel/pdf.worker.min.mjs');

/** Extrai o texto do PDF linha a linha (ver `montarLinhas`). Tudo roda no navegador. */
export async function extrairTextoPdf(dados: ArrayBuffer): Promise<string> {
  const tarefa = getDocument({ data: new Uint8Array(dados) });
  const paginas: string[] = [];
  try {
    const doc = await tarefa.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const conteudo = await pagina.getTextContent();
      const pedacos: Pedaco[] = [];
      for (const item of conteudo.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        pedacos.push({
          texto: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          largura: item.width,
          altura: Math.abs(item.height) || Math.abs(item.transform[3] ?? 10),
        });
      }
      paginas.push(montarLinhas(pedacos));
    }
  } finally {
    await tarefa.destroy();
  }
  return paginas.join('\n');
}
