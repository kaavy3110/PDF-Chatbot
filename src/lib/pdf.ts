/**
 * PDF Text Extraction Utility
 * This utility runs client-side to parse and extract raw text from PDF files.
 */

export async function extractTextFromPdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<{ text: string; pageCount: number }> {
  // Dynamically import pdfjs-dist only in the browser (client-side) to prevent SSR compilation errors
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set the worker URL to load the PDF parsing engine from a matching version CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  
  // Load the document using Uint8Array representation of the PDF array buffer
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  
  let fullText = '';
  
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // items is an array of items representing text strings or structure tags
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    
    fullText += pageText + '\n';
    
    if (onProgress) {
      onProgress(i, pageCount);
    }
  }
  
  // Strip out excessive spaces and line breaks to minimize token usage
  const cleanedText = fullText
    .replace(/[ \t]+/g, ' ')            // Combine multiple horizontal whitespaces/tabs
    .replace(/[\r\n]{3,}/g, '\n\n')    // Collapse multiple consecutive newlines (3+) to at most 2 newlines
    .replace(/\s{2,}/g, ' ')            // Clean up general multiple whitespace instances
    .trim();
    
  return { text: cleanedText, pageCount };
}
