/* Migration runner. Invoked via `pnpm db:migrate`. */
import { runMigrations } from './index';

runMigrations('./drizzle');
console.log('Migrations applied.');
process.exit(0);
