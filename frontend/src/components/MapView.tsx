import React, { useMemo } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Popup, LayersControl } from 'react-leaflet'
import L, { LatLngExpression, LatLngTuple, DivIcon } from 'leaflet'

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

function centroidLatLng(points: LatLngTuple[]): LatLngTuple | null {
  if (!points || points.length === 0) return null
  const n = points.length
  let sumLat = 0
  let sumLng = 0
  for (const [lat, lng] of points) {
    sumLat += lat
    sumLng += lng
  }
  return [sumLat / n, sumLng / n]
}

const mobIcon: DivIcon = L.divIcon({
  className: 'mob-marker',
  html: '🐄',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
})

export default function MapView({ paddocks, mobs }: { paddocks: Paddock[]; mobs: Mob[] }) {
  const center: LatLngTuple = [-31.9, 148.6]

  const paddockPolys = useMemo(() => {
    const map = new Map<number, LatLngTuple[]>()
    for (const p of paddocks) {
      map.set(p.id, parsePolygon(p.polygon_geojson))
    }
    return map
  }, [paddocks])

  return (
    <MapContainer center={center} zoom={13} className='map-container'>
      <LayersControl position='topright'>
        <LayersControl.BaseLayer checked name='Satellite'>
          <TileLayer
            attribution='Tiles (c) Esri — Sources: Esri, Maxar, Earthstar Geographics, GIS User Community'
            url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name='Streets'>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name='Labels'>
          <TileLayer
            attribution='Labels (c) Esri — World Boundaries and Places (Reference)'
            url='https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            zIndex={2}
          />
        </LayersControl.Overlay>
      </LayersControl>

      {paddocks.map(p => (
        <Polygon key={p.id} positions={parsePolygon(p.polygon_geojson)}>
          <Popup>
            <strong>{p.name}</strong><br/>
            Area: {p.area_ha} ha
          </Popup>
        </Polygon>
      ))}

      {mobs.map(m => {
        const poly = m.paddock_id ? paddockPolys.get(m.paddock_id) : undefined
        const pos = poly && poly.length ? (centroidLatLng(poly) as LatLngExpression) : (center as LatLngExpression)
        return (
          <Marker key={m.id} position={pos} icon={mobIcon}>
            <Popup>
              <strong>{m.name}</strong><br/>
              Count: {m.count}{m.paddock_id ? (<><br/>Paddock ID: {m.paddock_id}</>) : null}
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
