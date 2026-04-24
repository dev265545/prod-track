export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-x-hidden bg-background px-4 py-10 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_60%_at_50%_-15%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_55%)]"
        aria-hidden
      />
      <div className="relative w-full max-w-3xl">{children}</div>
    </div>
  );
}
