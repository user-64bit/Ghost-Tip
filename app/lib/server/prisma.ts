import { PrismaClient } from "@prisma/client";
// Side-effect import: runs validateEnv() once at module load so missing /
// dangerous config fails fast at server boot rather than at first request.
import "./env";

/**
 * Prisma client singleton. Next.js hot-reload in dev will otherwise spawn a
 * new client on every edit, exhausting Postgres connections.
 */

declare global {
  // eslint-disable-next-line no-var
  var __ghosttipPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__ghosttipPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__ghosttipPrisma = prisma;
}
