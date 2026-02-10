import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { storeQuorumMessage } from '@/lib/db';
import { getOpenClawPath } from '@/lib/openclaw';

const OPENCLAW_TIMEOUT_MS = 180_000;

const QUORUM_SYSTEM_PROMPT = `You are The Quorum - a council of 7 AI agents working together. When responding to queries, structure your response to show the perspectives of relevant agents:

- **The Connector** (patterns & connections)
- **The Executor** (action items & deadlines)
- **The Strategist** (big picture & priorities)
- **The Devil's Advocate** (risks & challenges)
- **The Opportunist** (quick wins & hidden value)
- **The Data Collector** (facts & evidence)
- **The Closer** (verifies completion, closes tasks, updates status from evidence)

Search the database for relevant context. After showing relevant agent perspectives, provide a **Council Summary** that synthesizes the key takeaway and recommended action.

Format each agent section with their name as a bold header (e.g. **The Connector**). Only include agents whose perspective is relevant - don't force all 7 for every query.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, threadId, threadTitle } = body as {
      message: string;
      threadId?: string | null;
      threadTitle?: string | null;
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid message' },
        { status: 400 }
      );
    }

    // Use provided threadId or default to 'default'
    const effectiveThreadId = threadId || 'default';
    const effectiveThreadTitle = threadTitle || (threadId ? null : 'Default Conversation');

    // Store the user message with thread info
    await storeQuorumMessage(message, 'user', effectiveThreadId, effectiveThreadTitle);

    // Prepend the system prompt to the first message so openclaw knows the persona
    const fullMessage = `${QUORUM_SYSTEM_PROMPT}\n\nUser query: ${message}`;

    // Use thread-specific session ID so conversations don't bleed into each other
    const sessionId = `quorum-council-${effectiveThreadId}`;

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(getOpenClawPath(), [
        'agent',
        '--message', fullMessage,
        '--session-id', sessionId,
        '--timeout', '180',
      ]);
    } catch (err) {
      console.error('Failed to spawn openclaw:', err);
      const response =
        'OpenClaw is not available on this machine. To enable The Quorum chat, install OpenClaw and ensure the gateway is running.';
      const councilEvent = await storeQuorumMessage(response, 'council', effectiveThreadId, effectiveThreadTitle);
      return NextResponse.json({ response, event_id: councilEvent.id });
    }

    let fullResponse = '';

    const stream = new ReadableStream({
      start(streamController) {
        const timeout = setTimeout(() => {
          console.error('openclaw quorum timed out, killing process');
          proc.kill('SIGTERM');
        }, OPENCLAW_TIMEOUT_MS);

        proc.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          fullResponse += text;
          streamController.enqueue(new TextEncoder().encode(text));
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          console.error('openclaw quorum stderr:', chunk.toString());
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          console.error('openclaw quorum process error:', err);

          if (fullResponse.length === 0) {
            const fallback =
              'OpenClaw is not available on this machine. To enable The Quorum chat, install OpenClaw and ensure the gateway is running.';
            fullResponse = fallback;
            streamController.enqueue(new TextEncoder().encode(fallback));
          }

          storeQuorumMessage(fullResponse, 'council', effectiveThreadId, effectiveThreadTitle).catch((e) =>
            console.error('Failed to store quorum response:', e)
          );
          streamController.close();
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);

          if (code !== 0 && fullResponse.length === 0) {
            const fallback = `OpenClaw exited with code ${code}. The Quorum may be unavailable. Please try again.`;
            fullResponse = fallback;
            streamController.enqueue(new TextEncoder().encode(fallback));
          }

          if (fullResponse.length > 0) {
            storeQuorumMessage(fullResponse, 'council', effectiveThreadId, effectiveThreadTitle).catch((e) =>
              console.error('Failed to store quorum response:', e)
            );
          }

          streamController.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    console.error('Quorum API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
