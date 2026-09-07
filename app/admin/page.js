import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { isAdminEmail } from '@/lib/admin';
import PeopleTable from './PeopleTable';

export const metadata = { title: 'Admin — Open Higgsfield AI' };

export default async function AdminPage() {
  const me = await currentUser();
  if (!isAdminEmail(me?.primaryEmailAddress?.emailAddress)) redirect('/studio');

  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-black uppercase tracking-wider">Usage</h1>
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noreferrer"
            className="text-[#d9ff00] text-sm hover:underline"
          >
            Invite or remove people in Clerk ↗
          </a>
        </header>

        <p className="text-white/50 text-sm max-w-2xl">
          These are generation counts, not money. The bill itself lives on your MuAPI billing page —
          images cost cents, video and lip sync cost considerably more.
        </p>

        <PeopleTable />

        <a href="/studio" className="inline-block text-[#d9ff00] text-sm hover:underline">
          ← Back to the studio
        </a>
      </div>
    </main>
  );
}
