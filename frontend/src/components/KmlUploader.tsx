import React, { useState } from "react";

type Props = {
  onUploaded?: () => void;
};

export default function KmlUploader({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<null | {
    imported?: number;
    placemarks?: number;
    polygon_placemarks?: number;
    non_polygon_placemarks?: number;
    geom_types?: Record<string, number>;
  }>(null);
  const API = (import.meta as any).env?.VITE_API_BASE || "/api";

  const upload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setStatus("Uploading...");
    try {
      setSummary(null);
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
      setSummary(data);
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
      {summary && (
        <div className="mt-2 text-xs text-gray-700">
          {typeof summary.placemarks === 'number' && (
            <div>Total placemarks: {summary.placemarks}</div>
          )}
          {typeof summary.polygon_placemarks === 'number' && (
            <div>With polygons: {summary.polygon_placemarks}</div>
          )}
          {typeof summary.non_polygon_placemarks === 'number' && (
            <div>Without polygons: {summary.non_polygon_placemarks}</div>
          )}
          {summary.geom_types && (
            <div>
              Geometry types:
              <ul>
                {Object.entries(summary.geom_types).map(([k, v]) => (
                  <li key={k}>{k}: {v}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
