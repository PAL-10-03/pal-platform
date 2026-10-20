// Clerk login v2
import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <main className="shell" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <div>
        <p className="mark" style={{ textAlign: "center" }}>PAL Business Solutions</p>
        <SignIn routing="path" path="/login" />
      </div>
    </main>
  );
}
