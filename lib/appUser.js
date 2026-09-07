import { randomBytes } from 'node:crypto';
import prisma from './db.js';

export function newMcpToken() {
  return `ohf_${randomBytes(24).toString('base64url')}`;
}

export async function getOrCreateAppUser({ clerkUserId, email }) {
  const existing = await prisma.appUser.findUnique({ where: { clerkUserId } });

  if (existing) {
    if (existing.email !== email) {
      return prisma.appUser.update({ where: { clerkUserId }, data: { email } });
    }
    return existing;
  }

  return prisma.appUser.create({
    data: { clerkUserId, email, keyMode: 'COMPANY', mcpToken: newMcpToken() },
  });
}

export async function findAppUserByMcpToken(token) {
  if (!token) return null;
  return prisma.appUser.findUnique({ where: { mcpToken: token } });
}
