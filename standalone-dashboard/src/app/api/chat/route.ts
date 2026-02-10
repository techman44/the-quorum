import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getAgent } from '@/lib/agents';
import { storeChatMessage } from '@/lib/db';
import { getOpenClawPath } from '@/lib/openclaw';

const OPENCLAW_TIMEOUT_MS = 120_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent, message } = body;

    if (!agent || typeof agent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid agent name' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid message' },
        { status: 400 }
      );
    }

    const agentDef = getAgent(agent);
    if (!agentDef) {
      return NextResponse.json(
        { error: `Unknown agent: ${agent}` },
        { status: 404 }
      );
    }

    // Store the user message
    await storeChatMessage(agent, message, 'user');

    // Build session ID so openclaw remembers conversation context per agent
    const sessionId = `quorum-chat-${agent}`;

    // Spawn the openclaw agent process (stream stdout directly, no --json)
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(getOpenClawPath(), [
        'agent',
        '--message', message,
        '--session-id', sessionId,
        '--timeout', '120',
      ]);
    } catch (err) {
      console.error('Failed to spawn openclaw:', err);
      const response =
        'OpenClaw is not available on this machine. To enable agent chat, install OpenClaw and ensure the gateway is running.';
      const agentEvent = await storeChatMessage(agent, response, 'agent');
      return NextResponse.json({ response, event_id: agentEvent.id });
    }

    const agentNameForStorage = agent;
    let fullResponse = '';

    const stream = new ReadableStream({
      start(streamController) {
        // Safety timeout -- kill the process if it hangs
        const timeout = setTimeout(() => {
          console.error('openclaw timed out, killing process');
          proc.kill('SIGTERM');
        }, OPENCLAW_TIMEOUT_MS);

        proc.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          fullResponse += text;
          streamController.enqueue(new TextEncoder().encode(text));
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          console.error('openclaw stderr:', chunk.toString());
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          console.error('openclaw process error:', err);

          // If nothing was streamed yet, send fallback message
          if (fullResponse.length === 0) {
            const fallback =
              'OpenClaw is not available on this machine. To enable agent chat, install OpenClaw and ensure the gateway is running.';
            fullResponse = fallback;
            streamController.enqueue(new TextEncoder().encode(fallback));
          }

          // Store whatever we have and close
          storeChatMessage(agentNameForStorage, fullResponse, 'agent').catch((e) =>
            console.error('Failed to store agent response:', e)
          );
          streamController.close();
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);

          if (code !== 0 && fullResponse.length === 0) {
            const fallback = `OpenClaw exited with code ${code}. The agent may be unavailable. Please try again.`;
            fullResponse = fallback;
            streamController.enqueue(new TextEncoder().encode(fallback));
          }

          // Store the complete response after process closes
          if (fullResponse.length > 0) {
            storeChatMessage(agentNameForStorage, fullResponse, 'agent').catch((e) =>
              console.error('Failed to store agent response:', e)
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
    console.error('Chat API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
