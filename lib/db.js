import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 takes the connection from a driver adapter here, not from
// schema.prisma. The singleton keeps hot reload from opening a pool per edit.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__ohfPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__ohfPrisma = prisma;
}

export default prisma;
