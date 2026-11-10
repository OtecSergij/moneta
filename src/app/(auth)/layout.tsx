export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 bg-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-5 pb-8 text-ink">
        <span className="px-1 text-[22px] leading-[normal] font-bold tracking-[-0.03em]">
          moneta
        </span>
        <main>{children}</main>
      </div>
    </div>
  );
}
