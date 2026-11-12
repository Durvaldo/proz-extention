import { interpretarAtivos } from '../../core/ativos';
import { interpretarBoletim, pareceBoletim } from '../../core/boletim';
import { gerarCsv, gerarTexto, gerarXlsx, nomeArquivo, type Contexto } from '../../core/exportar';
import { calcularFechamento, conferir, pendenciasPorDisciplina, type Divergencia, type Pendencia, type Resultado } from '../../core/fechamento';
import { chave, formatarNota } from '../../core/normalizar';
import { SITUACOES_ALVO, type Aviso, type Boletim, type ListaAtivos, type SituacaoAlvo } from '../../core/types';
import { extrairTextoPdf } from './pdf';

type Slot = 'boletim' | 'ativos';
type Visao = 'aluno' | 'disciplina';

interface EstadoArquivo<T> {
  nome: string;
  status: 'ok' | 'erro';
  valor: T | null;
  mensagem: string;
  avisos: Aviso[];
}

interface Arquivos {
  boletim: EstadoArquivo<Boletim> | null;
  ativos: EstadoArquivo<ListaAtivos> | null;
}

const SLOTS: Slot[] = ['boletim', 'ativos'];
const CHAVE_VISAO = 'fechamento.visao';
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

export function iniciarFechamento(raiz: HTMLElement): void {
  const $ = <T extends Element = HTMLElement>(sel: string) => {
    const el = raiz.querySelector<T>(sel);
    if (!el) throw new Error(`Elemento ausente: ${sel}`);
    return el;
  };

  const arquivos: Arquivos = { boletim: null, ativos: null };
  const selecionadas = new Set<string>(); // chaves normalizadas das disciplinas
  const situacoes = new Set<SituacaoAlvo>(SITUACOES_ALVO);
  let visao: Visao = 'aluno';
  let resultadoAtual: Resultado | null = null;

  const mensagens = $('#mensagens');
  const passoDisciplinas = $('#passo-disciplinas');
  const passoResultado = $('#passo-resultado');
  const lista = $('#lista-disciplinas');
  const busca = $<HTMLInputElement>('#busca');
  const limparDisciplinas = $('#limpar-disciplinas');
  const filtros = $('#filtros');
  const resultadoEl = $('#resultado');
  const divergenciasEl = $<HTMLDetailsElement>('#divergencias');
  const avisosResultado = $('#avisos-resultado');
  const listaDivergencias = $('#lista-divergencias');
  const barraExportar = $('#barra-exportar');
  const hintExportar = $('#hint-exportar');
  const botoesExportar = [$<HTMLButtonElement>('#exportar-xlsx'), $<HTMLButtonElement>('#exportar-csv'), $<HTMLButtonElement>('#copiar-texto')];

  void chrome.storage?.local.get(CHAVE_VISAO).then((r) => {
    if (r[CHAVE_VISAO] === 'disciplina' || r[CHAVE_VISAO] === 'aluno') {
      visao = r[CHAVE_VISAO];
      renderResultado();
    }
  });

  // ---------- Arquivos ----------

  function erroEm(slot: Slot, nome: string, mensagem: string): void {
    definir(slot, { nome, status: 'erro', valor: null, mensagem, avisos: [] });
  }

  /** Cada leitura recebe um número; só a mais recente para cada área é mostrada. */
  let sequencia = 0;
  const ultimaLeitura: Record<Slot, number> = { boletim: 0, ativos: 0 };

  function podeMostrar(slot: Slot, minha: number): boolean {
    if (minha < ultimaLeitura[slot]) return false;
    ultimaLeitura[slot] = minha;
    return true;
  }

  /**
   * Recebe um PDF e descobre pelo conteúdo se é o boletim ou a lista de ativos,
   * não importa em qual área foi solto. Assim dá para arrastar os dois juntos.
   */
  async function receber(arquivo: File, slotSolto: Slot): Promise<void> {
    const minha = ++sequencia;
    const nome = arquivo.name;
    const ehPdf = nome.toLowerCase().endsWith('.pdf') || arquivo.type === 'application/pdf';

    if (!ehPdf) {
      if (podeMostrar(slotSolto, minha)) erroEm(slotSolto, nome, 'Use o arquivo em PDF, como sai do sistema.');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      if (podeMostrar(slotSolto, minha)) erroEm(slotSolto, nome, 'Arquivo maior que 20 MB.');
      return;
    }

    let texto: string;
    try {
      texto = await extrairTextoPdf(await arquivo.arrayBuffer());
    } catch {
      if (podeMostrar(slotSolto, minha)) erroEm(slotSolto, nome, 'Não consegui ler este PDF. Baixe o arquivo de novo no sistema.');
      return;
    }

    if (pareceBoletim(texto)) {
      const leitura = interpretarBoletim(texto);
      if (!podeMostrar('boletim', minha)) return;
      if (!leitura.ok) return erroEm('boletim', nome, leitura.erro);
      const b = leitura.valor;
      const partes = [b.turma ? `Turma ${b.turma}` : null, `${b.alunos.size} alunos`, `${b.disciplinas.length} disciplinas`];
      definir('boletim', { nome, status: 'ok', valor: b, mensagem: partes.filter(Boolean).join(' · '), avisos: leitura.avisos });
      return;
    }

    const leitura = interpretarAtivos(texto);
    const slot: Slot = leitura.ok ? 'ativos' : slotSolto;
    if (!podeMostrar(slot, minha)) return;
    if (!leitura.ok) {
      return erroEm(slot, nome, slot === 'boletim' ? 'Este PDF não parece o boletim da turma. Use o boletim em PDF, como sai do sistema.' : leitura.erro);
    }
    const a = leitura.valor;
    const turma = a.turma ? ` · turma ${[a.turmaCodigo, a.turma].filter(Boolean).join(' - ')}` : '';
    definir('ativos', { nome, status: 'ok', valor: a, mensagem: `${a.alunos.length} alunos ativos${turma}`, avisos: leitura.avisos });
  }

  function definir(slot: Slot, estado: Arquivos[Slot]): void {
    (arquivos as Record<Slot, Arquivos[Slot]>)[slot] = estado;
    renderSlot(slot);
    renderTudo();
  }

  function renderSlot(slot: Slot): void {
    const el = $(`[data-slot="${slot}"]`);
    const estado = arquivos[slot];
    el.classList.toggle('ok', estado?.status === 'ok');
    el.classList.toggle('err', estado?.status === 'erro');
    $(`[data-slot="${slot}"] .dropzone`).hidden = estado !== null;
    $(`[data-slot="${slot}"] .file-chip`).hidden = estado === null;
    if (estado) {
      $(`[data-slot="${slot}"] .file-name`).textContent = estado.nome;
      $(`[data-slot="${slot}"] .file-meta`).textContent = estado.mensagem;
    }
  }

  for (const slot of SLOTS) {
    const input = $<HTMLInputElement>(`#input-${slot}`);
    input.addEventListener('change', () => {
      for (const f of [...(input.files ?? [])]) void receber(f, slot);
      input.value = '';
    });

    // Soltar os três arquivos juntos em qualquer área funciona: cada um vai para o lugar certo.
    const area = $(`[data-slot="${slot}"]`);
    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.classList.add('dragging');
    });
    area.addEventListener('dragleave', () => area.classList.remove('dragging'));
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('dragging');
      for (const f of [...(e.dataTransfer?.files ?? [])]) void receber(f, slot);
    });
  }
  // Arquivo solto fora das áreas não deve abrir no lugar do painel.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // ---------- Tela ----------

  function prontos(): { boletim: Boletim; ativos: ListaAtivos } | null {
    const b = arquivos.boletim?.valor;
    const a = arquivos.ativos?.valor;
    return b && a ? { boletim: b, ativos: a } : null;
  }

  function renderTudo(): void {
    const dados = prontos();
    const avisos: Aviso[] = SLOTS.flatMap((s) => arquivos[s]?.avisos ?? []);
    let bloqueado = false;

    if (dados) {
      const conf = conferir(dados.boletim, dados.ativos);
      avisos.push(...conf.avisos);
      bloqueado = conf.avisos.some((a) => a.tipo === 'erro');
      if (!bloqueado) {
        const fora =
          conf.inativos === 1
            ? ' O outro aluno do boletim não está ativo e fica de fora.'
            : conf.inativos > 1
              ? ` Os outros ${conf.inativos} alunos do boletim não estão ativos e ficam de fora.`
              : '';
        avisos.unshift({ tipo: 'ok', mensagem: `${conf.ativosNoBoletim} de ${dados.ativos.alunos.length} alunos ativos encontrados no boletim.${fora}` });
      }
      // Mantém só as disciplinas escolhidas que existem no boletim atual.
      const existentes = new Set(dados.boletim.disciplinas.map(chave));
      for (const k of [...selecionadas]) if (!existentes.has(k)) selecionadas.delete(k);
    }

    mensagens.replaceChildren(
      ...avisos.map((a) => {
        const p = document.createElement('p');
        p.className = `message ${a.tipo}`;
        p.textContent = a.mensagem;
        return p;
      }),
    );

    const mostrar = dados !== null && !bloqueado;
    passoDisciplinas.hidden = !mostrar;
    passoResultado.hidden = !mostrar;
    barraExportar.hidden = !mostrar;
    if (mostrar) renderDisciplinas();
    renderResultado();
  }

  function renderDisciplinas(): void {
    const dados = prontos();
    if (!dados) return;
    const contagem = pendenciasPorDisciplina(dados.boletim, dados.ativos);
    const filtro = chave(busca.value);
    const itens = dados.boletim.disciplinas.filter((d) => !filtro || chave(d).includes(filtro));

    if (itens.length === 0) {
      const li = document.createElement('li');
      li.className = 'vazio';
      li.textContent = 'Nenhuma disciplina com esse nome.';
      lista.replaceChildren(li);
    } else {
      lista.replaceChildren(
        ...itens.map((d) => {
          const k = chave(d);
          const li = document.createElement('li');
          li.classList.toggle('selecionada', selecionadas.has(k));
          const label = document.createElement('label');
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.checked = selecionadas.has(k);
          check.addEventListener('change', () => {
            if (check.checked) selecionadas.add(k);
            else selecionadas.delete(k);
            li.classList.toggle('selecionada', check.checked);
            atualizarLimpar();
            renderResultado();
          });
          const nome = document.createElement('span');
          nome.className = 'nome';
          nome.textContent = d;
          const n = contagem.get(d) ?? 0;
          const cont = document.createElement('span');
          cont.className = `contador${n > 0 ? ' tem' : ''}`;
          cont.textContent = String(n);
          cont.title = n === 1 ? '1 aluno ativo com pendência' : `${n} alunos ativos com pendência`;
          label.append(check, nome, cont);
          li.append(label);
          return li;
        }),
      );
    }
    atualizarLimpar();
  }

  function atualizarLimpar(): void {
    limparDisciplinas.hidden = selecionadas.size === 0;
  }

  busca.addEventListener('input', renderDisciplinas);
  limparDisciplinas.addEventListener('click', () => {
    selecionadas.clear();
    renderDisciplinas();
    renderResultado();
  });

  for (const botao of raiz.querySelectorAll<HTMLButtonElement>('[data-visao]')) {
    botao.addEventListener('click', () => {
      visao = botao.dataset.visao === 'disciplina' ? 'disciplina' : 'aluno';
      void chrome.storage?.local.set({ [CHAVE_VISAO]: visao });
      renderResultado();
    });
  }

  function classeSituacao(s: SituacaoAlvo): string {
    return `sit-${chave(s)}`;
  }

  function disciplinasEscolhidas(boletim: Boletim): string[] {
    return boletim.disciplinas.filter((d) => selecionadas.has(chave(d)));
  }

  function renderResultado(): void {
    for (const botao of raiz.querySelectorAll<HTMLButtonElement>('[data-visao]')) {
      botao.setAttribute('aria-pressed', String(botao.dataset.visao === visao));
    }
    const dados = prontos();
    divergenciasEl.hidden = true;
    avisosResultado.replaceChildren();
    if (!dados || passoResultado.hidden) {
      resultadoAtual = null;
      return;
    }
    const escolhidas = disciplinasEscolhidas(dados.boletim);
    hintExportar.textContent = '';
    hintExportar.classList.remove('ok');

    if (escolhidas.length === 0) {
      resultadoAtual = null;
      filtros.replaceChildren();
      resultadoEl.replaceChildren(vazio('Marque uma ou mais disciplinas acima para ver o resultado.'));
      for (const b of botoesExportar) b.disabled = true;
      hintExportar.textContent = 'Escolha as disciplinas para exportar.';
      return;
    }

    // As contagens dos filtros consideram as três situações; o que aparece na lista respeita os filtros.
    const completo = calcularFechamento(dados.boletim, dados.ativos, escolhidas);
    const resultado = calcularFechamento(dados.boletim, dados.ativos, escolhidas, SITUACOES_ALVO.filter((s) => situacoes.has(s)));
    renderDivergencias(resultado.divergencias);
    renderAvisosResultado(resultado);
    resultadoAtual = resultado;
    for (const b of botoesExportar) b.disabled = false;

    const total = document.createElement('span');
    total.className = 'filtro total';
    total.textContent = resultado.porAluno.length === 1 ? '1 aluno' : `${resultado.porAluno.length} alunos`;
    filtros.replaceChildren(
      total,
      ...SITUACOES_ALVO.map((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `filtro ${classeSituacao(s)}`;
        b.setAttribute('aria-pressed', String(situacoes.has(s)));
        b.title = situacoes.has(s) ? `Esconder ${s}` : `Mostrar ${s}`;
        b.textContent = `${s} ${completo.contagem[s]}`;
        b.addEventListener('click', () => {
          if (situacoes.has(s)) situacoes.delete(s);
          else situacoes.add(s);
          renderResultado();
        });
        return b;
      }),
    );

    if (resultado.pendencias.length === 0) {
      const msg =
        situacoes.size < SITUACOES_ALVO.length && completo.pendencias.length > 0
          ? 'Nenhum aluno nas situações marcadas.'
          : 'Nenhum aluno ativo em recuperação, reclassificação ou reprovado nessas disciplinas.';
      resultadoEl.replaceChildren(vazio(msg, completo.pendencias.length === 0));
      return;
    }

    if (visao === 'aluno') {
      resultadoEl.replaceChildren(...resultado.porAluno.map((a) => grupo(a.aluno, a.matricula, a.pendencias.map((p) => item(p, p.disciplina)))));
    } else {
      resultadoEl.replaceChildren(
        ...resultado.porDisciplina.map((d) =>
          grupo(
            d.disciplina,
            d.pendencias.length === 1 ? '1 aluno' : `${d.pendencias.length} alunos`,
            d.pendencias.map((p) => item(p, p.aluno, p.matricula)),
          ),
        ),
      );
    }
  }

  function vazio(texto: string, ok = false): HTMLElement {
    const p = document.createElement('p');
    p.className = `estado-vazio${ok ? ' ok' : ''}`;
    p.textContent = texto;
    return p;
  }

  function grupo(titulo: string, extra: string, itens: HTMLElement[]): HTMLElement {
    const div = document.createElement('div');
    div.className = 'grupo';
    const head = document.createElement('div');
    head.className = 'grupo-head';
    const nome = document.createElement('span');
    nome.className = 'grupo-nome';
    nome.textContent = titulo;
    const ex = document.createElement('span');
    ex.className = 'grupo-extra';
    ex.textContent = extra;
    head.append(nome, ex);
    const ul = document.createElement('ul');
    ul.append(cabecalho(visao === 'aluno' ? 'Disciplina' : 'Aluno'), ...itens);
    div.append(head, ul);
    return div;
  }

  /** Uma linha da tabela: Situação | Aluno ou Disciplina | Nota | Faltas. */
  function item(p: Pendencia, texto: string, sub = ''): HTMLElement {
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = `badge ${classeSituacao(p.situacao)}`;
    badge.textContent = p.situacao;
    const corpo = document.createElement('span');
    corpo.className = 'item-texto';
    corpo.textContent = texto;
    if (sub) {
      const s = document.createElement('span');
      s.className = 'item-sub';
      s.textContent = ` ${sub}`;
      corpo.append(s);
    }
    const nota = document.createElement('span');
    nota.className = 'item-num';
    nota.textContent = formatarNota(p.notaFinal);
    const faltas = document.createElement('span');
    faltas.className = `item-num${p.faltasAcima && !p.reclassificacaoFeita ? ' acima' : ''}`;
    faltas.textContent = p.faltas === null ? '–' : String(p.faltas);
    if (p.faltasAcima) {
      faltas.title = p.reclassificacaoFeita ? 'Acima do limite, mas a reclassificação já foi feita' : 'Faltas acima do limite permitido';
    }
    li.append(badge, corpo, nota, faltas);
    return li;
  }

  /** Cabeçalho das colunas de cada grupo. */
  function cabecalho(coluna: string): HTMLElement {
    const li = document.createElement('li');
    li.className = 'cab';
    for (const [texto, classe] of [['Situação', ''], [coluna, ''], ['Nota', 'item-num'], ['Faltas', 'item-num']] as const) {
      const s = document.createElement('span');
      s.className = classe;
      s.textContent = texto;
      li.append(s);
    }
    return li;
  }

  /** Disciplinas com alunos ainda "Cursando": ficam fora das regras e o painel avisa. */
  function renderAvisosResultado(r: Resultado): void {
    avisosResultado.replaceChildren(
      ...r.cursando.map((a) => {
        const p = document.createElement('p');
        p.className = 'message aviso';
        const quem = a.alunos === 1 ? '1 aluno ainda está' : `${a.alunos} alunos ainda estão`;
        p.textContent = `${a.disciplina}: ${quem} como Cursando no sistema e ficaram fora das regras.`;
        return p;
      }),
    );
  }

  function renderDivergencias(itens: Divergencia[]): void {
    divergenciasEl.hidden = itens.length === 0;
    const summary = divergenciasEl.querySelector('summary');
    if (summary) summary.textContent = `Divergências com o sistema (${itens.length})`;
    listaDivergencias.replaceChildren(
      ...itens.map((d) => {
        const li = document.createElement('li');
        const nome = document.createElement('div');
        nome.className = 'div-nome';
        nome.textContent = `${d.aluno} (${d.matricula}) · ${d.disciplina}`;
        const comp = document.createElement('div');
        comp.className = 'div-comp';
        comp.textContent = `Regra: ${d.regra ?? 'sem nota'} · Sistema: ${d.resultadoSistema || 'vazio'}`;
        const motivo = document.createElement('div');
        motivo.className = 'div-motivo';
        motivo.textContent = d.motivo;
        li.append(nome, comp, motivo);
        return li;
      }),
    );
  }

  // ---------- Exportar ----------

  function contexto(): Contexto | null {
    const dados = prontos();
    if (!dados) return null;
    return { turma: dados.boletim.turma ?? dados.ativos.turma, disciplinas: disciplinasEscolhidas(dados.boletim), data: new Date() };
  }

  function baixar(conteudo: BlobPart, tipo: string, nome: string): void {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function avisar(texto: string, ok = true): void {
    hintExportar.textContent = texto;
    hintExportar.classList.toggle('ok', ok);
  }

  $('#exportar-xlsx').addEventListener('click', () => {
    const ctx = contexto();
    if (!ctx || !resultadoAtual) return;
    const nome = nomeArquivo(ctx, 'xlsx');
    baixar(gerarXlsx(resultadoAtual, ctx), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nome);
    avisar(`Baixado: ${nome}`);
  });

  $('#exportar-csv').addEventListener('click', () => {
    const ctx = contexto();
    if (!ctx || !resultadoAtual) return;
    const nome = nomeArquivo(ctx, 'csv');
    baixar(gerarCsv(resultadoAtual), 'text/csv;charset=utf-8', nome);
    avisar(`Baixado: ${nome}`);
  });

  $('#copiar-texto').addEventListener('click', async () => {
    const ctx = contexto();
    if (!ctx || !resultadoAtual) return;
    const texto = gerarTexto(resultadoAtual, ctx);
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Texto copiado. Cole no WhatsApp ou no e-mail.');
    } catch {
      avisar('Não consegui copiar. Clique no painel e tente de novo.', false);
    }
  });
}
