// Where each star's name goes on the sky, so no two names overlap and no name covers a star. Pure geometry: runs in
// the browser and in the tests.

/** A rough width for a line of the sky's serif at `fs` units: wide enough that real text never runs past it. */
export const textWidth = (text, fs) => [...text].reduce((w, ch) => w + (/[ilj.,'’ ]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.56), 0) * fs;

const overlap = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

/**
 * stars: [{ x, y, r, text }] in the sky's own units; W, H its size; fs the font size. Returns, for each star, where its
 * name goes: { x, y, anchor } (y is the baseline). Each name tries spots around its star, nearest first, and takes the
 * first that is clear of the names already placed, the stars and the edges; if none is clear, the least crowded.
 */
export function placeLabels(stars, { W, H, fs, pad = 8 }) {
  const placed = [];
  const discs = stars.map((s) => ({ x1: s.x - s.r * 1.6, x2: s.x + s.r * 1.6, y1: s.y - s.r * 1.6, y2: s.y + s.r * 1.6 }));
  return stars.map((s) => {
    const w = textWidth(s.text, fs);
    const below = s.y + s.r + fs * 1.05;
    const above = s.y - s.r - fs * 0.45;
    const side = s.y + fs * 0.32;
    const spots = [
      { x: s.x, y: below, anchor: 'middle' },
      { x: s.x, y: above, anchor: 'middle' },
      { x: s.x + s.r + 14, y: side, anchor: 'start' },
      { x: s.x - s.r - 14, y: side, anchor: 'end' },
      { x: s.x, y: below + fs * 1.15, anchor: 'middle' },
      { x: s.x, y: above - fs * 1.15, anchor: 'middle' },
      { x: s.x, y: below + fs * 2.3, anchor: 'middle' },
      { x: s.x, y: above - fs * 2.3, anchor: 'middle' },
    ];
    let best = null;
    for (const spot of spots) {
      // A centred name slides sideways to stay inside the sky.
      if (spot.anchor === 'middle') spot.x = Math.min(Math.max(spot.x, pad + w / 2), W - pad - w / 2);
      const x1 = spot.anchor === 'start' ? spot.x : spot.anchor === 'end' ? spot.x - w : spot.x - w / 2;
      const box = { x1: x1 - 6, x2: x1 + w + 6, y1: spot.y - fs * 0.82, y2: spot.y + fs * 0.28 };
      const outside = (box.x1 < pad || box.x2 > W - pad || box.y1 < pad || box.y2 > H - pad) ? w * fs : 0;
      const score = outside + placed.reduce((a, b) => a + overlap(box, b), 0) + discs.reduce((a, d) => a + overlap(box, d), 0);
      if (!best || score < best.score) best = { spot, box, score };
      if (score === 0) break;
    }
    placed.push(best.box);
    return best.spot;
  });
}
