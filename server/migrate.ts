import { migrateDatabase, closeDatabase } from "./db";
import { seedCatalogue } from "./seed";
try {
  await migrateDatabase();
  await seedCatalogue();
  console.log("Migrations and exercise catalogue applied.");
} finally {
  await closeDatabase();
}
