import { execSync } from 'child_process';
import fs from 'fs';

const pages = [
  { name: 'Dashboard', path: '/' },
  { name: 'Transactions', path: '/transactions' },
  { name: 'Reports', path: '/reports' },
  { name: 'Settings', path: '/settings' }
];

const devices = ['mobile', 'desktop'];
let summary = '# Lighthouse Scores Summary\n\n';
summary += '| Page | Device | Performance | Accessibility | Best Practices | SEO | PWA |\n';
summary += '|------|--------|-------------|---------------|----------------|-----|-----|\n';

for (const page of pages) {
  for (const device of devices) {
    const url = `http://localhost:3000${page.path}`;
    console.log(`Running Lighthouse on ${url} (${device})...`);
    
    const flags = `--chrome-flags="--headless" --output=json --output-path=report.json --only-categories=performance,accessibility,best-practices,seo,pwa`;
    const formFactor = device === 'desktop' ? '--preset=desktop' : '--form-factor=mobile';
    
    try {
      execSync(`lighthouse ${url} ${flags} ${formFactor}`, { stdio: 'inherit' });
      
      const report = JSON.parse(fs.readFileSync('report.json', 'utf8'));
      const scores = {
        perf: (report.categories.performance?.score || 0) * 100,
        acc: (report.categories.accessibility?.score || 0) * 100,
        bp: (report.categories['best-practices']?.score || 0) * 100,
        seo: (report.categories.seo?.score || 0) * 100,
        pwa: (report.categories.pwa?.score || 0) * 100
      };
      
      summary += `| ${page.name} | ${device} | ${scores.perf.toFixed(0)} | ${scores.acc.toFixed(0)} | ${scores.bp.toFixed(0)} | ${scores.seo.toFixed(0)} | ${scores.pwa.toFixed(0)} |\n`;
    } catch (e) {
      console.error(`Failed to run Lighthouse on ${url} (${device})`);
      summary += `| ${page.name} | ${device} | Error | Error | Error | Error | Error |\n`;
    }
  }
}

fs.writeFileSync('lighthouse-summary.md', summary);
console.log('Lighthouse summary generated at lighthouse-summary.md');
