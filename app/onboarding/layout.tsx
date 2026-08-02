export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-x-hidden bg-background px-4 py-10 sm:px-6">
      {/* No decorative gradient: color-mix()/oklch are unsupported on the
          Chrome 109 (Windows 7) machines this app has to run on. */}
      <div className="relative w-full max-w-3xl">{children}</div>
    </div>
  );
}
