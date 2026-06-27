import { execSync } from 'child_process';
import fs from 'fs';

const pages = [
  { name: 'Dashboard', path: '/' },
  { name: 'Accounts', path: '/accounts' },
  { name: 'Bills', path: '/bills' },
  { name: 'Cash Flow', path: '/cash-flow' },
  { name: 'Categories', path: '/categories' },
  { name: 'Connect', path: '/connect' },
  { name: 'Crypto', path: '/crypto' },
  { name: 'Goals', path: '/goals' },
  { name: 'Inbox', path: '/inbox' },
  { name: 'Insights', path: '/insights' },
  { name: 'Investments', path: '/investments' },
  { name: 'Merchants', path: '/merchants' },
  { name: 'Monthly Close', path: '/monthly-close' },
  { name: 'Offline', path: '/offline' },
  { name: 'Portfolio', path: '/portfolio' },
  { name: 'Projection', path: '/projection' },
  { name: 'Recurring', path: '/recurring' },
  { name: 'Reports', path: '/reports' },
  { name: 'Scenarios', path: '/scenarios' },
  { name: 'Settings', path: '/settings' },
  { name: 'Sync', path: '/sync' },
  { name: 'Transactions', path: '/transactions' }
];

const devices = ['mobile', 'desktop'];
let summary = '# Lighthouse Scores Summary\n\n';
summary += '| Page | Device | Performance | Accessibility | Best Practices | SEO |\n';
summary += '|------|--------|-------------|---------------|----------------|-----|\n';

const criticalPages = pages.slice(0, 5); 

for (const page of criticalPages) {
  for (const device of devices) {
    const url = `http://localhost:3000${page.path}`;
    console.log(`Running Lighthouse on ${url} (${device})...`);
    
    const flags = `--chrome-flags="--headless" --output=json --output-path=report.json --only-categories=performance,accessibility,best-practices,seo --no-enable-error-reporting`;
    const formFactor = device === 'desktop' ? '--preset=desktop' : '--form-factor=mobile';
    
    try {
      execSync(`CI=true lighthouse ${url} ${flags} ${formFactor}`, { stdio: 'inherit' });
      
      const report = JSON.parse(fs.readFileSync('report.json', 'utf8'));
      const scores = {
        perf: (report.categories.performance?.score || 0) * 100,
        acc: (report.categories.accessibility?.score || 0) * 100,
        bp: (report.categories['best-practices']?.score || 0) * 100,
        seo: (report.categories.seo?.score || 0) * 100
      };
      
      summary += `| ${page.name} | ${device} | ${scores.perf.toFixed(0)} | ${scores.acc.toFixed(0)} | ${scores.bp.toFixed(0)} | ${scores.seo.toFixed(0)} |\n`;
    } catch (e) {
      console.error(`Failed to run Lighthouse on ${url} (${device})`);
      summary += `| ${page.name} | ${device} | Error | Error | Error | Error |\n`;
    }
  }
}

fs.writeFileSync('lighthouse-summary.md', summary);
console.log('Lighthouse summary generated at lighthouse-summary.md');
