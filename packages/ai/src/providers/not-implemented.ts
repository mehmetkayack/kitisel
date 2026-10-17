import { AIError } from '../types';
import type { AIProvider, AIResult, Source } from '../types';

/**
 * İleride eklenebilecek sağlayıcılar için iskelet (Bölüm 9: `anthropic.ts`, `openai.ts`).
 * Yeni sağlayıcı = bu sınıfın yerine gerçek implementasyon + `createAIProvider`'da seçim.
 */
export class NotImplementedProvider implements AIProvider {
  readonly configured = false;
  constructor(readonly id: 'anthropic' | 'openai') {}
  private fail(): never {
    throw new AIError('not_implemented', `${this.id} sağlayıcısı henüz eklenmedi`);
  }
  async generateText(): Promise<AIResult<string>> {
    return this.fail();
  }
  async generateStructured<T>(): Promise<AIResult<T>> {
    return this.fail();
  }
  async generateGrounded(): Promise<AIResult<{ text: string; sources: Source[] }>> {
    return this.fail();
  }
  async embed(): Promise<AIResult<number[][]>> {
    return this.fail();
  }
  async generateImage(): Promise<AIResult<{ data: Buffer; mimeType: string }>> {
    return this.fail();
  }
}
