import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;
neonConfig.useSecureWebSocket = false; // Allow non-secure WebSocket connections
neonConfig.pipelineTLS = false; // Disable TLS pipeline to avoid cert issues
neonConfig.pipelineConnect = false; // Disable connection pipelining

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure database pool with more robust settings
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  maxUses: 7500 // Close connections after 7500 queries
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('Successfully connected to database');
});

// Test the connection
pool.connect().then(() => {
  console.log('Initial database connection successful');
}).catch(err => {
  console.error('Error establishing initial database connection:', err);
});

export const db = drizzle({ client: pool, schema });
