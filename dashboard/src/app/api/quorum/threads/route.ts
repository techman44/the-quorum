import { NextRequest, NextResponse } from 'next/server';
import { listQuorumThreads, createQuorumThread } from '@/lib/db';
import type { QuorumThread } from '@/lib/types';

// GET /api/quorum/threads - List all threads
export async function GET() {
  try {
    const threads = await listQuorumThreads();
    return NextResponse.json(threads);
  } catch (err) {
    console.error('Threads list API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/quorum/threads - Create new thread
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body as { title?: string };

    const thread = await createQuorumThread(title || 'New Conversation');
    return NextResponse.json(thread, { status: 201 });
  } catch (err) {
    console.error('Thread create API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
