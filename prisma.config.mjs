import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 keeps the connection URL out of schema.prisma. This file is for the
// CLI (generate, db push); the running app supplies its own driver adapter in
// lib/db.js. `.env.local` is what `vercel env pull` writes, so it wins.
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
