import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const input = process.argv[2] || 'docs/prototypes/contextula-outreach-invitation.html';
const output = process.argv[3] || 'docs/prototypes/assets/contextula-outreach-current-screenshot.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: 1 });
await page.goto(`file://${path.resolve(root, input).replaceAll('\\', '/')}`);
await page.screenshot({ path: path.resolve(root, output), fullPage: true });
await browser.close();
console.log(output);
