const PDFDocument = require("pdfkit");
const fs = require("fs");

const doc = new PDFDocument({
  margin: 50,
  bufferPages: true,
  info: {
    Title: "Tutorial Sistem Rekrutmen Bareskrim Polri",
    Author: "Bareskrim Polri RP",
  },
});

const out = fs.createWriteStream("TUTORIAL-LENGKAP.pdf");
doc.pipe(out);

const text = fs.readFileSync("TUTORIAL-LENGKAP.txt", "utf8");
const lines = text.split("\n");
let y = 50;
const pageH = doc.page.height - 100;

lines.forEach((line) => {
  if (y > pageH) {
    doc.addPage();
    y = 50;
  }

  if (line.startsWith("=")) {
    doc.font("Courier-Bold").fontSize(11).fillColor("#D4AF37").text(line, 50, y, { width: 515 });
    y += 18;
  } else if (/^[2345]\./.test(line)) {
    doc.font("Courier-Bold").fontSize(10).fillColor("#FFD700").text(line, 50, y, { width: 515 });
    y += 16;
  } else if (/^[-*]/.test(line)) {
    doc.font("Courier").fontSize(9).fillColor("#555555").text(line, 60, y, { width: 505 });
    y += 13;
  } else {
    doc.font("Courier").fontSize(9).fillColor("#222222").text(line, 50, y, { width: 515 });
    y += 13;
  }
});

doc.end();
out.on("finish", () => {
  console.log("PDF berhasil dibuat: TUTORIAL-LENGKAP.pdf");
});
