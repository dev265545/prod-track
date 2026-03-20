export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6">
      {children}
    </div>
  );
}
