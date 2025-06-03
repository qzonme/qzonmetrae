import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const projectRoot = resolve(__dirname, '..');

export function getProjectPath(...paths: string[]) {
  return join(projectRoot, ...paths);
}
