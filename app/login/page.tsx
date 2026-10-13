import { login } from "@/lib/actions";

export default function LoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  return (
    <main className="shell">
      <p className="mark">PAL Business Solutions</p>
      <h1>Sign in</h1>
      <p className="sub">Company workspace. Your account opens only the company you belong to.</p>
      <form action={login} className="card" style={{ marginTop: 18 }}>
        {searchParams?.error ? <div className="error">Email or password did not match.</div> : null}
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      <div className="accounts">
        <p className="meta">Prototype accounts. Change these before any real customer use.</p>
        <ul>
          <li>admin@pal.local / pal-admin</li>
          <li>manager@bornagainair.local / manager</li>
          <li>employee@bornagainair.local / employee</li>
          <li>manager@northwind.local / manager</li>
        </ul>
      </div>
    </main>
  );
}
