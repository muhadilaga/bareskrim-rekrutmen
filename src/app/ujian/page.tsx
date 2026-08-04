import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { startExamSession } from "@/lib/exam-service";
import { CONFIG } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { ExamForm } from "@/components/exam/ExamForm";
import { TabLock } from "@/components/exam/TabLock";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export const metadata = { title: "Ujian - Rekrutmen Bareskrim Polri RP" };

export default async function ExamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.matraBlocked) redirect("/tolak");

  // Cek apakah sudah absen untuk periode aktif
  const activePeriod = await prisma.examPeriod.findFirst({
    where: { isActive: true },
  });

  if (activePeriod) {
    // Cek attendance hanya berdasarkan userId (identitas terverifikasi).
    // Tidak pakai discordUserId karena itu input bebas yang bisa dipalsukan
    // oleh orang yang meniru username Discord casis yang sudah absen.
    const attendance = await prisma.attendance.findFirst({
      where: {
        periodId: activePeriod.id,
        tahap: "AKADEMIK",
        userId: user.id,
      },
    });

    // Jika belum absen, redirect ke halaman absen
    if (!attendance) {
      redirect("/absen");
    }
  }

  const session = await startExamSession(user);

  if (!session.ok) {
    if (session.code === "ALREADY_SUBMITTED") {
      redirect("/hasil");
    }
    if (session.code === "RANK_BLOCKED") {
      return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
            <div className="text-4xl">⛔</div>
            <h1 className="mt-4 font-display text-xl font-bold text-red-300">Akses Ditolak</h1>
            <p className="mt-3 text-sm text-zinc-400">{session.message}</p>
            <Link href="/" className="mt-6 inline-block">
              <Button variant="ghost">Kembali ke Beranda</Button>
            </Link>
          </Card>
        </div>
      );
    }
    if (session.code === "PERIOD_CLOSED") {
      return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-4 font-display text-xl font-bold text-red-300">Periode Ditutup</h1>
            <p className="mt-3 text-sm text-zinc-400">{session.message}</p>
            <Link href="/" className="mt-6 inline-block">
              <Button variant="ghost">Kembali ke Beranda</Button>
            </Link>
          </Card>
        </div>
      );
    }
    if (session.code === "NO_ATTENDANCE") {
      redirect("/absen");
    }
    if (session.code === "NO_ROLE") {
      return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
            <div className="text-4xl">🎖️</div>
            <h1 className="mt-4 font-display text-xl font-bold text-gold">Role Belum Aktif</h1>
            <p className="mt-3 text-sm text-zinc-400">{session.message}</p>
            <div className="mt-6 flex flex-col gap-3">
              <Link href="/absen" className="inline-block">
                <Button variant="gold" className="w-full">
                  Ke Halaman Absen
                </Button>
              </Link>
              <Link href="/" className="inline-block">
                <Button variant="ghost" className="w-full">
                  Kembali ke Beranda
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      );
    }
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="text-4xl">🕐</div>
          <h1 className="mt-4 font-display text-xl font-bold gold-text">Ujian Belum Tersedia</h1>
          <p className="mt-3 text-sm text-zinc-400">{session.message}</p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <TabLock>
      <div className="bg-hero-radial min-h-[70vh] px-4 py-8">
        <div className="mb-8 text-center animate-slide-up">
          <h1 className="font-display text-2xl font-bold gold-text md:text-3xl">
            UJIAN REKRUTMEN BARESKRIM POLRI
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Halo, <span className="font-semibold text-gold">{user.displayName}</span> — selamat
            mengerjakan. Semua jawaban dinilai otomatis di server.
          </p>
        </div>
        <ExamForm
          attemptId={session.attemptId}
          questions={session.questions}
          periodName={session.period.name}
          durationMinutes={CONFIG.examDurationMinutes}
          remainingSeconds={session.remainingSeconds}
        />
      </div>
    </TabLock>
  );
}
