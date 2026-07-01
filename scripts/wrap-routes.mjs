import fs from 'node:fs';
import path from 'node:path';

const API_DIR = path.resolve('src/app/api');
const HEALTH_DIR = path.resolve('src/app/health');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (file === 'route.ts' || file === 'route.js') {
      results.push(filePath);
    }
  }
  return results;
}

const files = [...walk(API_DIR), ...walk(HEALTH_DIR)];
console.log(`Found ${files.length} route files.`);

let modifiedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Check if already processed
  if (content.includes('withLogging')) {
    console.log(`[Skipped] ${path.relative(process.cwd(), file)} is already wrapped.`);
    continue;
  }

  // Regex to find: export async function GET|POST|PUT|PATCH|DELETE
  const methodRegex = /\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  
  const foundMethods = [];
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    foundMethods.push(match[1]);
  }

  if (foundMethods.length === 0) {
    continue;
  }

  console.log(`[Processing] ${path.relative(process.cwd(), file)}: wrapping [${foundMethods.join(', ')}]`);

  // 1. Prepend import to the top of the file
  content = `import { withLogging } from '@/lib/logger';\n` + content;

  // 2. Rename exports: export async function GET -> async function _GET
  content = content.replace(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g, 'async function _$1');

  // 3. Append the wrapped exports at the end of the file
  content += '\n\n// ── Request Tracing & Structured Logging Wrap ──────────────────\n';
  for (const method of foundMethods) {
    content += `export const ${method} = withLogging(_${method});\n`;
  }

  fs.writeFileSync(file, content, 'utf8');
  modifiedCount++;
}

console.log(`Successfully processed and wrapped ${modifiedCount} route files.`);
