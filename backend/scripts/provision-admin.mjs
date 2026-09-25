import { provisionAdmin } from '../src/server/admin-operations.mjs';

const [email, password, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();

if (!email || !password) {
  console.error('Usage: npm run provision:admin -- admin@example.com "StrongPassword" "Admin Name"');
  process.exit(1);
}

try {
  const result = await provisionAdmin({ email, password, name });
  console.log(JSON.stringify(result, null, 2));
  console.log('Admin claim set. Sign out/in on the client to refresh the auth token.');
} catch (error) {
  console.error(error);
  process.exit(1);
}
