import { redirect } from "next/navigation";
import { logout } from "@/lib/actions";
import { readSession } from "@/lib/auth";
import { getDb, type TenantModule } from "@/lib/db";

export default function DashboardPage() {
  const session = readSession();
  if (!session) redirect("/login");
  if (session.isPalAdmin && !session.tenantId) redirect("/admin");
  if (!session.tenantId) redirect("/login");

  const modules = getDb().prepare(
    `SELECT m.key, m.name, m.description, tm.enabled
     FROM tenant_modules tm JOIN modules m ON m.id = tm.module_id
     WHERE tm.tenant_id = ? AND tm.enabled = 1
     ORDER BY m.name`
  ).all(session.tenantId) as TenantModule[];

  return (
    <main className="shell">
      <div className="top">
        <div>
          <p className="mark">PAL Business Solutions</p>
          <h1>{session.tenantName}</h1>
          <p className="sub">{session.name} · {session.role}</p>
        </div>
        <form action={logout}><button className="ghost" type="submit">Sign out</button></form>
      </div>
      <div className="grid modules">
        {modules.map((module) => (
          <a className="card module" key={module.key} href={`/modules/${module.key}`}>
            <strong>{module.name}</strong>
            <span>{module.description}</span>
          </a>
        ))}
      </div>
    </main>
  );
}
