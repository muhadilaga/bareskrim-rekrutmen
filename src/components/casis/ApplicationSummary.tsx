import React from "react";
import type { ApplicationStatus } from "@prisma/client";

export type ApplicationSummaryItem = {
  registrationId: string;
  status: ApplicationStatus;
  createdAt: Date;
  recruitmentPeriod: { name: string };
};

const labels: Record<ApplicationStatus, string> = {
  MENUNGGU_VERIFIKASI: "Menunggu verifikasi",
  DITERIMA: "Diterima",
  DITOLAK: "Ditolak",
};

export function ApplicationSummary({ applications }: { applications: ApplicationSummaryItem[] }) {
  return (
    <div className="casis-applications">
      {applications.map(application => (
        <article className="casis-application-summary" key={application.registrationId}>
          <h3>{application.recruitmentPeriod.name}</h3>
          <dl className="casis-identity">
            <div><dt>REGISTRATION ID</dt><dd>{application.registrationId}</dd></div>
            <div><dt>TANGGAL PENDAFTARAN</dt><dd>{new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(application.createdAt)}</dd></div>
            <div><dt>STATUS PENDAFTARAN</dt><dd>{labels[application.status] ?? "Status belum tersedia"}</dd></div>
          </dl>
        </article>
      ))}
      <p className="casis-claim-note">Status ini adalah status administratif pendaftaran. Akses ujian dan absensi mengikuti persyaratan tersendiri.</p>
    </div>
  );
}
