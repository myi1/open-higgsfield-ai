import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import StandaloneShell from '@/components/StandaloneShell';

export const metadata = {
  title: 'Studio — Open Higgsfield AI',
};

export default async function StudioPage() {
  // Provision the person record on first sight, so someone who signs in but has
  // not generated anything yet still appears in /admin and already has an MCP
  // token waiting on /connect.
  const { userId } = await auth();
  const clerkUser = await currentUser();
  await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  return <StandaloneShell />;
}
