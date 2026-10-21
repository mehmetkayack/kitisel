import { Ban, Check, Clock, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BillingOrderDto, OrderStatusValue } from '@upvine/shared';
import { Badge } from '@upvine/ui';

/** Sipariş durumu: renk + ikon + metin (sadece renk değil). Panel ve admin aynı rozeti kullanır. */
export function OrderStatusBadge({ status }: { status: OrderStatusValue }) {
  const { t } = useTranslation('app');
  const map = {
    pending: { tone: 'warning', Icon: Clock },
    paid: { tone: 'success', Icon: Check },
    failed: { tone: 'danger', Icon: XCircle },
    canceled: { tone: 'neutral', Icon: Ban },
  } as const;
  const { tone, Icon } = map[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {t(`billing.status.${status}`)}
    </Badge>
  );
}

/** Para biçimleri: USD sent ve TL kuruş, arayüz dilinde */
export function useMoney() {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return {
    usd: (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100),
    tryMinor: (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY' }).format(minor / 100),
  };
}

/** Havalede ödenecek tutar: TL hesabına TCMB kuruyla TL, USD hesabına USD */
export function transferAmount(order: Pick<BillingOrderDto, 'transferCurrency' | 'transferAmountMinor' | 'totalCents'>, money: ReturnType<typeof useMoney>): string {
  return order.transferCurrency === 'TRY' && order.transferAmountMinor !== null ? money.tryMinor(order.transferAmountMinor) : money.usd(order.totalCents);
}

/** Paket adı (marka adı: çevrilmez) */
export function planName(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
