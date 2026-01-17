"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.query = query;
exports.getClient = getClient;
exports.closePool = closePool;
const pg_1 = require("pg");
const config_1 = require("../config");
const logger_1 = require("./logger");
/**
 * PostgreSQL connection pool (Supabase-compatible)
 * This is the ONLY database connection in the system
 */
let pool = null;
function getPool() {
    if (!pool) {
        pool = new pg_1.Pool({
            connectionString: config_1.config.database.url,
            // Supabase requires SSL by default, even in development
            ssl: { rejectUnauthorized: false },
            max: 20, // Maximum pool size
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000, // Phase 5: Increase timeout for remote DB
        });
        pool.on('error', (err) => {
            logger_1.logger.error('Unexpected database pool error', { error: err.message });
        });
        logger_1.logger.info('Database pool created');
    }
    return pool;
}
/**
 * Execute a query against the database
 */
async function query(text, params) {
    const pool = getPool();
    const result = await pool.query(text, params);
    return result.rows;
}
/**
 * Get a client from the pool for transactions
 * Remember to release it when done!
 */
async function getClient() {
    const pool = getPool();
    return pool.connect();
}
/**
 * Close the database pool gracefully
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger_1.logger.info('Database pool closed');
    }
}
