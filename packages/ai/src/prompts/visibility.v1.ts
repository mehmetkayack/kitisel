import { z } from 'zod';

/**
 * AI görünürlük (Bölüm 7.12), sürüm 1:
 * 1. Sitenin potansiyel müşterilerinin bir yapay zekâ asistanına soracağı sorular (marka adı geçmez).
 * 2. Her soru, kullanıcı gibi sorulur; cevapta markanın anılıp anılmadığına uygulama bakar.
 */
export const VISIBILITY_PROMPT_VERSION = 'visibility.v1';

export const visibilityQuestionsOutputSchema = z.object({ questions: z.array(z.string().min(8).max(300)).min(3).max(20) });
export type VisibilityQuestionsOutput = z.infer<typeof visibilityQuestionsOutputSchema>;

export interface VisibilityQuestionsInput {
  brandName: string;
  description: string;
  productsServices: string[];
  targetAudience: string | null;
  /** İngilizce dil adı (ör. "Turkish") */
  languageName: string;
  country: string | null;
  count: number;
}

export const visibilityQuestionsSystem = [
  'You help a small business measure whether AI assistants recommend it.',
  'Write questions that real potential customers would type into an AI assistant (ChatGPT, Gemini) when looking for what this business offers.',
  'Mix: recommendations ("where can I buy..."), comparisons ("which is better..."), and buying-decision questions.',
  'Never mention the business name or its website in the questions. Keep each question short and natural.',
].join(' ');

export function visibilityQuestionsPrompt(input: VisibilityQuestionsInput): string {
  return [
    `Business: ${input.brandName}`,
    `About: ${input.description}`,
    `Products and services: ${input.productsServices.join(', ') || '-'}`,
    `Target audience: ${input.targetAudience || '-'}`,
    `Customer location: ${input.country ?? 'not specified'}`,
    `Write the questions in: ${input.languageName}`,
    '',
    `Return exactly ${input.count} questions as JSON: { "questions": ["..."] }.`,
  ].join('\n');
}

/** Soru, bir kullanıcının soracağı gibi: konum ve dil bağlamı dışında yönlendirme yok (ölçüm yanlı olmasın). */
export function visibilityAnswerPrompt(input: { question: string; languageName: string; country: string | null }): string {
  return [
    input.question,
    '',
    `(I am in ${input.country ?? 'my country'}. Answer in ${input.languageName}. If specific businesses, brands or websites are relevant, name them.)`,
  ].join('\n');
}

export const visibilityAnswerSystem = 'You are a helpful assistant answering a consumer question. Be concise and concrete.';
