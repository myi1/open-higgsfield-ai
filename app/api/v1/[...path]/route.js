import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import { forwardToMuapi } from '@/lib/muapiForward';

async function handle(request, context, method) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Your session has ended. Please sign in again.' }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const appUser = await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  const { path } = await context.params;
  let body;
  if (method !== 'GET') {
    body = await request.json().catch(() => undefined);
  }

  const result = await forwardToMuapi({
    appUser,
    path: path.join('/'),
    method,
    body,
    via: 'WEB',
    origin: request.headers.get('x-ohf-origin') ?? undefined,
  });

  return Response.json(result.body, { status: result.status });
}

export async function POST(request, context) {
  return handle(request, context, 'POST');
}

export async function GET(request, context) {
  return handle(request, context, 'GET');
}
