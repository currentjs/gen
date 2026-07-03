import * as fs from 'fs';
import * as path from 'path';
import { colors } from '../utils/colors';
import { resolveYamlPath } from '../utils/cliUtils';
import { withDatabaseConnection } from '../utils/dbConnection';
import {
  sortMigrationFiles,
  getCreateMigrationsTableSQL,
  extractSqlStatements,
} from '../utils/migrationUtils';

export async function handleMigratePush(yamlPath?: string): Promise<void> {
  try {
    const resolvedYamlPath = resolveYamlPath(yamlPath);
    const projectRoot = path.dirname(resolvedYamlPath);
    const migrationsDir = path.join(projectRoot, 'migrations');

    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n🚀 Running migrate push...'));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Project root: ${projectRoot}`));

    if (!fs.existsSync(migrationsDir)) {
      // eslint-disable-next-line no-console
      console.log(colors.yellow('⚠️  No migrations directory found. Run "currentjs migrate commit" first.'));
      return;
    }

    const allFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    if (allFiles.length === 0) {
      // eslint-disable-next-line no-console
      console.log(colors.yellow('⚠️  No migration SQL files found. Run "currentjs migrate commit" first.'));
      return;
    }

    const sortedFiles = sortMigrationFiles(allFiles);
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Found ${sortedFiles.length} migration file(s)`));

    await withDatabaseConnection(resolvedYamlPath, async (provider, dbType) => {
      // Ensure the _migrations tracking table exists
      const createTableSQL = getCreateMigrationsTableSQL(dbType);
      await provider.query(createTableSQL, {});
      // eslint-disable-next-line no-console
      console.log(colors.gray('   ✓ _migrations table ready'));

      // Fetch already-applied migration filenames
      const appliedResult = await provider.query(
        'SELECT filename FROM _migrations ORDER BY applied_at',
        {}
      );
      const appliedSet = new Set<string>(
        (appliedResult.data as any[]).map((row: any) => row.filename as string)
      );

      const pendingFiles = sortedFiles.filter(f => !appliedSet.has(f));

      if (pendingFiles.length === 0) {
        // eslint-disable-next-line no-console
        console.log(colors.green('\n✅ Database is already up to date. No pending migrations.'));
        return;
      }

      // eslint-disable-next-line no-console
      console.log(colors.cyan(`\n📋 Applying ${pendingFiles.length} pending migration(s)...`));

      let applied = 0;
      for (const filename of pendingFiles) {
        const filePath = path.join(migrationsDir, filename);
        const sql = fs.readFileSync(filePath, 'utf8');
        const statements = extractSqlStatements(sql);

        // eslint-disable-next-line no-console
        console.log(colors.cyan(`\n   ▶ ${filename} (${statements.length} statement(s))`));

        for (const statement of statements) {
          await provider.query(statement, {});
        }

        // Record the migration as applied
        const insertSql = dbType === 'postgres'
          ? 'INSERT INTO _migrations (filename) VALUES (:filename)'
          : 'INSERT INTO `_migrations` (filename) VALUES (:filename)';
        await provider.query(insertSql, { filename });

        // eslint-disable-next-line no-console
        console.log(colors.green(`   ✓ Applied ${filename}`));
        applied++;
      }

      const skipped = sortedFiles.length - pendingFiles.length;
      // eslint-disable-next-line no-console
      console.log(colors.green(`\n✅ Done! ${applied} migration(s) applied${skipped > 0 ? `, ${skipped} already up to date` : ''}.`));
    });

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(colors.red('❌ Error applying migrations:'), error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
