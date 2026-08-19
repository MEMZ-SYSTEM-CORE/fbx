// Minimal PNG icon generator (no dependencies)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 6; // RGBA

  const r = size / 2;
  const rad = r * 0.9;
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter none
    for (let x = 0; x < size; x++) {
      const dx = x - r + 0.5, dy = y - r + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rad) {
        // Orange center
        rawData.push(0xff, 0x6b, 0x35, 255);
      } else if (dist <= rad + 1) {
        // Anti-alias edge
        const a = Math.max(0, Math.min(255, Math.round((rad + 1 - dist) * 255)));
        rawData.push(0xff, 0x6b, 0x35, a);
      } else {
        rawData.push(0, 0, 0, 0); // transparent
      }
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(rawData));

  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

[16, 32, 48, 128].forEach(s => {
  const buf = createPNG(s);
  fs.writeFileSync(path.join(__dirname, 'icons', `icon${s}.png`), buf);
  console.log(`icon${s}.png: ${buf.length}B`);
});
