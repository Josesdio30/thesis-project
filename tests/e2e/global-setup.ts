import { seedDatabase } from './support/seed';

export default async function globalSetup(): Promise<void> {
  await seedDatabase();
}
