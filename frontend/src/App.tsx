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
  'Wheat': '#E5C07B',
  'Barley': '#D4B157',
  'Corn': '#B5E550',
  'Maize': '#9ED93C',
  'Canola': '#FFD700',
  'Rapeseed': '#FFC200',
  'Cotton': '#D9D9D9',
  'Soybeans': '#4CAF50',
  'Sorghum': '#B74E25',
  'Lucerne': '#A4DE02',
  'Alfalfa': '#8BC34A',
  'Pasture': '#2E7D32',
  'Fallow': '#8B5A2B',
  'Bare Soil': '#6D4C41',
  'Vegetables': '#3DBF8A',
  'Orchards': '#556B2F',
  'Trees': '#33691E',
  'Vineyards': '#6B4C9A',
  'Grapes': '#5E35B1',
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
  const [moveMobId, setMoveMobId] = useState<number | null>(null)
  const [opsMobId, setOpsMobId] = useState<number | null>(null)
  const [expandedMobId, setExpandedMobId] = useState<number | null>(null)
  const [mobEditNameId, setMobEditNameId] = useState<number | null>(null)
  const [mobEditName, setMobEditName] = useState<string>('')
  const [mobDetailTab, setMobDetailTab] = useState<Record<number, 'info' | 'tags'>>({})
  const [fieldPaddockId, setFieldPaddockId] = useState<number | null>(null)
  const [selectedPaddockId, setSelectedPaddockId] = useState<number | ''>('')
  const [cropType, setCropType] = useState('')
  const [cropColor, setCropColor] = useState('#62a554')
  const [sidebarTab, setSidebarTab] = useState<'livestock' | 'fields' | 'settings'>('livestock')
  const [manageOpsOpen, setManageOpsOpen] = useState(false)
  // Settings
  const [weaningOffsetDays, setWeaningOffsetDays] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('weaningOffsetDays') || '90')
    return isNaN(v) ? 90 : v
  })
  const [legendOnlyUsed, setLegendOnlyUsed] = useState<boolean>(() => localStorage.getItem('legendOnlyUsed') === 'true')
  useEffect(() => { localStorage.setItem('weaningOffsetDays', String(weaningOffsetDays)) }, [weaningOffsetDays])
  useEffect(() => { localStorage.setItem('legendOnlyUsed', legendOnlyUsed ? 'true' : 'false') }, [legendOnlyUsed])
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }
  // Rams edit state
  const [editingRamId, setEditingRamId] = useState<number | null>(null)
  const [editRamName, setEditRamName] = useState('')
  const [editRamTag, setEditRamTag] = useState('')
  const [editRamNotes, setEditRamNotes] = useState('')
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
    <div className="app-shell" style={{ gridTemplateColumns: '1fr' }}>
      {/* Mobile top bar */}
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu"><span /></button>
        <div className="topbar__title">JustFarming</div>
      </div>
      {/* legacy sidebar removed */}
      {false && (
      <div className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} style={{ display: 'none' }}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="sidebar-header__title" style={{ margin: 0 }}>JustFarming</h2>
            <button className="btn btn--ghost" onClick={() => setSidebarOpen(false)}>Close</button>
          </div>
          {/* Tabs with old sidebar sections */}
          <div style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', gap: 8 }}>
            <button className={`sidebar-tab ${sidebarTab==='livestock'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('livestock')}>Livestock</button>
            <button className={`sidebar-tab ${sidebarTab==='fields'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('fields')}>Field Ops</button>
            <button className={`sidebar-tab ${sidebarTab==='settings'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('settings')}>Settings</button>
          </div>
          <div style={{ padding: 16, overflowY: 'auto' }}>
            {sidebarTab === 'livestock' && (
              <>
                <h3 className='section-title' style={{ marginTop: 0 }}>Create Mob</h3>
                <div className='form-compact' style={{ marginBottom: 12 }}>
                  <input className='input' value={newMobName} onChange={e => setNewMobName(e.target.value)} placeholder='Name' style={{ marginBottom: 8 }} />
                  <input className='input' type='number' value={newMobCount} onChange={e => setNewMobCount(parseInt(e.target.value))} placeholder='Count' style={{ marginBottom: 8 }} />
                  <button className='btn btn--primary' onClick={createMob}>Add Mob</button>
                </div>
                <h3 className='section-title'>Rams</h3>
                <div className='panel form-compact' style={{ padding: 8, marginBottom: 12 }}>
                  <div style={{ maxHeight: 140, overflow: 'auto', marginBottom: 8 }}>
                    {rams.length === 0 && <div className='muted' style={{ fontSize: 12 }}>No rams yet</div>}
                    {rams.map(r => (
                      <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{r.name}</strong> {r.tag_id ? <span className='muted'>({r.tag_id})</span> : null}
                          {r.notes ? <div className='muted' style={{ fontSize: 12 }}>{r.notes}</div> : null}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className='btn' onClick={()=>{ setEditingRamId(r.id); setEditRamName(r.name); setEditRamTag(r.tag_id || ''); setEditRamNotes(r.notes || '') }}>Edit</button>
                          <button className='btn btn--ghost' onClick={async()=>{ if(!confirm('Delete ram?')) return; await axios.delete(`${API}/v1/sheep/rams/${r.id}`); const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data) }}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <AddRamForm onAdded={async()=>{ const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data) }} />
                </div>
                <h3 className='section-title'>Mobs</h3>
                <div className='form-compact mob-grid'>
                  {mobs.length === 0 && <div style={{ padding: 8, fontSize: 13, color: '#6b7280' }}>No mobs yet</div>}
                  {mobs.map(m => (
                    <div key={m.id} className='panel' style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                      <div style={{ fontWeight: 600 }}>
                        {m.name}
                        {mobDOBs[m.id] && <span style={{ fontWeight: 400, color: '#6b7280' }}> ({ageFromDOB(mobDOBs[m.id]) ?? ''}y)</span>}
                        <span style={{ fontWeight: 400, color: '#6b7280' }}> ({m.count})</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                        <select className='select' value={m.paddock_id ?? ''} onChange={e => transferMob(m.id, e.target.value ? parseInt(e.target.value) : null)} style={{ flex: 1 }}>
                          <option value=''>Unassigned</option>
                          {[...paddocks].sort((a,b)=>a.name.localeCompare(b.name)).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                        <select className='select' value={mobTypes[m.id] || 'cow'} onChange={e => setMobTypes(prev => ({ ...prev, [m.id]: e.target.value }))}>
                          <option value='cow'>Cattle</option>
                          <option value='sheep'>Sheep</option>
                          <option value='goat'>Goat</option>
                          <option value='pig'>Pig</option>
                          <option value='horse'>Horse</option>
                          <option value='chicken'>Chicken</option>
                          <option value='deer'>Deer</option>
                          <option value='alpaca'>Alpaca</option>
                          <option value='camel'>Camel</option>
                          <option value='other'>Other</option>
                        </select>
                        <input className='input' type='date' value={mobDOBs[m.id] || ''} onChange={e => setMobDOBs(prev => ({ ...prev, [m.id]: e.target.value }))} style={{ maxWidth: 140 }} />
                        <button className='btn btn--ghost' onClick={() => setHistoryMobId(m.id)}>History</button>
                        <input className='input' type='number' defaultValue={m.avg_weight} placeholder='Approx weight (kg)'
                          onBlur={async (e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) { await axios.patch(`${API}/v1/mobs/${m.id}`, { avg_weight: val }); await load() } }} style={{ width: 140 }} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{m.paddock_id ? paddockLookup.get(m.paddock_id)?.name : 'No paddock'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {sidebarTab === 'fields' && (
              <>
                <h3 className='section-title' style={{ marginTop: 0 }}>Field Ops</h3>
                <div className='form-compact panel' style={{ padding: 8, marginBottom: 8 }}>
                  <select className='select' value={selectedPaddockId as any} onChange={e=>setSelectedPaddockId(e.target.value?parseInt(e.target.value):'')} style={{ marginBottom: 6 }}>
                    <option value=''>Select paddock</option>
                    {[...paddocks].sort((a,b)=>a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className='form-compact' style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6 }}>
                    <select className='select' value={cropType} onChange={e=>{ const t = e.target.value; setCropType(t); if (cropPalette[t]) setCropColor(cropPalette[t]) }}>
                      <option value=''>Crop type�</option>
                      {Object.keys(cropPalette).sort((a,b)=>a.localeCompare(b)).map(k => (<option key={k} value={k}>{k}</option>))}
                    </select>
                    <input className='input' type='color' value={cropColor} onChange={e=>setCropColor(e.target.value)} title='Crop color' />
                  </div>
                  <button className='btn btn--primary' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; await axios.patch(`${API}/v1/paddocks/${selectedPaddockId}`, { crop_type: cropType || null, crop_color: cropColor || null }); await load() }}>Save Type/Color</button>
                  <div style={{ height: 8 }} />
                  <div className='form-compact' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button className='btn' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const chemical = prompt('Chemical?') || ''; const rate = prompt('Rate? (e.g., 1.5 L/ha)') || ''; if(!chemical) return; await axios.post(`${API}/v1/fields/spraying`, { paddock_id: selectedPaddockId, chemical, rate: rate || null }) }}>+ Spraying</button>
                    <button className='btn' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const seed = prompt('Seed/Species?') || ''; const rate = prompt('Sowing rate?') || ''; if(!seed) return; await axios.post(`${API}/v1/fields/sowing`, { paddock_id: selectedPaddockId, seed, rate: rate || null }) }}>+ Sowing</button>
                    <button className='btn' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const product = prompt('Fertiliser product?') || ''; const rate = prompt('Rate?') || ''; if(!product) return; await axios.post(`${API}/v1/fields/fertiliser`, { paddock_id: selectedPaddockId, product, rate: rate || null }) }}>+ Fertiliser</button>
                    <button className='btn' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; await axios.post(`${API}/v1/fields/cut`, { paddock_id: selectedPaddockId }) }}>+ Cut</button>
                    <button className='btn' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const kind = prompt('Harvest type (bale/harvest)?', 'bale') || 'bale'; const amount = prompt('Amount (e.g., 120 bales or 3.2 t)?') || ''; await axios.post(`${API}/v1/fields/harvest`, { paddock_id: selectedPaddockId, kind, amount: amount || null }) }}>+ Harvest</button>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className='btn' onClick={()=> setManageOpsOpen(true)}>Manage Operations�</button>
                  </div>
                </div>
              </>
            )}

            {sidebarTab === 'settings' && (
              <>
                <h3 className='section-title' style={{ marginTop: 0 }}>Settings</h3>
                <div className='panel form-compact' style={{ padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label className='muted' style={{ fontSize: 12 }}>Weaning offset (days)</label>
                      <input className='input' type='number' min={0} value={weaningOffsetDays as any} onChange={e=> setWeaningOffsetDays(Math.max(0, parseInt(e.target.value||'0')))} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'end' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type='checkbox' checked={legendOnlyUsed} onChange={e=> setLegendOnlyUsed(e.target.checked)} />
                        <span className='muted' style={{ fontSize: 12 }}>Legend: only show used crop types</span>
                      </label>
                    </div>
                  </div>
                </div>
                <h3 className='section-title'>Import KML</h3>
                <KmlUploader onUploaded={async ()=>{ await load(); alert('KML imported'); }} />
              </>
            )}
          </div>
          <div className="sidebar-header__subtitle">Field management</div>
        </div>
        
        <div className="sidebar-tabs">
          <button className={`sidebar-tab ${sidebarTab==='livestock'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('livestock')}>Livestock</button>
          <button className={`sidebar-tab ${sidebarTab==='fields'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('fields')}>Field Ops</button>
          <button className={`sidebar-tab ${sidebarTab==='settings'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('settings')}>Settings</button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
          {sidebarTab === 'livestock' && (
            <>
              <h3 className="section-title form-compact">Create Mob</h3>
              <div className="form-compact">
                <input className="input" value={newMobName} onChange={e => setNewMobName(e.target.value)} placeholder="Name" style={{ marginBottom: 8 }} />
                <input className="input" type="number" value={newMobCount} onChange={e => setNewMobCount(parseInt(e.target.value))} placeholder="Count" style={{ marginBottom: 8 }} />
                <button className="btn btn--primary" onClick={createMob}>Add Mob</button>
              </div>

              <h3 className="section-title form-compact">Rams</h3>
              <div className="panel form-compact" style={{ padding: 8, marginBottom: 8 }}>
                <div style={{ maxHeight: 140, overflow: 'auto', marginBottom: 8 }}>
                  {rams.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No rams yet</div>}
                  {rams.map(r => (
                    <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                      {editingRamId === r.id ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <input className="input" placeholder="Ram name" value={editRamName} onChange={e=>setEditRamName(e.target.value)} />
                      <input className="input" placeholder="Tag ID" value={editRamTag} onChange={e=>setEditRamTag(e.target.value)} />
                      <input className="input" placeholder="Notes" value={editRamNotes} onChange={e=>setEditRamNotes(e.target.value)} style={{ gridColumn: '1 / -1' }} />
                      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}>
                        <button className="btn btn--primary" onClick={async()=>{
                          await axios.patch(`${API}/v1/sheep/rams/${r.id}`, { name: editRamName || undefined, tag_id: editRamTag || undefined, notes: editRamNotes || undefined })
                          setEditingRamId(null); const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data)
                        }}>Save</button>
                        <button className="btn" onClick={()=> setEditingRamId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{r.name}</strong> {r.tag_id ? <span className="muted">({r.tag_id})</span> : null}
                        {r.notes ? <div className="muted" style={{ fontSize: 12 }}>{r.notes}</div> : null}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" onClick={()=>{ setEditingRamId(r.id); setEditRamName(r.name); setEditRamTag(r.tag_id || ''); setEditRamNotes(r.notes || '') }}>Edit</button>
                        <button className="btn btn--ghost" onClick={async()=>{
                          if (!confirm('Delete this ram?')) return
                          await axios.delete(`${API}/v1/sheep/rams/${r.id}`)
                          const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data)
                        }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
                <AddRamForm onAdded={async()=>{ const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data) }} />
              </div>

              
            </>
          )}

          {sidebarTab === 'fields' && (
            <>
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
                    <option value="">Crop type?</option>
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
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={()=> setManageOpsOpen(true)}>Manage Operations?</button>
                </div>
              </div>
            </>
          )}

          {sidebarTab === 'settings' && (
            <>
              <h3 className="section-title" style={{ marginTop: 0 }}>Settings</h3>
              <div className="panel form-compact" style={{ padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Weaning offset (days)</label>
                    <input className="input" type="number" min={0} value={weaningOffsetDays as any} onChange={e=> setWeaningOffsetDays(Math.max(0, parseInt(e.target.value||'0')))} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={legendOnlyUsed} onChange={e=> setLegendOnlyUsed(e.target.checked)} />
                      <span className="muted" style={{ fontSize: 12 }}>Legend: only show used crop types</span>
                    </label>
                  </div>
                </div>
              </div>

              <h3 className="section-title" style={{ marginTop: 0 }}>Import KML</h3>
              <KmlUploader onUploaded={load} />
            </>
          )}

          {sidebarTab === 'livestock' && (
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
                    value={mobTypes[m.id] || ''}
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
                      >?</button>
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
          )}

          <p style={{ marginTop: 24 }}><small style={{ color: '#6b7280' }}>API: {API}</small></p>
        </div>
      </div>
      )}
      <div style={{ position: 'relative' }}>
        <MapView
          paddocks={paddocks}
          mobs={mobs}
          movements={movements}
          mobTypes={mobTypes}
          selectedMobId={historyMobId}
          mobDOBs={mobDOBs}
          onOpenMenu={() => setSidebarOpen(true)}
          onOpenField={(id)=> setFieldPaddockId(id)}
          onOpenMobHistory={(id)=> setHistoryMobId(id)}
          moveMobId={moveMobId}
          onRequestMove={(id)=> setMoveMobId(id)}
          onSelectMoveTarget={async (mobId, pid) => {
            const dest = paddocks.find(p=>p.id===pid)?.name || `Paddock ${pid}`
            await transferMob(mobId, pid)
            setMoveMobId(null)
            showToast(`Moved to ${dest}`)
          }}
          onCancelMove={() => { setMoveMobId(null); showToast('Move cancelled') }}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className='map-controls' style={{ left: '50%', transform: 'translateX(-50%)', bottom: 72 }}>
          <div className='panel' style={{ padding: 8, fontSize: 12 }}>{toast}</div>
        </div>
      )}

      {/* Full-screen Menu Overlay */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 1200, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 700 }}>Menu</div>
            <button className='btn' onClick={()=> setSidebarOpen(false)}>Close</button>
          </div>
          {/* Tabs header inside the overlay */}
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${sidebarTab==='livestock'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('livestock')}>Livestock</button>
            <button className={`sidebar-tab ${sidebarTab==='fields'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('fields')}>Field Ops</button>
            <button className={`sidebar-tab ${sidebarTab==='settings'?'sidebar-tab--active':''}`} onClick={()=>setSidebarTab('settings')}>Settings</button>
          </div>
          {/* Tab content area */}
          <div className="container-fluid" style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 88px)' }}>
            {sidebarTab === 'livestock' && (
              <>
                <h3 className='section-title form-compact'>Create Mob</h3>
                <div className='row g-2 align-items-end' style={{ marginBottom: 12 }}>
                  <div className='col-12 col-sm-6 col-md-4'>
                    <input className='input' value={newMobName} onChange={e => setNewMobName(e.target.value)} placeholder='Name' />
                  </div>
                  <div className='col-6 col-md-3 col-lg-2'>
                    <input className='input' type='number' value={newMobCount} onChange={e => setNewMobCount(parseInt(e.target.value))} placeholder='Count' />
                  </div>
                  <div className='col-6 col-md-3 col-lg-2'>
                    <button className='btn btn--primary w-100' onClick={createMob}>Add Mob</button>
                  </div>
                </div>

                <h3 className='section-title form-compact'>Rams</h3>
                <div className='panel' style={{ padding: 8, marginBottom: 12 }}>
                  <div className='row g-2'>
                    <div className='col-12 col-lg-7'>
                      <div style={{ maxHeight: 180, overflow: 'auto' }}>
                        {rams.length === 0 && <div className='muted' style={{ fontSize: 12 }}>No rams yet</div>}
                        {rams.map(r => (
                          <div key={r.id} className='row' style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'center' }}>
                            <div className='col'>
                              <strong>{r.name}</strong> {r.tag_id ? <span className='muted'>({r.tag_id})</span> : null}
                              {r.notes ? <div className='muted' style={{ fontSize: 12 }}>{r.notes}</div> : null}
                            </div>
                            <div className='col-auto d-flex gap-2'>
                              <button className='btn' onClick={()=>{ setEditingRamId(r.id); setEditRamName(r.name); setEditRamTag(r.tag_id || ''); setEditRamNotes(r.notes || '') }}>Edit</button>
                              <button className='btn btn--ghost' onClick={async()=>{ if(!confirm('Delete ram?')) return; await axios.delete(`${API}/v1/sheep/rams/${r.id}`); const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data) }}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className='col-12 col-lg-5'>
                      <AddRamForm onAdded={async()=>{ const rr = await axios.get(`${API}/v1/sheep/rams`); setRams(rr.data) }} />
                    </div>
                  </div>
                </div>

                <h3 className='section-title'>Mobs</h3>
                <div className='row row-cols-1 row-cols-lg-3 g-2'>
                  {mobs.length === 0 && <div style={{ padding: 8, fontSize: 13, color: '#6b7280' }}>No mobs yet</div>}
                  {mobs.map(m => (
                    <div key={m.id} className='col'>
                      <div className='panel h-100' style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 600 }}>
                            {m.name}
                            {mobDOBs[m.id] && <span style={{ fontWeight: 400, color: '#6b7280' }}> ({ageFromDOB(mobDOBs[m.id]) ?? ''}y)</span>}
                            <span style={{ fontWeight: 400, color: '#6b7280' }}> ({m.count})</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button className='btn btn--ghost' onClick={()=> setExpandedMobId(expandedMobId===m.id?null:m.id)}>{expandedMobId===m.id?'Hide':'Details'}</button>
                            <button className='btn btn--ghost' onClick={()=> setOpsMobId(m.id)}>Mob Operations</button>
                            <button className='btn btn--ghost' onClick={() => setHistoryMobId(m.id)}>History</button>
                          </div>
                        </div>

                      {/* Quick row for paddock/type/DOB/weight to keep visible */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                        <select className='select' value={m.paddock_id ?? ''} onChange={e => transferMob(m.id, e.target.value ? parseInt(e.target.value) : null)} style={{ minWidth: 160 }}>
                          <option value=''>Unassigned</option>
                          {[...paddocks].sort((a,b)=>a.name.localeCompare(b.name)).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                        <select className='select' value={mobTypes[m.id] || 'cow'} onChange={e => setMobTypes(prev => ({ ...prev, [m.id]: e.target.value }))}>
                          <option value='cow'>Cattle</option>
                          <option value='sheep'>Sheep</option>
                          <option value='goat'>Goat</option>
                          <option value='pig'>Pig</option>
                          <option value='horse'>Horse</option>
                          <option value='chicken'>Chicken</option>
                          <option value='deer'>Deer</option>
                          <option value='alpaca'>Alpaca</option>
                          <option value='camel'>Camel</option>
                          <option value='other'>Other</option>
                        </select>
                        <input className='input' type='date' value={mobDOBs[m.id] || ''} onChange={e => setMobDOBs(prev => ({ ...prev, [m.id]: e.target.value }))} style={{ maxWidth: 140 }} />
                        <input className='input' type='number' defaultValue={m.avg_weight} placeholder='Approx weight (kg)'
                          onBlur={async (e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) { await axios.patch(`${API}/v1/mobs/${m.id}`, { avg_weight: val }); await load() } }} style={{ width: 140 }} />
                        <span className='muted' style={{ fontSize: 12 }}>Currently in: {m.paddock_id ? paddockLookup.get(m.paddock_id)?.name : 'Unassigned'}</span>
                      </div>

                      {expandedMobId === m.id && (
                        <div className='panel' style={{ marginTop: 8 }}>
                          <div className='sidebar-tabs' style={{ position: 'static', padding: 0, border: 0, marginBottom: 8 }}>
                            <button className={`sidebar-tab ${ (mobDetailTab[m.id]||'info')==='info' ? 'sidebar-tab--active' : '' }`} onClick={()=> setMobDetailTab(prev=>({ ...prev, [m.id]:'info'}))}>Info</button>
                            <button className={`sidebar-tab ${ (mobDetailTab[m.id]||'info')==='tags' ? 'sidebar-tab--active' : '' }`} onClick={()=> setMobDetailTab(prev=>({ ...prev, [m.id]:'tags'}))}>Tags</button>
                          </div>

                          {(mobDetailTab[m.id]||'info') === 'info' && (
                            <div className='form-compact' style={{ display: 'grid', gap: 8 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div><strong>Name:</strong> {m.name}</div>
                                {mobEditNameId===m.id ? (
                                  <>
                                    <input className='input' value={mobEditName} onChange={e=>setMobEditName(e.target.value)} placeholder='New name' style={{ maxWidth: 200 }} />
                                    <button className='btn btn--primary' onClick={async()=>{ await axios.patch(`${API}/v1/mobs/${m.id}`, { name: mobEditName || m.name }); setMobEditNameId(null); await load() }}>Save</button>
                                    <button className='btn' onClick={()=> setMobEditNameId(null)}>Cancel</button>
                                  </>
                                ) : (
                                  <button className='btn' onClick={()=>{ setMobEditNameId(m.id); setMobEditName(m.name) }}>Edit Name</button>
                                )}
                              </div>
                            </div>
                          )}

                          {(mobDetailTab[m.id]||'info') === 'tags' && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {(mobTags[m.id]||[]).map((t,idx)=>(
                                  <span key={idx} title={`${t.ear} ${t.label||''}`.trim()} style={{ display: 'inline-flex', alignItems:'center', gap:4, border:'1px solid #e5e7eb', borderRadius: 999, padding: '2px 6px' }}>
                                    <span style={{ width: 10, height: 10, background: t.color, borderRadius: 999 }} />
                                    <span className='muted' style={{ fontSize: 12 }}>{t.ear}</span>
                                    {t.label && <span className='muted' style={{ fontSize: 12 }}>� {t.label}</span>}
                                  </span>
                                ))}
                                <button className='btn' onClick={()=> setTagFormOpen(prev => ({ ...prev, [m.id]: !prev[m.id] }))}>+ Tag</button>
                              </div>
                              {tagFormOpen[m.id] && (
                                <div className='form-compact' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6, marginTop: 6 }}>
                                  <select className='select' value={tagEar[m.id] || 'left'} onChange={e => setTagEar(prev => ({ ...prev, [m.id]: e.target.value as any }))}>
                                    <option value='left'>Left</option>
                                    <option value='right'>Right</option>
                                    <option value='unknown'>Unknown</option>
                                  </select>
                                  <input className='input' type='color' value={tagColor[m.id] || '#10b981'} onChange={e => setTagColor(prev => ({ ...prev, [m.id]: e.target.value }))} />
                                  <input className='input' placeholder='Label' value={tagLabel[m.id] || ''} onChange={e => setTagLabel(prev => ({ ...prev, [m.id]: e.target.value }))} />
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className='btn btn--primary' onClick={() => {
                                      const ear = (tagEar[m.id] || 'left') as 'left'|'right'|'unknown'
                                      const color = tagColor[m.id] || '#10b981'
                                      const label = (tagLabel[m.id] || '').trim() || undefined
                                      setMobTags(prev => ({ ...prev, [m.id]: [...(prev[m.id] || []), { ear, color, label }] }))
                                      setTagFormOpen(prev => ({ ...prev, [m.id]: false }))
                                      setTagLabel(prev => ({ ...prev, [m.id]: '' }))
                                    }}>Add</button>
                                    <button className='btn' onClick={() => setTagFormOpen(prev => ({ ...prev, [m.id]: false }))}>Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {sidebarTab === 'fields' && (
              <>
                <h3 className='section-title form-compact'>Field Ops</h3>
                <div className='panel' style={{ padding: 8, marginBottom: 8 }}>
                  <div className='row g-2'>
                    <div className='col-12 col-md-6'>
                      <select className='select' value={selectedPaddockId as any} onChange={e=>setSelectedPaddockId(e.target.value?parseInt(e.target.value):'')}>
                        <option value=''>Select paddock</option>
                        {[...paddocks].sort((a,b)=>a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className='col-8 col-md-4'>
                      <select className='select' value={cropType} onChange={e=>{ const t = e.target.value; setCropType(t); if (cropPalette[t]) setCropColor(cropPalette[t]) }}>
                        <option value=''>Crop type.</option>
                        {Object.keys(cropPalette).sort((a,b)=>a.localeCompare(b)).map(k => (<option key={k} value={k}>{k}</option>))}
                      </select>
                    </div>
                    <div className='col-4 col-md-2'>
                      <input className='input' type='color' value={cropColor} onChange={e=>setCropColor(e.target.value)} title='Crop color' />
                    </div>
                    <div className='col-12 col-md-3'>
                      <button className='btn btn--primary w-100' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; await axios.patch(`${API}/v1/paddocks/${selectedPaddockId}`, { crop_type: cropType || null, crop_color: cropColor || null }); await load() }}>Save Type/Color</button>
                    </div>
                    <div className='col-6 col-md-3'>
                      <button className='btn w-100' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const chemical = prompt('Chemical?') || ''; const rate = prompt('Rate? (e.g., 1.5 L/ha)') || ''; if(!chemical) return; await axios.post(`${API}/v1/fields/spraying`, { paddock_id: selectedPaddockId, chemical, rate: rate || null }) }}>+ Spraying</button>
                    </div>
                    <div className='col-6 col-md-3'>
                      <button className='btn w-100' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const seed = prompt('Seed/Species?') || ''; const rate = prompt('Sowing rate?') || ''; if(!seed) return; await axios.post(`${API}/v1/fields/sowing`, { paddock_id: selectedPaddockId, seed, rate: rate || null }) }}>+ Sowing</button>
                    </div>
                    <div className='col-6 col-md-3'>
                      <button className='btn w-100' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const product = prompt('Fertiliser product?') || ''; const rate = prompt('Rate?') || ''; if(!product) return; await axios.post(`${API}/v1/fields/fertiliser`, { paddock_id: selectedPaddockId, product, rate: rate || null }) }}>+ Fertiliser</button>
                    </div>
                    <div className='col-6 col-md-3'>
                      <button className='btn w-100' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; await axios.post(`${API}/v1/fields/cut`, { paddock_id: selectedPaddockId }) }}>+ Cut</button>
                    </div>
                    <div className='col-6 col-md-3'>
                      <button className='btn w-100' disabled={!selectedPaddockId} onClick={async()=>{ if(!selectedPaddockId) return; const kind = prompt('Harvest type (bale/harvest)?', 'bale') || 'bale'; const amount = prompt('Amount (e.g., 120 bales or 3.2 t)?') || ''; await axios.post(`${API}/v1/fields/harvest`, { paddock_id: selectedPaddockId, kind, amount: amount || null }) }}>+ Harvest</button>
                    </div>
                    <div className='col-12 col-md-3'>
                      <button className='btn w-100' onClick={()=> setManageOpsOpen(true)}>Manage Operations.</button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {sidebarTab === 'settings' && (
              <>
                <h3 className='section-title' style={{ marginTop: 0 }}>Settings</h3>
                <div className='panel' style={{ padding: 12, marginBottom: 12 }}>
                  <div className='row g-2 align-items-end'>
                    <div className='col-12 col-md-6'>
                      <label className='muted' style={{ fontSize: 12 }}>Weaning offset (days)</label>
                      <input className='input' type='number' min={0} value={weaningOffsetDays as any} onChange={e=> setWeaningOffsetDays(Math.max(0, parseInt(e.target.value||'0')))} />
                    </div>
                    <div className='col-12 col-md-6'>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type='checkbox' checked={legendOnlyUsed} onChange={e=> setLegendOnlyUsed(e.target.checked)} />
                        <span className='muted' style={{ fontSize: 12 }}>Legend: only show used crop types</span>
                      </label>
                    </div>
                  </div>
                </div>
                <h3 className='section-title'>Import KML</h3>
                <div className='row g-2'>
                  <div className='col-12 col-md-6 col-lg-4'>
                    <KmlUploader onUploaded={async ()=>{ await load(); alert('KML imported'); }} />
                  </div>
                </div>
              </>
            )}

            <p style={{ marginTop: 24 }}><small style={{ color: '#6b7280' }}>API: {API}</small></p>
          </div>
          {false && (
          <div style={{ padding: 16, display: 'grid', gap: 16 }}>
            <div>
              <h3 className='section-title' style={{ marginTop: 0 }}>Quick Actions</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className='btn' onClick={()=> setManageOpsOpen(true)}>Manage Operations?</button>
              </div>
            </div>

            <div>
              <h3 className='section-title'>Import KML</h3>
              <KmlUploader onUploaded={async ()=>{ await load(); alert('KML imported'); }} />
            </div>

            <div>
              <h3 className='section-title'>Settings</h3>
              <div className='panel form-compact' style={{ padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className='muted' style={{ fontSize: 12 }}>Weaning offset (days)</label>
                    <input className='input' type='number' min={0} value={weaningOffsetDays as any} onChange={e=> setWeaningOffsetDays(Math.max(0, parseInt(e.target.value||'0')))} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type='checkbox' checked={legendOnlyUsed} onChange={e=> setLegendOnlyUsed(e.target.checked)} />
                      <span className='muted' style={{ fontSize: 12 }}>Legend: only show used crop types</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>)}
        </div>
      )}

      {historyMobId !== null && (
        <HistoryModal
          mob={mobs.find(x => x.id === historyMobId)!}
          paddocks={paddocks}
          movements={movements.filter(x => x.mob_id === historyMobId)}
          onClose={() => setHistoryMobId(null)}
          mode="history"
        />
      )}
      {opsMobId !== null && (
        <HistoryModal
          mob={mobs.find(x => x.id === opsMobId)!}
          paddocks={paddocks}
          movements={movements.filter(x => x.mob_id === opsMobId)}
          onClose={() => setOpsMobId(null)}
          mode="operations"
        />
      )}
      {fieldPaddockId !== null && (
        <FieldHistoryModal
          paddock={paddocks.find(p=>p.id===fieldPaddockId)!}
          mobs={mobs}
          movements={movements}
          onClose={() => setFieldPaddockId(null)}
        />
      )}
      {manageOpsOpen && (
        <ManageOperationsModal paddocks={paddocks} onClose={()=> setManageOpsOpen(false)} />
      )}
    </div>
  )
}


function HistoryModal({ mob, paddocks, movements, onClose, mode }: { mob: Mob; paddocks: Paddock[]; movements: Movement[]; onClose: () => void; mode?: 'history' | 'operations' }) {
  const [tab, setTab] = useState<'moves' | 'health' | 'metrics' | 'rams'>(mode === 'operations' ? 'health' : 'moves')
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
  const [moveMobId, setMoveMobId] = useState<number | null>(null)
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }} onClick={onClose}>
      <div className="panel" style={{ width: 860, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>History {mob.name}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {mode !== 'operations' && (
            <button className="btn" onClick={()=>setTab('moves')}>Movements</button>
          )}
          {mode === 'operations' && (
            <>
              <button className={"btn "+(tab==='health'?'btn--primary':'')} onClick={()=>setTab('health')}>Health</button>
              <button className={"btn "+(tab==='metrics'?'btn--primary':'')} onClick={()=>setTab('metrics')}>Metrics</button>
              <button className={"btn "+(tab==='rams'?'btn--primary':'')} onClick={()=>setTab('rams')}>Rams</button>
            </>
          )}
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
                  <div className="muted">?</div>
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
                    {new Date(r.date).toLocaleDateString()} ? {r.drug}{r.worm_count!=null?` (count ${r.worm_count})`:''} {r.notes?`? ${r.notes}`:''}
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
                    {new Date(r.date).toLocaleDateString()} ? {r.solution}{r.concentration?` (${r.concentration})`:''} {r.notes?`? ${r.notes}`:''}
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

        {tab === 'rams' && (
          <RamsTab joining={joining} rams={rams} mobId={mob.id} refresh={loadHealth} />
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
    <div className="form-compact">
      <div className='row g-2'>
        <div className='col-12 col-sm-6'>
          <input className="input" placeholder="Ram name" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className='col-12 col-sm-6'>
          <input className="input" placeholder="Tag ID" value={tag} onChange={e=>setTag(e.target.value)} />
        </div>
        <div className='col-12'>
          <input className="input" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
        <div className='col-12 col-sm-4 col-md-3'>
          <button className="btn btn--primary w-100" disabled={!canSave} onClick={async()=>{
            await axios.post(`${API}/v1/sheep/rams`, { name, tag_id: tag || undefined, notes: notes || undefined })
            setName(''); setTag(''); setNotes(''); onAdded && onAdded()
          }}>Add Ram</button>
        </div>
      </div>
    </div>
  )
}

function RamsTab({ joining, rams, mobId, refresh, weaningOffsetDays }: { joining: any[]; rams: any[]; mobId: number; refresh: ()=>Promise<void> | void; weaningOffsetDays?: number }) {
  const [editId, setEditId] = useState<number | null>(null)
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <div>
      <h4 className="section-title">Joining Records</h4>
      {joining.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No joining records.</div>}
      {joining.map((j:any) => {
        const r = (rams || []).find((x:any)=> x.id === j.ram_id)
        const isEdit = editId === j.id
        return (
          <div key={j.id} style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div><strong>Ram:</strong> {r ? r.name : `#${j.ram_id}`}{r?.tag_id?` (${r.tag_id})`:''}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Start: {new Date(j.start_date).toLocaleDateString()}
                  {j.due_date?` ? Due: ${new Date(j.due_date).toLocaleDateString()}`:''}
                  {j.end_date?` ? End: ${new Date(j.end_date).toLocaleDateString()}`:''}
                  {j.notes?` ? ${j.notes}`:''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" onClick={()=>{
                  setEditId(j.id); setStart(j.start_date?.slice(0,10)||''); setDue(j.due_date?.slice(0,10)||''); setEnd(j.end_date?.slice(0,10)||''); setNotes(j.notes||'')
                }}>Edit</button>
                <button className="btn" onClick={async()=>{
                  const endISO = new Date().toISOString()
                  await axios.patch(`${API}/v1/sheep/joining/${j.id}`, { end_date: endISO })
                  // Auto-schedule weaning after configured offset days (fallback to offset from now)
                  const base = j.due_date ? new Date(j.due_date) : new Date()
                  const _off = (weaningOffsetDays ?? (parseInt(localStorage.getItem('weaningOffsetDays') || '90')||0)); const wean = new Date(base.getTime() + _off*24*3600*1000)
                  await axios.post(`${API}/v1/sheep/weaning`, { mob_id: mobId, date: wean.toISOString(), notes: 'Scheduled (auto from joining end)' })
                  await refresh()
                }}>End now</button>
                <button className="btn btn--ghost" onClick={async()=>{
                  if(!confirm('Delete joining record?')) return
                  await axios.delete(`${API}/v1/sheep/joining/${j.id}`)
                  await refresh()
                }}>Delete</button>
              </div>
            </div>
            {isEdit && (
              <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
                <input className="input" type="date" value={start} onChange={e=>setStart(e.target.value)} />
                <input className="input" type="date" value={due} onChange={e=>setDue(e.target.value)} />
                <input className="input" type="date" value={end} onChange={e=>setEnd(e.target.value)} />
                <input className="input" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} style={{ gridColumn: '1 / -1' }} />
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}>
                  <button className="btn btn--primary" onClick={async()=>{
                    const payload: any = { notes: notes || undefined }
                    if (start) payload.start_date = new Date(start).toISOString()
                    if (due) payload.due_date = new Date(due).toISOString()
                    if (end) payload.end_date = new Date(end).toISOString()
                    await axios.patch(`${API}/v1/sheep/joining/${j.id}`, payload)
                    setEditId(null); await refresh()
                  }}>Save</button>
                  <button className="btn" onClick={()=> setEditId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ManageOperationsModal({ paddocks, onClose }: { paddocks: Paddock[]; onClose: ()=>void }) {
  const [spraying, setSpraying] = useState<any[]>([])
  const [sowing, setSowing] = useState<any[]>([])
  const [fert, setFert] = useState<any[]>([])
  const [cut, setCut] = useState<any[]>([])
  const [harvest, setHarvest] = useState<any[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [paddockFilter, setPaddockFilter] = useState<number | ''>('')
  const [query, setQuery] = useState('')
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, any>>({})
  useEffect(() => { (async()=>{
    const [s1,s2,s3,s4,s5] = await Promise.all([
      axios.get(`${API}/v1/fields/spraying`),
      axios.get(`${API}/v1/fields/sowing`),
      axios.get(`${API}/v1/fields/fertiliser`),
      axios.get(`${API}/v1/fields/cut`),
      axios.get(`${API}/v1/fields/harvest`),
    ])
    setSpraying(s1.data); setSowing(s2.data); setFert(s3.data); setCut(s4.data); setHarvest(s5.data)
  })() }, [])
  const timeline = useMemo(() => {
    const add = (arr:any[], type:string) => arr.map(r => ({ type, date: r.date, data: r }))
    let items = [
      ...add(spraying, 'Spraying'),
      ...add(sowing, 'Sowing'),
      ...add(fert, 'Fertiliser'),
      ...add(cut, 'Cut'),
      ...add(harvest, 'Harvest'),
    ] as any[]
    if (typeFilter) items = items.filter(i => i.type === typeFilter)
    if (paddockFilter) items = items.filter(i => i.data.paddock_id === paddockFilter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter(i => {
        const d = i.data || {}
        const fields = [d.chemical, d.product, d.seed, d.kind, d.notes]
        return fields.some((v: any) => (typeof v === 'string') && v.toLowerCase().includes(q))
      })
    }
    return items.sort((a,b)=> new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [spraying, sowing, fert, cut, harvest, typeFilter, paddockFilter, query])
  function endpointFor(type: string, id: number) {
    const base = type.toLowerCase()
    const key = base === 'fertiliser' ? 'fertiliser' : base === 'spraying' ? 'spraying' : base === 'sowing' ? 'sowing' : base === 'cut' ? 'cut' : 'harvest'
    return `${API}/v1/fields/${key}/${id}`
  }
  const nameOf = (pid:number) => paddocks.find(p=>p.id===pid)?.name || `Paddock ${pid}`
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className='panel' style={{ width: 860, maxHeight: '85vh', overflow: 'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className='section-title' style={{ margin: 0 }}>Manage Field Operations</h3>
          <button className='btn' onClick={onClose}>Close</button>
        </div>
        <div className='form-compact' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '8px 0' }}>
          <select className='select' value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value=''>All types</option>
            <option value='Spraying'>Spraying</option>
            <option value='Sowing'>Sowing</option>
            <option value='Fertiliser'>Fertiliser</option>
            <option value='Cut'>Cut</option>
            <option value='Harvest'>Harvest</option>
          </select>
          <select className='select' value={paddockFilter as any} onChange={e=>setPaddockFilter(e.target.value?parseInt(e.target.value):'')}>
            <option value=''>All paddocks</option>
            {[...paddocks].sort((a,b)=>a.name.localeCompare(b.name)).map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className='input' placeholder='Filter by product/chemical?' value={query} onChange={e=>setQuery(e.target.value)} />
        </div>
        <div>
          {timeline.map((e, idx) => {
            const key = `${e.type}-${e.data.id}`
            const isEdit = editKey === key
            return (
              <div key={idx} style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <strong>{e.type}</strong>
                    <div className='muted' style={{ fontSize: 12 }}>{new Date(e.date).toLocaleDateString()} ? {nameOf(e.data.paddock_id)}</div>
                  </div>
                  {!isEdit ? (
                    <div className='muted' style={{ fontSize: 13 }}>
                      {e.type==='Spraying' && (<>{e.data.chemical}{e.data.rate?` (${e.data.rate})`:''}</>)}
                      {e.type==='Sowing' && (<>{e.data.seed}{e.data.rate?` (${e.data.rate})`:''}</>)}
                      {e.type==='Fertiliser' && (<>{e.data.product}{e.data.rate?` (${e.data.rate})`:''}</>)}
                      {e.type==='Cut' && (<>{e.data.notes || ''}</>)}
                      {e.type==='Harvest' && (<>{e.data.kind}{e.data.amount?` (${e.data.amount})`:''}</>)}
                    </div>
                  ) : (
                    <div className='form-compact' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <input className='input' type='date' value={(editFields[key]?.date || e.data.date || '').slice(0,10)} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), date: ev.target.value } }))} />
                      {e.type==='Spraying' && (<><input className='input' placeholder='Chemical' defaultValue={e.data.chemical||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), chemical: ev.target.value } }))} /><input className='input' placeholder='Rate' defaultValue={e.data.rate||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), rate: ev.target.value } }))} /></>)}
                      {e.type==='Sowing' && (<><input className='input' placeholder='Seed' defaultValue={e.data.seed||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), seed: ev.target.value } }))} /><input className='input' placeholder='Rate' defaultValue={e.data.rate||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), rate: ev.target.value } }))} /></>)}
                      {e.type==='Fertiliser' && (<><input className='input' placeholder='Product' defaultValue={e.data.product||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), product: ev.target.value } }))} /><input className='input' placeholder='Rate' defaultValue={e.data.rate||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), rate: ev.target.value } }))} /></>)}
                      {e.type==='Harvest' && (<><input className='input' placeholder='Kind' defaultValue={e.data.kind||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), kind: ev.target.value } }))} /><input className='input' placeholder='Amount' defaultValue={e.data.amount||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), amount: ev.target.value } }))} /></>)}
                      {(e.type==='Spraying'||e.type==='Sowing'||e.type==='Fertiliser'||e.type==='Cut'||e.type==='Harvest') && (<input className='input' placeholder='Notes' defaultValue={e.data.notes||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), notes: ev.target.value } }))} />)}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isEdit ? (
                      <>
                        <button className='btn' onClick={()=>{ setEditKey(key); setEditFields(prev=>({ ...prev, [key]: { date: e.data.date?.slice(0,10) } })) }}>Edit</button>
                        <button className='btn btn--ghost' onClick={async()=>{
                          if(!confirm('Delete record?')) return
                          await axios.delete(endpointFor(e.type, e.data.id))
                          const [s1,s2,s3,s4,s5] = await Promise.all([
                            axios.get(`${API}/v1/fields/spraying`),
                            axios.get(`${API}/v1/fields/sowing`),
                            axios.get(`${API}/v1/fields/fertiliser`),
                            axios.get(`${API}/v1/fields/cut`),
                            axios.get(`${API}/v1/fields/harvest`),
                          ])
                          setSpraying(s1.data); setSowing(s2.data); setFert(s3.data); setCut(s4.data); setHarvest(s5.data)
                        }}>Delete</button>
                      </>
                    ) : (
                      <>
                        <button className='btn btn--primary' onClick={async()=>{
                          const payload: any = {}
                          const fields = editFields[key] || {}
                          if (fields.date) payload.date = new Date(fields.date).toISOString()
                          const mapFields: Record<string,string[]> = {
                            'Spraying': ['chemical','rate','notes'],
                            'Sowing': ['seed','rate','notes'],
                            'Fertiliser': ['product','rate','notes'],
                            'Cut': ['notes'],
                            'Harvest': ['kind','amount','notes'],
                          }
                          for (const f of (mapFields[e.type]||[])) { if (fields[f] !== undefined) payload[f] = fields[f] || undefined }
                          await axios.patch(endpointFor(e.type, e.data.id), payload)
                          setEditKey(null)
                          const [s1,s2,s3,s4,s5] = await Promise.all([
                            axios.get(`${API}/v1/fields/spraying`),
                            axios.get(`${API}/v1/fields/sowing`),
                            axios.get(`${API}/v1/fields/fertiliser`),
                            axios.get(`${API}/v1/fields/cut`),
                            axios.get(`${API}/v1/fields/harvest`),
                          ])
                          setSpraying(s1.data); setSowing(s2.data); setFert(s3.data); setCut(s4.data); setHarvest(s5.data)
                        }}>Save</button>
                        <button className='btn' onClick={()=> setEditKey(null)}>Cancel</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FieldHistoryModal({ paddock, mobs, movements, onClose }: { paddock: Paddock; mobs: Mob[]; movements: Movement[]; onClose: ()=>void }) {
  const [spraying, setSpraying] = useState<any[]>([])
  const [sowing, setSowing] = useState<any[]>([])
  const [fert, setFert] = useState<any[]>([])
  const [cut, setCut] = useState<any[]>([])
  const [harvest, setHarvest] = useState<any[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [query, setQuery] = useState('')
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, any>>({})
  useEffect(() => {
    (async () => {
      const [s1,s2,s3,s4,s5] = await Promise.all([
        axios.get(`${API}/v1/fields/spraying`, { params: { paddock_id: paddock.id } }),
        axios.get(`${API}/v1/fields/sowing`, { params: { paddock_id: paddock.id } }),
        axios.get(`${API}/v1/fields/fertiliser`, { params: { paddock_id: paddock.id } }),
        axios.get(`${API}/v1/fields/cut`, { params: { paddock_id: paddock.id } }),
        axios.get(`${API}/v1/fields/harvest`, { params: { paddock_id: paddock.id } }),
      ])
      setSpraying(s1.data); setSowing(s2.data); setFert(s3.data); setCut(s4.data); setHarvest(s5.data)
    })()
  }, [paddock.id])

  const mobsHere = useMemo(() => mobs.filter(m => m.paddock_id === paddock.id), [mobs, paddock.id])
  const lastLeave = useMemo(() => {
    let t: string | null = null
    for (const mv of movements) {
      if (mv.from_paddock_id === paddock.id) {
        if (!t || new Date(mv.timestamp) > new Date(t)) t = mv.timestamp
      }
    }
    return t
  }, [movements, paddock.id])
  const restDays = mobsHere.length > 0 ? 0 : (lastLeave ? Math.floor((Date.now() - new Date(lastLeave).getTime()) / (1000*60*60*24)) : undefined)

  // merge ops for timeline
  const timeline = useMemo(() => {
    const add = (arr:any[], type:string) => arr.map(r => ({ type, date: r.date, data: r }))
    let items = [
      ...add(spraying, 'Spraying'),
      ...add(sowing, 'Sowing'),
      ...add(fert, 'Fertiliser'),
      ...add(cut, 'Cut'),
      ...add(harvest, 'Harvest'),
    ] as any[]
    // filter by type
    if (typeFilter) items = items.filter(i => i.type === typeFilter)
    // filter by dates
    const sDate = start ? new Date(start) : null
    const eDate = end ? new Date(end) : null
    if (sDate) items = items.filter(i => new Date(i.date) >= sDate)
    if (eDate) items = items.filter(i => new Date(i.date) <= eDate)
    // query filter by product/chemical/seed/kind/notes
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter(i => {
        const d = i.data || {}
        const fields = [d.chemical, d.product, d.seed, d.kind, d.notes]
        return fields.some((v: any) => (typeof v === 'string') && v.toLowerCase().includes(q))
      })
    }
    return items.sort((a,b)=> new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [spraying, sowing, fert, cut, harvest, start, end, typeFilter, query])

  function endpointFor(type: string, id: number) {
    const base = type.toLowerCase()
    const key = base === 'fertiliser' ? 'fertiliser' : base === 'spraying' ? 'spraying' : base === 'sowing' ? 'sowing' : base === 'cut' ? 'cut' : 'harvest'
    return `${API}/v1/fields/${key}/${id}`
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="panel" style={{ width: 800, maxHeight: '85vh', overflow: 'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Field - {paddock.name}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
          Area: {paddock.area_ha} ha{paddock.crop_type?` ? Type: ${paddock.crop_type}`:''}{typeof restDays === 'number'?` ? Rest: ${restDays} days`:''}
        </div>
        <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input className="input" type="date" value={start} onChange={e=>setStart(e.target.value)} />
          <input className="input" type="date" value={end} onChange={e=>setEnd(e.target.value)} />
          <select className="select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="Spraying">Spraying</option>
            <option value="Sowing">Sowing</option>
            <option value="Fertiliser">Fertiliser</option>
            <option value="Cut">Cut</option>
            <option value="Harvest">Harvest</option>
          </select>
          <input className="input" placeholder="Filter by product/chemical?" value={query} onChange={e=>setQuery(e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <strong>Mobs in paddock:</strong> {mobsHere.length === 0 ? 'None' : mobsHere.map(m=>`${m.name} (${m.count})`).join(', ')}
        </div>
        <div>
          <h4 className="section-title">Operations</h4>
          {timeline.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No operations recorded.</div>}
          {timeline.map((e, idx) => {
            const key = `${e.type}-${e.data.id}`
            const isEdit = editKey === key
            return (
              <div key={idx} style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div><strong>{e.type}</strong><div className="muted" style={{ fontSize: 12 }}>{new Date(e.date).toLocaleDateString()}</div></div>
                  {!isEdit ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {e.type==='Spraying' && (<>{e.data.chemical}{e.data.rate?` (${e.data.rate})`:''}</>)}
                      {e.type==='Sowing' && (<>{e.data.seed}{e.data.rate?` (${e.data.rate})`:''}</>)}
                      {e.type==='Fertiliser' && (<>{e.data.product}{e.data.rate?` (${e.data.rate})`:''}</>)}
                      {e.type==='Cut' && (<>{e.data.notes || ''}</>)}
                      {e.type==='Harvest' && (<>{e.data.kind}{e.data.amount?` (${e.data.amount})`:''}</>)}
                    </div>
                  ) : (
                    <div className="form-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <input className="input" type="date" value={(editFields[key]?.date || e.data.date || '').slice(0,10)} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), date: ev.target.value } }))} />
                      {e.type==='Spraying' && (
                        <>
                          <input className="input" placeholder="Chemical" defaultValue={e.data.chemical||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), chemical: ev.target.value } }))} />
                          <input className="input" placeholder="Rate" defaultValue={e.data.rate||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), rate: ev.target.value } }))} />
                        </>
                      )}
                      {e.type==='Sowing' && (
                        <>
                          <input className="input" placeholder="Seed" defaultValue={e.data.seed||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), seed: ev.target.value } }))} />
                          <input className="input" placeholder="Rate" defaultValue={e.data.rate||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), rate: ev.target.value } }))} />
                        </>
                      )}
                      {e.type==='Fertiliser' && (
                        <>
                          <input className="input" placeholder="Product" defaultValue={e.data.product||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), product: ev.target.value } }))} />
                          <input className="input" placeholder="Rate" defaultValue={e.data.rate||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), rate: ev.target.value } }))} />
                        </>
                      )}
                      {e.type==='Harvest' && (
                        <>
                          <input className="input" placeholder="Kind" defaultValue={e.data.kind||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), kind: ev.target.value } }))} />
                          <input className="input" placeholder="Amount" defaultValue={e.data.amount||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), amount: ev.target.value } }))} />
                        </>
                      )}
                      {(e.type==='Spraying'||e.type==='Sowing'||e.type==='Fertiliser'||e.type==='Cut'||e.type==='Harvest') && (
                        <input className="input" placeholder="Notes" defaultValue={e.data.notes||''} onChange={ev=>setEditFields(prev=>({ ...prev, [key]: { ...(prev[key]||{}), notes: ev.target.value } }))} />
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isEdit ? (
                      <>
                        <button className="btn" onClick={()=>{ setEditKey(key); setEditFields(prev=>({ ...prev, [key]: { date: e.data.date?.slice(0,10) } })) }}>Edit</button>
                        <button className="btn btn--ghost" onClick={async()=>{
                          if(!confirm('Delete record?')) return
                          await axios.delete(endpointFor(e.type, e.data.id))
                          // reload lists
                          const [s1,s2,s3,s4,s5] = await Promise.all([
                            axios.get(`${API}/v1/fields/spraying`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/sowing`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/fertiliser`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/cut`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/harvest`, { params: { paddock_id: paddock.id } }),
                          ])
                          setSpraying(s1.data); setSowing(s2.data); setFert(s3.data); setCut(s4.data); setHarvest(s5.data)
                        }}>Delete</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--primary" onClick={async()=>{
                          const payload: any = {}
                          const fields = editFields[key] || {}
                          if (fields.date) payload.date = new Date(fields.date).toISOString()
                          const mapFields: Record<string,string[]> = {
                            'Spraying': ['chemical','rate','notes'],
                            'Sowing': ['seed','rate','notes'],
                            'Fertiliser': ['product','rate','notes'],
                            'Cut': ['notes'],
                            'Harvest': ['kind','amount','notes'],
                          }
                          for (const f of (mapFields[e.type]||[])) {
                            if (fields[f] !== undefined) payload[f] = fields[f] || undefined
                          }
                          await axios.patch(endpointFor(e.type, e.data.id), payload)
                          setEditKey(null)
                          const [s1,s2,s3,s4,s5] = await Promise.all([
                            axios.get(`${API}/v1/fields/spraying`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/sowing`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/fertiliser`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/cut`, { params: { paddock_id: paddock.id } }),
                            axios.get(`${API}/v1/fields/harvest`, { params: { paddock_id: paddock.id } }),
                          ])
                          setSpraying(s1.data); setSowing(s2.data); setFert(s3.data); setCut(s4.data); setHarvest(s5.data)
                        }}>Save</button>
                        <button className="btn" onClick={()=> setEditKey(null)}>Cancel</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
