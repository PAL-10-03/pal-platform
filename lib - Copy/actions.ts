"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieMaxAge, cookieName, signSession, verifyPassword } from "./auth";
import { getDb } from "./db";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const db = getDb();
  const user = db.prepare(
    "SELECT id, email, name, password_hash, status, is_pal_admin FROM users WHERE email = ?"
  ).get(email) as {
    id: string; email: string; name: string; password_hash: string; status: string; is_pal_admin: number;
  } | undefined;

  if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) {
    redirect("/login?error=1");
  }

  const membership = db.prepare(
    `SELECT m.role, t.id AS tenant_id, t.display_name
     FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND m.status = 'active' AND t.status = 'active'
     ORDER BY t.display_name LIMIT 1`
  ).get(user.id) as { role: "employee" | "manager"; tenant_id: string; display_name: string } | undefined;

  db.prepare(
    "INSERT INTO audit_log (id, tenant_id, actor_user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'login', 'user', ?, ?)"
  ).run(crypto.randomUUID(), membership?.tenant_id ?? null, user.id, user.id, new Date().toISOString());

  cookies().set(cookieName, signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    isPalAdmin: user.is_pal_admin === 1,
    tenantId: membership?.tenant_id ?? null,
    tenantName: membership?.display_name ?? null,
    role: membership?.role ?? null
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: cookieMaxAge
  });
  redirect(user.is_pal_admin === 1 ? "/admin" : "/dashboard");
}

export async function logout() {
  cookies().delete(cookieName);
  redirect("/login");
}
