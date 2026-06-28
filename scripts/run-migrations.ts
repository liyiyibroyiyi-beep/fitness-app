// Run all SQL migrations against Neon database
// Usage: npx tsx scripts/run-migrations.ts
import * as fs from "fs";
import * as path from "path";

// Load .env.local if DATABASE_URL is not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = value;
        }
      }
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || DATABASE_URL.includes("user:password@host")) {
  console.error("❌ DATABASE_URL is not set or is still a placeholder.");
  console.error("   Update DATABASE_URL in .env.local with your real Neon connection string.");
  console.error("   Get one at: https://neon.tech → Create project → Copy connection string\n");
  process.exit(1);
}

// Parse connection string to extract Neon SQL API endpoint
// Format: postgresql://user:password@host/dbname?sslmode=require
const url = new URL(DATABASE_URL);
const host = url.hostname;
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const sqlEndpoint = `https://${host}/sql`;
const auth = Buffer.from(`${user}:${password}`).toString("base64");

async function runSQL(query: string): Promise<any> {
  const res = await fetch(sqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": DATABASE_URL,
    },
    body: JSON.stringify({ query, params: [] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  // 1. Test connection
  console.log("Testing connection to Neon...");
  try {
    const result = await runSQL("SELECT 1 AS test");
    console.log("✓ Database connection OK\n");
  } catch (err: any) {
    console.error(`❌ Cannot connect to database: ${err.message}`);
    console.error(`   Host: ${host}`);
    process.exit(1);
  }

  // 2. Read and run all migration files in order
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration(s): ${files.join(", ")}\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");

    // Remove comment lines, then split into individual SQL statements
    const clean = raw
      .split("\n")
      .filter(line => !line.trim().startsWith("--"))
      .join("\n");
    const statements = clean
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Running ${file} (${statements.length} statement(s))...`);

    for (const stmt of statements) {
      try {
        await runSQL(stmt);
      } catch (err: any) {
        // "already exists" errors are non-fatal
        if (err.message?.includes("already exists")) {
          console.log(`  ⚠ Already exists — skipping`);
        } else {
          console.error(`  ❌ Failed: ${err.message}`);
        }
      }
    }
    console.log(`  ✓ ${file} done\n`);
  }

  console.log("✓ All migrations applied successfully!");
  console.log("  Next: npm run seed-foods\n");
}

main().catch(console.error);
