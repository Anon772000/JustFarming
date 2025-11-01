import React, { useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView'
import axios from 'axios'
import KmlUploader from "./components/KmlUploader";

const API = (import.meta as any).env?.VITE_API_BASE || '/api'

type Paddock = { id: number; name: string; area_ha: number; polygon_geojson: string }
type Mob = { id: number; name: string; count: number; avg_weight: number; paddock_id?: number | null }

export default function App() {
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [mobs, setMobs] = useState<Mob[]>([])
  const [newPaddockName, setNewPaddockName] = useState('North 1')
  const [newPaddockArea, setNewPaddockArea] = useState(10)
  const [newPaddockGeoJSON, setNewPaddockGeoJSON] = useState('{"type":"Polygon","coordinates":[[[148.6,-31.9],[148.61,-31.9],[148.61,-31.91],[148.6,-31.91],[148.6,-31.9]]]}')

  const [newMobName, setNewMobName] = useState('Heifers A')
  const [newMobCount, setNewMobCount] = useState(50)

  const load = async () => {
    const [pRes, mRes] = await Promise.all([
      axios.get(`${API}/v1/paddocks/`),
      axios.get(`${API}/v1/mobs/`)
    ])
    setPaddocks(pRes.data)
    setMobs(mRes.data)
  }

  useEffect(() => { load() }, [])

  const createPaddock = async () => {
    await axios.post(`${API}/v1/paddocks/`, {
      name: newPaddockName,
      area_ha: newPaddockArea,
      polygon_geojson: newPaddockGeoJSON
    })
    await load()
  }

  const createMob = async () => {
    await axios.post(`${API}/v1/mobs/`, {
      name: newMobName,
      count: newMobCount,
      avg_weight: 0,
      paddock_id: paddocks[0]?.id ?? null
    })
    await load()
  }

  const transferMob = async (mobId: number, toPaddockId: number | null) => {
    const mob = mobs.find(m => m.id === mobId)
    if (!mob) return
    await axios.post(`${API}/v1/movements/`, {
      mob_id: mobId,
      from_paddock_id: mob.paddock_id ?? null,
      to_paddock_id: toPaddockId
    })
    await load()
  }

  const paddockLookup = useMemo(() => {
    const map = new Map<number, Paddock>()
    paddocks.forEach(p => map.set(p.id, p))
    return map
  }, [paddocks])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb' }}>
        <div className="sidebar-header">
          <h2 className="sidebar-header__title">JustFarming</h2>
          <div className="sidebar-header__subtitle">Field management</div>
        </div>
        <div style={{ padding: 16 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>Import KML</h3>
          <KmlUploader onUploaded={load} />
          <h3 className="section-title">Create Paddock</h3>
          <input className="input" value={newPaddockName} onChange={e => setNewPaddockName(e.target.value)} placeholder="Name" style={{ marginBottom: 8 }} />
          <input className="input" type="number" value={newPaddockArea} onChange={e => setNewPaddockArea(parseFloat(e.target.value))} placeholder="Area (ha)" style={{ marginBottom: 8 }} />
          <textarea className="textarea" value={newPaddockGeoJSON} onChange={e => setNewPaddockGeoJSON(e.target.value)} rows={6} style={{ marginBottom: 8 }} />
          <button className="btn btn--primary" onClick={createPaddock}>Add Paddock</button>

          <h3 className="section-title">Create Mob</h3>
          <input className="input" value={newMobName} onChange={e => setNewMobName(e.target.value)} placeholder="Name" style={{ marginBottom: 8 }} />
          <input className="input" type="number" value={newMobCount} onChange={e => setNewMobCount(parseInt(e.target.value))} placeholder="Count" style={{ marginBottom: 8 }} />
          <button className="btn btn--primary" onClick={createMob}>Add Mob</button>

          <h3 className="section-title">Mobs</h3>
          <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            {mobs.length === 0 && <div style={{ padding: 8, fontSize: 13, color: '#6b7280' }}>No mobs yet</div>}
            {mobs.map(m => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr', padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontWeight: 600 }}>{m.name} <span style={{ fontWeight: 400, color: '#6b7280' }}>({m.count})</span></div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <select className="select" defaultValue={m.paddock_id ?? ''} onChange={e => transferMob(m.id, e.target.value ? parseInt(e.target.value) : null)} style={{ flex: 1 }}>
                    <option value="">Unassigned</option>
                    {paddocks.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{m.paddock_id ? paddockLookup.get(m.paddock_id)?.name : 'No paddock'}</span>
                </div>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 24 }}><small style={{ color: '#6b7280' }}>API: {API}</small></p>
        </div>
      </div>
      <MapView paddocks={paddocks} mobs={mobs} />
    </div>
  )
}
