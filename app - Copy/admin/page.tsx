import { redirect } from "next/navigation";
import { logout } from "@/lib/actions";
import { readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default function AdminPage() {
  const session = readSession();
  if (!session) redirect("/login");
  if (!session.isPalAdmin) redirect("/dashboard");

  const tenants = getDb().prepare(
    `SELECT t.display_name, t.slug, t.status,
            (SELECT COUNT(*) FROM tenant_memberships m WHERE m.tenant_id = t.id) AS users,
            (SELECT GROUP_CONCAT(md.name, ', ')
             FROM tenant_modules tm JOIN modules md ON md.id = tm.module_id
             WHERE tm.tenant_id = t.id AND tm.enabled = 1) AS modules
     FROM tenants t ORDER BY t.display_name`
  ).all() as { display_name: string; slug: string; status: string; users: number; modules: string }[];

  return (
    <main className="shell">
      <div className="top">
        <div>
          <p className="mark">PAL Admin</p>
          <h1>Customers</h1>
          <p className="sub">{session.name}. This screen is not shown to customer users.</p>
        </div>
        <form action={logout}><button className="ghost" type="submit">Sign out</button></form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Company</th><th>Users</th><th>Enabled modules</th></tr></thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.slug}>
                <td>{tenant.display_name}</td>
                <td>{tenant.users}</td>
                <td>{tenant.modules}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
