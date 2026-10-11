// Temporary diagnostic (not for merging): which WAV files does WebKit load from a blob?
const { test, expect, INDEX_URL } = require('../support/backend');
for (const sec of [20, 60, 120, 212]) for (let rep = 0; rep < 4; rep++) {
  test(`tone wav ${sec}s #${rep}`, async ({ page, backend }) => {
    await page.goto(INDEX_URL);
    const r = await page.evaluate(async (sec) => {
      const y = new Float32Array(sec * MUSIC_RATE); for (let i = 0; i < y.length; i++) y[i] = 0.1 * Math.sin(i / 20);
      const a = new Audio(URL.createObjectURL(wavBlob(y, MUSIC_RATE)));
      await new Promise((res) => { a.onloadedmetadata = res; a.onerror = res; setTimeout(res, 8000); });
      return { readyState: a.readyState, error: a.error && a.error.code, duration: a.duration };
    }, sec);
    console.log('DIAG tone', sec, rep, JSON.stringify(r));
    expect(r.error).toBeNull();
  });
}
for (let rep = 0; rep < 4; rep++) {
  test(`rendered music #${rep}`, async ({ page, backend }) => {
    await page.goto(INDEX_URL);
    const r = await page.evaluate(async () => {
      const y = await renderGeneratedSamples('rain', 1); setLevel(y, -30);
      const blob = wavBlob(y, MUSIC_RATE);
      const a = new Audio(URL.createObjectURL(blob));
      await new Promise((res) => { a.onloadedmetadata = res; a.onerror = res; setTimeout(res, 8000); });
      return { size: blob.size, readyState: a.readyState, error: a.error && a.error.code, duration: a.duration, mem: performance.memory ? performance.memory.usedJSHeapSize : null };
    });
    console.log('DIAG music', rep, JSON.stringify(r));
    expect(r.error).toBeNull();
  });
}
