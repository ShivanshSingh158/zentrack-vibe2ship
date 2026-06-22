import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';

// Configure the worker for pdfjs-dist via a public CDN
// This avoids complex Vite worker configurations and large chunk sizes.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Extracts all text from a given PDF URL by fetching it and parsing pages.
 */
export const extractTextFromPdf = async (url: string): Promise<string> => {
  try {
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    // Process each page sequentially
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(' ') + '\n';
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Failed to parse PDF:', error);
    throw new Error('Failed to extract text from PDF file.');
  }
};

/**
 * Extracts raw text from a given DOCX URL by fetching it as an ArrayBuffer.
 */
export const extractTextFromDocx = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  } catch (error) {
    console.error('Failed to parse DOCX:', error);
    throw new Error('Failed to extract text from DOCX file.');
  }
};
