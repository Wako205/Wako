// Test media made on the fly: MP3 segments (lamejs) and PDFs (pdf-lib). Nothing binary is stored in the repository.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const NM = path.resolve(__dirname, '..', '..', 'node_modules');

// lamejs 1.2.1 cannot be require()d (its CommonJS build has a missing global), so the browser build is run in a sandbox.
let lame = null;
function lamejs() {
  if (!lame) { const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(NM, 'lamejs/lame.min.js'), 'utf8'), ctx); lame = ctx.lamejs; }
  return lame;
}

/**
 * MP3 of `bursts` tone bursts of `burst` seconds separated by `gap` seconds of silence,
 * 24 kHz mono 48 kbit/s like the server's speech. Each burst stands for one sentence.
 */
function makeMp3({ bursts = 3, burst = 1.2, gap = 0.4, freq = 220 } = {}) {
  const sr = 24000, enc = new (lamejs().Mp3Encoder)(1, sr, 48);
  const total = Math.round(sr * (bursts * burst + (bursts - 1) * gap + 0.1));
  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / sr, slot = t % (burst + gap);
    if (t < bursts * (burst + gap) - gap && slot < burst) pcm[i] = Math.round(9000 * Math.sin(2 * Math.PI * freq * t));
  }
  const out = [];
  for (let i = 0; i < pcm.length; i += 11520) { const b = enc.encodeBuffer(pcm.subarray(i, i + 11520)); if (b.length) out.push(Buffer.from(b)); }
  out.push(Buffer.from(enc.flush()));
  return Buffer.concat(out);
}

const LOREM = 'The river ran slowly past the old mill while the town slept. Nobody noticed the lantern in the upper window. ' +
  'By morning the miller had gone and the wheel stood still. His daughter searched the fields until noon. ';

/**
 * A plain book (no scientific features) with one heading "Chapter k" per page.
 * padBytes adds an attachment of random bytes, to make the file large enough for several upload chunks.
 */
async function makeBookPdf({ chapters = 5, padBytes = 0 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let c = 1; c <= chapters; c++) {
    const page = doc.addPage([420, 595]);
    page.drawText('Chapter ' + c, { x: 40, y: 540, size: 16, font });
    const words = (LOREM.repeat(3) + 'This is the end of chapter ' + c + '.').split(' ');
    let line = '', y = 500;
    for (const w of words) {
      if ((line + ' ' + w).length > 60) { page.drawText(line.trim(), { x: 40, y, size: 10, font }); y -= 14; line = ''; }
      line += ' ' + w;
    }
    if (line.trim()) page.drawText(line.trim(), { x: 40, y, size: 10, font });
    page.drawText(String(c), { x: 205, y: 30, size: 9, font });
  }
  if (padBytes) await doc.attach(crypto.randomBytes(padBytes), 'padding.bin', { mimeType: 'application/octet-stream' });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

module.exports = { makeMp3, makeBookPdf, NM };
