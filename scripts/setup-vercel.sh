#!/usr/bin/env bash
# One-shot Vercel setup for the hosted studio.
#
# Secrets are piped from your shell environment straight into Vercel. They are
# never printed, never written to a file, and never pass through the chat.
#
# Before running, make sure these are exported in your shell:
#   MUAPI_API_KEY                       (from muapi.ai)
#   CLERK_SECRET_KEY                    (Clerk dashboard -> API keys)
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   (Clerk dashboard -> API keys)
#
# Then:  bash scripts/setup-vercel.sh
set -euo pipefail

ADMIN_EMAIL="${ADMIN_EMAIL:-yahyaismail@gmail.com}"

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "MISSING: $name is not set in your shell." >&2
    echo "  export $name=\"...\"   then re-run this script." >&2
    exit 1
  fi
}

for v in MUAPI_API_KEY CLERK_SECRET_KEY NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; do
  require "$v"
done

echo "==> Linking the Vercel project"
vercel link --yes --project open-higgsfield-ai

# Values we generate ourselves — new random secrets, not yours to supply.
KEY_ENCRYPTION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
CRON_SECRET="$(openssl rand -hex 32)"

set_env() {
  local name="$1" value="$2"
  # Production is the live site; development is for `vercel env pull` locally.
  # Preview is deliberately skipped — preview builds would otherwise run against
  # the live database and spend the live MuAPI key.
  for target in production development; do
    vercel env add "$name" "$target" --value "$value" --force --yes >/dev/null
  done
  echo "    set $name"
}

echo "==> Setting environment variables"
set_env MUAPI_API_KEY                     "$MUAPI_API_KEY"
set_env CLERK_SECRET_KEY                  "$CLERK_SECRET_KEY"
set_env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
set_env KEY_ENCRYPTION_SECRET             "$KEY_ENCRYPTION_SECRET"
set_env CRON_SECRET                       "$CRON_SECRET"
set_env ADMIN_EMAIL                       "$ADMIN_EMAIL"

echo
echo "Done. Still to do, and they need the Vercel dashboard:"
echo "  1. Storage -> Create Neon Postgres, connect it   (sets DATABASE_URL)"
echo "  2. Storage -> Create Blob store, connect it      (sets BLOB_READ_WRITE_TOKEN)"
echo "  3. After the first deploy, set NEXT_PUBLIC_APP_URL to the live URL"
echo
echo "DATABASE_URL and BLOB_READ_WRITE_TOKEN are added by Vercel itself when you"
echo "connect those stores — do not set them by hand."
