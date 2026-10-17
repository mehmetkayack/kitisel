import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState } from '@upvine/ui';
import { Logo } from './logo';

/** 404 ve beklenmeyen hata ekranı: teknik ayrıntı yok, tek net eylem. */
export function ErrorPage(props: { title: string; body: string; cta: string; href?: string; reload?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <Logo />
      <EmptyState
        icon={Compass}
        titleAs="h1"
        title={props.title}
        body={props.body}
        action={
          props.reload ? (
            <Button onClick={() => window.location.reload()}>{props.cta}</Button>
          ) : (
            <Button asChild>
              <Link to={props.href ?? '/'}>{props.cta}</Link>
            </Button>
          )
        }
      />
    </main>
  );
}
