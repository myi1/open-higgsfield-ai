import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 keeps the connection URL out of schema.prisma. This file is for the
// CLI (generate, db push); the running app supplies its own driver adapter in
// lib/db.js.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
