import { PrismaClient } from "@prisma/client";

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
