import { getKey, setKey } from '../src/lib/server/services/secrets/keychain';

const TOKEN = process.argv[2];
const HOST = process.argv[3];

if (!TOKEN || !HOST) {
	console.error('Usage: tsx scripts/store-gitlab-token.ts <token> <host>');
	console.error('Example: tsx scripts/store-gitlab-token.ts glpat-... gitlab.example.com');
	process.exit(1);
}

await setKey(`gitlab:${HOST}`, TOKEN);
const round = await getKey(`gitlab:${HOST}`);
console.log(`Stored gitlab:${HOST}. Read back length: ${round?.length ?? 0}`);
