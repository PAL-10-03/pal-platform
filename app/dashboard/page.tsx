import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = auth();
  if (!userId) redirect("/login");

  const user = await currentUser();
  const name = user?.firstName || user?.emailAddresses[0]?.emailAddress || "there";

  return (
    <main className="shell">
      <div className="top">
        <p className="mark">PAL Business Solutions</p>
        <h1>Welcome, {name}</h1>
        <p className="sub">You are signed in.</p>
      </div>
      <div className="grid modules">
        <a className="card" href="/modules">
          <strong>Core Processing</strong>
          <span>Open the modules</span>
        </a>
      </div>
    </main>
  );
}