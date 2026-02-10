import { NextResponse } from 'next/server';
import { storeDocumentFromUpload, generateAndStoreEmbedding } from '@/lib/db';

export async function POST(request: Request) {
  try {
    // Check if the request is multipart/form-data (file upload) or JSON (text content)
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload with multipart/form-data
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const title = formData.get('title') as string | null;
      const docType = formData.get('doc_type') as string | null;
      const tagsJson = formData.get('tags') as string | null;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      if (!title || !docType) {
        return NextResponse.json(
          { error: 'Missing required fields: title, doc_type' },
          { status: 400 }
        );
      }

      // Get file content as buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // For PDF files and other binary formats, we need server-side parsing
      let content: string;

      if (file.name.toLowerCase().endsWith('.pdf')) {
        // Parse PDF on the server using the pdf-parse library
        try {
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: buffer });
          const data = await parser.getText();
          content = data.text.trim();

          if (!content) {
            return NextResponse.json(
              { error: 'Could not extract text from PDF. The PDF may be scanned or contain images only.' },
              { status: 400 }
            );
          }
        } catch (error) {
          console.error('PDF parsing error:', error);
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to parse PDF file' },
            { status: 400 }
          );
        }
      } else {
        // For text files, decode as UTF-8
        try {
          content = buffer.toString('utf-8');
        } catch (error) {
          return NextResponse.json(
            { error: 'Failed to read file content' },
            { status: 400 }
          );
        }
      }

      const tags = tagsJson ? JSON.parse(tagsJson) : [];

      const document = await storeDocumentFromUpload({
        title,
        content,
        doc_type: docType,
        metadata: {
          filename: file.name,
          file_type: file.type,
          file_size: file.size,
        },
        tags,
      });

      let embedded = false;
      try {
        embedded = await generateAndStoreEmbedding(document.id, content);
      } catch (err) {
        console.error('Embedding generation failed:', err);
      }

      return NextResponse.json({
        document_id: document.id,
        embedded,
      });
    } else {
      // Handle JSON payload (legacy text-based upload)
      const body = await request.json();
      const { title, content, doc_type, tags } = body as {
        title: string;
        content: string;
        doc_type: string;
        tags?: string[];
      };

      if (!title || !content || !doc_type) {
        return NextResponse.json(
          { error: 'Missing required fields: title, content, doc_type' },
          { status: 400 }
        );
      }

      const document = await storeDocumentFromUpload({
        title,
        content,
        doc_type,
        tags: tags ?? [],
      });

      let embedded = false;
      try {
        embedded = await generateAndStoreEmbedding(document.id, content);
      } catch (err) {
        console.error('Embedding generation failed:', err);
      }

      return NextResponse.json({
        document_id: document.id,
        embedded,
      });
    }
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}
