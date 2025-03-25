import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not defined");
}

// Create a connection
const client = postgres(connectionString, { max: 1 });

// Create a drizzle instance using that connection
export const db = drizzle(client);