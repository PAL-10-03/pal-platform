import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";

export default function HomePage() {
  const session = readSession();
  redirect(session ? (session.isPalAdmin ? "/admin" : "/dashboard") : "/login");
}
