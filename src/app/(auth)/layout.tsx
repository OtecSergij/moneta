// Centering shell for all auth pages. Route groups don't affect URLs, so the
// children still live at /login, /sign-up, etc. max-w-md per MASTER layout.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
