import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = g.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
export const disconnectDb = () => prisma.$disconnect();
