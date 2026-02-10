import { NextRequest, NextResponse } from 'next/server';
import { createObservation, storeQuorumMessage } from '@/lib/db';
import type { N8nWebhookEvent, N8nWebhookEventType, N8nWebhookResponse } from '@/lib/types';

// Webhook signature validation (if configured)
function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // For now, return true if no signature is required
  // Implement proper HMAC validation if needed
  return !signature || signature.length === 0;
}

// Route events to appropriate agents or storage
async function routeWebhookEvent(event: N8nWebhookEvent): Promise<N8nWebhookResponse> {
  const { event_type, source_workflow, data, metadata } = event;

  switch (event_type) {
    case 'observation':
      // Store as an observation in the database
      const observation = await createObservation({
        category: ((data.category as string) || 'insight') as any,
        content: String(data.content ?? JSON.stringify(data)),
        source_agent: String(data.source_agent ?? source_workflow),
        severity: (data.severity as string) || 'info',
        status: (data.status as string) || 'open',
        ref_id: (data.ref_id as string | null) || null,
        ref_type: (data.ref_type as string | null) || null,
        metadata: metadata || {},
      });
      return {
        success: true,
        message: 'Observation stored',
        data: { observation_id: observation.id },
      };

    case 'chat':
      // Store as a chat message
      const chatEvent = await storeQuorumMessage(
        String(data.message ?? JSON.stringify(data)),
        'council',
        (data.thread_id as string | null) || null,
        (data.thread_title as string | null) || null
      );
      return {
        success: true,
        message: 'Chat message stored',
        data: { event_id: chatEvent.id },
      };

    case 'agent_trigger':
      // Store agent trigger event for later processing
      const triggerEvent = await storeQuorumMessage(
        `Agent trigger request from ${source_workflow}: ${JSON.stringify(data)}`,
        'council',
        null,
        null
      );
      return {
        success: true,
        message: 'Agent trigger queued',
        data: { event_id: triggerEvent.id },
      };

    case 'workflow_complete':
      // Workflow completion notification
      const completeEvent = await storeQuorumMessage(
        `Workflow ${source_workflow} completed: ${JSON.stringify(data)}`,
        'council',
        null,
        null
      );
      return {
        success: true,
        message: 'Workflow completion recorded',
        data: { event_id: completeEvent.id },
      };

    case 'workflow_error':
      // Workflow error notification
      const errorEvent = await storeQuorumMessage(
        `Workflow ${source_workflow} error: ${String(data.error ?? JSON.stringify(data))}`,
        'council',
        null,
        null
      );
      return {
        success: true,
        message: 'Workflow error recorded',
        data: { event_id: errorEvent.id },
      };

    default:
      // Store as generic event
      const genericEvent = await storeQuorumMessage(
        `Unknown webhook event from ${source_workflow}: ${JSON.stringify(data)}`,
        'council',
        null,
        null
      );
      return {
        success: true,
        message: 'Generic event stored',
        data: { event_id: genericEvent.id },
      };
  }
}

// POST /api/webhooks/n8n - Receive webhooks from n8n workflows
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      event_type,
      source_workflow,
      data,
      metadata,
      signature,
    } = body as {
      event_type?: string;
      source_workflow?: string;
      data?: unknown;
      metadata?: Record<string, unknown>;
      signature?: string;
    };

    // Validate required fields
    if (!event_type || typeof event_type !== 'string') {
      return NextResponse.json(
        { error: 'event_type is required and must be a string' },
        { status: 400 }
      );
    }

    if (!source_workflow || typeof source_workflow !== 'string') {
      return NextResponse.json(
        { error: 'source_workflow is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate webhook signature if configured
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const payload = JSON.stringify(body);
      if (!validateWebhookSignature(payload, signature, webhookSecret)) {
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }
    }

    // Build the event object
    const event: N8nWebhookEvent = {
      event_type: event_type as N8nWebhookEventType,
      source_workflow,
      data: (data || {}) as Record<string, unknown>,
      metadata: metadata || {},
      received_at: new Date(),
    };

    // Route the event to appropriate handler
    const response = await routeWebhookEvent(event);

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('N8n webhook API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// GET /api/webhooks/n8n - Verify webhook endpoint is reachable
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'N8n webhook endpoint is active',
    supported_events: [
      'observation',
      'chat',
      'agent_trigger',
      'workflow_complete',
      'workflow_error',
    ],
  });
}
