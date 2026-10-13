import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { hashPassword } from "./auth";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "pal.sqlite");

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_pal_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenant_memberships (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE (tenant_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenant_modules (
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      module_id TEXT NOT NULL REFERENCES modules(id),
      enabled INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, module_id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function seed(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (count.n > 0) return;
  const now = new Date().toISOString();
  const insertTenant = database.prepare(
    "INSERT INTO tenants (id, legal_name, display_name, slug, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)"
  );
  const insertUser = database.prepare(
    "INSERT INTO users (id, email, name, password_hash, status, is_pal_admin, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)"
  );
  const insertMembership = database.prepare(
    "INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)"
  );
  const insertModule = database.prepare(
    "INSERT INTO modules (id, key, name, description) VALUES (?, ?, ?, ?)"
  );
  const insertTenantModule = database.prepare(
    "INSERT INTO tenant_modules (tenant_id, module_id, enabled) VALUES (?, ?, ?)"
  );

  const baa = "tenant_born_again_air";
  const northwind = "tenant_northwind";
  insertTenant.run(baa, "Born Again Air", "Born Again Air", "born-again-air", now);
  insertTenant.run(northwind, "Northwind Test Company", "Northwind Test Company", "northwind", now);

  insertUser.run("user_admin", "admin@pal.local", "PAL Admin", hashPassword("pal-admin"), 1, now);
  insertUser.run("user_baa_manager", "manager@bornagainair.local", "BAA Manager", hashPassword("manager"), 0, now);
  insertUser.run("user_baa_employee", "employee@bornagainair.local", "BAA Employee", hashPassword("employee"), 0, now);
  insertUser.run("user_northwind", "manager@northwind.local", "Northwind Manager", hashPassword("manager"), 0, now);

  insertMembership.run("mem_baa_mgr", baa, "user_baa_manager", "manager", now);
  insertMembership.run("mem_baa_emp", baa, "user_baa_employee", "employee", now);
  insertMembership.run("mem_nw_mgr", northwind, "user_northwind", "manager", now);

  const modules = [
    ["mod_core", "core_processing", "Core Processing", "Identify and process used compressor cores."],
    ["mod_workloads", "workloads", "Workloads", "Open and finish workloads."],
    ["mod_reports", "reports", "Reports", "Workload reports."],
    ["mod_pricing", "pricing", "Pricing", "Active customer price list."],
    ["mod_approvals", "approvals", "Approvals", "Review finished workloads."],
    ["mod_invoices", "invoice_processing", "Invoice Processing", "Process customer invoices."]
  ];
  for (const [id, key, name, description] of modules) insertModule.run(id, key, name, description);

  const enable = (tenantId: string, moduleId: string) => insertTenantModule.run(tenantId, moduleId, 1);
  const disable = (tenantId: string, moduleId: string) => insertTenantModule.run(tenantId, moduleId, 0);
  for (const id of ["mod_core", "mod_workloads", "mod_reports", "mod_pricing", "mod_approvals"]) enable(baa, id);
  disable(baa, "mod_invoices");
  enable(northwind, "mod_invoices");
  enable(northwind, "mod_reports");
  for (const id of ["mod_core", "mod_workloads", "mod_pricing", "mod_approvals"]) disable(northwind, id);
}

export type TenantModule = {
  key: string;
  name: string;
  description: string;
  enabled: number;
};
