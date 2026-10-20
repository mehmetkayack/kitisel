import { describe, expect, it } from 'vitest';
import { loadEnv } from '@upvine/config/env';
import { createMailer, parseAddress } from '@upvine/email';

const email = { to: 'ayse@example.com', subject: 'Konu', html: '<p>Merhaba</p>', text: 'Merhaba', replyTo: 'can@example.com' };

function capture() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response('{"id":"x"}', { status: 201 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('HTTPS API ile e-posta (SMTP portu kapalı sunucular)', () => {
  it('Resend: Bearer anahtar, gönderici EMAIL_FROM, yanıt adresi reply_to', async () => {
    const env = loadEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Kitisel <no-reply@kitisel.com>' });
    const { calls, fetchImpl } = capture();
    await createMailer(env, fetchImpl).send(email);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: 'Kitisel <no-reply@kitisel.com>',
      to: ['ayse@example.com'],
      subject: 'Konu',
      html: '<p>Merhaba</p>',
      text: 'Merhaba',
      reply_to: 'can@example.com',
    });
  });

  it('Brevo: api-key başlığı, gönderici ad + adres olarak ayrıştırılır', async () => {
    const env = loadEnv({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'xkeysib-test', EMAIL_FROM: 'Kitisel <no-reply@kitisel.com>' });
    const { calls, fetchImpl } = capture();
    await createMailer(env, fetchImpl).send(email);
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((calls[0]!.init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      sender: { name: 'Kitisel', email: 'no-reply@kitisel.com' },
      to: [{ email: 'ayse@example.com' }],
      subject: 'Konu',
      htmlContent: '<p>Merhaba</p>',
      textContent: 'Merhaba',
      replyTo: { email: 'can@example.com' },
    });
  });

  it('servis hata döndürürse durum koduyla hata fırlatılır; anahtar yoksa açılışta anlaşılır hata', async () => {
    const env = loadEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' });
    const failing = (async () => new Response('{"message":"domain not verified"}', { status: 403 })) as typeof fetch;
    await expect(createMailer(env, failing).send(email)).rejects.toThrow(/HTTP 403 .*domain not verified/);
    expect(() => createMailer(loadEnv({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: '' }))).toThrow(/BREVO_API_KEY/);
  });

  it('gönderici adresi ayrıştırma', () => {
    expect(parseAddress('"Kitisel Destek" <destek@kitisel.com>')).toEqual({ name: 'Kitisel Destek', email: 'destek@kitisel.com' });
    expect(parseAddress('no-reply@kitisel.com')).toEqual({ email: 'no-reply@kitisel.com' });
  });
});
