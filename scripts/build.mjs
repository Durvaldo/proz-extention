import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(`${outdir}/panel`, { recursive: true });

const common = {
  bundle: true,
  target: 'chrome116',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning',
  format: 'esm',
};

await build({ ...common, entryPoints: ['src/background/index.ts'], outfile: `${outdir}/background.js` });
await build({ ...common, entryPoints: ['src/panel/panel.ts'], outfile: `${outdir}/panel/panel.js` });

cpSync('manifest.json', `${outdir}/manifest.json`);
cpSync('src/panel/index.html', `${outdir}/panel/index.html`);
cpSync('src/panel/panel.css', `${outdir}/panel/panel.css`);
// O pdf.js lê o PDF num worker; o arquivo precisa estar dentro da extensão (CSP não permite CDN).
cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', `${outdir}/panel/pdf.worker.min.mjs`);
cpSync('src/assets/icons', `${outdir}/icons`, { recursive: true });
// Logo dos PDFs dos professores.
cpSync('src/assets/img', `${outdir}/img`, { recursive: true });

console.log(`Build gerado em ${outdir}/`);
