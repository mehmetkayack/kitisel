import { auditLogsRepository, contactMessagesRepository } from '@upvine/db';
import type { ContactMessage } from '@upvine/db';
import type { AdminContactMessage, ContactQuery, Page, UpdateContactMessageInput } from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { AdminActor } from './admin.service';

function toDto(m: ContactMessage): AdminContactMessage {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    company: m.company,
    message: m.message,
    locale: m.locale,
    status: m.status,
    recaptchaScore: m.recaptchaScore,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

/** Admin: iletişim formu mesajları. Açılan yeni mesaj "okundu" olur; arşivleme denetim kaydına yazılır. */
export function createAdminMessagesService() {
  async function load(id: string): Promise<ContactMessage> {
    const m = await contactMessagesRepository.findById(id);
    if (!m) throw new AppError('not_found');
    return m;
  }

  return {
    async list(query: ContactQuery): Promise<Page<AdminContactMessage>> {
      const { items, nextCursor } = await contactMessagesRepository.list(query);
      return { items: items.map(toDto), nextCursor };
    },

    countNew(): Promise<number> {
      return contactMessagesRepository.countNew();
    },

    async get(id: string): Promise<AdminContactMessage> {
      const m = await load(id);
      if (m.status === 'new') {
        await contactMessagesRepository.update(id, { status: 'read', readAt: new Date() });
        return toDto(await load(id));
      }
      return toDto(m);
    },

    async update(id: string, input: UpdateContactMessageInput, actor: AdminActor): Promise<AdminContactMessage> {
      const m = await load(id);
      await contactMessagesRepository.update(id, { status: input.status, ...(input.status === 'new' ? { readAt: null } : m.readAt ? {} : { readAt: new Date() }) });
      await auditLogsRepository.record({
        action: 'admin.contact_message_updated',
        userId: actor.adminId,
        targetType: 'contact_message',
        targetId: id,
        metadata: { before: m.status, after: input.status },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return toDto(await load(id));
    },
  };
}
