import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Popup, LayersControl, Circle, LayerGroup, Polyline, useMap } from 'react-leaflet'
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
  return L.divIcon({ className: 'mob-marker', html: emoji, iconSize: [24, 24], iconAnchor: [12, 12] })
}

export default function MapView({ paddocks, mobs, movements, mobTypes, selectedMobId, mobDOBs, onOpenMenu }: { paddocks: Paddock[]; mobs: Mob[]; movements: Movement[]; mobTypes: MobTypes; selectedMobId?: number | null; mobDOBs?: Record<number, string>; onOpenMenu?: () => void }) {
  const center: LatLngTuple = [-31.9, 148.6]
  const [userPos, setUserPos] = useState<LatLngTuple | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [gpsOn, setGpsOn] = useState<boolean>(true)

  useEffect(() => {
    if (!navigator.geolocation || !gpsOn) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude])
        setAccuracy(pos.coords.accuracy || null)
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    )
    return () => navigator.geolocation && navigator.geolocation.clearWatch(watchId)
  }, [gpsOn])

  const paddockPolys = useMemo(() => {
    const map = new Map<number, LatLngTuple[]>()
    for (const p of paddocks) map.set(p.id, parsePolygon(p.polygon_geojson))
    return map
  }, [paddocks])

  const paddockNames = useMemo(() => {
    const map = new Map<number, string>()
    paddocks.forEach(p => map.set(p.id, p.name))
    return map
  }, [paddocks])

  const centroidByPaddock = useMemo(() => {
    const m = new Map<number, LatLngTuple>()
    for (const [id, pts] of paddockPolys.entries()) {
      const c = centroidLatLng(pts)
      if (c) m.set(id, c)
    }
    return m
  }, [paddockPolys])

  const pathSegments: LatLngTuple[][] = useMemo(() => {
    if (!selectedMobId) return []
    const moves = movements
      .filter(x => x.mob_id === selectedMobId)
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const segs: LatLngTuple[][] = []
    for (const mv of moves) {
      const from = mv.from_paddock_id != null ? centroidByPaddock.get(mv.from_paddock_id) : undefined
      const to = mv.to_paddock_id != null ? centroidByPaddock.get(mv.to_paddock_id) : undefined
      if (from && to) segs.push([from, to])
    }
    return segs
  }, [selectedMobId, movements, centroidByPaddock])

  function lastMoveToPaddock(mobId: number, toPaddockId: number | null | undefined) {
    if (toPaddockId === undefined) return undefined
    let latest: Movement | undefined
    for (const mv of movements) {
      if (mv.mob_id === mobId && mv.to_paddock_id === toPaddockId) {
        if (!latest || new Date(mv.timestamp) > new Date(latest.timestamp)) latest = mv
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

  function bezierCurve(from: LatLngTuple, to: LatLngTuple, samples = 16): LatLngTuple[] {
    const [lat1, lng1] = from
    const [lat2, lng2] = to
    const dx = lng2 - lng1
    const dy = lat2 - lat1
    const len = Math.sqrt(dx*dx + dy*dy) || 1
    const nx = -(dy / len)
    const ny = dx / len
    const offset = 0.2 * len
    const cx = (lng1 + lng2) / 2 + nx * offset
    const cy = (lat1 + lat2) / 2 + ny * offset
    const pts: LatLngTuple[] = []
    for (let i=0; i<=samples; i++) {
      const t = i / samples
      const x = (1-t)*(1-t)*lng1 + 2*(1-t)*t*cx + t*t*lng2
      const y = (1-t)*(1-t)*lat1 + 2*(1-t)*t*cy + t*t*lat2
      pts.push([y, x])
    }
    return pts
  }

  function arrowHeads(from: LatLngTuple, to: LatLngTuple): LatLngTuple[][] {
    const [lat1, lng1] = from
    const [lat2, lng2] = to
    const dx = lng2 - lng1
    const dy = lat2 - lat1
    const angle = Math.atan2(dy, dx)
    const segLen = Math.sqrt(dx*dx + dy*dy) || 1
    const headLen = segLen * 0.2
    const alpha = 25 * Math.PI/180
    const pointAt = (ang: number): LatLngTuple => [lat2 - headLen*Math.sin(ang), lng2 - headLen*Math.cos(ang)]
    const left = pointAt(angle - alpha)
    const right = pointAt(angle + alpha)
    return [[to, left], [to, right]]
  }

  function FitToPath({ segments }: { segments: LatLngTuple[][] }) {
    const map = useMap()
    useEffect(() => {
      if (!segments || segments.length === 0) return
      const pts: LatLngTuple[] = []
      segments.forEach(seg => { pts.push(seg[0], seg[1]) })
      map.fitBounds(L.latLngBounds(pts as any).pad(0.2))
    }, [segments])
    return null
  }

  function Controls() {
    const map = useMap()
    return (
      <div className='map-controls'>
        <button className='control-btn' onClick={() => onOpenMenu && onOpenMenu()}>Menu</button>
        <button className='control-btn' onClick={() => { if (userPos) map.flyTo(userPos as any, 16) }}>Locate</button>
        <button className='control-btn' onClick={() => setGpsOn(s => !s)}>{gpsOn ? 'GPS: On' : 'GPS: Off'}</button>
      </div>
    )
  }

  return (
    <MapContainer center={center} zoom={13} className='map-container'>
      <LayersControl position='topright'>
        <LayersControl.BaseLayer checked name='Satellite'>
          <TileLayer
            attribution='Tiles (c) Esri - Sources: Esri, Maxar, Earthstar Geographics, GIS User Community'
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
            attribution='Labels (c) Esri - World Boundaries and Places (Reference)'
            url='https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            zIndex={2}
          />
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name='Paddocks'>
          <LayerGroup>
            {paddocks.map(p => (
              <Polygon key={p.id} positions={parsePolygon(p.polygon_geojson)}>
                <Popup>
                  <strong>{p.name}</strong><br/>
                  Area: {p.area_ha} ha
                </Popup>
              </Polygon>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name='Mobs'>
          <LayerGroup>
            {mobs.map(m => {
              const poly = m.paddock_id ? paddockPolys.get(m.paddock_id) : undefined
              const pos = poly && poly.length ? (centroidLatLng(poly) as LatLngExpression) : (center as LatLngExpression)
              const move = lastMoveToPaddock(m.id, m.paddock_id ?? null)
              const movedDate = move?.timestamp
              const days = daysSince(movedDate)
              const paddockName = m.paddock_id ? paddockNames.get(m.paddock_id) : undefined
              const typeKey = mobTypes[m.id] || 'cow'
              const icon = makeEmojiIcon(animalEmoji[typeKey] || '🐄')
              const age = mobDOBs && mobDOBs[m.id] ? Math.max(0, Math.floor(((daysSince(mobDOBs[m.id])||0))/365)) : undefined
              return (
                <Marker key={m.id} position={pos} icon={icon}>
                  <Popup>
                    <strong>{m.name}{age!=null?` (${age}y)`:''}</strong><br/>
                    Count: {m.count}
                    <br/>Paddock: {paddockName ?? 'Unassigned'}
                    <br/>Moved: {formatDate(movedDate)}{typeof days === 'number' ? (<><br/>Days on paddock: {days}</>) : null}
                  </Popup>
                </Marker>
              )
            })}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay name='My Location'>
          <LayerGroup>
            {userPos && (
              <>
                <Marker position={userPos} icon={makeEmojiIcon('📍')}>
                  <Popup>You are here</Popup>
                </Marker>
                {accuracy && <Circle center={userPos as LatLngExpression} radius={accuracy} pathOptions={{ color: '#2563eb', fillOpacity: 0.1 }} />}
              </>
            )}
          </LayerGroup>
        </LayersControl.Overlay>

        {selectedMobId && pathSegments.length > 0 && (
          <LayersControl.Overlay checked name='Selected Mob Path'>
            <LayerGroup>
              {pathSegments.map((seg, idx) => {
                const curve = bezierCurve(seg[0], seg[1])
                const heads = arrowHeads(seg[0], seg[1])
                return (
                  <React.Fragment key={idx}>
                    <Polyline positions={curve as LatLngExpression[]} pathOptions={{ color: '#d97706', weight: 4, opacity: 0.9 }} />
                    {heads.map((h, i) => (
                      <Polyline key={i} positions={h as LatLngExpression[]} pathOptions={{ color: '#d97706', weight: 3 }} />
                    ))}
                  </React.Fragment>
                )
              })}
              <FitToPath segments={pathSegments} />
            </LayerGroup>
          </LayersControl.Overlay>
        )}
      </LayersControl>
      <Controls />
    </MapContainer>
  )
}

