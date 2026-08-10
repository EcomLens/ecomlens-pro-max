// Promotes an existing account to admin. There's no signup flow for admins
// on purpose - sign up normally through /api/auth/signup first, then run:
//   npm run make-admin -- someone@example.com
require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error("Usage: npm run make-admin -- <email>");
        process.exit(1);
    }

    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
        console.error(`No account found for ${email} - sign up through /api/auth/signup first.`);
        process.exit(1);
    }

    await prisma.account.update({ where: { email }, data: { isAdmin: true } });
    console.log(`${email} is now an admin.`);
    process.exit(0);
}

main();
