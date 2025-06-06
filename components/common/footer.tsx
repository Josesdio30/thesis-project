export default function Footer() {
  return (
    <footer className="bg-gray-100 border-t border-gray-200 py-4 mt-auto">
      <div className="container mx-auto px-4 text-center">
        <p className="text-gray-600 text-sm">
          © {new Date().getFullYear()} SMAK St. Louis 2
        </p>
      </div>
    </footer>
  );
}