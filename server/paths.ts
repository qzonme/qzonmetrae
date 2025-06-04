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
  // Fallback for production build - always use /app in production
  projectRoot = process.env.NODE_ENV === 'production' ? '/app' : process.cwd();
  console.log(`Using ${projectRoot} as project root (${process.env.NODE_ENV} environment)`);
}

export { projectRoot };

export function getProjectPath(...paths: string[]) {
  // Handle case where no paths are provided
  if (!paths || paths.length === 0) {
    console.warn('No path segments provided to getProjectPath');
    return projectRoot;
  }

  // Filter out invalid paths and convert to string
  const validPaths = paths
    .filter(p => p != null)
    .map(p => String(p).trim())
    .filter(p => p.length > 0);

  if (validPaths.length === 0) {
    console.warn('No valid path segments after filtering:', paths);
    return projectRoot;
  }

  // Log if we filtered out any paths
  if (validPaths.length !== paths.length) {
    console.warn('Some path segments were invalid and filtered out:', {
      original: paths,
      filtered: validPaths
    });
  }

  try {
    // Use absolute paths in production
    if (process.env.NODE_ENV === 'production') {
      return join('/app', ...validPaths);
    }
    return join(projectRoot, ...validPaths);
  } catch (error) {
    console.error('Error joining paths:', error);
    // In case of error, return a safe fallback
    return join(process.env.NODE_ENV === 'production' ? '/app' : process.cwd(), ...validPaths);
  }
}
