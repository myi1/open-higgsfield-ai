export function isAdminEmail(email) {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin || !email) return false;
  return String(email).trim().toLowerCase() === admin.trim().toLowerCase();
}
