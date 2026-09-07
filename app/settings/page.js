import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import KeyForm from './KeyForm';

export const metadata = { title: 'Settings — Open Higgsfield AI' };

export default async function SettingsPage() {
  const { userId } = await auth();
  const clerkUser = await currentUser();
  const appUser = await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-2xl font-black uppercase tracking-wider">Settings</h1>

        <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-3">
          <h2 className="font-semibold">Who pays for your generations</h2>
          {appUser.keyMode === 'COMPANY' ? (
            <p className="text-white/60 text-sm">
              The company is covering your generations. There is nothing for you to set up.
            </p>
          ) : (
            <>
              <p className="text-white/60 text-sm">
                You are set up to use your own MuAPI account, so your generations are billed to you.
              </p>
              <KeyForm initialLast4={appUser.ownKeyLast4} />
            </>
          )}
        </section>

        <a href="/studio" className="text-[#d9ff00] text-sm hover:underline">← Back to the studio</a>
      </div>
    </main>
  );
}
