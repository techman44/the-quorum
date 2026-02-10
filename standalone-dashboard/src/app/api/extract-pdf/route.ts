import { NextResponse } from 'next/server';

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

    // Parse PDF using the pdf-parse library
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    const text = data.text.trim();

    if (!text) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF. The PDF may be scanned or contain images only.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text,
      pages: data.pages.length,
    });
  } catch (err) {
    console.error('PDF extraction error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to extract PDF text' },
      { status: 500 }
    );
  }
}
