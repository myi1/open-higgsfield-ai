import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import CopyBox from './CopyBox';

export const metadata = { title: 'Connect to Claude — Open Higgsfield AI' };

export default async function ConnectPage() {
  const { userId } = await auth();
  const clerkUser = await currentUser();
  // Their token is created here, silently, the first time they visit.
  const appUser = await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const cliLine =
    `claude mcp add --transport http higgsfield ${origin}/mcp ` +
    `--header "Authorization: Bearer ${appUser.mcpToken}"`;

  const desktopJson = JSON.stringify(
    {
      mcpServers: {
        higgsfield: {
          url: `${origin}/mcp`,
          headers: { Authorization: `Bearer ${appUser.mcpToken}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-10">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider">Use this from Claude</h1>
          <p className="mt-2 text-white/60">
            Once connected, you can ask Claude to make images and videos for you, and they are
            billed and recorded exactly as they are on this website. Takes about a minute to set up.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">If you use Claude Code (the terminal)</h2>
          <ol className="text-sm text-white/60 space-y-1 list-decimal list-inside">
            <li>Copy the line below.</li>
            <li>Paste it into your terminal and press Enter.</li>
            <li>
              Ask Claude: <em>&ldquo;list the higgsfield models&rdquo;</em>. If it answers, you are done.
            </li>
          </ol>
          <CopyBox value={cliLine} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">If you use the Claude desktop app</h2>
          <ol className="text-sm text-white/60 space-y-1 list-decimal list-inside">
            <li>Open Settings, then Connectors, then Add custom connector.</li>
            <li>Paste the details below.</li>
            <li>
              Ask Claude: <em>&ldquo;list the higgsfield models&rdquo;</em>.
            </li>
          </ol>
          <CopyBox value={desktopJson} multiline />
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/50">
          <p>
            The line above contains your personal token. Do not share it — anyone who has it can
            generate as you. If you think it has got out, ask the administrator to reset it.
          </p>
        </section>

        <a href="/studio" className="text-[#d9ff00] text-sm hover:underline">← Back to the studio</a>
      </div>
    </main>
  );
}
