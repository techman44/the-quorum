import { NextRequest, NextResponse } from 'next/server';
import { renameQuorumThread, deleteQuorumThread, getQuorumThread } from '@/lib/db';

// PUT /api/quorum/threads/[id] - Rename thread
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title } = body as { title: string };

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const success = await renameQuorumThread(id, title);

    if (!success) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Thread rename API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/quorum/threads/[id] - Delete thread
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Don't allow deleting the default thread
    if (id === 'default') {
      return NextResponse.json(
        { error: 'Cannot delete default thread' },
        { status: 400 }
      );
    }

    const success = await deleteQuorumThread(id);

    if (!success) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Thread delete API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
