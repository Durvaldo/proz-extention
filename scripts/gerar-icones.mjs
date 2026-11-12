/** Gera os PNGs do ícone a partir do SVG. Rode só quando o desenho mudar: node scripts/gerar-icones.mjs */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Boletim com marca de conferência, nas cores do SSG.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <rect width="128" height="128" rx="28" fill="#3b2f86"/>
  <rect x="32" y="22" width="56" height="76" rx="8" fill="#fff"/>
  <path d="M44 42h32M44 56h32M44 70h18" stroke="#b9afee" stroke-width="7" stroke-linecap="round"/>
  <circle cx="88" cy="92" r="20" fill="#b9afee"/>
  <path d="m79 92 6 6 12-12" stroke="#3b2f86" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

mkdirSync('src/assets/icons', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}</style>${SVG}`);
  await page.screenshot({ path: `src/assets/icons/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
