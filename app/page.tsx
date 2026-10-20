import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default function HomePage() {
  const { userId } = auth();
  if (!userId) {
    redirect("/login");
  }
  // For now, send everyone to dashboard. Admin check can be added later.
  redirect("/dashboard");
}
