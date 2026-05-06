import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema/*',
	out: './drizzle',
	dbCredentials: {
		url: process.env.LECTERN_DB_URL || 'file:./local.db'
	},
	verbose: true,
	strict: true
});
