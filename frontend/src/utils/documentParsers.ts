/**
 * Document parsers for extracting text from Word, PDF, and other formats.
 * Works in the browser using mammoth (docx) and pdf.js (pdf).
 */

import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set worker path - copied to public folder (must match pdfjs-dist version)
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Progress callback type for tracking parsing progress
 */
export type ProgressCallback = (progress: number, status?: string) => void;

export interface ParseResult {
  success: boolean;
  text?: string;
  error?: string;
  warning?: string;
  pageCount?: number;
  wordCount?: number;
}

/**
 * Parse a Word document (.docx) to plain text
 */
export async function parseDocx(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    const text = result.value.trim();
    const warnings = result.messages.filter(m => m.type === 'warning');
    
    if (!text) {
      return {
        success: false,
        error: 'The document appears to be empty or contains only images/tables that cannot be extracted as text.'
      };
    }
    
    return {
      success: true,
      text,
      warning: warnings.length > 0 
        ? `Some content may not have been extracted: ${warnings.map(w => w.message).join(', ')}`
        : undefined,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };
  } catch (err) {
    console.error('DOCX parse error:', err);
    return {
      success: false,
      error: `Failed to parse Word document: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}

/**
 * Parse old Word format (.doc) - limited support
 * Note: mammoth only supports .docx, so .doc files need special handling
 */
export async function parseDoc(file: File): Promise<ParseResult> {
  // .doc format is binary and not well supported in browsers
  // We'll try to extract any readable text, but warn the user
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Try to find readable ASCII text in the file
    let text = '';
    let currentWord = '';
    
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      // Check if it's a printable ASCII character
      if (byte >= 32 && byte < 127) {
        currentWord += String.fromCharCode(byte);
      } else if (byte === 10 || byte === 13) {
        if (currentWord.length > 2) {
          text += currentWord + '\n';
        }
        currentWord = '';
      } else {
        if (currentWord.length > 3) {
          text += currentWord + ' ';
        }
        currentWord = '';
      }
    }
    
    // Clean up the extracted text
    text = text
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(.)\1{5,}/g, '') // Remove repeated characters
      .trim();
    
    if (text.length < 50) {
      return {
        success: false,
        error: 'Could not extract text from .doc file. Please save as .docx or .txt in Word.'
      };
    }
    
    return {
      success: true,
      text,
      warning: '⚠️ Old .doc format has limited support. Some formatting and content may be lost. For best results, save as .docx or .txt.',
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };
  } catch (err) {
    console.error('DOC parse error:', err);
    return {
      success: false,
      error: 'Failed to parse .doc file. Please save as .docx or .txt in Word.'
    };
  }
}

/**
 * Parse a PDF document to plain text with progress tracking
 */
export async function parsePdf(file: File, onProgress?: ProgressCallback): Promise<ParseResult> {
  try {
    onProgress?.(0, 'Reading file...');
    const arrayBuffer = await file.arrayBuffer();
    
    console.log('[PDF Parser] Starting PDF parsing, size:', file.size);
    onProgress?.(10, 'Loading PDF...');
    
    // Disable worker to avoid CORS/loading issues
    const loadingTask = getDocument({ 
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    });
    
    const pdf = await loadingTask.promise;
    console.log('[PDF Parser] PDF loaded, pages:', pdf.numPages);
    
    let fullText = '';
    const pageCount = pdf.numPages;
    
    // Extract text from each page with progress updates
    for (let i = 1; i <= pageCount; i++) {
      // Progress from 10% to 90% based on pages
      const pageProgress = 10 + Math.round((i / pageCount) * 80);
      onProgress?.(pageProgress, `Extracting page ${i} of ${pageCount}...`);
      
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) => {
          const textItem = item as { str?: string };
          return textItem.str || '';
        })
        .join(' ');
      
      fullText += pageText + '\n\n';
    }
    
    onProgress?.(95, 'Finalizing...');
    fullText = fullText.trim();
    
    if (!fullText) {
      return {
        success: false,
        error: 'The PDF appears to be empty or contains only images/scanned content that cannot be extracted as text.'
      };
    }
    
    onProgress?.(100, 'Complete');
    return {
      success: true,
      text: fullText,
      pageCount,
      wordCount: fullText.split(/\s+/).filter(w => w.length > 0).length
    };
  } catch (err) {
    console.error('PDF parse error:', err);
    return {
      success: false,
      error: `Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}

/**
 * Parse RTF (Rich Text Format) to plain text
 * Basic implementation - strips RTF control codes
 */
export async function parseRtf(file: File): Promise<ParseResult> {
  try {
    const text = await file.text();
    
    // Basic RTF parsing - remove control words and extract text
    let plainText = text
      // Remove RTF header
      .replace(/^\{\\rtf1.*?(?=\\pard|\\par|\{)/s, '')
      // Remove font tables, color tables, etc.
      .replace(/\{\\fonttbl[^}]*\}/g, '')
      .replace(/\{\\colortbl[^}]*\}/g, '')
      .replace(/\{\\stylesheet[^}]*\}/g, '')
      // Remove control words but keep text
      .replace(/\\[a-z]+\d* ?/gi, '')
      // Remove special characters
      .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Remove braces
      .replace(/[{}]/g, '')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!plainText || plainText.length < 10) {
      return {
        success: false,
        error: 'Could not extract text from RTF file.'
      };
    }
    
    return {
      success: true,
      text: plainText,
      wordCount: plainText.split(/\s+/).filter(w => w.length > 0).length
    };
  } catch (err) {
    console.error('RTF parse error:', err);
    return {
      success: false,
      error: `Failed to parse RTF: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}

/**
 * Main function to parse any supported document format with progress
 */
export async function parseDocument(file: File, onProgress?: ProgressCallback): Promise<ParseResult> {
  const ext = file.name.toLowerCase();
  
  if (ext.endsWith('.docx')) {
    onProgress?.(0, 'Parsing Word document...');
    const result = await parseDocx(file);
    onProgress?.(100, 'Complete');
    return result;
  }
  
  if (ext.endsWith('.doc')) {
    onProgress?.(0, 'Parsing legacy Word document...');
    const result = await parseDoc(file);
    onProgress?.(100, 'Complete');
    return result;
  }
  
  if (ext.endsWith('.pdf')) {
    return parsePdf(file, onProgress);
  }
  
  if (ext.endsWith('.rtf')) {
    onProgress?.(0, 'Parsing RTF document...');
    const result = await parseRtf(file);
    onProgress?.(100, 'Complete');
    return result;
  }
  
  // For other text-based formats, just read as text
  try {
    onProgress?.(0, 'Reading text file...');
    const text = await file.text();
    onProgress?.(100, 'Complete');
    return {
      success: true,
      text,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };
  } catch {
    return {
      success: false,
      error: 'Failed to read file as text.'
    };
  }
}

/**
 * Check if a file format is supported for parsing
 */
export function isDocumentSupported(file: File): boolean {
  const ext = file.name.toLowerCase();
  return ['.docx', '.doc', '.pdf', '.rtf', '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml', '.js', '.ts', '.py', '.html', '.css'].some(e => ext.endsWith(e));
}

/**
 * Get human-readable format name
 */
export function getFormatName(file: File): string {
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.docx')) return 'Word Document';
  if (ext.endsWith('.doc')) return 'Word Document (Legacy)';
  if (ext.endsWith('.pdf')) return 'PDF Document';
  if (ext.endsWith('.rtf')) return 'Rich Text Format';
  if (ext.endsWith('.txt')) return 'Plain Text';
  if (ext.endsWith('.md')) return 'Markdown';
  if (ext.endsWith('.json')) return 'JSON';
  if (ext.endsWith('.xml')) return 'XML';
  if (ext.endsWith('.csv')) return 'CSV';
  if (ext.endsWith('.yaml') || ext.endsWith('.yml')) return 'YAML';
  return 'Text File';
}
