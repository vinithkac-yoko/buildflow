// Generates the app icons (PNG) without any image dependency: a green "B" on navy.
// Run once: node scripts/make-icons.mjs   (outputs are committed under public/icons)
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const NAVY = [11, 31, 58], GREEN = [34, 197, 94];

function inB(x, y) {
  // Coordinates are 0..1. A bold "B": stem, three bars, two half-rings.
  const rect = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (rect(0.31, 0.24, 0.41, 0.76)) return true;
  if (rect(0.31, 0.24, 0.5, 0.33)) return true;
  if (rect(0.31, 0.455, 0.54, 0.545)) return true;
  if (rect(0.49, 0.44, 0.545, 0.53)) return true;
  if (rect(0.31, 0.67, 0.53, 0.76)) return true;
  const ring = (cx, cy, ro, ri) => { const d = Math.hypot(x - cx, y - cy); return x >= cx && d <= ro && d >= ri; };
  return ring(0.5, 0.375, 0.135, 0.045) || ring(0.53, 0.6, 0.16, 0.07);
}

function png(size, { rounded, pad }) {
  const S = 3; // supersampling
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (px + (sx + 0.5) / S) / size, v = (py + (sy + 0.5) / S) / size;
        // Inside the rounded-square icon shape? (maskable icons are full-bleed)
        let inside = true;
        if (rounded) {
          const rad = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - rad), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - rad), 0);
          inside = Math.hypot(dx, dy) <= rad;
        }
        // Scale the mark into the safe zone.
        const mu = 0.5 + (u - 0.5) / pad, mv = 0.5 + (v - 0.5) / pad;
        const c = !inside ? [11, 31, 58] : inB(mu, mv) ? GREEN : NAVY;
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = Math.round(r / (S * S)); raw[o + 1] = Math.round(g / (S * S)); raw[o + 2] = Math.round(b / (S * S));
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("public/icons/icon-192.png", png(192, { rounded: true, pad: 1 }));
writeFileSync("public/icons/icon-512.png", png(512, { rounded: true, pad: 1 }));
writeFileSync("public/icons/icon-maskable-512.png", png(512, { rounded: false, pad: 1.35 }));
writeFileSync("public/icons/apple-touch-icon.png", png(180, { rounded: false, pad: 1.2 }));
console.log("icons written");
