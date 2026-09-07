import { currentUser } from '@clerk/nextjs/server';
import prisma from '@/lib/db';
import { isAdminEmail } from '@/lib/admin';

const VIDEO_STUDIOS = new Set(['VIDEO', 'LIPSYNC']);

function monthRange(month) {
  const [year, mon] = (month ?? '').split('-').map(Number);
  const now = new Date();
  const start = year && mon
    ? new Date(Date.UTC(year, mon - 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function GET(request) {
  const me = await currentUser();
  if (!isAdminEmail(me?.primaryEmailAddress?.emailAddress)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const month = new URL(request.url).searchParams.get('month');
  const { start, end } = monthRange(month);

  const [people, generations] = await Promise.all([
    prisma.appUser.findMany({ orderBy: { email: 'asc' } }),
    prisma.generation.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const summary = people.map((person) => {
    const mine = generations.filter((g) => g.clerkUserId === person.clerkUserId);
    return {
      clerkUserId: person.clerkUserId,
      email: person.email,
      keyMode: person.keyMode,
      ownKeyLast4: person.ownKeyLast4,
      total: mine.length,
      images: mine.filter((g) => !VIDEO_STUDIOS.has(g.studio)).length,
      videos: mine.filter((g) => VIDEO_STUDIOS.has(g.studio)).length,
      paidByCompany: mine.filter((g) => g.paidBy === 'COMPANY').length,
      paidBySelf: mine.filter((g) => g.paidBy === 'SELF').length,
    };
  });

  return Response.json({
    month: start.toISOString().slice(0, 7),
    people: summary,
    recent: generations.slice(0, 200),
  });
}
