import { NextRequest, NextResponse } from 'next/server';
import { updateObservationStatus } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status: string };

    if (!status || typeof status !== 'string') {
      return NextResponse.json(
        { error: 'status is required and must be a string' },
        { status: 400 }
      );
    }

    const validStatuses = ['open', 'acknowledged', 'addressed', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const observation = await updateObservationStatus(id, status);

    if (!observation) {
      return NextResponse.json(
        { error: 'Observation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ observation });
  } catch (error) {
    console.error('Failed to update observation status:', error);
    return NextResponse.json(
      { error: 'Failed to update observation status' },
      { status: 500 }
    );
  }
}
