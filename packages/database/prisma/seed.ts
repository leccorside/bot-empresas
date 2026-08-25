import bcrypt from 'bcryptjs';
import { prisma } from '../src';
async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@local.test';
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'prospector', 12);
  await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash } });
  await prisma.systemSetting.upsert({ where: { key: 'automation' }, update: {}, create: { key: 'automation', value: { paused: false, autopilot: process.env.AUTOPILOT === 'true' } } });
  console.log(`Administrador pronto: ${email}`);
}
main().finally(() => prisma.$disconnect());
