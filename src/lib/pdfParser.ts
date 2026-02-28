import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PDFExtractionResult {
  text: string;
  pageCount: number;
  usedOCR: boolean;
  errors: string[];
}

export interface PDFProgressCallback {
  (stage: string, progress?: number): void;
}

/**
 * Extract text from a PDF file.
 * First attempts native text extraction via pdfjs-dist.
 * If pages yield very little text, falls back to Tesseract.js OCR.
 */
export async function extractTextFromPDF(
  file: File,
  onProgress?: PDFProgressCallback
): Promise<PDFExtractionResult> {
  const errors: string[] = [];
  const buffer = await file.arrayBuffer();

  onProgress?.("A ler PDF...", 10);

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (err) {
    return {
      text: "",
      pageCount: 0,
      usedOCR: false,
      errors: ["Não foi possível abrir o PDF. O ficheiro pode estar corrompido ou protegido."],
    };
  }

  const pageCount = doc.numPages;
  onProgress?.(`A ler PDF (${pageCount} páginas)...`, 15);

  // Step 1: Try native text extraction
  const pageTexts: string[] = [];
  let totalChars = 0;

  for (let i = 1; i <= pageCount; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      // Sort items by Y position (top to bottom), then X (left to right)
      const items = content.items as Array<{
        str: string;
        transform: number[];
        width: number;
        height: number;
      }>;

      // Group items by approximate Y position (same line)
      const lines = groupTextItemsIntoLines(items);
      const pageText = lines.join("\n");
      pageTexts.push(pageText);
      totalChars += pageText.replace(/\s/g, "").length;

      const pct = 15 + Math.round((i / pageCount) * 35);
      onProgress?.(`A ler PDF (página ${i}/${pageCount})...`, pct);
    } catch (err) {
      errors.push(`Erro na página ${i}: ${err instanceof Error ? err.message : "desconhecido"}`);
      pageTexts.push("");
    }
  }

  // Check if we got enough text (heuristic: at least 20 chars per page on average)
  const avgCharsPerPage = totalChars / pageCount;
  const needsOCR = avgCharsPerPage < 20;

  if (!needsOCR) {
    // Clean up the text: remove repeated headers/footers
    const cleanedText = cleanExtractedText(pageTexts);
    return {
      text: cleanedText,
      pageCount,
      usedOCR: false,
      errors,
    };
  }

  // Step 2: Fallback to OCR
  onProgress?.("PDF digitalizado detectado. A aplicar OCR...", 55);

  try {
    const ocrText = await performOCR(file, pageCount, onProgress);
    const cleanedText = cleanExtractedText(ocrText.split("\n---PAGE_BREAK---\n").length > 1 
      ? ocrText.split("\n---PAGE_BREAK---\n") 
      : [ocrText]);

    return {
      text: cleanedText,
      pageCount,
      usedOCR: true,
      errors,
    };
  } catch (err) {
    errors.push(`OCR falhou: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    // Return whatever native text we got
    return {
      text: cleanExtractedText(pageTexts),
      pageCount,
      usedOCR: false,
      errors: [
        ...errors,
        "O PDF parece ser digitalizado e o OCR falhou. Tente exportar em Excel a partir do seu sistema contabilístico.",
      ],
    };
  }
}

/**
 * Group text items from PDF.js into lines based on Y position
 */
function groupTextItemsIntoLines(
  items: Array<{ str: string; transform: number[]; width: number; height: number }>
): string[] {
  if (items.length === 0) return [];

  // Extract position info
  const positioned = items.map((item) => ({
    text: item.str,
    x: item.transform[4],
    y: item.transform[5],
    width: item.width,
  }));

  // Sort by Y (descending = top to bottom in PDF coords) then X
  positioned.sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff; // different line
    return a.x - b.x; // same line, left to right
  });

  // Group by Y proximity
  const lines: Array<{ y: number; items: typeof positioned }> = [];
  const Y_THRESHOLD = 4; // pixels

  for (const item of positioned) {
    const existingLine = lines.find((l) => Math.abs(l.y - item.y) < Y_THRESHOLD);
    if (existingLine) {
      existingLine.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  // Sort lines top to bottom, items left to right
  lines.sort((a, b) => b.y - a.y);

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);

    // Join items with appropriate spacing
    let result = "";
    for (let i = 0; i < line.items.length; i++) {
      const item = line.items[i];
      if (i > 0) {
        const prev = line.items[i - 1];
        const gap = item.x - (prev.x + prev.width);
        // Add tab for large gaps (column separator), space for small gaps
        result += gap > 15 ? "\t" : gap > 2 ? " " : "";
      }
      result += item.text;
    }
    return result;
  });
}

/**
 * Perform OCR on a PDF file using Tesseract.js
 */
async function performOCR(
  file: File,
  pageCount: number,
  onProgress?: PDFProgressCallback
): Promise<string> {
  // Dynamically import Tesseract.js
  const Tesseract = await import("tesseract.js");

  const worker = await Tesseract.createWorker("por", 1, {
    logger: (m: any) => {
      if (m.status === "recognizing text" && m.progress) {
        const pct = 55 + Math.round(m.progress * 40);
        onProgress?.(`OCR em progresso...`, pct);
      }
    },
  });

  // Convert PDF pages to images using canvas
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pageTexts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(`A aplicar OCR (página ${i}/${pageCount})...`, 55 + Math.round((i / pageCount) * 35));

    try {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale = better OCR

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;

      // Convert canvas to blob for Tesseract
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      const result = await worker.recognize(blob);
      pageTexts.push(result.data.text);
    } catch (err) {
      console.error(`OCR error on page ${i}:`, err);
      pageTexts.push("");
    }
  }

  await worker.terminate();

  return pageTexts.join("\n---PAGE_BREAK---\n");
}

/**
 * Clean extracted text:
 * - Remove repeated headers/footers across pages
 * - Remove page numbers
 * - Remove system watermarks (Domínio, Alterdata, etc.)
 */
function cleanExtractedText(pageTexts: string[]): string {
  if (pageTexts.length === 0) return "";

  // Patterns to remove
  const systemPatterns = [
    /^\s*P[aá]gina\s*:?\s*\d+\s*(de|\/)\s*\d+\s*$/gim,
    /^\s*\d+\s*\/\s*\d+\s*$/gm,
    /^\s*-+\s*$/gm,
    /^\s*=+\s*$/gm,
    /dom[ií]nio\s*sistemas/gi,
    /alterdata/gi,
    /^\s*emitido\s*(em|por)\s*:?\s*.*$/gim,
    /^\s*usu[aá]rio\s*:?\s*.*$/gim,
    /^\s*data\s*de?\s*emiss[aã]o\s*:?\s*.*$/gim,
    /^\s*hora\s*:?\s*\d{2}:\d{2}.*$/gim,
  ];

  // Find repeated lines across pages (likely headers/footers)
  const lineFrequency = new Map<string, number>();
  for (const pageText of pageTexts) {
    const lines = pageText.split("\n").slice(0, 5); // First 5 lines
    const lastLines = pageText.split("\n").slice(-3); // Last 3 lines
    for (const line of [...lines, ...lastLines]) {
      const normalized = line.trim().toLowerCase();
      if (normalized.length > 5) {
        lineFrequency.set(normalized, (lineFrequency.get(normalized) || 0) + 1);
      }
    }
  }

  // Lines that appear in more than half the pages are likely headers/footers
  const threshold = Math.max(2, Math.ceil(pageTexts.length / 2));
  const repeatedLines = new Set(
    Array.from(lineFrequency.entries())
      .filter(([, count]) => count >= threshold)
      .map(([line]) => line)
  );

  // Clean each page
  const cleanedPages = pageTexts.map((pageText) => {
    let cleaned = pageText;

    // Remove system patterns
    for (const pattern of systemPatterns) {
      cleaned = cleaned.replace(pattern, "");
    }

    // Remove repeated header/footer lines
    const lines = cleaned.split("\n");
    const filteredLines = lines.filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !repeatedLines.has(normalized);
    });

    return filteredLines.join("\n");
  });

  // Join all pages
  return cleanedPages.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
