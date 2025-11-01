import React, { useEffect, useState } from 'react'
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%' }}>
      <div style={{ padding: 16, borderRight: '1px solid #ddd' }}>
        <h2>JustFarming</h2>
        <h3>Import KML</h3>
        <KmlUploader onUploaded={load} />
        
        <h3>Create Paddock</h3>
        <input value={newPaddockName} onChange={e => setNewPaddockName(e.target.value)} placeholder="Name" /><br />
        <input type="number" value={newPaddockArea} onChange={e => setNewPaddockArea(parseFloat(e.target.value))} placeholder="Area (ha)" /><br />
        <textarea value={newPaddockGeoJSON} onChange={e => setNewPaddockGeoJSON(e.target.value)} rows={6} style={{ width: '100%' }} />
        <button onClick={createPaddock}>Add Paddock</button>

        <h3 style={{ marginTop: 24 }}>Create Mob</h3>
        <input value={newMobName} onChange={e => setNewMobName(e.target.value)} placeholder="Name" /><br />
        <input type="number" value={newMobCount} onChange={e => setNewMobCount(parseInt(e.target.value))} placeholder="Count" /><br />
        <button onClick={createMob}>Add Mob</button>

        <p style={{ marginTop: 24 }}><small>API: {API}</small></p>
      </div>
      <MapView paddocks={paddocks} mobs={mobs} />
    </div>
  )
}
