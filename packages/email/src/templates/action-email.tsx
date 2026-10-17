/** @jsxRuntime automatic */
/** @jsxImportSource react */
// tsx (API dev) JSX ayarını tsconfig'ten almıyor; çalışma modu dosyada sabitlendi.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'react-email';
import { emailTheme as c } from '../theme';

export interface ActionEmailProps {
  lang: string;
  preview: string;
  heading: string;
  paragraphs: string[];
  buttonLabel: string;
  buttonUrl: string;
  /** Buton çalışmazsa kopyalanacak link için açıklama */
  fallbackLabel: string;
  footer: string;
}

/** Tek eylemli işlem e-postası: başlık, kısa metin, tek buton (Bölüm 6.5: tek ana eylem). */
export function ActionEmail(props: ActionEmailProps) {
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ backgroundColor: c.background, fontFamily: c.fontFamily, margin: 0, padding: '32px 0' }}>
        <Container
          style={{
            backgroundColor: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            maxWidth: 520,
            padding: 32,
          }}
        >
          <Text style={{ color: c.ink, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 24px' }}>kitisel</Text>
          <Heading as="h1" style={{ color: c.ink, fontSize: 24, lineHeight: 1.2, margin: '0 0 16px' }}>
            {props.heading}
          </Heading>
          {props.paragraphs.map((p) => (
            <Text key={p} style={{ color: c.ink, fontSize: 16, lineHeight: 1.6, margin: '0 0 16px' }}>
              {p}
            </Text>
          ))}
          <Section style={{ margin: '24px 0' }}>
            <Button
              href={props.buttonUrl}
              style={{
                backgroundColor: c.primary,
                borderRadius: 8,
                color: c.primaryText,
                display: 'inline-block',
                fontSize: 16,
                fontWeight: 600,
                padding: '12px 20px',
                textDecoration: 'none',
              }}
            >
              {props.buttonLabel}
            </Button>
          </Section>
          <Text style={{ color: c.inkMuted, fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
            {props.fallbackLabel}
          </Text>
          <Text style={{ color: c.inkMuted, fontSize: 13, lineHeight: 1.5, margin: 0, wordBreak: 'break-all' }}>
            {props.buttonUrl}
          </Text>
          <Hr style={{ borderColor: c.border, margin: '24px 0' }} />
          <Text style={{ color: c.inkMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>{props.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
