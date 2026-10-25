import { PrismaClient, QuestionType } from "@prisma/client";

const prisma = new PrismaClient();

const mcqBank = [
  {
    prompt: "Apa kepanjangan dari Bareskrim?",
    options: [
      { key: "A", text: "Badan Reserse Kriminal" },
      { key: "B", text: "Badan Reserse Kriminologi" },
      { key: "C", text: "Badan Reserse Kepolisian" },
      { key: "D", text: "Badan Riset Kepolisian" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Tugas utama Bareskrim Polri adalah melakukan...",
    options: [
      { key: "A", text: "Penegakan hukum & penyidikan tindak pidana" },
      { key: "B", text: "Pengaturan lalu lintas saja" },
      { key: "C", text: "Administrasi data kependudukan" },
      { key: "D", text: "Pengelolaan keuangan negara" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Dalam roleplay, kapan Anda wajib menggunakan /me?",
    options: [
      { key: "A", text: "Saat melakukan aksi yang tidak bisa ditampilkan animasi (membuka pintu, mengambil barang, dll)" },
      { key: "B", text: "Setiap kali mengetik apapun di chat" },
      { key: "C", text: "Hanya saat berada di kantor polisi" },
      { key: "D", text: "Tidak pernah, /me tidak penting" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Apa yang dimaksud dengan Metagaming (MG)?",
    options: [
      { key: "A", text: "Menggunakan informasi di luar karakter (chat luar RP, sosmed, dll)" },
      { key: "B", text: "Berbicara dengan rekan kerja di radio" },
      { key: "C", text: "Meminta bantuan warga" },
      { key: "D", text: "Menjalankan patroli secara rutin" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Apa yang dimaksud dengan Powergaming (PG)?",
    options: [
      { key: "A", text: "Memaksa/menggambarkan aksi sukses tanpa memberi kesempatan lawan merespon" },
      { key: "B", text: "Menggunakan kendaraan dinas" },
      { key: "C", text: "Membaca buku peraturan" },
      { key: "D", text: "Melakukan body blocking" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Saat menerima laporan dari warga, langkah pertama yang benar adalah...",
    options: [
      { key: "A", text: "Mendengarkan & mencatat kronologi kejadian dengan teliti" },
      { key: "B", text: "Langsung menangkap warga tersebut" },
      { key: "C", text: "Mengabaikan karena sibuk patroli" },
      { key: "D", text: "Menyuruhnya pergi" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Nomor darurat Polisi Indonesia adalah...",
    options: [
      { key: "A", text: "110" },
      { key: "B", text: "112" },
      { key: "C", text: "118" },
      { key: "D", text: "119" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Fungsi Polri menurut UU No. 2 Tahun 2002 adalah...",
    options: [
      { key: "A", text: "Memelihara keamanan, penegak hukum, serta pelindung/pengayom/pelayan masyarakat" },
      { key: "B", text: "Hanya menindak pelanggar lalu lintas" },
      { key: "C", text: "Mengelola penjara" },
      { key: "D", text: "Mengawasi jalannya pemilu saja" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Sikap yang benar ketika berpapasan dengan atasan berpangkat lebih tinggi adalah...",
    options: [
      { key: "A", text: "Memberi hormat sesuai protokol kepolisian" },
      { key: "B", text: "Menunduk dan pura-pura tidak melihat" },
      { key: "C", text: "Berlari menjauh" },
      { key: "D", text: "Tidak perlu menghormat dalam RP" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Apa tugas dari SPKT (Sentra Pelayanan Kepolisian Terpadu)?",
    options: [
      { key: "A", text: "Menerima, mengelola, dan menindaklanjuti laporan/pengaduan masyarakat" },
      { key: "B", text: "Menjaga markas belaka" },
      { key: "C", text: "Menjual barang bukti" },
      { key: "D", text: "Mengatur jadwal piket anggota" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Saat melakukan penangkapan terhadap tersangka, anggota wajib...",
    options: [
      { key: "A", text: "Memberitahukan pasal yang disangkakan & melaporkan ke atasan" },
      { key: "B", text: "Langsung menghakimi tersangka" },
      { key: "C", text: "Menahan tanpa laporan" },
      { key: "D", text: "Memungut tebusan" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Perlengkapan yang wajib dibawa anggota saat patroli adalah...",
    options: [
      { key: "A", text: "Walkie-talkie/radio dinas, bodycam & alat tulis" },
      { key: "B", text: "Senyum saja" },
      { key: "C", text: "Barang pribadi bebas" },
      { key: "D", text: "Tidak perlu perlengkapan apapun" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Apa itu Fear RP (FRP)?",
    options: [
      { key: "A", text: "Merespon ancaman/musuh seolah hidupnya benar-benar terancam (takut wajar)" },
      { key: "B", text: "Berlari sangat cepat saat patroli" },
      { key: "C", text: "Menjadi takut saat melihat warga" },
      { key: "D", text: "Mengabaikan semua peraturan" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Tempat yang benar untuk menahan tersangka yang sudah ditangkap adalah...",
    options: [
      { key: "A", text: "Sel tahanan di Mapolres sesuai prosedur" },
      { key: "B", text: "Garasi pribadi" },
      { key: "C", text: "Menahannya di rumah tersangka" },
      { key: "D", text: "Membiarkan bebas berkeliaran" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Kapan seorang anggota boleh menggunakan sirene & lampu rotator?",
    options: [
      { key: "A", text: "Saat situasi darurat / merespon laporan dengan kecepatan tinggi sesuai SOP" },
      { key: "B", text: "Setiap kali mengemudi" },
      { key: "C", text: "Hanya saat ada parade" },
      { key: "D", text: "Tidak pernah boleh" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Lambang (logo) Kepolisian Negara Republik Indonesia adalah...",
    options: [
      { key: "A", text: "Bintang segi sembilan" },
      { key: "B", text: "Burung garuda berwarna hijau" },
      { key: "C", text: "Tengkorak" },
      { key: "D", text: "Elang merah" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Saat menerima barang bukti, anggota wajib...",
    options: [
      { key: "A", text: "Membuat berita acara dan mencatatnya sesuai prosedur" },
      { key: "B", text: "Menyimpannya untuk diri sendiri" },
      { key: "C", text: "Membagikannya ke anggota lain" },
      { key: "D", text: "Membuangnya" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Seorang anggota Bareskrim sedang diserang secara verbal di dalam RP. Respon terbaik adalah...",
    options: [
      { key: "A", text: "Tetap profesional, mengingatkan, dan melaporkan sesuai SOP" },
      { key: "B", text: "Membalas dengan kata-kata kasar" },
      { key: "C", text: "Langsung menembak" },
      { key: "D", text: "Keluar dari RP tanpa alasan" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Berapa lama batas waktu penahanan sementara sebelum diajukan ke penyidik sesuai aturan?",
    options: [
      { key: "A", text: "Sesuai KUHAP & SOP, tidak boleh sewenang-wenang" },
      { key: "B", text: "Selamanya" },
      { key: "C", text: "Tidak ada aturan" },
      { key: "D", text: "Tergantung mood anggota" },
    ],
    correctKey: "A",
    points: 4,
  },
  {
    prompt: "Perilaku yang dilarang keras bagi anggota saat dinas adalah...",
    options: [
      { key: "A", text: "Mengonsumsi alkohol/drugs dalam RP sebagai polisi" },
      { key: "B", text: "Berpatroli berdua" },
      { key: "C", text: "Menggunakan radio dinas" },
      { key: "D", text: "Melakukan laporan piket" },
    ],
    correctKey: "A",
    points: 4,
  },
];

const essayBank = [
  {
    prompt:
      "Jelaskan apa itu Bareskrim Polri dan sebutkan tugas-tugas utamanya menurut pemahaman Anda!",
    points: 8,
    keywords: ["reserse", "kriminal", "penyidikan", "kejahatan"],
  },
  {
    prompt:
      "Mengapa penting bagi seorang anggota kepolisian untuk selalu bersikap sopan dan menghormati atasan serta warga? Jelaskan!",
    points: 8,
    keywords: ["sopan", "hormat", "atasan", "profesional"],
  },
  {
    prompt:
      "Sebutkan dan jelaskan kewajiban-kewajiban yang harus dilakukan anggota saat menjalankan patroli!",
    points: 8,
    keywords: ["patroli", "warga", "lapor", "radio"],
  },
  {
    prompt:
      "Jelaskan perbedaan antara Fear RP (FRP) dan Powergaming (PG) beserta contoh sederhananya!",
    points: 8,
    keywords: ["fear", "powergaming", "ancaman", "rp"],
  },
  {
    prompt:
      "Bagaimana prosedur yang benar saat seorang warga melapor kepada Anda di SPKT? Tuliskan langkah-langkahnya!",
    points: 8,
    keywords: ["catat", "kronologi", "saksi", "bukti"],
  },
];

async function main() {
  console.log("Seeding bank soal Bareskrim...");

  let addedMcq = 0;
  for (const q of mcqBank) {
    const existing = await prisma.question.findFirst({
      where: { prompt: q.prompt, deletedAt: null },
    });
    if (!existing) {
      await prisma.question.create({
        data: {
          type: QuestionType.MCQ,
          prompt: q.prompt,
          options: q.options,
          correctKey: q.correctKey,
          points: q.points,
        },
      });
      addedMcq++;
    }
  }

  let addedEssay = 0;
  for (const q of essayBank) {
    const existing = await prisma.question.findFirst({
      where: { prompt: q.prompt, deletedAt: null },
    });
    if (!existing) {
      await prisma.question.create({
        data: {
          type: QuestionType.ESSAY,
          prompt: q.prompt,
          keywords: q.keywords,
          points: q.points,
        },
      });
      addedEssay++;
    }
  }

  const existingPeriod = await prisma.examPeriod.findFirst({
    where: { isActive: true, deletedAt: null },
  });

  if (!existingPeriod) {
    const seed = Math.floor(Math.random() * 2_000_000_000) + 1;
    await prisma.examPeriod.create({
      data: {
        name: "Rekrutmen Gelombang 1",
        description: "Periode rekrutmen Bareskrim Polri - dibuka",
        isActive: true,
        seed,
      },
    });
    console.log("Periode rekrutmen baru dibuat dengan seed:", seed);
  } else {
    console.log(`Periode aktif dipertahankan: ${existingPeriod.name}`);
  }

  const mcqCount = await prisma.question.count({ where: { type: "MCQ", deletedAt: null } });
  const essayCount = await prisma.question.count({ where: { type: "ESSAY", deletedAt: null } });

  console.log(`Selesai. Ditambahkan: ${addedMcq} MCQ, ${addedEssay} Essay.`);
  console.log(`Total bank soal aktif: ${mcqCount} MCQ, ${essayCount} Essay.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
