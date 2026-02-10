// Provider registry and factory
import type { AIProvider, ProviderType } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { CustomProvider } from './custom';
import type { ChatMessage, ChatOptions } from './base';

export interface AICompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AIChatService {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<AICompletionResult>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
  test(): Promise<boolean>;
}

/**
 * Create a provider instance based on type
 */
export async function createProvider(provider: AIProvider): Promise<AIChatService> {
  switch (provider.type) {
    case 'openai':
      return new OpenAIProvider(provider) as unknown as AIChatService;
    case 'anthropic':
      return new AnthropicProvider(provider) as unknown as AIChatService;
    case 'google':
      return new GoogleProvider(provider) as unknown as AIChatService;
    case 'custom':
    case 'openrouter':
      return new CustomProvider(provider) as unknown as AIChatService;
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}

/**
 * Test a provider connection
 */
export async function testProvider(provider: AIProvider): Promise<boolean> {
  const service = await createProvider(provider);
  return service.test();
}

// Re-export types
export * from './base';
export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';
export { GoogleProvider } from './google';
export { CustomProvider } from './custom';
