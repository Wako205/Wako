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

/** Draws words as wrapped lines from y downwards; the first line of each paragraph is indented. Returns the next y. */
function drawParagraphs(page, font, paras, y, { x = 50, width = 62, size = 10, lead = 14, indent = 18 } = {}) {
  for (const p of paras) {
    let line = '', first = true;
    const flush = () => { page.drawText(line.trim(), { x: x + (first ? indent : 0), y, size, font }); y -= lead; line = ''; first = false; };
    for (const w of p.split(' ')) { if ((line + ' ' + w).length > width) flush(); line += ' ' + w; }
    if (line.trim()) flush();
  }
  return y;
}

/**
 * A novel laid out like a printed book: title page, a table of contents with page numbers,
 * a running header and a page number on every text page, indented paragraphs, and chapters
 * of two pages each whose headings carry a title ("Chapter 2 The Lantern").
 */
async function makeRichBookPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman), bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const titles = ['The River', 'The Lantern', 'The Search', 'The Wheel'];
  const title = doc.addPage([420, 595]);
  title.drawText('The Quiet Mill', { x: 110, y: 400, size: 24, font: bold });
  title.drawText('A Novel', { x: 175, y: 360, size: 14, font });
  const toc = doc.addPage([420, 595]);
  toc.drawText('Contents', { x: 50, y: 540, size: 16, font: bold });
  titles.forEach((t, i) => toc.drawText('Chapter ' + (i + 1) + ' ' + t + '   ' + (3 + 2 * i), { x: 50, y: 500 - 20 * i, size: 11, font }));
  let pageNo = 3;
  titles.forEach((t, i) => {
    for (let half = 0; half < 2; half++) {
      const page = doc.addPage([420, 595]);
      page.drawText('THE QUIET MILL', { x: 160, y: 565, size: 8, font });
      let y = 530;
      if (half === 0) { page.drawText('Chapter ' + (i + 1) + ' ' + t, { x: 50, y, size: 15, font: bold }); y -= 34; }
      const paras = [0, 1, 2].map((k) => 'Paragraph ' + (k + 1) + ' of part ' + (half + 1) + ' in chapter ' + (i + 1) + '. ' + LOREM.trim());
      drawParagraphs(page, font, paras, y);
      page.drawText(String(pageNo++), { x: 205, y: 30, size: 9, font });
    }
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** A short scientific article: abstract, numbered citations, figure captions, a DOI and a reference list. */
async function makePaperPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const body = 'Monolayer MoS2 grown by chemical vapour deposition shows strong photoluminescence [1]. ' +
    'Raman spectra of the films agree with earlier reports [2, 3] and with Fig. 1. The phonon modes shift with strain [4]. ' +
    'Table 1 lists the fitted parameters, and Fig. 2 shows the temperature dependence [5]. Similar trends were found in WS2 [6], ' +
    'MoSe2 [7] and WSe2 [8], see also Fig. 3.';
  for (let p = 0; p < 3; p++) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    if (p === 0) {
      page.drawText('Strain-tuned phonons in monolayer MoS2', { x: 60, y, size: 16, font }); y -= 30;
      page.drawText('Abstract', { x: 60, y, size: 12, font }); y -= 20;
      page.drawText('doi:10.1000/example.2026.001', { x: 60, y: 40, size: 8, font });
    }
    y = drawParagraphs(page, font, [body, body], y, { x: 60, width: 90 });
    if (p === 2) {
      page.drawText('References', { x: 60, y: y - 10, size: 12, font });
      for (let k = 1; k <= 8; k++) page.drawText('[' + k + '] A. Author, Phys. Rev. B ' + (100 + k) + ', 1 (2020).', { x: 60, y: y - 10 - 16 * k, size: 9, font });
    }
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/**
 * A book whose chapters are headed only by a number ("1", "2", ...) in the running text, with no contents
 * page; every page also has a page number at the bottom. Chapter c starts on page 2c-1, after some text
 * of the previous chapter (except chapter 1, which starts at the top).
 */
async function makeNumberedBookPdf({ chapters = 4, roman = false } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const lines = [];
  for (let c = 1; c <= chapters; c++) {
    if (c > 1) for (let k = 0; k < 5; k++) lines.push({ t: 'The last lines of chapter ' + (c - 1) + ', line ' + k + '.' });
    lines.push({ t: roman ? ROMAN[c - 1] : String(c), head: true });
    for (let k = 0; k < 80; k++) lines.push({ t: 'Text of chapter ' + c + ', line ' + k + ', going on quietly.' });
  }
  let page = null, y = 0, n = 0;
  const newPage = () => { page = doc.addPage([420, 595]); y = 540; n++; page.drawText(String(n), { x: 205, y: 30, size: 9, font }); };
  for (const l of lines) {
    if (!page || y < 60) newPage();
    page.drawText(l.t, { x: l.head ? 200 : 40, y, size: l.head ? 14 : 10, font });
    y -= l.head ? 26 : 14;
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

module.exports = { makeMp3, makeBookPdf, makeNumberedBookPdf, makeRichBookPdf, makePaperPdf, NM };
