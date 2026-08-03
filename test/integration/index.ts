import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(full));
    } else if (entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
  return results;
}

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000 });

  const testsRoot = path.resolve(__dirname);
  collectTestFiles(testsRoot)
    .sort()
    .forEach((file) => mocha.addFile(file));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
