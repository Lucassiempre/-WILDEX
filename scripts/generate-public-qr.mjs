import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const text = "https://lucassiempre.github.io/-WILDEX/";
const output = resolve("public/images/wildex-qr.svg");
const version = 4;
const size = version * 4 + 17;
const dataCodewords = 64;
const ecCodewordsPerBlock = 18;
const blockCount = 2;

const modules = Array.from({ length: size }, () => Array(size).fill(false));
const reserved = Array.from({ length: size }, () => Array(size).fill(false));

const setModule = (x, y, value, isReserved = true) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  modules[y][x] = value;
  if (isReserved) reserved[y][x] = true;
};

const drawFinder = (x, y) => {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
        && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(xx, yy, on);
    }
  }
};

const drawAlignment = (cx, cy) => {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setModule(cx + dx, cy + dy, distance !== 1);
    }
  }
};

drawFinder(0, 0);
drawFinder(size - 7, 0);
drawFinder(0, size - 7);
drawAlignment(26, 26);

for (let i = 8; i < size - 8; i += 1) {
  setModule(6, i, i % 2 === 0);
  setModule(i, 6, i % 2 === 0);
}

setModule(8, size - 8, true);
for (let i = 0; i < 9; i += 1) {
  if (i !== 6) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
}
for (let i = 0; i < 8; i += 1) {
  reserved[8][size - 1 - i] = true;
  reserved[size - 1 - i][8] = true;
}

const appendBits = (bits, value, count) => {
  for (let i = count - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) === 1);
};

const bytes = [...Buffer.from(text, "utf8")];
const bits = [];
appendBits(bits, 0b0100, 4);
appendBits(bits, bytes.length, 8);
for (const byte of bytes) appendBits(bits, byte, 8);
appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));
while (bits.length % 8) bits.push(false);

const codewords = [];
for (let i = 0; i < bits.length; i += 8) {
  let value = 0;
  for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] ? 1 : 0);
  codewords.push(value);
}
for (let pad = 0; codewords.length < dataCodewords; pad += 1) {
  codewords.push(pad % 2 === 0 ? 0xec : 0x11);
}

const gfMultiply = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};

const reedSolomonDivisor = (degree) => {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
};

const reedSolomonRemainder = (data, divisor) => {
  const result = Array(divisor.length).fill(0);
  for (const value of data) {
    const factor = value ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
};

const divisor = reedSolomonDivisor(ecCodewordsPerBlock);
const blocks = [];
for (let i = 0; i < blockCount; i += 1) {
  const start = i * (dataCodewords / blockCount);
  const data = codewords.slice(start, start + dataCodewords / blockCount);
  blocks.push({ data, ec: reedSolomonRemainder(data, divisor) });
}

const finalCodewords = [];
for (let i = 0; i < dataCodewords / blockCount; i += 1) {
  for (const block of blocks) finalCodewords.push(block.data[i]);
}
for (let i = 0; i < ecCodewordsPerBlock; i += 1) {
  for (const block of blocks) finalCodewords.push(block.ec[i]);
}

const dataBits = [];
for (const codeword of finalCodewords) appendBits(dataBits, codeword, 8);
for (let i = 0; i < 7; i += 1) dataBits.push(false);

let bitIndex = 0;
let upward = true;
for (let right = size - 1; right >= 1; right -= 2) {
  if (right === 6) right -= 1;
  for (let vert = 0; vert < size; vert += 1) {
    const y = upward ? size - 1 - vert : vert;
    for (let dx = 0; dx < 2; dx += 1) {
      const x = right - dx;
      if (!reserved[y][x] && bitIndex < dataBits.length) {
        modules[y][x] = dataBits[bitIndex];
        bitIndex += 1;
      }
    }
  }
  upward = !upward;
}

const maskBit = (mask, x, y) => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
};

const drawFormatBits = (target, mask) => {
  let data = mask;
  let bitsValue = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if (((bitsValue >>> i) & 1) !== 0) bitsValue ^= 0x537 << (i - 10);
  }
  data = ((data << 10) | bitsValue) ^ 0x5412;
  const bit = (i) => ((data >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) target[i][8] = bit(i);
  target[7][8] = bit(6);
  target[8][8] = bit(7);
  target[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) target[8][14 - i] = bit(i);

  for (let i = 0; i < 8; i += 1) target[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) target[size - 15 + i][8] = bit(i);
  target[size - 8][8] = true;
};

const masked = modules.map((row, y) => row.map((value, x) => (!reserved[y][x] && maskBit(1, x, y)) ? !value : value));
drawFormatBits(masked, 1);

let paths = "";
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    if (masked[y][x]) paths += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
}

const dimension = size + 8;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="512" height="512" role="img" aria-label="QR para abrir la página pública de Wildex"><rect width="${dimension}" height="${dimension}" fill="#f8fbf5"/><path fill="#071812" d="${paths}"/></svg>\n`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, svg);
console.log(`QR written to ${output}`);
