import { notFound, redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default function ModulePage({ params }: { params: { key: string } }) {
  const session = readSession();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/admin");

  const module = getDb().prepare(
    `SELECT m.name, m.description
     FROM tenant_modules tm JOIN modules m ON m.id = tm.module_id
     WHERE tm.tenant_id = ? AND m.key = ? AND tm.enabled = 1`
  ).get(session.tenantId, params.key) as { name: string; description: string } | undefined;

  if (!module) notFound();

  return (
    <main className="shell">
      <p className="mark">{session.tenantName}</p>
      <h1>{module.name}</h1>
      <p className="sub">{module.description}</p>
      <div className="card" style={{ marginTop: 18 }}>
        <p>This module is enabled for this company. Processing screens are not built yet.</p>
        <p className="meta">Next build: workload, photo, confirm or change part number, label, report.</p>
        <a className="button" href="/dashboard">Back to workspace</a>
      </div>
    </main>
  );
}
