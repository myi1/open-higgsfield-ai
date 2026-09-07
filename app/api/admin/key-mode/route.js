import { currentUser } from '@clerk/nextjs/server';
import prisma from '@/lib/db';
import { isAdminEmail } from '@/lib/admin';

const MODES = new Set(['COMPANY', 'SELF']);

export async function POST(request) {
  const me = await currentUser();
  if (!isAdminEmail(me?.primaryEmailAddress?.emailAddress)) {
    // 404, not 403 — no hint that this route exists.
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { clerkUserId, keyMode } = await request.json().catch(() => ({}));
  if (!clerkUserId || !MODES.has(keyMode)) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const target = await prisma.appUser.findUnique({ where: { clerkUserId } });
  await prisma.appUser.update({ where: { clerkUserId }, data: { keyMode } });

  const warning =
    keyMode === 'SELF' && !target?.ownKeyCiphertext
      ? 'This person has no key saved, so they cannot generate until they add one in Settings.'
      : undefined;

  return Response.json({ ok: true, keyMode, warning });
}
