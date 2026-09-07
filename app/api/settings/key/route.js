import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/db';
import { encryptSecret, last4 } from '@/lib/crypto';

export async function PUT(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const { key } = await request.json().catch(() => ({}));
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return Response.json({ error: 'Enter your MuAPI key.' }, { status: 400 });

  await prisma.appUser.update({
    where: { clerkUserId: userId },
    data: { ownKeyCiphertext: encryptSecret(trimmed), ownKeyLast4: last4(trimmed) },
  });

  return Response.json({ ok: true, last4: last4(trimmed) });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

  await prisma.appUser.update({
    where: { clerkUserId: userId },
    data: { ownKeyCiphertext: null, ownKeyLast4: null },
  });

  return Response.json({ ok: true });
}
