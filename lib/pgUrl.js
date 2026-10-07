// pg already treats sslmode=prefer/require/verify-ca as verify-full, and logs
// a deprecation warning on every connection that says so. Spelling out
// verify-full keeps today's behaviour exactly and stops the warning. A string
// that opts into libpq semantics (uselibpqcompat) is left alone.
export function withExplicitSslMode(connectionString) {
  if (!connectionString) return connectionString;
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const mode = url.searchParams.get('sslmode');
  if (url.searchParams.has('uselibpqcompat')) return connectionString;
  if (!['prefer', 'require', 'verify-ca'].includes(mode)) return connectionString;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
