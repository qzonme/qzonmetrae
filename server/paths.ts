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
  return join(projectRoot, ...paths);
}
