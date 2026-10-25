import { redirect } from "next/navigation";

export const metadata = {
  title: "Absensi & Status Seleksi — Bareskrim Polri RBX",
};

export default function AbsenPage() {
  redirect("/dashboard");
}
