import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

let projectRoot: string;

try {
  if (import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    projectRoot = resolve(__dirname, '..');
    console.log('Using import.meta.url for project root');
  } else {
    throw new Error('import.meta.url not available');
  }
} catch (error) {
  // Fallback for production build
  projectRoot = process.cwd();
  console.log('Using process.cwd() as project root:', projectRoot);
}

export { projectRoot };

export function getProjectPath(...paths: string[]) {
  // Filter out any undefined or null paths
  const validPaths = paths.filter(p => p !== undefined && p !== null);
  
  if (validPaths.length === 0) {
    console.error('No valid path segments provided:', paths);
    return projectRoot;
  }

  if (validPaths.length !== paths.length) {
    console.warn('Some invalid path segments were filtered:', paths);
  }

  try {
    return join(projectRoot, ...validPaths);
  } catch (error) {
    console.error('Error joining paths:', error);
    return projectRoot;
  }
}
