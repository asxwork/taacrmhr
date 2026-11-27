// Copies the free bill reader (Tesseract) into public/ocr so it's served by AMS itself, not an outside website:
// the worker, the reading engine and the English language data. Run on install and before every build.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const out = path.join("public", "ocr");
mkdirSync(out, { recursive: true });
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];
let n = 0;
for (const [from, to] of files) if (existsSync(from)) { copyFileSync(from, path.join(out, to)); n++; }
console.log(`Bill reader: ${n} file(s) copied to public/ocr`);
