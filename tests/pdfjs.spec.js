// pdf.js 4 (ES modules) must read PDFs exactly as pdf.js 3.11.174 did: the chapter split and
// the document type depend on the text lines it returns (running headers, table of contents,
// paragraph indentation, chapter headings).
const { test, expect, INDEX_URL } = require('./support/backend');
const { makeBookPdf, makeRichBookPdf, makePaperPdf } = require('./support/media');

const V3 = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';

/** Lines, chapters and document type of a PDF, read in the page with the given pdf.js. */
function readIn(page, b64, useV3) {
  return page.evaluate(async ([data, v3]) => {
    const lib = v3 ? window.pdfjsLib : await getPdfjs();
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const lines = await pdfLines(lib, bytes);
    const chapters = splitChapters(lines);
    return {
      lines: lines.map((L) => L.map((l) => l.s)),
      chapters: chapters.map((c) => ({ title: c.title, text: c.text, startPage: c.startPage, endPage: c.endPage, front: !!c.front })),
      kind: classifyDoc(lines, chapters),
    };
  }, [b64, useV3]);
}

async function bothVersions(browser, backend, pdf) {
  const b64 = pdf.toString('base64');
  const page4 = await browser.newPage();
  await backend.attach(page4);
  await page4.goto(INDEX_URL);
  const v4 = await readIn(page4, b64, false);
  const page3 = await browser.newPage();
  await backend.attach(page3);
  await page3.goto(INDEX_URL);
  await page3.addScriptTag({ url: V3 + 'pdf.min.js' });
  await page3.evaluate((w) => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = w; }, V3 + 'pdf.worker.min.js');
  const v3 = await readIn(page3, b64, true);
  await page3.close(); await page4.close();
  return { v3, v4 };
}

test('a printed-style novel: same chapters as with pdf.js 3', async ({ browser, backend }) => {
  const { v3, v4 } = await bothVersions(browser, backend, await makeRichBookPdf());
  expect(v4).toEqual(v3);
  // And the result is the intended one: the title page as front matter, the table of contents
  // and running headers dropped, four chapters.
  expect(v4.kind.kind).toBe('book');
  expect(v4.chapters.map((c) => c.title)).toEqual(['Front matter (before the first chapter)', 'Chapter 1 The River', 'Chapter 2 The Lantern', 'Chapter 3 The Search', 'Chapter 4 The Wheel']);
  expect(v4.chapters[0].text).toBe('The Quiet Mill\n\nA Novel');
  expect(v4.chapters.slice(1).map((c) => [c.startPage, c.endPage])).toEqual([[3, 4], [5, 6], [7, 8], [9, 10]]);
  const c2 = v4.chapters[2].text;
  expect(c2).not.toContain('THE QUIET MILL');
  expect(c2.split('\n\n')).toHaveLength(6);                     // indented first lines start paragraphs
  expect(c2).toMatch(/^Paragraph 1 of part 1 in chapter 2\./);
});

test('a plain book: same chapters as with pdf.js 3', async ({ browser, backend }) => {
  const { v3, v4 } = await bothVersions(browser, backend, await makeBookPdf({ chapters: 5 }));
  expect(v4).toEqual(v3);
  expect(v4.chapters).toHaveLength(5);
});

test('a scientific paper: same text and type as with pdf.js 3', async ({ browser, backend }) => {
  const { v3, v4 } = await bothVersions(browser, backend, await makePaperPdf());
  expect(v4).toEqual(v3);
  expect(v4.kind.kind).toBe('paper');
  expect(v4.kind.why).toContain('reference list');
});

test('pdf.js 4 runs in a module worker started from a verified blob URL', async ({ page, backend }) => {
  await page.addInitScript(() => {
    window.__workers = [];
    const W = window.Worker;
    window.Worker = function (url, opts) { window.__workers.push({ url: String(url), type: opts && opts.type }); return new W(url, opts); };
  });
  await page.goto(INDEX_URL);
  const info = await page.evaluate(async () => {
    const lib = await getPdfjs();
    return { version: lib.version, hasGlobal: typeof window.pdfjsLib };
  });
  expect(info.version).toBe('4.10.38');
  const b64 = (await makeBookPdf({ chapters: 2 })).toString('base64');
  await readIn(page, b64, false);
  const workers = await page.evaluate(() => window.__workers);
  expect(workers.length).toBeGreaterThan(0);
  expect(workers[0].type).toBe('module');
  expect(workers[0].url).toMatch(/^blob:/);
});
