import { createApp } from "./app";
import { migrateDatabase, closeDatabase } from "./db";
import { seedCatalogue } from "./seed";
import { startWearableWorker } from "./wearables";

if (process.env.NODE_ENV !== "production") {
  await migrateDatabase();
  await seedCatalogue();
}
const { app, server } = await createApp();
const stopWearableWorker = startWearableWorker();
if (process.env.NODE_ENV === "production") (await import("./static")).serveStatic(app);
else await (await import("./vite")).setupVite(app, server);
const port = Number(process.env.PORT) || 5000;
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Strive Fitness: http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close(() => {
      void stopWearableWorker()
        .then(closeDatabase)
        .then(() => process.exit(0));
    });
  });
