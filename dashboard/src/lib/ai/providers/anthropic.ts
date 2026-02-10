// Anthropic provider implementation
import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatOptions, AIProvider } from './base';

export interface AnthropicCompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export class AnthropicProvider {
  private client: Anthropic;
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
    this.client = new Anthropic({
      apiKey: provider.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: provider.baseUrl,
    });
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<AnthropicCompletionResult> {
    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: this.provider.metadata?.model as string || 'claude-sonnet-4-20250514',
      system: systemMessage?.content,
      messages: chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
    });

    // Extract text from response
    let content = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      }
    }

    return {
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Generate a streaming chat completion
   */
  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const stream = await this.client.messages.create({
      model: this.provider.metadata?.model as string || 'claude-sonnet-4-20250514',
      system: systemMessage?.content,
      messages: chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }

  /**
   * Test the connection
   */
  async test(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.provider.metadata?.model as string || 'claude-haiku-4-20250514',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function createAnthropicProvider(provider: AIProvider): Promise<AnthropicProvider> {
  return new AnthropicProvider(provider);
}
