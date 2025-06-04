import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as fs from "fs";
import { scheduleCleanupTask } from './cleanup';
import { testCloudinaryConnection } from './cloudinary';
import { projectRoot, getProjectPath } from './paths';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

console.log('Project root:', projectRoot);

// Ensure required directories exist
const requiredDirs = ['temp_uploads', 'uploads', 'persistent_uploads', 'dist/public'].map(dir => 
  getProjectPath(dir)
);

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
  const sitemapPath = getProjectPath('public', 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    res.status(404).send('Sitemap not found');
    return;
  }
  fs.readFile(sitemapPath, (err: NodeJS.ErrnoException | null, data: Buffer) => {
    if (err) {
      res.status(500).send('Error reading sitemap file');
      return;
    }
    res.header('Content-Type', 'application/xml');
    res.send(data);
  });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function(bodyJson: any, ...args: any[]) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
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

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
    
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/assets')) {
        return;
      }
      
      const htmlFile = getProjectPath('dist/public/index.html');
      if (fs.existsSync(htmlFile)) {
        res.sendFile(htmlFile);
      } else {
        console.error('index.html not found at:', htmlFile);
        res.status(404).send('Not found');
      }
    });
  }

  // Validate required directories and files exist
  const criticalPaths = [
    getProjectPath('dist/public/index.html'),
    getProjectPath('dist/public/assets'),
    getProjectPath('uploads'),
    getProjectPath('persistent_uploads')
  ];

  criticalPaths.forEach(path => {
    if (!fs.existsSync(path)) {
      console.error(`Critical path not found: ${path}`);
    } else {
      console.log(`Critical path exists: ${path}`);
    }
  });

  // Log environment and port information
  const port = process.env.PORT || 3000;
  console.log(`Server starting in ${app.get('env')} mode on port ${port}`);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });

  // Test Cloudinary connection
  try {
    await testCloudinaryConnection();
    console.log('Cloudinary connection test successful');
  } catch (error) {
    console.error('Cloudinary connection test failed:', error);
  }

  // Schedule cleanup task
  scheduleCleanupTask();
})();
