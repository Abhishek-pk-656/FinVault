const fs = require('fs');
const path = require('path');

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (/from\s+['"][^'"]+\.tsx?['"]/.test(line) || /import\s*\(['"][^'"]+\.tsx?['"]\)/.test(line)) {
          console.log(`${full}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

walk('apps');
walk('packages');
