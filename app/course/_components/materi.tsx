const Materi = () => {
  return (
    <div className="mt-6 p-4 bg-gray-200 rounded-md">
      <h3 className="font-bold text-lg mb-3">Nama Materi</h3>

      <p className="font-semibold">Pembahasan</p>
      <ul className="list-disc pl-5 text-sm">
        <li>Penjumlahan beda variable</li>
        <li>Lorem Ipsum kaffe muspi</li>
      </ul>

      <p className="font-semibold mt-3">Pembahasan di buku</p>
      <ul className="list-disc pl-5 text-sm">
        <li>Buku tematik halaman 243</li>
        <li>Lorem Ipsum kaffe muspi</li>
        <li>Lorem Ipsum kaffe muspi</li>
      </ul>

      <p className="mt-4 text-sm text-gray-600">Start: 15 Maret 2025, 07:20 GMT+7</p>
      <p className="text-sm text-gray-600">End: 15 Maret 2025, 09:00 GMT+7</p>
    </div>
  );
};

export default Materi;
