import assert from "node:assert";
import { findLatestPusdikBlacklistMatch } from "@/lib/blacklist-pusdik";

const hitStructured = findLatestPusdikBlacklistMatch(
  [
    {
      id: "1",
      timestamp: "2026-08-09T10:00:00.000Z",
      content: "Nama: AlanWalker\nAlasan: Mengundurkan diri\nDurasi: 30 hari",
      embeds: [],
    },
  ],
  "AlanWalker",
  "guild1",
  "channel1"
);
assert(hitStructured);
assert.equal(hitStructured?.username, "AlanWalker");
assert.equal(hitStructured?.reason, "Mengundurkan diri");
assert.equal(hitStructured?.duration, "30 hari");

const hitLoose = findLatestPusdikBlacklistMatch(
  [
    {
      id: "2",
      timestamp: "2026-08-09T11:00:00.000Z",
      content: "AlanWalker pernah terkena blacklist pendidikan karena keluar saat diklat.",
      embeds: [],
    },
  ],
  "AlanWalker",
  "guild1",
  "channel1"
);
assert(hitLoose);
assert.equal(hitLoose?.username, "AlanWalker");
assert.equal(hitLoose?.reason, null);
assert.equal(hitLoose?.duration, null);
assert(hitLoose?.rawSnippet?.includes("AlanWalker"));

const hitEmbed = findLatestPusdikBlacklistMatch(
  [
    {
      id: "3",
      timestamp: "2026-08-09T12:00:00.000Z",
      content: "",
      embeds: [
        {
          title: "Blacklist Pendidikan",
          description: "Casis terdata di blacklist.",
          fields: [
            { name: "Username", value: "AlanWalker" },
            { name: "Alasan", value: "Pelanggaran aturan" },
            { name: "Durasi", value: "Permanen" },
          ],
        },
      ],
    },
  ],
  "AlanWalker",
  "guild1",
  "channel1"
);
assert(hitEmbed);
assert.equal(hitEmbed?.reason, "Pelanggaran aturan");
assert.equal(hitEmbed?.duration, "Permanen");

const hitForwarded = findLatestPusdikBlacklistMatch(
  [
    {
      id: "4",
      timestamp: "2026-08-09T13:00:00.000Z",
      content: "",
      embeds: [],
      message_snapshots: [
        {
          message: {
            content: "Nama : kanslay2206\nDurasi Blacklist : Selamanya\nAlasan : Desersi dari divisi",
            embeds: [],
          },
        },
      ],
    },
  ],
  "kanslay2206",
  "guild1",
  "channel1"
);
assert(hitForwarded);
assert.equal(hitForwarded?.username, "kanslay2206");
assert.equal(hitForwarded?.reason, "Desersi dari divisi");
assert.equal(hitForwarded?.duration, "Selamanya");

const hitAtName = findLatestPusdikBlacklistMatch(
  [
    {
      id: "5",
      timestamp: "2026-08-09T13:30:00.000Z",
      content: "Nama : @wongirengjmboten21\nDurasi : SAMPAI GANTI USERNAME\nAlasan : Tertera",
      embeds: [],
    },
  ],
  "wongirengjmboten21",
  "guild1",
  "channel1"
);
assert(hitAtName);
assert.equal(hitAtName?.username, "@wongirengjmboten21");
assert.equal(hitAtName?.duration, "SAMPAI GANTI USERNAME");

const miss = findLatestPusdikBlacklistMatch(
  [
    {
      id: "5",
      timestamp: "2026-08-09T14:00:00.000Z",
      content: "Nama: Budi",
      embeds: [],
    },
  ],
  "AlanWalker",
  "guild1",
  "channel1"
);
assert.equal(miss, null);

console.log("blacklist-pusdik self-test: ok");
