import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// Minimal html2pdf-compatible shim built on html2canvas + jsPDF.
// Replaces the vulnerable `html2pdf.js` package while keeping the fluent API
// used by the app: html2pdf().set(opt).from(el).save()

interface Html2PdfOptions {
  margin?: number | number[] | [number, number, number, number];
  filename?: string;
  image?: { type?: string; quality?: number };
  html2canvas?: Record<string, unknown>;
  jsPDF?: { unit?: string; format?: string | [number, number]; orientation?: "portrait" | "landscape" };
  pagebreak?: unknown;
}

const A4 = { mm: { w: 210, h: 297 } };

function normalizeMargin(m: Html2PdfOptions["margin"]): [number, number, number, number] {
  if (m == null) return [0, 0, 0, 0];
  if (typeof m === "number") return [m, m, m, m];
  const [t = 0, r = 0, b = 0, l = 0] = m;
  return [t, r, b, l];
}

class Html2PdfBuilder {
  private opt: Html2PdfOptions = {};
  private element: HTMLElement | null = null;

  set(opt: Html2PdfOptions) {
    this.opt = { ...this.opt, ...opt };
    return this;
  }

  from(el: HTMLElement) {
    this.element = el;
    return this;
  }

  async save(): Promise<void> {
    if (!this.element) throw new Error("html2pdf: no element provided");
    const {
      margin,
      filename = "document.pdf",
      image = { type: "jpeg", quality: 0.95 },
      html2canvas: h2cOpts = {},
      jsPDF: jsPDFOpts = { unit: "mm", format: "a4", orientation: "portrait" },
    } = this.opt;

    const [mt, mr, mb, ml] = normalizeMargin(margin);

    const canvas = await html2canvas(this.element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      ...h2cOpts,
    });

    const imgType = (image.type || "jpeg").toLowerCase();
    const mime = imgType === "png" ? "image/png" : "image/jpeg";
    const imgData = canvas.toDataURL(mime, image.quality ?? 0.95);

    const orientation = jsPDFOpts.orientation ?? "portrait";
    const pdf = new jsPDF({
      unit: (jsPDFOpts.unit as any) ?? "mm",
      format: (jsPDFOpts.format as any) ?? "a4",
      orientation,
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const contentW = pageW - ml - mr;
    const contentH = pageH - mt - mb;

    // Scale the canvas so its width fits contentW in mm.
    const imgWmm = contentW;
    const imgHmm = (canvas.height * imgWmm) / canvas.width;

    if (imgHmm <= contentH) {
      pdf.addImage(imgData, imgType.toUpperCase(), ml, mt, imgWmm, imgHmm);
    } else {
      // Multi-page: slice by page height, drawing the same tall image shifted upward
      // and clipping to the content rect on each page.
      let renderedHmm = 0;
      while (renderedHmm < imgHmm) {
        const remaining = imgHmm - renderedHmm;
        const pageChunk = Math.min(contentH, remaining);
        // jsPDF supports clipping via rect; use a temp canvas slice instead for reliability.
        const sliceCanvas = document.createElement("canvas");
        const pxPerMm = canvas.width / imgWmm;
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(pageChunk * pxPerMm);
        const ctx = sliceCanvas.getContext("2d");
        if (!ctx) throw new Error("html2pdf: 2d context unavailable");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          Math.floor(renderedHmm * pxPerMm),
          canvas.width,
          sliceCanvas.height,
          0,
          0,
          canvas.width,
          sliceCanvas.height,
        );
        const sliceData = sliceCanvas.toDataURL(mime, image.quality ?? 0.95);
        pdf.addImage(sliceData, imgType.toUpperCase(), ml, mt, imgWmm, pageChunk);
        renderedHmm += pageChunk;
        if (renderedHmm < imgHmm) pdf.addPage();
      }
    }

    pdf.save(filename);
  }
}

export default function html2pdf() {
  return new Html2PdfBuilder();
}

// Silence unused-var lint for A4 constant (kept for potential future use)
void A4;