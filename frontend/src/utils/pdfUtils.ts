/**
 * PDF Utilities - Text extraction with OCR fallback
 * 
 * Handles both text-based and scanned PDFs by:
 * 1. First trying to extract embedded text
 * 2. Falling back to OCR (Tesseract.js) if no text found
 */

import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface PDFExtractionResult {
    text: string;
    usedOCR: boolean;
    pageCount: number;
    ocrPages: number[];
}

export interface PDFExtractionProgress {
    stage: 'loading' | 'extracting' | 'ocr' | 'complete';
    message: string;
    progress: number; // 0-100
    currentPage?: number;
    totalPages?: number;
}

/**
 * Extract text from PDF file with OCR fallback for scanned documents
 * 
 * @param file - PDF file to process
 * @param onProgress - Progress callback
 * @param ocrLanguages - OCR languages (default: rus+eng)
 * @returns Extraction result with text and metadata
 */
export async function extractTextFromPDF(
    file: File,
    onProgress?: (progress: PDFExtractionProgress) => void,
    ocrLanguages: string = 'rus+eng'
): Promise<PDFExtractionResult> {
    const reportProgress = (p: PDFExtractionProgress) => {
        onProgress?.(p);
        console.log(`[PDF] ${p.stage}: ${p.message}`);
    };

    reportProgress({
        stage: 'loading',
        message: 'Loading PDF...',
        progress: 0
    });

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    reportProgress({
        stage: 'extracting',
        message: `Extracting text from ${totalPages} pages...`,
        progress: 5,
        totalPages
    });

    const textParts: string[] = [];
    const emptyPages: number[] = []; // Pages that need OCR

    // First pass: try to extract text normally
    for (let i = 1; i <= totalPages; i++) {
        reportProgress({
            stage: 'extracting',
            message: `Extracting page ${i}/${totalPages}...`,
            progress: 5 + Math.round((i / totalPages) * 40),
            currentPage: i,
            totalPages
        });

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Better text extraction - handle different item types
        let pageText = '';
        let lastY: number | null = null;

        for (const item of textContent.items) {
            const textItem = item as any;

            // Skip empty items
            if (!textItem.str || textItem.str.trim() === '') continue;

            // Check if we need a newline (different Y position = new line)
            if (lastY !== null && textItem.transform) {
                const currentY = textItem.transform[5];
                if (Math.abs(currentY - lastY) > 5) {
                    pageText += '\n';
                } else if (pageText && !pageText.endsWith(' ')) {
                    pageText += ' ';
                }
            }

            pageText += textItem.str;

            if (textItem.transform) {
                lastY = textItem.transform[5];
            }
        }

        // Check if page has meaningful content
        const trimmedText = pageText.trim();
        if (trimmedText && trimmedText.length > 10) {
            textParts.push(`--- Page ${i} ---\n${trimmedText}`);
        } else {
            // Mark for OCR
            emptyPages.push(i);
            textParts.push(`--- Page ${i} ---\n__OCR_PLACEHOLDER_${i}__`);
        }
    }

    // Check if we need OCR
    const meaningfulText = textParts
        .join('')
        .replace(/--- Page \d+ ---/g, '')
        .replace(/__OCR_PLACEHOLDER_\d+__/g, '')
        .trim();

    const needsOCR = !meaningfulText || emptyPages.length > totalPages / 2;
    const ocrPages: number[] = [];

    if (needsOCR) {
        // More than half pages empty - likely scanned PDF, use OCR
        const pagesToOCR = meaningfulText ? emptyPages : Array.from({ length: totalPages }, (_, i) => i + 1);

        reportProgress({
            stage: 'ocr',
            message: `Scanned PDF detected. Running OCR on ${pagesToOCR.length} pages...`,
            progress: 45,
            totalPages: pagesToOCR.length
        });

        for (let idx = 0; idx < pagesToOCR.length; idx++) {
            const pageNum = pagesToOCR[idx];

            reportProgress({
                stage: 'ocr',
                message: `OCR page ${pageNum}/${totalPages}...`,
                progress: 45 + Math.round((idx / pagesToOCR.length) * 50),
                currentPage: pageNum,
                totalPages
            });

            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

                // Render page to canvas
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d')!;
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: context, viewport } as any).promise;

                // Run OCR with Russian + English
                const { data } = await Tesseract.recognize(canvas, ocrLanguages, {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            reportProgress({
                                stage: 'ocr',
                                message: `OCR page ${pageNum}: ${Math.round((m.progress || 0) * 100)}%`,
                                progress: 45 + Math.round(((idx + (m.progress || 0)) / pagesToOCR.length) * 50),
                                currentPage: pageNum,
                                totalPages
                            });
                        }
                    }
                });

                const ocrText = data.text.trim();

                if (ocrText) {
                    ocrPages.push(pageNum);
                    // Replace placeholder or add new
                    const placeholderIndex = textParts.findIndex(p => p.includes(`__OCR_PLACEHOLDER_${pageNum}__`));
                    if (placeholderIndex >= 0) {
                        textParts[placeholderIndex] = `--- Page ${pageNum} (OCR) ---\n${ocrText}`;
                    } else {
                        textParts[pageNum - 1] = `--- Page ${pageNum} (OCR) ---\n${ocrText}`;
                    }
                }
            } catch (ocrError) {
                console.error(`OCR failed for page ${pageNum}:`, ocrError);
                // Keep placeholder but mark as failed
                const placeholderIndex = textParts.findIndex(p => p.includes(`__OCR_PLACEHOLDER_${pageNum}__`));
                if (placeholderIndex >= 0) {
                    textParts[placeholderIndex] = `--- Page ${pageNum} ---\n[OCR failed]`;
                }
            }
        }
    }

    // Clean up any remaining placeholders
    const result = textParts
        .map(p => p.replace(/__OCR_PLACEHOLDER_\d+__/g, '[No text extracted]'))
        .join('\n\n');

    // Final check
    const finalText = result
        .replace(/--- Page \d+( \(OCR\))? ---/g, '')
        .replace(/\[(No text extracted|OCR failed)\]/g, '')
        .trim();

    reportProgress({
        stage: 'complete',
        message: finalText ? 'Extraction complete' : 'No text could be extracted',
        progress: 100,
        totalPages
    });

    if (!finalText) {
        throw new Error('Could not extract any text from PDF. The file may be corrupted or contain only images that OCR could not read.');
    }

    return {
        text: result,
        usedOCR: ocrPages.length > 0,
        pageCount: totalPages,
        ocrPages
    };
}

/**
 * Convert a text string to a File object for upload
 * Useful when we extract text on frontend and want to upload as .txt
 */
export function textToFile(text: string, originalFilename: string): File {
    // Change extension from .pdf to .txt
    const newFilename = originalFilename.replace(/\.pdf$/i, '_ocr.txt');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    return new File([blob], newFilename, { type: 'text/plain' });
}

/**
 * Check if a file is a PDF
 */
export function isPDF(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
