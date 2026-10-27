export interface SiteContent {
  // Landing / Hero
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;

  // Recruitment Card
  recruitmentCardTopline: string;
  recruitmentYear: string;
  recruitmentTitle: string;
  recruitmentWave: string;
  recruitmentStatus: string;
  recruitmentDates: string;

  // Intro
  introKicker: string;
  introTitle: string;
  introBody: string;
  introCta: string;

  // 3 Pilar
  pilar1Title: string;
  pilar1Desc: string;
  pilar2Title: string;
  pilar2Desc: string;
  pilar3Title: string;
  pilar3Desc: string;

  // Closing CTA
  closingKicker: string;
  closingTitle: string;
  closingBody: string;

  // Footer
  footerMotto: string;
  footerNotice: string;

  // Rekrutmen Page
  rekrutmenAngkatan?: string;
  rekrutmenKicker: string;
  rekrutmenTitle: string;
  rekrutmenSubtitle: string;
  rekrutmenSyarat1Title: string;
  rekrutmenSyarat1: string;
  rekrutmenSyarat2Title: string;
  rekrutmenSyarat2: string;
  rekrutmenSyarat3Title: string;
  rekrutmenSyarat3: string;
  rekrutmenSyarat4Title: string;
  rekrutmenSyarat4: string;
  rekrutmenJadwalEyebrow: string;
  rekrutmenJadwalTitle: string;
  rekrutmenJadwalSubtitle: string;
  rekrutmenTahap1Tag: string;
  rekrutmenTahap1Title: string;
  rekrutmenTahap1State: string;
  rekrutmenTahap1Date: string;
  rekrutmenTahap2Tag: string;
  rekrutmenTahap2Title: string;
  rekrutmenTahap2State: string;
  rekrutmenTahap2Date: string;
  rekrutmenTahap3Tag: string;
  rekrutmenTahap3Title: string;
  rekrutmenTahap3State: string;
  rekrutmenTahap3Date: string;
  rekrutmenTahap4Tag: string;
  rekrutmenTahap4Title: string;
  rekrutmenTahap4State: string;
  rekrutmenTahap4Date: string;
  rekrutmenCtaTitle: string;
  rekrutmenCtaSubtitle: string;

  // Tentang Page
  tentangKicker: string;
  tentangTitle: string;
  tentangSubtitle: string;
  tentangFilosofiTitle: string;
  tentangFilosofi1: string;
  tentangFilosofi2: string;
  tentangNilai1Title: string;
  tentangNilai1Desc: string;
  tentangNilai2Title: string;
  tentangNilai2Desc: string;
  tentangNilai3Title: string;
  tentangNilai3Desc: string;

  // Arsip Page
  arsipKicker: string;
  arsipTitle: string;
  arsipSubtitle: string;
  arsipNoteTitle: string;
  arsipNoteBody: string;

  // Legacy compatibility
  quoteText?: string;
  quoteAuthor?: string;
  quoteRole?: string;
  tentangVisi?: string;
  tentangMisi?: string;
}

export const defaultSiteContent: SiteContent = {
  // Landing / Hero
  heroKicker: "PENERIMAAN CALON SISWA / 2026",
  heroTitle: "Selamat Datang Calon Reserse Muda.",
  heroDescription:
    "Pusdik Reserse Bareskrim Polri RBX merupakan ruang pendidikan bagi calon personel yang siap mengembangkan kemampuan, disiplin, dan profesionalisme.",
  heroCtaPrimary: "Mulai Pendaftaran",
  heroCtaSecondary: "Pelajari Lebih Lanjut",

  // Recruitment Card
  recruitmentCardTopline: "PENERIMAAN SAAT INI",
  recruitmentYear: "2026",
  recruitmentTitle: "Angkatan 41",
  recruitmentWave: "Gelombang 02",
  recruitmentStatus: "Pendaftaran dibuka",
  recruitmentDates: "01 September 2026 — 30 September 2026",

  // Intro
  introKicker: "PUSDIK RESERSE",
  introTitle: "Lebih dari sekadar seragam.",
  introBody:
    "Di balik setiap proses, ada individu yang memilih untuk belajar, bertumbuh, dan menjadi bagian dari sesuatu yang lebih besar.",
  introCta: "Lihat Cerita Kami",

  // Quote
  quoteText:
    "Kami tidak hanya mendidik mereka untuk menjadi penyidik yang kompeten, tetapi juga membentuk integritas yang tidak goyah saat menghadapi tekanan.",
  quoteAuthor: "KOMBES POL. DRS. S. HERMAWAN, S.I.K.",
  quoteRole: "KEPALA PUSDIK RESERSE",

  // 3 Pilar
  pilar1Title: "Penyelidikan Kriminal",
  pilar1Desc:
    "Metodologi investigasi ilmiah, olah TKP, dan rekonstruksi perkara secara terukur dan presisi.",
  pilar2Title: "Forensik Digital",
  pilar2Desc:
    "Analisis bukti digital, pelacakan siber, dan penanganan kejahatan berbasis teknologi tinggi.",
  pilar3Title: "Hukum & Etika",
  pilar3Desc:
    "Penegakan hukum berkeadilan dengan standar moral kepolisian tertinggi tanpa kompromi.",

  // Closing CTA
  closingKicker: "SIAP MELANGKAH LEBIH JAUH?",
  closingTitle: "Pendaftaran dibuka untuk calon siswa yang memenuhi kriteria.",
  closingBody:
    "Pastikan Anda telah memenuhi seluruh persyaratan sebelum mengajukan formulir pendaftaran.",

  // Footer
  footerMotto: "Disiplin. Integritas. Profesional.",
  footerNotice: "Hak Cipta © 2026 Bareskrim Polri RBX. Seluruh hak cipta dilindungi undang-undang.",

  // Rekrutmen Page
  rekrutmenAngkatan: "42",
  rekrutmenKicker: "PENERIMAAN / PUSDIK RESERSE",
  rekrutmenTitle: "Penerimaan Calon Siswa Baru",
  rekrutmenSubtitle:
    "Pusdik Reserse Bareskrim Polri membuka kesempatan bagi anggota terbaik untuk bergabung dalam pendidikan pembentukan penyidik.",
  rekrutmenSyarat1Title: "Identitas Peserta",
  rekrutmenSyarat1: "Warga Negara Roblox Indonesia dengan reputasi baik dan akun terverifikasi.",
  rekrutmenSyarat2Title: "Kepangkatan",
  rekrutmenSyarat2: "Pangkat minimal Bhayangkara Satu (Rank 224) di grup Kepolisian resmi.",
  rekrutmenSyarat3Title: "Integritas & Afiliasi",
  rekrutmenSyarat3: "Tidak terafiliasi dengan organisasi kriminal / blacklist aktif di Bareskrim Polri.",
  rekrutmenSyarat4Title: "Kesiapan & Komitmen Seleksi",
  rekrutmenSyarat4: "Bersedia mengikuti seluruh tahapan seleksi administrasi, ujian akademik daring, dan seleksi wawancara.",
  rekrutmenJadwalEyebrow: "IMPORTANT DATES",
  rekrutmenJadwalTitle: "Catat tahapannya.",
  rekrutmenJadwalSubtitle: "Seluruh tahapan mengikuti jadwal yang telah ditetapkan oleh Pusdik Reserse.",
  rekrutmenTahap1Tag: "TAHAP 01",
  rekrutmenTahap1Title: "Pembukaan Pendaftaran",
  rekrutmenTahap1State: "DIBUKA",
  rekrutmenTahap1Date: "",
  rekrutmenTahap2Tag: "TAHAP 02",
  rekrutmenTahap2Title: "Verifikasi Administrasi",
  rekrutmenTahap2State: "TERJADWAL",
  rekrutmenTahap2Date: "",
  rekrutmenTahap3Tag: "TAHAP 03",
  rekrutmenTahap3Title: "Pelaksanaan Seleksi",
  rekrutmenTahap3State: "TERJADWAL",
  rekrutmenTahap3Date: "",
  rekrutmenTahap4Tag: "TAHAP 04",
  rekrutmenTahap4Title: "Pengumuman Hasil Seleksi",
  rekrutmenTahap4State: "TERJADWAL",
  rekrutmenTahap4Date: "",
  rekrutmenCtaTitle: "Siap mengambil langkah pertama?",
  rekrutmenCtaSubtitle: "Pastikan kamu telah membaca informasi, persyaratan, dan tahapan penerimaan sebelum melanjutkan.",

  // Tentang Page
  tentangKicker: "PROFIL / INSTITUSI",
  tentangTitle: "Pusat Pendidikan Reserse",
  tentangSubtitle:
    "Pusat Pendidikan Reserse Kriminal (Pusdik Reserse) Bareskrim Polri RBX adalah kawah candradimuka bagi pembentukan penyidik handal.",
  tentangFilosofiTitle: "Tidak hanya mempersiapkan.",
  tentangFilosofi1:
    "Setiap proses pendidikan dirancang sebagai perjalanan. Peserta tidak hanya mengikuti tahapan, tetapi belajar memahami tanggung jawab, membangun kebiasaan, dan berkembang bersama lingkungan pendidikan.",
  tentangFilosofi2:
    "Karena kesiapan tidak terbentuk dalam satu hari. Ia dibangun melalui proses yang konsisten, terukur, dan dijalani dengan kesungguhan.",
  tentangNilai1Title: "Disiplin",
  tentangNilai1Desc:
    "Membentuk kebiasaan untuk hadir, mengikuti proses, dan menyelesaikan tanggung jawab dengan konsisten.",
  tentangNilai2Title: "Integritas",
  tentangNilai2Desc:
    "Menempatkan kejujuran, tanggung jawab, dan sikap yang dapat dipercaya sebagai bagian dari perjalanan pendidikan.",
  tentangNilai3Title: "Profesionalisme",
  tentangNilai3Desc:
    "Mendorong peserta untuk terus belajar, berkembang, dan memahami standar dalam menjalankan perannya.",

  // Legacy defaults
  tentangVisi:
    "Menjadi lembaga pendidikan kepolisian unggulan dalam mencetak personel reserse yang profesional, bermoral, presisi, dan modern.",
  tentangMisi:
    "Menyelenggarakan pendidikan spesialisasi investigasi berstandar tinggi, menegakkan etika moral kepolisian, dan mengintegrasikan teknologi forensik terkini.",

  // Arsip Page
  arsipKicker: "DOKUMENTASI / RIWAYAT",
  arsipTitle: "Arsip Angkatan & Kelulusan",
  arsipSubtitle:
    "Catatan sejarah penerimaan, diklat, dan alumni yang telah menyelesaikan pendidikan di Pusdik Reserse Bareskrim Polri.",
  arsipNoteTitle: "Penerimaan Angkatan Baru masih berlangsung.",
  arsipNoteBody:
    "Pendaftaran sedang berlangsung. Setelah rangkaian seleksi ini selesai, data akan diarsipkan di sini.",
};
