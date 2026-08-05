import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger";

const log = createLogger("Ingest");

/** Below this, an extracted PDF is assumed to be scanned images (MIGRATION_SPEC.md §5.1). */
export const OCR_MIN_CHARS_PER_PAGE = 50;

export const OCR_CACHE_DIR = ".ocr_cache";

export type ExtractionMethod = "text" | "pdf" | "ocr-cache";

export interface Extraction {
  text: string;
  method: ExtractionMethod;
  pages?: number;
}

/**
 * Extracts text from one corpus file.
 *
 * `.md`/`.txt` are read directly. PDFs go through `pdf-parse`; if the result averages fewer than
 * `OCR_MIN_CHARS_PER_PAGE`, the file is scanned images and the text must come from OCR.
 *
 * **OCR is not performed here.** The legacy pipeline cached its OCR output to
 * `.ocr_cache/<filename>.txt`, and that cache is still on disk for the one scanned document in
 * this corpus. Reusing it keeps a heavyweight OCR toolchain out of this service and — more
 * importantly for the bake-off — guarantees every arm sees byte-identical text for that document
 * rather than whatever a new OCR run happened to produce.
 */
export const extractText = async (filePath: string): Promise<Extraction> => {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".md" || ext === ".txt") {
    return { text: fs.readFileSync(filePath, "utf8"), method: "text" };
  }

  // Required lazily so this module stays importable without the PDF toolchain present.
  // Note this is the pdf-parse v2 class API (`new PDFParse(...).getText()`), not the v1
  // `pdfParse(buffer)` function form that most examples online still show.
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });

  let text = "";
  let pages = 0;
  try {
    const parsed = await parser.getText();
    text = parsed.text ?? "";
    pages = parsed.total ?? 0;
  } finally {
    // Releases the worker; without this the process hangs instead of exiting.
    await parser.destroy();
  }

  const perPage = pages > 0 ? text.length / pages : text.length;
  if (perPage >= OCR_MIN_CHARS_PER_PAGE) {
    return { text, method: "pdf", pages };
  }

  const cached = path.join(OCR_CACHE_DIR, `${filename}.txt`);
  if (fs.existsSync(cached)) {
    log.info(`${filename}: scanned (${Math.round(perPage)} chars/page) — using OCR cache.`);
    return { text: fs.readFileSync(cached, "utf8"), method: "ocr-cache", pages };
  }

  throw new Error(
    `${filename} appears scanned (${Math.round(perPage)} chars/page) and no OCR cache exists at ${cached}. `
      + "Restore the cache file or run OCR externally — this service does not perform OCR.",
  );
};
