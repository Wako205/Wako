const { test, expect, INDEX_URL } = require('./support/backend');

// Synthetic page lines: one line per page (x 72, height 10), enough text to count as content.
const page = (s) => [{ s, x: 72, h: 10 }, { s: 'Body text of this page, long enough to be read aloud as part of the chapter.', x: 72, h: 10 }];

test('bookmarks of a book with parts and chapters give the chapters, not the parts', async ({ page: p }) => {
  await p.goto(INDEX_URL);
  const r = await p.evaluate(({ pages }) => {
    const outline = [
      { title: 'Contents', page: 2, items: [] },
      { title: 'AUTHOR\'S NOTE', page: 3, items: [] },
      { title: 'I', page: 4, items: [
        { title: '1 Downstream', page: 5, items: [{ title: '1.1 THE CITY', page: 6, items: [] }] },
        { title: '2 Shakespeare with Chinese Characteristics', page: 7, items: [] },
        { title: '3 Running', page: 8, items: [] } ] },
      { title: 'II', page: 9, items: [
        { title: '4 Summer', page: 10, items: [] },
        { title: '5 Chinese Life', page: 11, items: [] } ] },
    ];
    return chaptersFromOutline(outline, pages).map((c) => [c.title, c.startPage, c.endPage]);
  }, { pages: Array.from({ length: 12 }, (_, i) => page('Page ' + (i + 1))) });
  expect(r).toEqual([
    ['Front matter (before the first chapter)', 1, 1],
    ['AUTHOR\'S NOTE', 3, 3],
    ['1 Downstream', 5, 6],                      // its section 1.1 stays inside it
    ['2 Shakespeare with Chinese Characteristics', 7, 7],
    ['3 Running', 8, 8],                         // ends before the title page of part II
    ['4 Summer', 10, 10],
    ['5 Chinese Life', 11, 12],
  ]);
});

test('without bookmarks, "Part" headings give way to the chapters inside them', async ({ page: p }) => {
  await p.goto(INDEX_URL);
  const titles = await p.evaluate(() => {
    const body = (n) => Array.from({ length: 4 }, (_, i) => ({ s: 'Sentence ' + i + ' of page ' + n + ', long enough to count as text.', x: 72, h: 10 }));
    const pg = (head, n) => [{ s: head, x: 72, h: 14 }].concat(body(n));
    const pages = [pg('Part I', 1), pg('Chapter 1', 2), body(3), pg('Chapter 2', 4), pg('Part II', 5), pg('Chapter 3', 6), body(7)];
    return splitChapters(pages).map((c) => c.title);
  });
  expect(titles).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
});

test('a book whose chapters are only titles in the table of contents is split at those titles', async ({ page: p }) => {
  await p.goto(INDEX_URL);
  const r = await p.evaluate(() => {
    const L = (s, h) => ({ s, x: 72, h: h || 10 });
    const text = (n) => Array.from({ length: 3 }, (_, i) => L('Body sentence ' + i + ' of section ' + n + ', long enough to be read.'));
    const toc = [L('Contents', 14), L('Establishing Your Authority 3'), L('Developing a Theme 10'), L('Using “On-the-Body” Physical Sensation 20'),
                 L('Submerging the “I” 28'), L('Nuts and Bolts: Hiding a Gun 41'), L('Discon nected Dialogue – Part One 113'), L('2')];
    const pages = [
      [L('The Book Title', 18)], toc,
      [L('Establishing Your Authority', 14)].concat(text(1)),
      text(2),
      [L('Developing a Theme', 14)].concat(text(3), [L('Using “On-the-Body” Physical Sensation', 14)], text(4)),   // a chapter starting mid-page
      [L('Submerging the “I”', 14)].concat(text(5)),
      [L('Nuts and Bolts: Hiding a Gun', 14)].concat(text(6)),
      [L('Disconnected Dialogue – Part One', 14)].concat(text(7)),
    ];
    return chaptersFromToc(pages).map((c) => [c.title, c.startPage, c.text.split('\n\n')[0], c.text.length > 60]);
  });
  expect(r.map((x) => x[0])).toEqual(['Establishing Your Authority', 'Developing a Theme', 'Using “On-the-Body” Physical Sensation',
    'Submerging the “I”', 'Nuts and Bolts: Hiding a Gun', 'Discon nected Dialogue – Part One']);
  expect(r[2][1]).toBe(5);                                   // starts on the same page as the chapter before it
  r.forEach((x) => expect(x[3]).toBe(true));
});
