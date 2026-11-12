import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateEvidenceFile } from './evidence.mjs';

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const root = path.resolve('docs/agent-work');
let files = [];
try {
  files = (await walk(root)).filter(file => file.endsWith('.evidence.json'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

let invalid = 0;
for (const file of files) {
  try {
    const { evidencePath, errors } = await validateEvidenceFile(file);
    if (errors.length) {
      invalid++;
      errors.forEach(error => console.error(`${evidencePath}: ${error}`));
    }
  } catch (error) {
    invalid++;
    console.error(`${file}: ${error.message}`);
  }
}

if (invalid) {
  console.error(`${invalid} invalid evidence file(s).`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} delivery evidence file(s).`);
}
