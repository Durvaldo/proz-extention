import { iniciarFechamento } from '../modules/fechamento/view';

/**
 * Cada ferramenta da secretaria é um módulo: um bloco `[data-modulo]` no index.html e uma função que o liga.
 * Para adicionar outra, crie src/modules/<nome>/view.ts, o bloco no HTML e uma entrada aqui.
 */
interface Modulo {
  id: string;
  titulo: string;
  iniciar: (raiz: HTMLElement) => void;
}

const MODULOS: Modulo[] = [{ id: 'fechamento', titulo: 'Fechamento mensal', iniciar: iniciarFechamento }];

const nav = document.querySelector<HTMLElement>('#modulos');

function abrir(id: string): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-modulo]')) el.hidden = el.dataset.modulo !== id;
  for (const b of nav?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
    if (b.dataset.id === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

for (const modulo of MODULOS) {
  const raiz = document.querySelector<HTMLElement>(`[data-modulo="${modulo.id}"]`);
  if (raiz) modulo.iniciar(raiz);
}

if (nav && MODULOS.length > 1) {
  nav.hidden = false;
  nav.replaceChildren(
    ...MODULOS.map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = m.id;
      b.textContent = m.titulo;
      b.addEventListener('click', () => abrir(m.id));
      return b;
    }),
  );
}
if (MODULOS[0]) abrir(MODULOS[0].id);
