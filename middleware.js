import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// The MCP endpoint authenticates with its own bearer token, and the cron route
// with a shared secret — neither has a browser session, so Clerk must not
// intercept them.
const isPublic = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/mcp(.*)',
  '/api/cron(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
