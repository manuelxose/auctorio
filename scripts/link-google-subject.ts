/**
 * Links a Google identity subject to an Auctorio Studio account so Google
 * Sign-In works even when the Google account email differs from the Studio
 * account email.
 *
 * The `sub` is the Google account subject (visible in the Google ID token;
 * e.g. from a one-time debug log or by decoding the JWT `sub` claim).
 *
 * Usage: npx ts-node scripts/link-google-subject.ts <accountEmail> <googleSubject>
 */
import { getPrismaClient } from "../src/infrastructure/db/prisma";

async function main() {
  const [email, subject] = process.argv.slice(2);
  if (!email || !subject) {
    console.error("usage: link-google-subject.ts <accountEmail> <googleSubject>");
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const account = await prisma.studioAccount.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!account) {
    console.error(`account not found: ${email}`);
    process.exit(1);
  }

  const conflicting = await prisma.studioAccount.findFirst({
    where: { googleSubject: subject.trim(), id: { not: account.id } },
  });
  if (conflicting) {
    console.error(`google subject already linked to ${conflicting.email}`);
    process.exit(1);
  }

  await prisma.studioAccount.update({
    where: { id: account.id },
    data: { googleSubject: subject.trim() },
  });

  console.log(`linked google subject to ${account.email}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
