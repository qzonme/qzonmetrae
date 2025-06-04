import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as fs from "fs";
import { scheduleCleanupTask } from './cleanup';
import { testCloudinaryConnection } from './cloudinary';
import { projectRoot, getProjectPath } from './paths';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Log important environment information
console.log('Node environment:', process.env.NODE_ENV);
console.log('Current working directory:', process.cwd());
// Print environment info for debugging
console.log({
  'Project root': projectRoot,
  'Node env': process.env.NODE_ENV,
  'Current directory': process.cwd(),
  'File URL': import.meta.url
});

// Safely resolve a path with fallback to cwd
function safeResolvePath(pathSegment: string): string {
  try {
    const resolvedPath = getProjectPath(pathSegment);
    console.log(`Resolved ${pathSegment} to:`, resolvedPath);
    return resolvedPath;
  } catch (error) {
    const fallbackPath = path.join(process.cwd(), pathSegment);
    console.log(`Fallback ${pathSegment} to:`, fallbackPath);
    return fallbackPath;
  }
}

// Ensure required directories exist
const requiredDirs = ['temp_uploads', 'uploads', 'persistent_uploads', 'dist/public'].map(safeResolvePath);

requiredDirs.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } else {
      console.log(`Directory exists: ${dir}`);
    }
  } catch (error) {
    console.error(`Error creating directory ${dir}:`, error);
  }
});

// Special route for sitemap.xml - ensure it's served with XML content type
app.get('/sitemap.xml', (req: Request, res: Response) => {
  try {
    const sitemapPath = safeResolvePath(path.join('public', 'sitemap.xml'));
    console.log('Looking for sitemap at:', sitemapPath);
    
    if (!fs.existsSync(sitemapPath)) {
      console.log('Sitemap not found at:', sitemapPath);
      res.status(404).send('Sitemap not found');
      return;
    }
    
    fs.readFile(sitemapPath, (err: NodeJS.ErrnoException | null, data: Buffer) => {
      if (err) {
        console.error('Error reading sitemap:', err);
        res.status(500).send('Error reading sitemap file');
        return;
      }
      res.header('Content-Type', 'application/xml');
      res.send(data);
    });
  } catch (error) {
    console.error('Error handling sitemap request:', error);
    res.status(500).send('Internal server error');
  }
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function(bodyJson: any) {
    capturedJsonResponse = bodyJson;
    return originalResJson.call(res, bodyJson);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as any).status || (err as any).statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Create required directories before setting up routes
  const dirs = ['dist/public', 'uploads', 'temp_uploads', 'persistent_uploads'];
  for (const dir of dirs) {
    const dirPath = getProjectPath(dir);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      }
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error);
    }
  }

  try {
    if (app.get("env") === "development") {
      console.log('Starting in development mode with Vite middleware');
      await setupVite(app, server);
    } else {
      console.log('Starting in production mode with static file serving');
      const publicDir = safeResolvePath('dist/public');
      console.log('Static files directory:', publicDir);
      
      if (!fs.existsSync(publicDir)) {
        console.error('Public directory not found at:', publicDir);
      }
      
      serveStatic(app);
    }
  } catch (error) {
    console.error('Error setting up server mode:', error);
    throw error;
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
  server.listen({
    port,
    host: "0.0.0.0",
  }, async () => {
    log(`serving on port ${port}`);
    
    try {
      const cloudinaryTestResult = await testCloudinaryConnection();
      if (cloudinaryTestResult.success) {
        log('Cloudinary connection successful');
      } else {
        log('Warning: Could not connect to Cloudinary - image uploads may fail');
      }
    } catch (error) {
      log(`Error testing Cloudinary connection: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    scheduleCleanupTask(5 * 60 * 1000);
    log('Scheduled daily cleanup task for expired quizzes (7-day retention period)');
  });
})();
