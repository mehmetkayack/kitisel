import type { Sequelize } from 'sequelize';
import {
  auditLogsRepository,
  membershipsRepository,
  salesLeadEventsRepository,
  salesLeadsRepository,
  salesMatchRepository,
  salesPostsRepository,
  sitesRepository,
  UniqueConstraintError,
  usersRepository,
} from '@upvine/db';
import type { SalesLead, SalesLeadEvent, SalesLeadPatch, SalesSocialPost, User } from '@upvine/db';
import {
  leadDomain,
  SALES_FOLLOW_UP_DAYS,
  SALES_FOLLOW_UP_DELAY_DAYS,
  SALES_LEAD_STATUSES,
  SALES_MAX_FOLLOW_UPS,
} from '@upvine/shared';
import type {
  SalesChannelValue,
  SalesImportData,
  SalesImportReport,
  SalesLeadCreateInput,
  SalesLeadDetail,
  SalesLeadDto,
  SalesLeadEventDto,
  SalesLeadEventInput,
  SalesLeadPage,
  SalesLeadQuery,
  SalesLeadStatusValue,
  SalesLeadUpdateInput,
  SalesPostDto,
  SalesPostInput,
  SalesPostPillarValue,
  SalesPostStatusValue,
  SalesPostUpdateInput,
  SalesSectorValue,
  SalesSummary,
} from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { AdminActor } from '../admin/admin.service';

const DAY_MS = 24 * 60 * 60_000;
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** Takip hatırlatması biten durumlar */
const CLOSED_STATUSES: SalesLeadStatusValue[] = ['replied', 'meeting', 'trial', 'customer', 'not_interested'];

/** Kişisel e-posta servisleri: alan adı bir işletmeyi göstermez, eşleştirmeye katılmaz */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.tr', 'outlook.com', 'outlook.com.tr', 'live.com', 'msn.com',
  'windowslive.com', 'yahoo.com', 'yahoo.com.tr', 'ymail.com', 'yandex.com', 'yandex.com.tr', 'yandex.ru', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'mail.ru', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'zoho.com',
]);

// --- seed-data.json Türkçe değerleri ---
/** Karşılaştırma anahtarı: Türkçe küçük harf, ı/i farkı yok ("Instagram" → "ınstagram" olmasın) */
const trKey = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('tr').replace(/ı/g, 'i');
const folded = <T>(table: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(table).map(([k, v]) => [trKey(k), v]));
const SECTOR_TR = folded<SalesSectorValue>({ 'diş kliniği': 'dental', 'güzellik merkezi': 'beauty', avukat: 'lawyer', 'butik e-ticaret': 'ecommerce' });
const CHANNEL_TR = folded<SalesChannelValue>({ 'e-posta': 'email', 'instagram dm': 'instagram_dm', 'yüz yüze': 'in_person', telefon: 'phone', linkedin: 'linkedin' });
const STATUS_TR = folded<SalesLeadStatusValue>({
  yeni: 'new',
  'mesaj gönderildi': 'contacted',
  'cevap verdi': 'replied',
  görüşme: 'meeting',
  'deneme başladı': 'trial',
  müşteri: 'customer',
  ilgilenmiyor: 'not_interested',
});
const POST_STATUS_TR = folded<SalesPostStatusValue>({ taslak: 'draft', onaylandı: 'approved', zamanlandı: 'scheduled', paylaşıldı: 'published' });
const PILLAR_TR = folded<SalesPostPillarValue>({ tanışma: 'intro', eğitim: 'education', 'kit buldu': 'kit_found', sektör: 'sector', 'analiz çağrısı': 'analysis_cta' });

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Pazartesi 00:00 Europe/Istanbul (2016'dan beri sabit UTC+3) */
function istanbulWeekStart(now: Date): Date {
  const tr = new Date(now.getTime() + 3 * 3600_000);
  const daysSinceMonday = (tr.getUTCDay() + 6) % 7;
  const monday = Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate() - daysSinceMonday);
  return new Date(monday - 3 * 3600_000);
}

/** İstanbul'da bugünün başı (UTC an) */
function istanbulDayStart(now: Date): Date {
  const tr = new Date(now.getTime() + 3 * 3600_000);
  return new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate()) - 3 * 3600_000);
}

/** İstanbul takvim günü (YYYY-MM-DD) */
const istanbulDate = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

function isDue(l: Pick<SalesLead, 'status' | 'doNotContact' | 'nextFollowUpAt'>, now: Date): boolean {
  return l.status === 'contacted' && !l.doNotContact && !!l.nextFollowUpAt && l.nextFollowUpAt.getTime() <= now.getTime();
}

export function toLeadDto(l: SalesLead, now = new Date()): SalesLeadDto {
  return {
    id: l.id,
    domain: l.domain,
    name: l.name,
    sector: l.sector,
    city: l.city,
    website: l.website,
    email: l.email,
    phone: l.phone,
    instagram: l.instagram,
    channel: l.channel,
    status: l.status,
    finding: l.finding,
    message: l.message,
    followUpMessage: l.followUpMessage,
    note: l.note,
    source: l.source,
    doNotContact: l.doNotContact,
    contactedAt: iso(l.contactedAt),
    lastStatusAt: iso(l.lastStatusAt),
    nextFollowUpAt: iso(l.nextFollowUpAt),
    followUpsSent: l.followUpsSent,
    followUpDue: isDue(l, now),
    linkedUserId: l.linkedUserId,
    addedAt: l.addedAt.toISOString(),
  };
}

function toEventDto(e: SalesLeadEvent): SalesLeadEventDto {
  return { id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, text: e.text, adminUserId: e.adminUserId, createdAt: e.createdAt.toISOString() };
}

function toPostDto(p: SalesSocialPost): SalesPostDto {
  return {
    id: p.id,
    slug: p.slug,
    date: p.date,
    time: p.time,
    format: p.format,
    pillar: p.pillar,
    title: p.title,
    visual: p.visual,
    caption: p.caption,
    hashtags: p.hashtags,
    status: p.status,
    source: p.source,
    updatedAt: p.updatedAt.toISOString(),
  };
}

const CSV_COLUMNS: { header: string; value: (l: SalesLead) => string | null }[] = [
  { header: 'domain', value: (l) => l.domain },
  { header: 'name', value: (l) => l.name },
  { header: 'sector', value: (l) => l.sector },
  { header: 'city', value: (l) => l.city },
  { header: 'website', value: (l) => l.website },
  { header: 'email', value: (l) => l.email },
  { header: 'phone', value: (l) => l.phone },
  { header: 'instagram', value: (l) => l.instagram },
  { header: 'channel', value: (l) => l.channel },
  { header: 'status', value: (l) => l.status },
  { header: 'do_not_contact', value: (l) => (l.doNotContact ? '1' : '0') },
  { header: 'added_at', value: (l) => iso(l.addedAt) },
  { header: 'contacted_at', value: (l) => iso(l.contactedAt) },
  { header: 'next_follow_up_at', value: (l) => iso(l.nextFollowUpAt) },
  { header: 'finding', value: (l) => l.finding },
  { header: 'message', value: (l) => l.message },
  { header: 'follow_up_message', value: (l) => l.followUpMessage },
  { header: 'note', value: (l) => l.note },
];

/** Excel (Türkçe bölge ayarı) noktalı virgülü ayırıcı bekler; UTF-8 BOM Türkçe karakterleri korur */
function toCsv(leads: SalesLead[]): string {
  const cell = (v: string | null) => {
    const s = v ?? '';
    // Formül enjeksiyonuna karşı (=, +, -, @ ile başlayan hücre Excel'de formül sayılır)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [CSV_COLUMNS.map((c) => c.header).join(';'), ...leads.map((l) => CSV_COLUMNS.map((c) => cell(c.value(l))).join(';'))];
  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`;
}

/** Huni aşamaları ve sırası */
const FUNNEL = ['contacted', 'replied', 'meeting', 'trial', 'customer'] as const;
const RANK: Record<string, number> = { new: 0, contacted: 1, replied: 2, meeting: 3, trial: 4, customer: 5 };

/**
 * Satış masası (admin, Bölüm: SATIS_MASASI). Mesaj gönderen hiçbir kod yoktur: admin kopyalayıp elle gönderir.
 * Her değişiklik aday geçmişine (`sales_lead_events`) ve denetim kaydına yazılır; mesaj metinleri loglara yazılmaz.
 */
export function createSalesService(deps: { sequelize: Sequelize }) {
  async function loadLead(id: string): Promise<SalesLead> {
    const lead = await salesLeadsRepository.findById(id);
    if (!lead) throw new AppError('not_found');
    return lead;
  }

  async function audit(actor: AdminActor, action: string, targetId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await auditLogsRepository.record({ action, userId: actor.adminId, targetType: 'sales', targetId, metadata, ip: actor.ip, userAgent: actor.userAgent });
  }

  async function detail(id: string): Promise<SalesLeadDetail> {
    const lead = await loadLead(id);
    const events = await salesLeadEventsRepository.listForLead(id);
    return { ...toLeadDto(lead), events: events.map(toEventDto) };
  }

  /** Aday ile kullanıcıyı bağlar: durum "deneme başladı" olur (müşteriyse değişmez) */
  async function link(lead: SalesLead, user: User, actorId: string | null): Promise<void> {
    const now = new Date();
    const patch: SalesLeadPatch = { linkedUserId: user.id };
    const promote = lead.status !== 'customer' && lead.status !== 'trial';
    if (promote) Object.assign(patch, { status: 'trial', lastStatusAt: now, nextFollowUpAt: null });
    await deps.sequelize.transaction(async (t) => {
      await salesLeadsRepository.update(lead.id, patch, t);
      await salesLeadEventsRepository.create({ leadId: lead.id, type: 'linked', fromStatus: null, toStatus: null, text: user.email, adminUserId: actorId }, t);
      if (promote) await salesLeadEventsRepository.create({ leadId: lead.id, type: 'status_change', fromStatus: lead.status, toStatus: 'trial', text: null, adminUserId: actorId }, t);
    });
  }

  /** Adayın alan adına uyan kullanıcı: aynı alan adında e-posta, yoksa bu alan adını site olarak ekleyen organizasyonun sahibi */
  async function findUserForDomain(domain: string): Promise<User | null> {
    if (FREE_EMAIL_DOMAINS.has(domain)) return null;
    const [byEmail] = await salesMatchRepository.usersWithEmailDomain(domain);
    if (byEmail) return byEmail;
    for (const orgId of await salesMatchRepository.orgIdsWithSiteDomain(domain)) {
      const owner = (await membershipsRepository.listForOrg(orgId)).find((m) => m.role === 'owner');
      const user = owner ? await usersRepository.findById(owner.userId) : null;
      if (user) return user;
    }
    return null;
  }

  return {
    async list(query: SalesLeadQuery): Promise<SalesLeadPage> {
      const now = new Date();
      const { items, hasMore } = await salesLeadsRepository.list(
        {
          status: query.status,
          sector: query.sector,
          channel: query.channel,
          q: query.q || undefined,
          ...(query.due ? { dueBefore: now } : {}),
          includeDoNotContact: !!query.dnc,
        },
        query.sort,
        query.offset,
        query.limit,
      );
      return { items: items.map((l) => toLeadDto(l, now)), nextOffset: hasMore ? query.offset + query.limit : null };
    },

    async summary(now = new Date()): Promise<SalesSummary> {
      const weekStart = istanbulWeekStart(now);
      const weekDays = [istanbulDate(weekStart), istanbulDate(new Date(weekStart.getTime() + 6 * 86_400_000))] as const;
      const [leads, changes, weekPosts] = await Promise.all([
        salesLeadsRepository.all(),
        salesLeadEventsRepository.statusChanges(),
        salesPostsRepository.list(weekDays[0], weekDays[1]),
      ]);
      const byStatus = Object.fromEntries(SALES_LEAD_STATUSES.map((s) => [s, 0])) as Record<SalesLeadStatusValue, number>;
      const reached = new Map<string, number>();
      for (const l of leads) {
        if (!l.doNotContact) byStatus[l.status as SalesLeadStatusValue] += 1;
        // İlgilenmeyen aday en az "mesaj gönderildi" aşamasındaydı (gönderildiyse)
        const own = l.status === 'not_interested' ? (l.contactedAt ? 1 : 0) : (RANK[l.status] ?? 0);
        reached.set(l.id, Math.max(reached.get(l.id) ?? 0, own));
      }
      for (const e of changes) {
        if (e.toStatus && e.toStatus in RANK && reached.has(e.leadId)) reached.set(e.leadId, Math.max(reached.get(e.leadId)!, RANK[e.toStatus]!));
      }
      const counts = FUNNEL.map((stage) => [...reached.values()].filter((r) => r >= RANK[stage]!).length);
      const dayStart = istanbulDayStart(now);
      return {
        byStatus,
        total: leads.filter((l) => !l.doNotContact).length,
        doNotContact: leads.filter((l) => l.doNotContact).length,
        due: leads.filter((l) => isDue(l, now)).length,
        sentThisWeek: leads.filter((l) => l.contactedAt && l.contactedAt >= weekStart).length,
        addedToday: leads.filter((l) => l.addedAt >= dayStart).length,
        postsThisWeek: weekPosts.filter((p) => p.status !== 'published').length,
        funnel: FUNNEL.map((stage, i) => ({ stage, count: counts[i]!, rate: i === 0 ? null : counts[i - 1] ? counts[i]! / counts[i - 1]! : null })),
      };
    },

    get: detail,

    async create(input: SalesLeadCreateInput, actor: AdminActor): Promise<SalesLeadDetail> {
      const domain = leadDomain(input.website)!;
      const existing = await salesLeadsRepository.findByDomain(domain);
      if (existing) throw new AppError('lead_exists', { id: existing.id });
      const now = new Date();
      const contacted = input.status !== 'new';
      let lead: SalesLead;
      try {
        lead = await deps.sequelize.transaction(async (t) => {
          const created = await salesLeadsRepository.create(
            {
              domain,
              name: input.name,
              sector: input.sector,
              city: input.city,
              website: input.website,
              email: input.email,
              phone: input.phone,
              instagram: input.instagram,
              channel: input.channel,
              status: input.status,
              finding: input.finding,
              message: input.message,
              followUpMessage: input.followUpMessage,
              note: input.note,
              source: 'manual',
              doNotContact: false,
              contactedAt: input.status === 'contacted' ? now : null,
              lastStatusAt: contacted ? now : null,
              nextFollowUpAt: input.status === 'contacted' ? addDays(now, SALES_FOLLOW_UP_DAYS) : null,
              addedAt: now,
            },
            t,
          );
          await salesLeadEventsRepository.create({ leadId: created.id, type: 'created', fromStatus: null, toStatus: input.status, text: null, adminUserId: actor.adminId }, t);
          return created;
        });
      } catch (err) {
        // Aynı anda iki ekleme: benzersiz indeks yakalar
        if (err instanceof UniqueConstraintError) {
          const dup = await salesLeadsRepository.findByDomain(domain);
          throw new AppError('lead_exists', { id: dup?.id });
        }
        throw err;
      }
      await audit(actor, 'admin.sales_lead_created', lead.id, { domain });
      return detail(lead.id);
    },

    async update(id: string, input: SalesLeadUpdateInput, actor: AdminActor): Promise<SalesLeadDetail> {
      const lead = await loadLead(id);
      const now = new Date();
      const patch: SalesLeadPatch = {};
      const events: Parameters<typeof salesLeadEventsRepository.create>[0][] = [];

      for (const key of ['name', 'sector', 'city', 'email', 'phone', 'instagram', 'channel', 'finding', 'message', 'followUpMessage', 'note'] as const) {
        if (input[key] !== undefined) Object.assign(patch, { [key]: input[key] });
      }
      if (input.website !== undefined) {
        const domain = leadDomain(input.website)!;
        if (domain !== lead.domain) {
          const other = await salesLeadsRepository.findByDomain(domain);
          if (other) throw new AppError('lead_exists', { id: other.id });
          patch.domain = domain;
        }
        patch.website = input.website;
      }

      if (input.status && input.status !== lead.status) {
        patch.status = input.status;
        patch.lastStatusAt = now;
        events.push({ leadId: id, type: 'status_change', fromStatus: lead.status, toStatus: input.status, text: null, adminUserId: actor.adminId });
        if (input.status === 'contacted') {
          const contactedAt = lead.contactedAt ?? now;
          patch.contactedAt = contactedAt;
          patch.nextFollowUpAt = addDays(contactedAt, SALES_FOLLOW_UP_DAYS);
          patch.followUpsSent = 0;
        } else if (CLOSED_STATUSES.includes(input.status)) {
          patch.nextFollowUpAt = null;
        }
      }

      if (input.followUpSent) {
        const status = patch.status ?? lead.status;
        if (status !== 'contacted') throw new AppError('invalid_state');
        const sent = lead.followUpsSent + 1;
        patch.followUpsSent = sent;
        // İkinci takipten sonra hatırlatma durur
        patch.nextFollowUpAt = sent >= SALES_MAX_FOLLOW_UPS ? null : addDays(now, SALES_FOLLOW_UP_DELAY_DAYS);
        events.push({ leadId: id, type: 'follow_up_sent', fromStatus: null, toStatus: null, text: String(sent), adminUserId: actor.adminId });
      }

      if (input.doNotContact !== undefined && input.doNotContact !== lead.doNotContact) {
        patch.doNotContact = input.doNotContact;
        if (input.doNotContact) patch.nextFollowUpAt = null;
      }

      await deps.sequelize.transaction(async (t) => {
        if (Object.keys(patch).length) await salesLeadsRepository.update(id, patch, t);
        for (const e of events) await salesLeadEventsRepository.create(e, t);
      });
      // Mesaj/not metinleri denetim kaydına yazılmaz; sadece değişen alan adları
      await audit(actor, 'admin.sales_lead_updated', id, {
        fields: Object.keys(input),
        ...(patch.status ? { from: lead.status, to: patch.status } : {}),
      });
      return detail(id);
    },

    async addEvent(id: string, input: SalesLeadEventInput, actor: AdminActor): Promise<SalesLeadDetail> {
      await loadLead(id);
      if (input.type === 'note' && !input.text) throw new AppError('validation_failed', { fields: [{ path: 'text', message: 'validation.required' }] });
      await salesLeadEventsRepository.create({
        leadId: id,
        type: input.type,
        fromStatus: null,
        toStatus: null,
        // Kopyalanan mesajın metni saklanmaz; sadece hangisi olduğu ("message" / "follow_up")
        text: input.type === 'note' ? input.text : (input.text?.slice(0, 40) ?? null),
        adminUserId: actor.adminId,
      });
      return detail(id);
    },

    async remove(id: string, actor: AdminActor): Promise<void> {
      const lead = await loadLead(id);
      await salesLeadsRepository.remove(id);
      await audit(actor, 'admin.sales_lead_deleted', id, { domain: lead.domain });
    },

    /** "Eski kayıtları temizle": 12 aydan eski "ilgilenmiyor" adaylar */
    async cleanup(actor: AdminActor, now = new Date()): Promise<{ removed: number }> {
      const before = new Date(now);
      before.setUTCFullYear(before.getUTCFullYear() - 1);
      const removed = await salesLeadsRepository.removeStaleNotInterested(before);
      await audit(actor, 'admin.sales_cleanup', null, { removed });
      return { removed };
    },

    async exportCsv(query: SalesLeadQuery): Promise<string> {
      const leads = await salesLeadsRepository.all({
        status: query.status,
        sector: query.sector,
        channel: query.channel,
        q: query.q || undefined,
        ...(query.due ? { dueBefore: new Date() } : {}),
        includeDoNotContact: !!query.dnc,
      });
      return toCsv(leads);
    },

    /**
     * Kullanıcıyı adayla bağlar (2.3): e-postasının alan adı ya da organizasyonlarının eklediği site adayın alan
     * adıysa. Kayıt akışında hook olmadığı için şimdilik `matchUsers` (admin düğmesi) bunu toplu yapar.
     */
    async linkLeadToUser(user: User, actorId: string | null = null): Promise<string | null> {
      const domains = new Set<string>();
      const emailDomain = user.email.split('@')[1]?.toLowerCase();
      if (emailDomain && !FREE_EMAIL_DOMAINS.has(emailDomain)) domains.add(emailDomain);
      for (const m of await membershipsRepository.listForUser(user.id)) {
        for (const site of await sitesRepository.listForOrg(m.organizationId)) domains.add(site.domain);
      }
      for (const domain of domains) {
        const lead = await salesLeadsRepository.findByDomain(domain);
        if (lead && !lead.linkedUserId) {
          await link(lead, user, actorId);
          return lead.id;
        }
      }
      return null;
    },

    /** Kayıtlı kullanıcılarla eşleştir: henüz bağlanmamış adaylar için */
    async matchUsers(actor: AdminActor): Promise<{ linked: number }> {
      let linked = 0;
      for (const lead of await salesLeadsRepository.unlinked()) {
        const user = await findUserForDomain(lead.domain);
        if (!user) continue;
        await link(lead, user, actor.adminId);
        linked++;
      }
      await audit(actor, 'admin.sales_match_users', null, { linked });
      return { linked };
    },

    /**
     * seed-data.json biçimindeki adayları ve gönderileri içe aktarır. Var olan alan adı / slug: varsayılan atlanır;
     * `update` modunda sadece boş alanlar doldurulur (durum, not, gönderim tarihi ve "bir daha yazma" korunur).
     */
    async importData(data: SalesImportData, opts: { dryRun: boolean; mode: 'skip' | 'update' }, actor: AdminActor | null): Promise<SalesImportReport> {
      const actorId = actor?.adminId ?? null;
      const report: SalesImportReport = { dryRun: opts.dryRun, leads: { added: [], updated: [], skipped: [], invalid: [] }, posts: { added: [], updated: [], skipped: [] } };
      const run = async (write: boolean) => {
        await deps.sequelize.transaction(async (t) => {
          const seen = new Set<string>();
          for (const raw of data.leads) {
            const domain = leadDomain(raw.id) ?? (raw.website ? leadDomain(raw.website) : null);
            if (!domain || seen.has(domain)) {
              report.leads[domain ? 'skipped' : 'invalid'].push(raw.id);
              continue;
            }
            seen.add(domain);
            const fields = {
              name: raw.name.trim().slice(0, 255),
              sector: SECTOR_TR[trKey(raw.sector)] ?? 'other',
              city: raw.city?.trim().slice(0, 120) || null,
              website: raw.website?.trim().slice(0, 500) || null,
              email: raw.email?.trim().toLowerCase().slice(0, 255) || null,
              phone: raw.phone?.trim().slice(0, 60) || null,
              instagram: raw.instagram?.trim().slice(0, 255) || null,
              channel: CHANNEL_TR[trKey(raw.channel)] ?? 'email',
              finding: raw.finding?.trim() || null,
              message: raw.message?.trim() || null,
              followUpMessage: raw.followUp?.trim() || null,
            } as const;
            const existing = await salesLeadsRepository.findByDomain(domain, t);
            if (existing) {
              if (opts.mode !== 'update') {
                report.leads.skipped.push(domain);
                continue;
              }
              // Sadece boş alanlar; durum, not, gönderim tarihi ve "bir daha yazma" değişmez
              const fill: SalesLeadPatch = {};
              for (const key of ['city', 'website', 'email', 'phone', 'instagram', 'finding', 'message', 'followUpMessage'] as const) {
                if (!existing[key] && fields[key]) Object.assign(fill, { [key]: fields[key] });
              }
              if (!Object.keys(fill).length) {
                report.leads.skipped.push(domain);
                continue;
              }
              report.leads.updated.push(domain);
              if (write) {
                await salesLeadsRepository.update(existing.id, fill, t);
                await salesLeadEventsRepository.create({ leadId: existing.id, type: 'imported', fromStatus: null, toStatus: null, text: Object.keys(fill).join(', '), adminUserId: actorId }, t);
              }
              continue;
            }
            report.leads.added.push(domain);
            if (!write) continue;
            const status = STATUS_TR[trKey(raw.status)] ?? 'new';
            const addedAt = parseDate(raw.addedAt) ?? new Date();
            const contactedAt = parseDate(raw.contactedAt);
            const created = await salesLeadsRepository.create(
              {
                domain,
                ...fields,
                status,
                note: raw.note?.trim() || null,
                source: 'import',
                doNotContact: false,
                contactedAt,
                lastStatusAt: status === 'new' ? null : (contactedAt ?? addedAt),
                nextFollowUpAt: status === 'contacted' ? addDays(contactedAt ?? addedAt, SALES_FOLLOW_UP_DAYS) : null,
                addedAt,
              },
              t,
            );
            await salesLeadEventsRepository.create({ leadId: created.id, type: 'imported', fromStatus: null, toStatus: status, text: null, adminUserId: actorId }, t);
          }

          for (const raw of data.posts) {
            const slug = raw.id.trim().toLowerCase();
            const fields = {
              date: raw.date,
              time: raw.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time.trim()) ? raw.time.trim() : null,
              format: raw.format?.trim().slice(0, 60) || null,
              pillar: PILLAR_TR[trKey(raw.pillar)] ?? 'intro',
              title: raw.title.trim().slice(0, 255),
              visual: raw.visual?.trim() || null,
              caption: raw.caption?.trim() || null,
              hashtags: raw.hashtags?.trim().slice(0, 500) || null,
            } as const;
            const existing = await salesPostsRepository.findBySlug(slug, t);
            if (existing) {
              const fill: Parameters<typeof salesPostsRepository.update>[1] = {};
              if (opts.mode === 'update') {
                for (const key of ['time', 'format', 'visual', 'caption', 'hashtags'] as const) {
                  if (!existing[key] && fields[key]) Object.assign(fill, { [key]: fields[key] });
                }
              }
              if (!Object.keys(fill).length) {
                report.posts.skipped.push(slug);
                continue;
              }
              report.posts.updated.push(slug);
              if (write) await salesPostsRepository.update(existing.id, fill, t);
              continue;
            }
            report.posts.added.push(slug);
            if (write) await salesPostsRepository.create({ slug, ...fields, status: POST_STATUS_TR[trKey(raw.status)] ?? 'draft', source: 'import' }, t);
          }
        });
      };
      await run(!opts.dryRun);
      if (actor && !opts.dryRun) {
        await audit(actor, 'admin.sales_import', null, {
          mode: opts.mode,
          leads: { added: report.leads.added.length, updated: report.leads.updated.length },
          posts: { added: report.posts.added.length, updated: report.posts.updated.length },
        });
      }
      return report;
    },

    // --- Gönderiler ---

    async listPosts(from?: string, to?: string): Promise<SalesPostDto[]> {
      return (await salesPostsRepository.list(from, to)).map(toPostDto);
    },

    async getPost(id: string): Promise<SalesPostDto> {
      const post = await salesPostsRepository.findById(id);
      if (!post) throw new AppError('not_found');
      return toPostDto(post);
    },

    async createPost(input: SalesPostInput, actor: AdminActor): Promise<SalesPostDto> {
      if (await salesPostsRepository.findBySlug(input.slug)) throw new AppError('slug_taken');
      const post = await salesPostsRepository.create({ ...input, source: 'manual' });
      await audit(actor, 'admin.sales_post_created', post.id, { slug: input.slug });
      return toPostDto(post);
    },

    async updatePost(id: string, input: SalesPostUpdateInput, actor: AdminActor): Promise<SalesPostDto> {
      const post = await salesPostsRepository.findById(id);
      if (!post) throw new AppError('not_found');
      if (input.slug && input.slug !== post.slug && (await salesPostsRepository.findBySlug(input.slug))) throw new AppError('slug_taken');
      await salesPostsRepository.update(id, input);
      await audit(actor, 'admin.sales_post_updated', id, { fields: Object.keys(input) });
      return toPostDto((await salesPostsRepository.findById(id))!);
    },

    async removePost(id: string, actor: AdminActor): Promise<void> {
      const post = await salesPostsRepository.findById(id);
      if (!post) throw new AppError('not_found');
      await salesPostsRepository.remove(id);
      await audit(actor, 'admin.sales_post_deleted', id, { slug: post.slug });
    },
  };
}

export type SalesService = ReturnType<typeof createSalesService>;

