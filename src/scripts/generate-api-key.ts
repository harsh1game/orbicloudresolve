/**
 * Generate API Key Script
 * 
 * WHY: Utility to create new API keys for projects
 * RESPONSIBILITY: Generate a key, hash it, insert into database
 * 
 * Usage: npx ts-node src/scripts/generate-api-key.ts <project_id> <key_name>
 */

import { query, closePool } from '../../admin/lib/db';
import { generateApiKey } from '../api/auth';
import { logger } from '../../admin/lib/logger';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx ts-node src/scripts/generate-api-key.ts <project_id> <key_name>');
    console.log('Example: npx ts-node src/scripts/generate-api-key.ts 00000000-0000-0000-0000-000000000000 "Production Key"');
    process.exit(1);
  }

  const [projectId, keyName] = args;

  try {
    // Verify project exists
    const projectRows = await query<{ id: string }>(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectRows.length === 0) {
      console.error(`Error: Project ${projectId} not found`);
      process.exit(1);
    }

    // Generate new API key
    const { key, hash } = generateApiKey();

    // Insert into database
    await query(
      `INSERT INTO api_keys (project_id, key_hash, name)
       VALUES ($1, $2, $3)`,
      [projectId, hash, keyName]
    );

    console.log('\n=== API Key Generated ===');
    console.log(`Project ID: ${projectId}`);
    console.log(`Key Name: ${keyName}`);
    console.log(`\nAPI Key (save this, it won't be shown again):`);
    console.log(`\n  ${key}\n`);
    console.log('Use in requests as:');
    console.log(`  Authorization: Bearer ${key}\n`);

    logger.info('API key created', { projectId, keyName });
  } catch (error: any) {
    console.error('Failed to generate API key:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
