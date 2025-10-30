import React from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet'
import L, { LatLngTuple } from 'leaflet'

type Paddock = { id: number; name: string; area_ha: number; polygon_geojson: string }
type Mob = { id: number; name: string; count: number; avg_weight: number; paddock_id?: number | null }

function parsePolygon(geojson: string): LatLngTuple[] {
  try {
    const gj = JSON.parse(geojson)
    const coords = gj.coordinates?.[0] || []
    // GeoJSON is [lng, lat]. Leaflet expects [lat, lng].
    return coords.map((c: number[]) => [c[1], c[0]]) as LatLngTuple[]
  } catch {
    return []
  }
}

export default function MapView({ paddocks, mobs }: { paddocks: Paddock[]; mobs: Mob[] }) {
  const center: LatLngTuple = [-31.9, 148.6]

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {paddocks.map(p => (
        <Polygon key={p.id} positions={parsePolygon(p.polygon_geojson)}>
          <Popup>
            <strong>{p.name}</strong><br/>
            Area: {p.area_ha} ha
          </Popup>
        </Polygon>
      ))}

      {mobs.map(m => (
        <Marker key={m.id} position={center}>
          <Popup>
            <strong>{m.name}</strong><br/>
            Count: {m.count}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
