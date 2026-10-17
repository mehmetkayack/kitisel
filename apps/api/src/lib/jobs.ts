import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { ASSIST_JOB_OPTIONS, FREE_ANALYSIS_JOB_OPTIONS, GENERATE_JOB_OPTIONS, PUBLISH_JOB_OPTIONS, QUEUES, SITE_JOB_OPTIONS, SITE_JOBS } from '@upvine/shared';
import type { AssistJobData, AssistJobName, ContentJobData, FreeAnalysisJobData, RefreshJobData, SiteJobData, SiteJobName } from '@upvine/shared';

/**
 * Arka plan işleri (Bölüm 4.4): uzun işler HTTP isteğinde çalışmaz, kuyruğa atılır.
 * Testlerde `MemoryJobQueue` ile değiştirilir.
 */
export interface JobQueue {
  enqueueSiteJob(name: SiteJobName, data: SiteJobData): Promise<void>;
  enqueueContentJob(name: 'generate' | 'publish', data: ContentJobData): Promise<void>;
  enqueueFreeAnalysis(data: FreeAnalysisJobData): Promise<void>;
  enqueueAssistJob(name: AssistJobName, data: AssistJobData | RefreshJobData): Promise<void>;
  close(): Promise<void>;
}

export type QueuedJob =
  | { queue: 'site'; name: SiteJobName; data: SiteJobData }
  | { queue: 'content'; name: 'generate' | 'publish'; data: ContentJobData }
  | { queue: 'free'; name: 'analyze'; data: FreeAnalysisJobData }
  | { queue: 'assist'; name: AssistJobName; data: AssistJobData | RefreshJobData };

export function createBullJobQueue(redis: Redis, prefix: string): JobQueue {
  // BullMQ kendi bağlantısını yönetir; ortak istemciyi bloklamamak için ayrı bağlantılar.
  const site = new Queue<SiteJobData, void, SiteJobName>(QUEUES.siteAnalysis, { connection: redis.duplicate(), prefix });
  const content = new Queue<ContentJobData>(QUEUES.content, { connection: redis.duplicate(), prefix });
  const free = new Queue<FreeAnalysisJobData>(QUEUES.freeAnalysis, { connection: redis.duplicate(), prefix });
  const assist = new Queue<AssistJobData | RefreshJobData>(QUEUES.assist, { connection: redis.duplicate(), prefix });
  return {
    async enqueueSiteJob(name, data) {
      await site.add(name, data, SITE_JOB_OPTIONS);
    },
    async enqueueContentJob(name, data) {
      // Kullanıcının başlattığı iş: zamanlayıcının iş kimliğiyle çakışmasın diye zaman damgalı kimlik.
      await content.add(name, data, { ...(name === 'generate' ? GENERATE_JOB_OPTIONS : PUBLISH_JOB_OPTIONS), jobId: `${name}-${data.contentItemId}-${Date.now()}` });
    },
    async enqueueFreeAnalysis(data) {
      await free.add('analyze', data, FREE_ANALYSIS_JOB_OPTIONS);
    },
    async enqueueAssistJob(name, data) {
      await assist.add(name, data, ASSIST_JOB_OPTIONS);
    },
    async close() {
      await Promise.allSettled([site.close(), content.close(), free.close(), assist.close()]);
    },
  };
}

export class MemoryJobQueue implements JobQueue {
  readonly all: QueuedJob[] = [];
  /** Sadece site işleri (geriye dönük uyumlu test erişimi) */
  get jobs(): { name: SiteJobName; data: SiteJobData }[] {
    return this.all.flatMap((j) => (j.queue === 'site' ? [{ name: j.name, data: j.data }] : []));
  }
  async enqueueSiteJob(name: SiteJobName, data: SiteJobData): Promise<void> {
    this.all.push({ queue: 'site', name, data });
  }
  async enqueueContentJob(name: 'generate' | 'publish', data: ContentJobData): Promise<void> {
    this.all.push({ queue: 'content', name, data });
  }
  async enqueueFreeAnalysis(data: FreeAnalysisJobData): Promise<void> {
    this.all.push({ queue: 'free', name: 'analyze', data });
  }
  async enqueueAssistJob(name: AssistJobName, data: AssistJobData | RefreshJobData): Promise<void> {
    this.all.push({ queue: 'assist', name, data });
  }
  async close(): Promise<void> {}
  clear(): void {
    this.all.length = 0;
  }
}

export { SITE_JOBS };
