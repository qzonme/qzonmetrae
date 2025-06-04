import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";

// Force HTTP pooling instead of WebSocket
process.env.NEON_CONNECTION_TYPE = 'http';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure database pool with HTTP settings
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true, // Use SSL without custom configuration
  max: 10, // Reduce max connections for HTTP pooling
  connectionTimeoutMillis: 0, // Wait indefinitely for connection
  idleTimeoutMillis: 120000, // 2 minute idle timeout
  keepalive: true // Enable TCP keepalive
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
