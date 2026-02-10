// Custom OpenAI-compatible provider implementation
// Supports LM Studio, Ollama, and other OpenAI-compatible APIs
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';
import type { ChatMessage, ChatOptions, AIProvider } from './base';

export interface CustomCompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export class CustomProvider {
  private provider: AIProvider;
  private client: ReturnType<typeof createOpenAI>;

  constructor(provider: AIProvider) {
    this.provider = provider;

    // Create OpenAI-compatible client
    // Default to LM Studio if no base URL provided
    const baseUrl = provider.baseUrl || 'http://192.168.20.173:1234/v1';

    this.client = createOpenAI({
      baseURL: baseUrl,
      apiKey: provider.apiKey || 'not-needed', // Some local models don't require API keys
    });
  }

  /**
   * Get the model ID from provider metadata or use a sensible default
   */
  private getModelId(): string {
    return this.provider.metadata?.model as string || 'gpt-4o'; // Many local servers accept any model name
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<CustomCompletionResult> {
    const model = this.client(this.getModelId());

    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');

    const result = await generateText({
      model,
      system: systemMessage,
      messages: chatMessages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
    } as any); // Using any because maxTokens might not be in all SDK versions

    return {
      content: result.text,
      usage: {
        promptTokens: (result.usage as any)?.promptTokens || (result.usage as any)?.prompt || 0,
        completionTokens: (result.usage as any)?.completionTokens || (result.usage as any)?.completionion || 0,
      },
    };
  }

  /**
   * Generate a streaming chat completion
   */
  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string> {
    const model = this.client(this.getModelId());

    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');

    const result = await streamText({
      model,
      system: systemMessage,
      messages: chatMessages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
    } as any); // Using any because maxTokens might not be in all SDK versions

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  /**
   * Test the connection by fetching the models list
   */
  async test(): Promise<boolean> {
    try {
      // First try to get the models list - this is a lighter test
      const baseUrl = this.provider.baseUrl || 'http://192.168.20.173:1234/v1';
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.provider.apiKey && { 'Authorization': `Bearer ${this.provider.apiKey}` }),
        },
      });

      if (response.ok) {
        const data = await response.json();
        // If we have models, try a simple generation with the first model
        const models = data.data;
        if (models && models.length > 0) {
          const testModel = models[0].id;
          const model = this.client(testModel);
          await generateText({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            maxTokens: 5,
          } as any);
          return true;
        }
      }

      // Fallback to trying a generation with default model name
      const model = this.client(this.getModelId());
      await generateText({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 5,
      } as any);
      return true;
    } catch {
      return false;
    }
  }
}

export async function createCustomProvider(provider: AIProvider): Promise<CustomProvider> {
  return new CustomProvider(provider);
}
