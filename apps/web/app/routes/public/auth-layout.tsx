import { Outlet } from 'react-router';

/** Kimlik doğrulama ekranları: ortada tek kart, tek görev. */
export default function AuthLayout() {
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
        <Outlet />
      </div>
    </div>
  );
}
