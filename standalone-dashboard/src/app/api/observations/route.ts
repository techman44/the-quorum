import { NextRequest, NextResponse } from 'next/server';
import {
  listObservations,
  createObservation,
  type ListObservationsOptions,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const opts: ListObservationsOptions = {
      category: searchParams.get('category') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      severity: searchParams.get('severity') ?? undefined,
      source_agent: searchParams.get('source_agent') ?? undefined,
      ref_id: searchParams.get('ref_id') ?? undefined,
      ref_type: searchParams.get('ref_type') ?? undefined,
      limit: parseInt(searchParams.get('limit') ?? '50', 10),
      offset: parseInt(searchParams.get('offset') ?? '0', 10),
    };

    const observations = await listObservations(opts);

    return NextResponse.json({ observations });
  } catch (error) {
    console.error('Failed to fetch observations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch observations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      category,
      content,
      source_agent,
      severity,
      status,
      ref_id,
      ref_type,
      metadata,
    } = body as {
      category: string;
      content: string;
      source_agent: string;
      severity?: string;
      status?: string;
      ref_id?: string | null;
      ref_type?: string | null;
      metadata?: Record<string, unknown>;
    };

    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'category is required and must be a string' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'content is required and must be a string' },
        { status: 400 }
      );
    }

    if (!source_agent || typeof source_agent !== 'string') {
      return NextResponse.json(
        { error: 'source_agent is required and must be a string' },
        { status: 400 }
      );
    }

    const validCategories = [
      'critique',
      'risk',
      'insight',
      'recommendation',
      'issue',
      'improvement',
      'other',
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        {
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const validSeverities = ['info', 'low', 'medium', 'high', 'critical'];
    if (severity && !validSeverities.includes(severity)) {
      return NextResponse.json(
        {
          error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const validStatuses = ['open', 'acknowledged', 'addressed', 'dismissed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const observation = await createObservation({
      category,
      content,
      source_agent,
      severity,
      status,
      ref_id,
      ref_type,
      metadata,
    });

    return NextResponse.json({ observation }, { status: 201 });
  } catch (error) {
    console.error('Failed to create observation:', error);
    return NextResponse.json(
      { error: 'Failed to create observation' },
      { status: 500 }
    );
  }
}
