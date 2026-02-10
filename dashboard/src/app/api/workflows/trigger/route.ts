import { NextRequest, NextResponse } from 'next/server';
import { storeQuorumMessage } from '@/lib/db';
import type { N8nWorkflowTriggerRequest, N8nWorkflowTriggerResponse } from '@/lib/types';

// Get n8n configuration from environment
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

// Headers for n8n API requests
function getN8nHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (N8N_API_KEY) {
    headers['Authorization'] = `Bearer ${N8N_API_KEY}`;
    headers['X-N8N-API-KEY'] = N8N_API_KEY;
  }

  return headers;
}

// Trigger an n8n workflow by ID
async function triggerWorkflow(
  workflowId: string,
  data: Record<string, unknown>
): Promise<N8nWorkflowTriggerResponse> {
  try {
    // Try webhook trigger first (most common)
    const webhookUrl = `${N8N_BASE_URL}/webhook/${workflowId}`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: getN8nHeaders(),
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      return {
        success: true,
        workflowId,
        executionId: result.executionId || null,
        data: result,
        message: 'Workflow triggered successfully',
      };
    }

    // If webhook fails, try API trigger
    const apiUrl = `${N8N_BASE_URL}/api/v1/workflows/${workflowId}/execute`;
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: getN8nHeaders(),
      body: JSON.stringify({ data }),
    });

    if (apiResponse.ok) {
      const result = await apiResponse.json().catch(() => ({}));
      return {
        success: true,
        workflowId,
        executionId: result.executionId || result.id || null,
        data: result,
        message: 'Workflow triggered successfully via API',
      };
    }

    return {
      success: false,
      workflowId,
      executionId: null,
      data: null,
      message: `Failed to trigger workflow: ${apiResponse.statusText}`,
      error: apiResponse.statusText,
    };
  } catch (error) {
    return {
      success: false,
      workflowId,
      executionId: null,
      data: null,
      message: 'Error triggering workflow',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Get workflow execution status
async function getExecutionStatus(executionId: string): Promise<{
  success: boolean;
  status: string;
  data: Record<string, unknown> | null;
  finished: boolean;
}> {
  try {
    const response = await fetch(`${N8N_BASE_URL}/api/v1/executions/${executionId}`, {
      method: 'GET',
      headers: getN8nHeaders(),
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        status: result.status || 'unknown',
        data: result.data || result,
        finished: result.finished || result.status === 'completed' || result.status === 'error',
      };
    }

    return {
      success: false,
      status: 'error',
      data: null,
      finished: true,
    };
  } catch {
    return {
      success: false,
      status: 'error',
      data: null,
      finished: true,
    };
  }
}

// POST /api/workflows/trigger - Trigger an external n8n workflow
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workflow_id,
      webhook_path,
      data,
      await_result,
      timeout,
    } = body as N8nWorkflowTriggerRequest;

    // Validate required fields
    if (!workflow_id && !webhook_path) {
      return NextResponse.json(
        { error: 'Either workflow_id or webhook_path is required' },
        { status: 400 }
      );
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'data is required and must be an object' },
        { status: 400 }
      );
    }

    // Determine the workflow identifier
    const workflowIdentifier = (webhook_path || workflow_id) as string;

    // Log the trigger attempt
    await storeQuorumMessage(
      `Triggering n8n workflow: ${workflowIdentifier}`,
      'council',
      null,
      null
    );

    // Trigger the workflow
    const result = await triggerWorkflow(workflowIdentifier, data);

    // If await_result is true, poll for completion
    if (result.success && await_result && result.executionId) {
      const maxTimeout = timeout || 30000; // Default 30 seconds
      const startTime = Date.now();
      let executionResult = await getExecutionStatus(result.executionId);

      while (Date.now() - startTime < maxTimeout) {
        executionResult = await getExecutionStatus(result.executionId);
        if (executionResult.finished) break;
        await new Promise(resolve => setTimeout(resolve, 500)); // Poll every 500ms
      }

      result.data = executionResult.data;
      result.finished = executionResult.finished;
    }

    // Store the result as an event
    if (result.success) {
      await storeQuorumMessage(
        `Workflow ${workflowIdentifier} triggered successfully${result.executionId ? ` (execution: ${result.executionId})` : ''}`,
        'council',
        null,
        null
      );
    } else {
      await storeQuorumMessage(
        `Failed to trigger workflow ${workflowIdentifier}: ${result.message}`,
        'council',
        null,
        null
      );
    }

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    console.error('Workflow trigger API error:', err);
    return NextResponse.json(
      {
        success: false,
        workflowId: null,
        executionId: null,
        data: null,
        message: 'Internal server error',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// GET /api/workflows/trigger - Get available workflows info
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'N8n workflow trigger endpoint is active',
    n8n_configured: !!N8N_API_KEY,
    n8n_base_url: N8N_BASE_URL,
    usage: {
      trigger: 'POST with workflow_id or webhook_path',
      parameters: {
        workflow_id: 'ID of the workflow to trigger',
        webhook_path: 'Webhook path for the workflow',
        data: 'Data to pass to the workflow',
        await_result: 'Wait for workflow completion (optional)',
        timeout: 'Max wait time in ms (optional, default 30000)',
      },
    },
  });
}
