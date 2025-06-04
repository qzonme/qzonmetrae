import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

let projectRoot: string;

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  projectRoot = resolve(__dirname, '..');
} catch (error) {
  // Fallback for production build where import.meta.url might not be available
  projectRoot = process.cwd();
  console.log('Using process.cwd() as project root:', projectRoot);
}

export { projectRoot };

export function getProjectPath(...paths: string[]) {
  if (paths.some(p => p === undefined || p === null)) {
    console.error('Invalid path segment:', paths);
    throw new Error('Invalid path segment: all path segments must be defined');
  }
  return join(projectRoot, ...paths);
}
