import React, { useState } from "react";

type Props = {
  onUploaded?: () => void;
};

export default function KmlUploader({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const API = (import.meta as any).env?.VITE_API_BASE || "/api";

  const upload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setStatus("Uploading...");
    try {
      const res = await fetch(`${API}/v1/kml/import`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        try {
          const err = await res.json();
          setStatus(`Error: ${err.detail || res.statusText}`);
        } catch {
          setStatus(`Error: ${res.status} ${res.statusText}`);
        }
        return;
      }
      const data = await res.json();
      setStatus(`Imported ${data.imported} paddocks`);
      onUploaded?.();
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
