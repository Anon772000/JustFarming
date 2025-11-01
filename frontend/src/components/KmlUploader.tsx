import React, { useState } from "react";

export default function KmlUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  const upload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setStatus("Uploading...");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/v1/kml/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setStatus(`Imported ${data.imported} paddocks`);
    } catch (e) {
      setStatus("Error uploading file");
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <input type="file" accept=".kml" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button onClick={upload} className="ml-2 px-4 py-1 bg-green-600 text-white rounded">
        Upload
      </button>
      <p className="mt-2 text-sm text-gray-600">{status}</p>
    </div>
  );
}
