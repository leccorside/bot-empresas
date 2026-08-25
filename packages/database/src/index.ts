import { PrismaClient } from '@prisma/client';
const root = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = root.prisma ?? new PrismaClient({ log: ['error', 'warn'] });
if (process.env.NODE_ENV !== 'production') root.prisma = prisma;
export * from '@prisma/client';
