import { redirect } from "next/navigation";

export const metadata = { title: "Masuk Portal Casis - Bareskrim Polri RBX" };

export default function LoginPage() {
  redirect("/dashboard");
}
