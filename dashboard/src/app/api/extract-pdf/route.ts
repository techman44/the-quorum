import { NextResponse } from 'next/server';

// Helper function to extract text from PDF using pdf2json (pure Node.js implementation)
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const PDFParser = (await import('pdf2json')).default;

  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(errData.parserError || 'Failed to parse PDF'));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      let fullText = '';

      // Extract text from all pages
      for (let i = 0; i < (pdfData.formImage?.Pages?.length || 0); i++) {
        const page = pdfData.formImage.Pages[i];
        let pageText = '';

        // Extract text from text blocks
        if (page.Texts && Array.isArray(page.Texts)) {
          for (const textItem of page.Texts) {
            if (textItem.R && Array.isArray(textItem.R)) {
              for (const r of textItem.R) {
                if (r.T) {
                  pageText += decodeURIComponent(r.T) + ' ';
                }
              }
            }
          }
        }

        fullText += pageText + '\n';
      }

      resolve({
        text: fullText.trim(),
        pages: pdfData.formImage?.Pages?.length || 0,
      });
    });

    // Parse the PDF buffer
    pdfParser.parseBuffer(buffer);
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are supported by this endpoint' },
        { status: 400 }
      );
    }

    // Get file content as buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF using pdf2json
    const data = await extractTextFromPDF(buffer);
    const text = data.text;

    if (!text) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF. The PDF may be scanned or contain images only.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text,
      pages: data.pages,
    });
  } catch (err) {
    console.error('PDF extraction error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to extract PDF text' },
      { status: 500 }
    );
  }
}
