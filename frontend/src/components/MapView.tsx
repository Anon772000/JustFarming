import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Popup, LayersControl, Circle } from 'react-leaflet'
import L, { LatLngExpression, LatLngTuple, DivIcon } from 'leaflet'

type Paddock = { id: number; name: string; area_ha: number; polygon_geojson: string }
type Mob = { id: number; name: string; count: number; avg_weight: number; paddock_id?: number | null }
type Movement = { id: number; mob_id: number; from_paddock_id?: number | null; to_paddock_id: number | null; timestamp: string }
type MobTypes = Record<number, string>

function parsePolygon(geojson: string): LatLngTuple[] {
  try {
    const gj = JSON.parse(geojson)
    const coords = gj.coordinates?.[0] || []
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

const animalEmoji: Record<string, string> = {
  cow: '🐄', sheep: '🐑', goat: '🐐', pig: '🐖', horse: '🐴', chicken: '🐔', deer: '🦌', alpaca: '🦙', camel: '🐫', other: '🐾'
}
function makeEmojiIcon(emoji: string): DivIcon {
  return L.divIcon({ className: 'mob-marker', html: emoji, iconSize: [24,24], iconAnchor: [12,12] })
}

export default function MapView({ paddocks, mobs, movements, mobTypes }: { paddocks: Paddock[]; mobs: Mob[]; movements: Movement[]; mobTypes: MobTypes }) {
  const center: LatLngTuple = [-31.9, 148.6]
  const [userPos, setUserPos] = useState<LatLngTuple | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude])
        setAccuracy(pos.coords.accuracy || null)
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    )
    return () => navigator.geolocation && navigator.geolocation.clearWatch(watchId)
  }, [])

  const paddockPolys = useMemo(() => {
    const map = new Map<number, LatLngTuple[]>()
    for (const p of paddocks) {
      map.set(p.id, parsePolygon(p.polygon_geojson))
    }
    return map
  }, [paddocks])

  const paddockNames = useMemo(() => {
    const map = new Map<number, string>()
    paddocks.forEach(p => map.set(p.id, p.name))
    return map
  }, [paddocks])

  function lastMoveToPaddock(mobId: number, toPaddockId: number | null | undefined) {
    if (toPaddockId === undefined) return undefined
    let latest: Movement | undefined
    for (const mv of movements) {
      if (mv.mob_id === mobId && mv.to_paddock_id === toPaddockId) {
        if (!latest || new Date(mv.timestamp) > new Date(latest.timestamp)) {
          latest = mv
        }
      }
    }
    return latest
  }

  function formatDate(d?: string) {
    if (!d) return '-'
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '-'
    return dt.toLocaleDateString()
  }

  function daysSince(d?: string) {
    if (!d) return undefined
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return undefined
    const now = new Date()
    const diff = Math.floor((now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 ? diff : 0
  }

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
        const move = lastMoveToPaddock(m.id, m.paddock_id ?? null)
        const movedDate = move?.timestamp
        const days = daysSince(movedDate)
        const paddockName = m.paddock_id ? paddockNames.get(m.paddock_id) : undefined
        const typeKey = mobTypes[m.id] || 'cow'
        const icon = makeEmojiIcon(animalEmoji[typeKey] || '🐄')
        return (
          <Marker key={m.id} position={pos} icon={icon}>
            <Popup>
              <strong>{m.name}</strong><br/>
              Count: {m.count}
              <br/>Paddock: {paddockName ?? 'Unassigned'}
              <br/>Moved: {formatDate(movedDate)}{typeof days === 'number' ? (<><br/>Days on paddock: {days}</>) : null}
            </Popup>
          </Marker>
        )
      })}

      {userPos && (
        <>
          <Marker position={userPos} icon={makeEmojiIcon('📍')}>
            <Popup>You are here</Popup>
          </Marker>
          {accuracy && <Circle center={userPos as LatLngExpression} radius={accuracy} pathOptions={{ color: '#2563eb', fillOpacity: 0.1 }} />}
        </>
      )}
    </MapContainer>
  )
}
