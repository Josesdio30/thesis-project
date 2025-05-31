export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-blue-900">
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );
}