"use client";

import { useEffect, useState } from "react";

interface RecruitmentCountdownProps {
  targetDate?: string | null;
}

function calc(targetDate?: string | null) {
  if (!targetDate) {
    return { days: "00", hours: "00", minutes: "00", seconds: "00" };
  }
  const deadline = new Date(targetDate).getTime();
  if (Number.isNaN(deadline)) {
    return { days: "00", hours: "00", minutes: "00", seconds: "00" };
  }
  const distance = deadline - Date.now();
  if (distance <= 0) {
    return { days: "00", hours: "00", minutes: "00", seconds: "00" };
  }
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor((distance % 86400000) / 3600000);
  const minutes = Math.floor((distance % 3600000) / 60000);
  const seconds = Math.floor((distance % 60000) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return { days: p(days), hours: p(hours), minutes: p(minutes), seconds: p(seconds) };
}

export function RecruitmentCountdown({ targetDate }: RecruitmentCountdownProps) {
  const [time, setTime] = useState(() => calc(targetDate));

  useEffect(() => {
    setTime(calc(targetDate));
    const id = setInterval(() => setTime(calc(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return (
    <div className="countdown">
      <div>
        <strong>{time.days}</strong>
        <span>HARI</span>
      </div>
      <b>:</b>
      <div>
        <strong>{time.hours}</strong>
        <span>JAM</span>
      </div>
      <b>:</b>
      <div>
        <strong>{time.minutes}</strong>
        <span>MENIT</span>
      </div>
      <b>:</b>
      <div>
        <strong>{time.seconds}</strong>
        <span>DETIK</span>
      </div>
    </div>
  );
}
