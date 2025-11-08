import React, { useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView'
import axios from 'axios'
import KmlUploader from "./components/KmlUploader";
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const API = (import.meta as any).env?.VITE_API_BASE || '/api'

// Crop type to default color palette
const cropPalette: Record<string, string> = {
  'Wheat / Barley': '#E5C07B',
  'Corn / Maize': '#B5E550',
  'Canola / Rapeseed': '#FFD700',
  'Cotton': '#D9D9D9',
  'Soybeans': '#4CAF50',
  'Sorghum': '#B74E25',
  'Lucerne / Alfalfa': '#A4DE02',
  'Pasture / Mixed Grazing': '#2E7D32',
  'Fallow / Bare Soil': '#8B5A2B',
  'Vegetables (general)': '#3DBF8A',
  'Orchards / Trees': '#556B2F',
  'Vineyards / Grapes': '#6B4C9A',
}

type Paddock = { id: number; name: string; area_ha: number; polygon_geojson: string; crop_type?: string | null; crop_color?: string | null }
type Mob = { id: number; name: string; count: number; avg_weight: number; paddock_id?: number | null }
type Movement = { id: number; mob_id: number; from_paddock_id?: number | null; to_paddock_id: number | null; timestamp: string }
type Ram = { id: number; name: string; tag_id?: string | null; notes?: string | null }

export default function App() {
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [mobs, setMobs] = useState<Mob[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [historyMobId, setHistoryMobId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [newMobName, setNewMobName] = useState('Group A')
  const [newMobCount, setNewMobCount] = useState(50)
  const [mobTypes, setMobTypes] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('mobTypes') || '{}') } catch { return {} }
  })
  useEffect(() => { localStorage.setItem('mobTypes', JSON.stringify(mobTypes)) }, [mobTypes])
  const [mobDOBs, setMobDOBs] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('mobDOBs') || '{}') } catch { return {} }
  })
  useEffect(() => { localStorage.setItem('mobDOBs', JSON.stringify(mobDOBs)) }, [mobDOBs])
  const [mobTags, setMobTags] = useState<Record<number, { ear: 'left'|'right'|'unknown'; color: string; label?: string }[]>>(() => {
    try { return JSON.parse(localStorage.getItem('mobTags') || '{}') } catch { return {} }
  })
  useEffect(() => { localStorage.setItem('mobTags', JSON.stringify(mobTags)) }, [mobTags])
  const [rams, setRams] = useState<Ram[]>([])
  const [selectedPaddockId, setSelectedPaddockId] = useState<number | ''>('')
  const [cropType, setCropType] = useState('')
  const [cropColor, setCropColor] = useState('#62a554')
  // Inline tag form state
  const [tagFormOpen, setTagFormOpen] = useState<Record<number, boolean>>({})
  const [tagEar, setTagEar] = useState<Record<number, 'left'|'right'|'unknown'>>({})
  const [tagColor, setTagColor] = useState<Record<number, string>>({})
  const [tagLabel, setTagLabel] = useState<Record<number, string>>({})

  const load = async () => {
    const [pRes, mRes, mvRes, rRes] = await Promise.all([
      axios.get(`${API}/v1/paddocks/`),
      axios.get(`${API}/v1/mobs/`),
      axios.get(`${API}/v1/movements/`),
      axios.get(`${API}/v1/sheep/rams`)
    ])
    setPaddocks(pRes.data)
    setMobs(mRes.data)
    setMovements(mvRes.data)
    setRams(rRes.data)
  }

  useEffect(() => { load() }, [])

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

  function ageFromDOB(d?: string) {
    if (!d) return undefined
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return undefined
    const now = new Date()
    const years = now.getFullYear() - dt.getFullYear()
    const m = now.getMonth() - dt.getMonth()
    const adj = (m < 0 || (m === 0 && now.getDate() < dt.getDate())) ? -1 : 0
    return years + adj
  }

  return (
    <div className="app-shell">
      {/* Mobile top bar */}
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><span /></button>
        <div className="topbar__title">JustFarming</div>
      </div>
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <div className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb' }}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="sidebar-header__title" style={{ margin: 0 }}>JustFarming</h2>
            <button className="btn btn--ghost" onClick={() => setSidebarOpen(false)}>Close</button>
          </div>
          <div className="sidebar-header__subtitle">Field management</div>
        </div>
        <div style={{ padding: 16 }}>
          <button className="btn btn--ghost" onClick={() => setSidebarOpen(false)}>Close Menu</button>
          <h3 className="section-title" style={{ marginTop: 0 }}>Import KML</h3>
          <KmlUploader onUploaded={load} />

          <h3 className="section-title form-compact">Create Mob</h3>
          <div className="form-compact">
            <input className="input" value={newMobName} onChange={e => setNewMobName(e.target.value)} placeholder="Name" style={{ marginBottom: 8 }} />
            <input className="input" type="number" value={newMobCount} onChange={e => setNewMobCount(parseInt(e.target.value))} placeholder="Count" style={{ marginBottom: 8 }} />
            <button className="btn btn--primary" onClick={createMob}>Add Mob</button>
          </div>
          
          <h3 className="section-title form-compact">Rams</h3>
          <div className="panel form-compact" style={{ padding: 8, marginBottom: 8 }}>
            <div style={{ maxHeight: 120, overflow: 'auto', marginBottom: 8 }}>
              {rams.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No rams yet</div>}
              {rams.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <strong>{r.name}</strong> {r.tag_id ? <span className="muted">({r.tag_id})</span> : null}
                    {r.notes ? <div className="muted" style={{ fontSize: 12 }}>{r.notes}</div> : null}
                  </div>
                </div>
              ))}
            </div>
            <AddRamForm onAdded={async()=>{ const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data) }} />
          </div>

          <h3 className="section-title form-compact">Field Ops</h3>
          <div className="form-compact panel" style={{ padding: 8, marginBottom: 8 }}>
            <select className="select" value={selectedPaddockId as any} onChange={e=>setSelectedPaddockId(e.target.value?parseInt(e.target.value):'')} style={{ marginBottom: 6 }}>
              <option value="">Select paddock</option>
              {paddocks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6 }}>
              <select
                className="select"
                value={cropType}
                onChange={e=>{
                  const t = e.target.value
                  setCropType(t)
                  if (cropPalette[t]) setCropColor(cropPalette[t])
                }}
              >
                <option value="">Crop type…</option>
                {Object.keys(cropPalette).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <input className="input" type="color" value={cropColor} onChange={e=>setCropColor(e.target.value)} title="Crop color" />
            </div>
            <button className="btn btn--primary" disabled={!selectedPaddockId} onClick={async()=>{
              if(!selectedPaddockId) return
              await axios.patch(`${API}/v1/paddocks/${selectedPaddockId}`, { crop_type: cropType || null, crop_color: cropColor || null })
              await load()
            }}>Save Type/Color</button>
            <div style={{ height: 8 }} />
            <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn" disabled={!selectedPaddockId} onClick={async()=>{
                if(!selectedPaddockId) return
                const chemical = prompt('Chemical?') || ''
                const rate = prompt('Rate? (e.g., 1.5 L/ha)') || ''
                if(!chemical) return
                await axios.post(`${API}/v1/fields/spraying`, { paddock_id: selectedPaddockId, chemical, rate: rate || null })
              }}>+ Spraying</button>
              <button className="btn" disabled={!selectedPaddockId} onClick={async()=>{
                if(!selectedPaddockId) return
                const seed = prompt('Seed/Species?') || ''
                const rate = prompt('Sowing rate?') || ''
                if(!seed) return
                await axios.post(`${API}/v1/fields/sowing`, { paddock_id: selectedPaddockId, seed, rate: rate || null })
              }}>+ Sowing</button>
              <button className="btn" disabled={!selectedPaddockId} onClick={async()=>{
                if(!selectedPaddockId) return
                const product = prompt('Fertiliser product?') || ''
                const rate = prompt('Rate?') || ''
                if(!product) return
                await axios.post(`${API}/v1/fields/fertiliser`, { paddock_id: selectedPaddockId, product, rate: rate || null })
              }}>+ Fertiliser</button>
              <button className="btn" disabled={!selectedPaddockId} onClick={async()=>{
                if(!selectedPaddockId) return
                await axios.post(`${API}/v1/fields/cut`, { paddock_id: selectedPaddockId })
              }}>+ Cut</button>
              <button className="btn" disabled={!selectedPaddockId} onClick={async()=>{
                if(!selectedPaddockId) return
                const kind = prompt('Harvest type (bale/harvest)?', 'bale') || 'bale'
                const amount = prompt('Amount (e.g., 120 bales or 3.2 t)?') || ''
                await axios.post(`${API}/v1/fields/harvest`, { paddock_id: selectedPaddockId, kind, amount: amount || null })
              }}>+ Harvest</button>
            </div>
          </div>

          <h3 className="section-title form-compact">Mobs</h3>
          <div className="form-compact" style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            {mobs.length === 0 && <div style={{ padding: 8, fontSize: 13, color: '#6b7280' }}>No mobs yet</div>}
            {mobs.map(m => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr', padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontWeight: 600 }}>
                  {m.name}
                  {mobDOBs[m.id] && <span style={{ fontWeight: 400, color: '#6b7280' }}> ({ageFromDOB(mobDOBs[m.id]) ?? ''}y)</span>}
                  <span style={{ fontWeight: 400, color: '#6b7280' }}> ({m.count})</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <select
                    className="select"
                    value={m.paddock_id ?? ''}
                    onChange={e => transferMob(m.id, e.target.value ? parseInt(e.target.value) : null)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Unassigned</option>
                    {paddocks.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    className="select"
                    value={mobTypes[m.id] || 'cow'}
                    onChange={e => setMobTypes(prev => ({ ...prev, [m.id]: e.target.value }))}
                  >
                    <option value="cow">Cattle</option>
                    <option value="sheep">Sheep</option>
                    <option value="goat">Goat</option>
                    <option value="pig">Pig</option>
                    <option value="horse">Horse</option>
                    <option value="chicken">Chicken</option>
                    <option value="deer">Deer</option>
                    <option value="alpaca">Alpaca</option>
                    <option value="camel">Camel</option>
                    <option value="other">Other</option>
                  </select>
                  <input className="input" type="date" value={mobDOBs[m.id] || ''} onChange={e => setMobDOBs(prev => ({ ...prev, [m.id]: e.target.value }))} style={{ maxWidth: 140 }} />
                  <button className="btn btn--ghost" onClick={() => setHistoryMobId(m.id)}>History</button>
                  <input
                    className="input"
                    type="number"
                    defaultValue={m.avg_weight}
                    placeholder="Approx weight (kg)"
                    onBlur={async (e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) {
                        await axios.patch(`${API}/v1/mobs/${m.id}`, { avg_weight: val })
                        await load()
                      }
                    }}
                    style={{ width: 140 }}
                  />
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{m.paddock_id ? paddockLookup.get(m.paddock_id)?.name : 'No paddock'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(mobTags[m.id] || []).map((t, idx) => (
                    <span key={idx} title={`${t.ear} ${t.label || ''}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 6px', borderRadius: 999, background: t.color, color: '#fff', fontSize: 11 }}>
                      {t.label || t.ear}
                      <button
                        className="btn"
                        style={{ background: '#0006', color: '#fff', padding: '0 6px', borderRadius: 999, fontSize: 11, lineHeight: '18px' }}
                        onClick={() => {
                          setMobTags(prev => {
                            const arr = [...(prev[m.id] || [])]
                            arr.splice(idx, 1)
                            return { ...prev, [m.id]: arr }
                          })
                        }}
                        aria-label="Remove tag"
                      >×</button>
                    </span>
                  ))}
                </div>
                <div className="form-compact" style={{ marginTop: 6 }}>
                  {!tagFormOpen[m.id] ? (
                    <button className="btn btn--ghost" onClick={() => setTagFormOpen(prev => ({ ...prev, [m.id]: true }))}>+ Tag</button>
                  ) : (
                    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                      <select
                        className="select"
                        value={tagEar[m.id] || 'left'}
                        onChange={e => setTagEar(prev => ({ ...prev, [m.id]: e.target.value as any }))}
                        aria-label="Tag ear"
                      >
                        <option value="left">Left ear</option>
                        <option value="right">Right ear</option>
                        <option value="unknown">Unknown</option>
                      </select>
                      <input
                        className="input"
                        type="color"
                        value={tagColor[m.id] || '#10b981'}
                        onChange={e => setTagColor(prev => ({ ...prev, [m.id]: e.target.value }))}
                        aria-label="Tag color"
                      />
                      <input
                        className="input"
                        placeholder="Label"
                        value={tagLabel[m.id] || ''}
                        onChange={e => setTagLabel(prev => ({ ...prev, [m.id]: e.target.value }))}
                        aria-label="Tag label"
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn--primary"
                          onClick={() => {
                            const ear = (tagEar[m.id] || 'left') as 'left'|'right'|'unknown'
                            const color = tagColor[m.id] || '#10b981'
                            const label = (tagLabel[m.id] || '').trim() || undefined
                            setMobTags(prev => ({ ...prev, [m.id]: [...(prev[m.id] || []), { ear, color, label }] }))
                            setTagFormOpen(prev => ({ ...prev, [m.id]: false }))
                            setTagLabel(prev => ({ ...prev, [m.id]: '' }))
                          }}
                        >Add</button>
                        <button className="btn" onClick={() => setTagFormOpen(prev => ({ ...prev, [m.id]: false }))}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 24 }}><small style={{ color: '#6b7280' }}>API: {API}</small></p>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <MapView paddocks={paddocks} mobs={mobs} movements={movements} mobTypes={mobTypes} selectedMobId={historyMobId} mobDOBs={mobDOBs} onOpenMenu={() => setSidebarOpen(true)} />
      </div>

      {historyMobId !== null && (
        <HistoryModal
          mob={mobs.find(x => x.id === historyMobId)!}
          paddocks={paddocks}
          movements={movements.filter(x => x.mob_id === historyMobId)}
          onClose={() => setHistoryMobId(null)}
        />
      )}
    </div>
  )
}


function HistoryModal({ mob, paddocks, movements, onClose }: { mob: Mob; paddocks: Paddock[]; movements: Movement[]; onClose: () => void }) {
  const [tab, setTab] = useState<'moves' | 'health' | 'metrics'>('moves')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [pfilter, setPfilter] = useState('')
  const nameOf = (id?: number | null) => id ? (paddocks.find(p => p.id === id)?.name || `Paddock ${id}`) : 'Unassigned'

  const filtered = useMemo(() => {
    const s = start ? new Date(start) : null
    const e = end ? new Date(end) : null
    const pid = pfilter ? parseInt(pfilter) : null
    return movements.filter(x => {
      const t = new Date(x.timestamp)
      if (s && t < s) return false
      if (e && t > e) return false
      if (pid && x.to_paddock_id !== pid && x.from_paddock_id !== pid) return false
      return true
    }).sort((a,b)=> new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [movements, start, end, pfilter])

  // Health records
  const [worming, setWorming] = useState<any[]>([])
  const [footbath, setFootbath] = useState<any[]>([])
  // Sheep-specific
  const [rams, setRams] = useState<any[]>([])
  const [joining, setJoining] = useState<any[]>([])
  const [marking, setMarking] = useState<any[]>([])
  const [weaning, setWeaning] = useState<any[]>([])
  const [flyTx, setFlyTx] = useState<any[]>([])
  const [paring, setParing] = useState<any[]>([])

  const loadHealth = async () => {
    const [w, f, r, j, mk, wn, ft, fp] = await Promise.all([
      axios.get(`${API}/v1/health/worming`, { params: { mob_id: mob.id } }),
      axios.get(`${API}/v1/health/footbath`, { params: { mob_id: mob.id } }),
      axios.get(`${API}/v1/sheep/rams`),
      axios.get(`${API}/v1/sheep/joining`, { params: { mob_id: mob.id } }),
      axios.get(`${API}/v1/sheep/marking`, { params: { mob_id: mob.id } }),
      axios.get(`${API}/v1/sheep/weaning`, { params: { mob_id: mob.id } }),
      axios.get(`${API}/v1/sheep/fly_treatment`, { params: { mob_id: mob.id } }),
      axios.get(`${API}/v1/sheep/foot_paring`, { params: { mob_id: mob.id } }),
    ])
    setWorming(w.data)
    setFootbath(f.data)
    setRams(r.data)
    setJoining(j.data)
    setMarking(mk.data)
    setWeaning(wn.data)
    setFlyTx(ft.data)
    setParing(fp.data)
  }
  useEffect(() => { if (tab !== 'moves') loadHealth() }, [tab])

  // Chart data for worm count over time
  const wormChart = useMemo(() => {
    const points = (worming || []).filter((r: any) => r.worm_count != null)
      .sort((a: any,b: any)=> new Date(a.date).getTime()-new Date(b.date).getTime())
    return {
      labels: points.map((r: any)=> new Date(r.date).toLocaleDateString()),
      datasets: [{ label: 'Worm Count', data: points.map((r:any)=> r.worm_count), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.2)' }]
    }
  }, [worming])

  // Simple forms
  const [drug, setDrug] = useState('')
  const [wormCount, setWormCount] = useState<number | ''>('')
  const [wDate, setWDate] = useState('')
  const [wNotes, setWNotes] = useState('')

  const [solution, setSolution] = useState('')
  const [conc, setConc] = useState('')
  const [fDate, setFDate] = useState('')
  const [fNotes, setFNotes] = useState('')

  const submitWorming = async () => {
    await axios.post(`${API}/v1/health/worming`, { mob_id: mob.id, date: wDate || undefined, drug, worm_count: wormCount === '' ? null : wormCount, notes: wNotes || undefined })
    setDrug(''); setWormCount(''); setWDate(''); setWNotes(''); await loadHealth()
  }
  const submitFootbath = async () => {
    await axios.post(`${API}/v1/health/footbath`, { mob_id: mob.id, date: fDate || undefined, solution, concentration: conc || undefined, notes: fNotes || undefined })
    setSolution(''); setConc(''); setFDate(''); setFNotes(''); await loadHealth()
  }

  // Sheep form states
  const [ramId, setRamId] = useState('')
  const [joinStart, setJoinStart] = useState('')
  const [joinNotes, setJoinNotes] = useState('')
  const [markDate, setMarkDate] = useState('')
  const [markNotes, setMarkNotes] = useState('')
  const [weanDate, setWeanDate] = useState('')
  const [weanCount, setWeanCount] = useState<number | ''>('')
  const [weanNotes, setWeanNotes] = useState('')
  const [flyDate, setFlyDate] = useState('')
  const [flyChem, setFlyChem] = useState('')
  const [flyRate, setFlyRate] = useState('')
  const [flyNotes, setFlyNotes] = useState('')
  const [fpDate, setFpDate] = useState('')
  const [fpNotes, setFpNotes] = useState('')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="panel" style={{ width: 860, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>History — {mob.name}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn" onClick={()=>setTab('moves')}>Movements</button>
          <button className="btn" onClick={()=>setTab('health')}>Health</button>
          <button className="btn" onClick={()=>setTab('metrics')}>Metrics</button>
        </div>

        {tab === 'moves' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, margin: '8px 0' }}>
              <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} />
              <input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} />
              <select className="select" value={pfilter} onChange={e => setPfilter(e.target.value)}>
                <option value="">Any paddock</option>
                {paddocks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div />
            </div>
            {filtered.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No movements recorded.</div>}
            <div>
              {filtered.map((mv, idx) => (
                <div key={mv.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto 1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'center' }}>
                  <div className="panel" style={{ width: 24, height: 24, borderRadius: 999, textAlign: 'center', lineHeight: '24px', fontSize: 12 }}>{filtered.length - idx}</div>
                  <div>{nameOf(mv.from_paddock_id)}</div>
                  <div className="muted">→</div>
                  <div>{nameOf(mv.to_paddock_id)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{new Date(mv.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'health' && (
          <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <h4 className="section-title">Add Worming</h4>
              <input className="input" placeholder="Drug" value={drug} onChange={e=>setDrug(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="input" type="number" placeholder="Worm count" value={wormCount as any} onChange={e=>setWormCount(e.target.value === '' ? '' : parseInt(e.target.value))} style={{ marginBottom: 6 }} />
              <input className="input" type="date" value={wDate} onChange={e=>setWDate(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="input" placeholder="Notes" value={wNotes} onChange={e=>setWNotes(e.target.value)} style={{ marginBottom: 6 }} />
              <button className="btn btn--primary" onClick={submitWorming}>Save</button>
              <div style={{ marginTop: 10 }}>
                <h4 className="section-title">History</h4>
                {worming.map((r:any)=> (
                  <div key={r.id} className="muted" style={{ fontSize: 12 }}>
                    {new Date(r.date).toLocaleDateString()} — {r.drug}{r.worm_count!=null?` (count ${r.worm_count})`:''} {r.notes?`— ${r.notes}`:''}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="section-title">Add Footbath</h4>
              <input className="input" placeholder="Solution" value={solution} onChange={e=>setSolution(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="input" placeholder="Concentration" value={conc} onChange={e=>setConc(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="input" type="date" value={fDate} onChange={e=>setFDate(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="input" placeholder="Notes" value={fNotes} onChange={e=>setFNotes(e.target.value)} style={{ marginBottom: 6 }} />
              <button className="btn btn--primary" onClick={submitFootbath}>Save</button>
              <div style={{ marginTop: 10 }}>
                <h4 className="section-title">History</h4>
                {footbath.map((r:any)=> (
                  <div key={r.id} className="muted" style={{ fontSize: 12 }}>
                    {new Date(r.date).toLocaleDateString()} — {r.solution}{r.concentration?` (${r.concentration})`:''} {r.notes?`— ${r.notes}`:''}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
              <h4 className="section-title">Sheep</h4>
              <div className="panel" style={{ padding: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <h5 className="section-title">Joining</h5>
                    <select className="select" value={ramId} onChange={e=>setRamId(e.target.value)} style={{ marginBottom: 6 }}>
                      <option value="">Select ram</option>
                      {rams.map((r:any)=> <option key={r.id} value={r.id}>{r.name}{r.tag_id?` (${r.tag_id})`:''}</option>)}
                    </select>
                    <input className="input" type="date" value={joinStart} onChange={e=>setJoinStart(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" placeholder="Notes" value={joinNotes} onChange={e=>setJoinNotes(e.target.value)} style={{ marginBottom: 6 }} />
                    <button className="btn btn--primary" disabled={!ramId} onClick={async()=>{
                      await axios.post(`${API}/v1/sheep/joining`, { mob_id: mob.id, ram_id: parseInt(ramId), start_date: joinStart || undefined, notes: joinNotes || undefined })
                      setRamId(''); setJoinStart(''); setJoinNotes(''); await loadHealth()
                    }}>Save</button>
                    <div style={{ marginTop: 6 }}>
                      {joining.map((j:any)=> (
                        <div key={j.id} className="muted" style={{ fontSize: 12 }}>
                          {new Date(j.start_date).toLocaleDateString()} - Ram #{j.ram_id}{j.due_date?` (due ${new Date(j.due_date).toLocaleDateString()})`:''} {j.notes?`- ${j.notes}`:''}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h5 className="section-title">Marking</h5>
                    <input className="input" type="date" value={markDate} onChange={e=>setMarkDate(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" placeholder="Notes" value={markNotes} onChange={e=>setMarkNotes(e.target.value)} style={{ marginBottom: 6 }} />
                    <button className="btn btn--primary" onClick={async()=>{
                      await axios.post(`${API}/v1/sheep/marking`, { mob_id: mob.id, date: markDate || undefined, notes: markNotes || undefined })
                      setMarkDate(''); setMarkNotes(''); await loadHealth()
                    }}>Save</button>
                    <div style={{ marginTop: 6 }}>
                      {marking.map((r:any)=> (
                        <div key={r.id} className="muted" style={{ fontSize: 12 }}>
                          {new Date(r.date).toLocaleDateString()} {r.notes?`- ${r.notes}`:''}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h5 className="section-title">Weaning</h5>
                    <input className="input" type="date" value={weanDate} onChange={e=>setWeanDate(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" type="number" placeholder="Weaned count" value={weanCount as any} onChange={e=>setWeanCount(e.target.value===''?'':parseInt(e.target.value))} style={{ marginBottom: 6 }} />
                    <input className="input" placeholder="Notes" value={weanNotes} onChange={e=>setWeanNotes(e.target.value)} style={{ marginBottom: 6 }} />
                    <button className="btn btn--primary" onClick={async()=>{
                      await axios.post(`${API}/v1/sheep/weaning`, { mob_id: mob.id, date: weanDate || undefined, weaned_count: weanCount===''?null:weanCount, notes: weanNotes || undefined })
                      setWeanDate(''); setWeanCount(''); setWeanNotes(''); await loadHealth()
                    }}>Save</button>
                    <div style={{ marginTop: 6 }}>
                      {weaning.map((r:any)=> (
                        <div key={r.id} className="muted" style={{ fontSize: 12 }}>
                          {new Date(r.date).toLocaleDateString()} {r.weaned_count!=null?`- ${r.weaned_count} weaned`:''} {r.notes?`- ${r.notes}`:''}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h5 className="section-title">Fly Treatment</h5>
                    <input className="input" placeholder="Chemical" value={flyChem} onChange={e=>setFlyChem(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" placeholder="Rate" value={flyRate} onChange={e=>setFlyRate(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" type="date" value={flyDate} onChange={e=>setFlyDate(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" placeholder="Notes" value={flyNotes} onChange={e=>setFlyNotes(e.target.value)} style={{ marginBottom: 6 }} />
                    <button className="btn btn--primary" disabled={!flyChem} onClick={async()=>{
                      await axios.post(`${API}/v1/sheep/fly_treatment`, { mob_id: mob.id, date: flyDate || undefined, chemical: flyChem, rate: flyRate || undefined, notes: flyNotes || undefined })
                      setFlyChem(''); setFlyRate(''); setFlyDate(''); setFlyNotes(''); await loadHealth()
                    }}>Save</button>
                    <div style={{ marginTop: 6 }}>
                      {flyTx.map((r:any)=> (
                        <div key={r.id} className="muted" style={{ fontSize: 12 }}>
                          {new Date(r.date).toLocaleDateString()} - {r.chemical}{r.rate?` (${r.rate})`:''} {r.notes?`- ${r.notes}`:''}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h5 className="section-title">Foot Paring</h5>
                    <input className="input" type="date" value={fpDate} onChange={e=>setFpDate(e.target.value)} style={{ marginBottom: 6 }} />
                    <input className="input" placeholder="Notes" value={fpNotes} onChange={e=>setFpNotes(e.target.value)} style={{ marginBottom: 6 }} />
                    <button className="btn btn--primary" onClick={async()=>{
                      await axios.post(`${API}/v1/sheep/foot_paring`, { mob_id: mob.id, date: fpDate || undefined, notes: fpNotes || undefined })
                      setFpDate(''); setFpNotes(''); await loadHealth()
                    }}>Save</button>
                    <div style={{ marginTop: 6 }}>
                      {paring.map((r:any)=> (
                        <div key={r.id} className="muted" style={{ fontSize: 12 }}>
                          {new Date(r.date).toLocaleDateString()} {r.notes?`- ${r.notes}`:''}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'metrics' && (
          <div>
            <h4 className="section-title">Worm Count</h4>
            <WormChart data={wormChart} />
          </div>
        )}

      </div>
    </div>
  )
}

function WormChart({ data }: { data: any }) {
  return <Line data={data} options={{ responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } }} />
}

function AddRamForm({ onAdded }: { onAdded?: () => void }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [notes, setNotes] = useState('')
  const canSave = name.trim().length > 0
  return (
    <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      <input className="input" placeholder="Ram name" value={name} onChange={e=>setName(e.target.value)} />
      <input className="input" placeholder="Tag ID" value={tag} onChange={e=>setTag(e.target.value)} />
      <input className="input" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} style={{ gridColumn: '1 / -1' }} />
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}>
        <button className="btn btn--primary" disabled={!canSave} onClick={async()=>{
          await axios.post(`${API}/v1/sheep/rams`, { name, tag_id: tag || undefined, notes: notes || undefined })
          setName(''); setTag(''); setNotes(''); onAdded && onAdded()
        }}>Add Ram</button>
      </div>
    </div>
  )
}
