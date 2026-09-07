import prisma from '@/lib/db';

const VIDEO_STUDIOS = new Set(['VIDEO', 'LIPSYNC']);

export function buildDigest(generations) {
  if (generations.length === 0) {
    return {
      subject: 'Higgsfield studio — no generations yesterday',
      text: 'Nobody generated anything yesterday.',
    };
  }

  const byPerson = new Map();
  for (const g of generations) {
    const row = byPerson.get(g.email) ?? { total: 0, videos: 0 };
    row.total += 1;
    if (VIDEO_STUDIOS.has(g.studio)) row.videos += 1;
    byPerson.set(g.email, row);
  }

  const ranked = [...byPerson.entries()].sort((a, b) => b[1].total - a[1].total);
  const onCompany = generations.filter((g) => g.paidBy === 'COMPANY').length;
  const videos = generations.filter((g) => VIDEO_STUDIOS.has(g.studio)).length;

  const lines = ranked.map(
    ([email, r]) => `  ${email}: ${r.total}${r.videos ? ` (${r.videos} video)` : ''}`,
  );

  return {
    subject: `Higgsfield studio — ${generations.length} generations yesterday`,
    text: [
      `${generations.length} generations yesterday, ${videos} video, ` +
      `${onCompany} on the company key.`,
      '',
      ...lines,
    ].join('\n'),
  };
}

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const generations = await prisma.generation.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });

  const { subject, text } = buildDigest(generations);

  const { Resend } = await import('resend');
  await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: `studio@${process.env.DIGEST_FROM_DOMAIN ?? 'example.com'}`,
    to: process.env.DIGEST_TO,
    subject,
    text,
  });

  return Response.json({ ok: true, counted: generations.length });
}
