"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToastContext } from "@/components/ui/Toast";

export function AttendanceChecker() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [attended, setAttended] = useState(false);
  const [warning, setWarning] = useState(false);
  const [noPeriod, setNoPeriod] = useState<boolean | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState<boolean | null>(null);
  const [checkingAttendance, setCheckingAttendance] = useState(true);
  const [attendanceData, setAttendanceData] = useState<{
    status: string;
    createdAt: string;
  } | null>(null);
  const [robloxUsername, setRobloxUsername] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");
  const [motivation, setMotivation] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    message: string;
    user?: {
      username: string;
      displayName: string;
      robloxId: number;
      avatarUrl: string | null;
      policeGroupRank: string | null;
    };
    roleAssigned?: boolean;
    roleError?: string;
    motivationStatus?: string;
    motivationReason?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captchaA, setCaptchaA] = useState(0);
  const [captchaB, setCaptchaB] = useState(0);
  const [captchaInput, setCaptchaInput] = useState("");
  const toast = useToastContext();

  // Light captcha: soal penjumlahan sederhana
  function generateCaptcha() {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 1;
    setCaptchaA(a);
    setCaptchaB(b);
    setCaptchaInput("");
  }

  useEffect(() => {
    generateCaptcha();
    // Cek periode aktif + apakah sudah absen saat mount
    Promise.all([
      fetch("/api/period/active").then((r) => r.json()),
      fetch("/api/attendance/check").then((r) => r.json()),
    ])
      .then(([periodData, attendData]) => {
        setNoPeriod(!periodData.active);
        setAttendanceOpen(periodData.period?.isAttendanceOpen ?? false);
        if (attendData.attended) {
          // Sudah absen → tampilkan tombol mulai ujian
          setAttended(true);
          setAttendanceData(attendData.attendance);
          setCheckingAttendance(false);
          return;
        }
        setCheckingAttendance(false);
      })
      .catch(() => {
        setFetchError(true);
        setCheckingAttendance(false);
      });
  }, [router]);

  // Tampilkan peringatan bila diarahkan dari login karena belum absen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("peringatan") === "absen") {
      setWarning(true);
      window.history.replaceState(null, "", "/absen");
    }
  }, []);

  // Verifikasi Roblox + assign role
  async function handleVerify() {
    if (!robloxUsername.trim() || !discordUsername.trim() || !motivation.trim()) return;
    const answer = Number(captchaInput.trim());
    if (Number.isNaN(answer) || answer !== captchaA + captchaB) {
      setError("Jawaban captcha salah. Coba lagi.");
      generateCaptcha();
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(discordUsername.trim())) {
      setError("Username Discord tidak valid. Hanya huruf, angka, dan underscore (max 32 karakter).");
      return;
    }
    setLoading(true);
    setError(null);
    setVerifyResult(null);

    try {
      const res = await fetch("/api/attendance/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          robloxUsername: robloxUsername.trim(),
          discordUsername: discordUsername.trim(),
          motivation: motivation.trim(),
        }),
      });
      const data = await res.json();

      setVerifyResult(data);
      setVerified(data.ok);

      if (data.ok) {
        toast.success(data.message);
        setAttendanceData(data.attendance);
        setAttended(true);
      } else {
        setError(data.message);
        toast.error(data.message);
      }
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }

   // Fetch error
   if (fetchError) {
     return (
       <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
         <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
           <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
             <span className="text-3xl">⚠️</span>
           </div>
           <h1 className="font-display text-xl font-bold text-red-300">Gagal Memuat Data</h1>
           <p className="mt-3 text-sm text-zinc-400">
             Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda dan coba lagi.
           </p>
           <Button
             variant="ghost"
             className="mt-6"
             onClick={() => window.location.reload()}
           >
             Coba Lagi
           </Button>
         </Card>
       </div>
     );
   }

   // Tidak ada periode aktif
   if (noPeriod) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="font-display text-xl font-bold text-zinc-100">Belum Ada Periode Aktif</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Pendaftaran belum dibuka. Pantau server Discord untuk pengumuman periode rekrutmen.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Periode aktif tapi absen belum dibuka
  if (!attendanceOpen && !attended) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <span className="text-3xl">📋</span>
          </div>
          <h1 className="font-display text-xl font-bold text-zinc-100">Absen Belum Dibuka</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Instruktur belum membuka sesi absen. Silakan tunggu pengumuman dari Discord.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Loading state
  if (loading || checkingAttendance) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center space-y-4">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto h-4 w-64" />
          <Skeleton className="mx-auto h-10 w-full rounded-lg" />
        </Card>
      </div>
    );
  }

  // Sudah absen / hasil verifikasi
  if (attended && verifyResult?.ok) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="font-display text-xl font-bold text-emerald-400">Absensi Berhasil!</h1>

           {verifyResult.user && (
             <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
               <img
                 src={verifyResult.user.avatarUrl ?? "/shield.svg"}
                 alt={verifyResult.user.displayName}
                 width={48}
                 height={48}
                 className="h-12 w-12 rounded-full border border-gold/40 object-cover"
               />
               <div className="text-left">
                 <p className="font-semibold text-zinc-100">{verifyResult.user.displayName}</p>
                 <p className="text-xs text-zinc-400">@{verifyResult.user.username}</p>
                 {verifyResult.user.policeGroupRank && (
                   <p className="text-xs text-gold">{verifyResult.user.policeGroupRank}</p>
                 )}
               </div>
             </div>
           )}

          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm text-emerald-300">
              {verifyResult.roleAssigned ? (
                <>
                  Role <span className="font-bold">Tahap Akademik</span> sudah diberikan.
                  {verifyResult.user?.username ? (
                    <>
                      <br />
                      Nickname Discord berhasil diubah menjadi <span className="font-bold">[CASIS] {verifyResult.user.username}</span>.
                    </>
                  ) : null}
                </>
              ) : verifyResult.roleError ? (
                <>
                  Role <span className="font-bold">Tahap Akademik</span>{" "}
                  <span className="text-yellow-300">belum diberikan</span>.
                  <br />
                  <span className="text-xs text-zinc-400">{verifyResult.roleError}</span>
                  {verifyResult.motivationStatus ? (
                    <>
                      <br />
                      <span className="text-xs text-zinc-500">Status motivasi: {verifyResult.motivationStatus}.</span>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Role <span className="font-bold">Tahap Akademik</span> akan diberikan oleh admin.
                </>
              )}
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-zinc-500">Waktu Absen</p>
            <p className="text-sm font-semibold text-zinc-200">
              {attendanceData
                ? new Date(attendanceData.createdAt).toLocaleString("id-ID")
                : "-"}
            </p>
          </div>

          <Link href="/ujian" className="mt-6 inline-block w-full">
            <Button variant="gold" className="w-full py-3 text-base">
              Mulai Ujian
            </Button>
          </Link>

          <Link href="/" className="mt-3 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Sudah absen (dari check, bukan dari verify baru)
  if (attended && !verifyResult) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="font-display text-xl font-bold text-emerald-400">Sudah Absen</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Anda sudah melakukan absensi untuk periode ini.
          </p>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-zinc-500">Waktu Absen</p>
            <p className="text-sm font-semibold text-zinc-200">
              {attendanceData
                ? new Date(attendanceData.createdAt).toLocaleString("id-ID")
                : "-"}
            </p>
          </div>

          <Link href="/ujian" className="mt-6 inline-block w-full">
            <Button variant="gold" className="w-full py-3 text-base">
              Mulai Ujian
            </Button>
          </Link>

          <Link href="/" className="mt-3 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Form absensi
  return (
    <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
        {warning && (
          <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-left">
            <p className="text-sm font-semibold text-yellow-300">⚠️ Belum Absen</p>
            <p className="mt-1 text-xs leading-relaxed text-yellow-200/80">
              Anda harus melakukan absensi terlebih dahulu sebelum mengikuti ujian. Silakan isi
              form di bawah ini untuk mendapatkan role <span className="font-bold">Tahap Akademik</span>.
            </p>
          </div>
        )}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
          <span className="text-3xl">📋</span>
        </div>
        <h1 className="font-display text-xl font-bold gold-text">Absensi Try Out</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Masukkan username Roblox dan Discord Anda. Sistem akan memverifikasi
          apakah Anda memenuhi syarat untuk mendapatkan role{" "}
          <span className="font-bold text-gold">Tahap Akademik</span>.
        </p>

        <div className="mt-6 space-y-4 text-left">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Username Roblox
            </label>
            <input
              type="text"
              value={robloxUsername}
              onChange={(e) => {
                setRobloxUsername(e.target.value);
                setVerified(false);
                setAttended(false);
                setVerifyResult(null);
              }}
              placeholder="Contoh: BangReskrim_01"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              onKeyDown={(e) => {
                if (e.key === "Enter" && robloxUsername.trim() && discordUsername.trim() && motivation.trim() && captchaInput.trim() && Number(captchaInput.trim()) === captchaA + captchaB) {
                  handleVerify();
                }
              }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Username Discord
            </label>
            <input
              type="text"
              value={discordUsername}
              onChange={(e) => {
                setDiscordUsername(e.target.value);
                setVerified(false);
                setAttended(false);
                setVerifyResult(null);
              }}
              placeholder="Contoh: bang_reskrim"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              onKeyDown={(e) => {
                if (e.key === "Enter" && robloxUsername.trim() && discordUsername.trim() && motivation.trim() && captchaInput.trim() && Number(captchaInput.trim()) === captchaA + captchaB) {
                  handleVerify();
                }
              }}
            />
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">
              Isi username Discord yang terdaftar di server pusdik, tanpa tanda <span className="font-semibold text-zinc-400">@</span>.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Alasan / Motivasi Masuk Bareskrim
            </label>
            <textarea
              value={motivation}
              onChange={(e) => {
                setMotivation(e.target.value);
                setVerified(false);
                setAttended(false);
                setVerifyResult(null);
              }}
              placeholder="Jelaskan alasan Anda masuk Bareskrim dan kenapa Anda layak mengikuti tahap akademik."
              rows={4}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
            />
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">Jawaban terlalu singkat atau tidak jelas tidak akan otomatis mendapat role Tahap Akademik.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Verifikasi
            </label>
            <div className="flex items-center gap-2">
              <span className="flex h-10 shrink-0 items-center rounded-lg border border-white/15 bg-white/5 px-4 font-mono text-sm font-bold text-gold">
                {captchaA} + {captchaB} = ?
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={captchaInput}
                onChange={(e) => {
                  setCaptchaInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                  setError(null);
                }}
                placeholder="Jawaban"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && robloxUsername.trim() && discordUsername.trim() && motivation.trim() && captchaInput.trim() && Number(captchaInput.trim()) === captchaA + captchaB) {
                    handleVerify();
                  }
                }}
              />
              <button
                type="button"
                onClick={generateCaptcha}
                aria-label="Ganti soal captcha"
                className="shrink-0 rounded-lg border border-white/15 px-3 py-2.5 text-zinc-400 transition hover:text-zinc-200"
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <Button
          variant="gold"
          className="mt-6 w-full"
          onClick={handleVerify}
          disabled={
            !robloxUsername.trim() ||
            !discordUsername.trim() ||
            !motivation.trim() ||
            !captchaInput.trim() ||
            Number(captchaInput.trim()) !== captchaA + captchaB
          }
        >
          {loading ? "Memverifikasi..." : "Absen Sekarang"}
        </Button>

        <div className="mt-4 space-y-1.5 text-left text-xs text-zinc-500">
          <p>• Sistem otomatis memverifikasi data Roblox Anda.</p>
          <p>• Alasan/motivasi yang terlalu singkat tidak otomatis mendapat role Tahap Akademik.</p>
          <p>• Pangkat minimal: <span className="text-gold">Bhayangkara Kepala</span>.</p>
          <p>• Tidak boleh terdaftar di matra lain (TNI AD/AL).</p>
          <p>• Harus terdaftar di grup <span className="text-gold">[RI] Republic Indonesia</span>.</p>
        </div>

        <Link href="/" className="mt-4 inline-block">
          <Button variant="ghost">Kembali</Button>
        </Link>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs text-zinc-500">Sudah absen?</p>
          <Link href="/ujian" className="inline-block w-full">
            <Button variant="gold" className="w-full">
              Mulai Ujian
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
