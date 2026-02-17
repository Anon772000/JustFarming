import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import KmlUploader from './components/KmlUploader'

const API = (import.meta as any).env?.VITE_API_BASE || '/api'

type Paddock = {
  id: number
  name: string
  area_ha: number
  crop_type?: string | null
}

type Mob = {
  id: number
  name: string
  count: number
  avg_weight: number
  paddock_id?: number | null
  paddock_ids?: number[]
  sheep_class?: string | null
  year_group?: number | null
  sheep_tags?: string[]
}

type DailyLog = {
  id: number
  mob_id: number
  date: string
  paddock_ids: number[]
  water_checked: boolean
  feed_checked: boolean
  deaths_count: number
  death_cause?: string | null
  notes?: string | null
  images?: string[] | null
}

type Movement = {
  id: number
  mob_id: number
  from_paddock_id?: number | null
  to_paddock_id?: number | null
  timestamp: string
}

type SheepMobEvent = {
  id: number
  mob_id: number
  event_type: string
  date: string
  related_mob_id?: number | null
  count?: number | null
  value?: string | null
  notes?: string | null
  images?: string[] | null
}

type MobMetaDraft = {
  sheep_class: string
  year_group: string
  sheep_tags: string
}

type TabId = 'daily' | 'mobs' | 'fields' | 'activity'

const DEATH_CAUSES: Array<{ value: string; label: string }> = [
  { value: 'pest', label: 'Killed by pest' },
  { value: 'found_dead', label: 'Found dead' },
  { value: 'illness', label: 'Illness' },
  { value: 'injury', label: 'Injury' },
  { value: 'unknown', label: 'Unknown cause' },
]

const SHEEP_CLASSES = ['mixed', 'ewe', 'ram', 'lamb', 'wether']

function uniqIds(ids: number[]) {
  const out: number[] = []
  const seen = new Set<number>()
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function parseTags(text: string) {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => !!t)
    .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
}

function getMobPaddocks(mob?: Mob | null) {
  if (!mob) return []
  const raw = Array.isArray(mob.paddock_ids) && mob.paddock_ids.length > 0
    ? mob.paddock_ids
    : (mob.paddock_id ? [mob.paddock_id] : [])
  return uniqIds(raw)
}

function isSameDay(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function formatDateTime(iso: string) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString()
}

function imageList(images?: string[] | null) {
  if (!images) return []
  return images.filter((img) => typeof img === 'string' && !!img.trim())
}

function eventTypeLabel(eventType: string) {
  const key = (eventType || '').toLowerCase()
  if (key === 'joining') return 'Joining'
  if (key === 'lambing') return 'Lambing'
  if (key === 'lamb_marking') return 'Lamb Marking'
  if (key === 'tagging') return 'Tagging'
  if (key === 'year_update') return 'Year Update'
  return 'Sheep Event'
}

export default function App() {
  const [tab, setTab] = useState<TabId>('daily')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [mobs, setMobs] = useState<Mob[]>([])
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [mobEvents, setMobEvents] = useState<SheepMobEvent[]>([])

  const [newMobName, setNewMobName] = useState('New Mob')
  const [newMobCount, setNewMobCount] = useState(100)
  const [newMobClass, setNewMobClass] = useState('mixed')
  const [newMobYear, setNewMobYear] = useState('')
  const [newMobTags, setNewMobTags] = useState('')
  const [creatingMob, setCreatingMob] = useState(false)

  const [splitMobName, setSplitMobName] = useState('')
  const [splitMobClass, setSplitMobClass] = useState('lamb')
  const [splitMobYear, setSplitMobYear] = useState('')
  const [splitMobTags, setSplitMobTags] = useState('')
  const [splitCounts, setSplitCounts] = useState<Record<number, number>>({})
  const [creatingFromMobs, setCreatingFromMobs] = useState(false)

  const [joinSourceMobId, setJoinSourceMobId] = useState<number | ''>('')
  const [joinApplyAll, setJoinApplyAll] = useState(true)
  const [joinTargets, setJoinTargets] = useState<number[]>([])
  const [joinNotes, setJoinNotes] = useState('')
  const [joiningBusy, setJoiningBusy] = useState(false)

  const [lambingMobId, setLambingMobId] = useState<number | ''>('')
  const [lambingCount, setLambingCount] = useState(0)
  const [lambingLosses, setLambingLosses] = useState(0)
  const [lambingNotes, setLambingNotes] = useState('')
  const [lambingFiles, setLambingFiles] = useState<File[]>([])
  const [savingLambing, setSavingLambing] = useState(false)

  const [markingMobId, setMarkingMobId] = useState<number | ''>('')
  const [markingCount, setMarkingCount] = useState(0)
  const [markingNotes, setMarkingNotes] = useState('')
  const [markingFiles, setMarkingFiles] = useState<File[]>([])
  const [savingMarking, setSavingMarking] = useState(false)

  const [mobMetaDraft, setMobMetaDraft] = useState<Record<number, MobMetaDraft>>({})
  const [savingMobMeta, setSavingMobMeta] = useState<Record<number, boolean>>({})

  const [selectedMobId, setSelectedMobId] = useState<number | ''>('')
  const [selectedPaddockIds, setSelectedPaddockIds] = useState<number[]>([])
  const [waterChecked, setWaterChecked] = useState(true)
  const [feedChecked, setFeedChecked] = useState(true)
  const [deathsCount, setDeathsCount] = useState<number>(0)
  const [deathCause, setDeathCause] = useState('')
  const [noteText, setNoteText] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [savingDaily, setSavingDaily] = useState(false)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2500)
  }

  const paddockName = (id?: number | null) => {
    if (!id) return 'Unassigned'
    return paddocks.find((p) => p.id === id)?.name || `Paddock ${id}`
  }

  const mobName = (id?: number | null) => {
    if (!id) return 'Unknown mob'
    return mobs.find((m) => m.id === id)?.name || `Mob ${id}`
  }

  const loadCore = async () => {
    const [pRes, mRes] = await Promise.all([
      axios.get(`${API}/v1/paddocks/`),
      axios.get(`${API}/v1/mobs/`),
    ])
    setPaddocks(pRes.data || [])
    setMobs(mRes.data || [])
  }

  const loadDailyLogs = async () => {
    try {
      const res = await axios.get(`${API}/v1/sheep/daily_logs`)
      setDailyLogs(res.data || [])
    } catch {
      setDailyLogs([])
    }
  }

  const loadMovements = async () => {
    try {
      const res = await axios.get(`${API}/v1/movements/`)
      setMovements(res.data || [])
    } catch {
      setMovements([])
    }
  }

  const loadMobEvents = async () => {
    try {
      const res = await axios.get(`${API}/v1/sheep/mob_events`)
      setMobEvents(res.data || [])
    } catch {
      setMobEvents([])
    }
  }

  const reloadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadCore(), loadDailyLogs(), loadMovements(), loadMobEvents()])
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reloadAll()
  }, [])

  useEffect(() => {
    if (selectedMobId === '' && mobs.length > 0) {
      setSelectedMobId(mobs[0].id)
      return
    }
    if (selectedMobId === '') return
    const mob = mobs.find((m) => m.id === selectedMobId)
    setSelectedPaddockIds(getMobPaddocks(mob))
  }, [selectedMobId, mobs])

  useEffect(() => {
    setMobMetaDraft((prev) => {
      const next = { ...prev }
      mobs.forEach((mob) => {
        if (!next[mob.id]) {
          next[mob.id] = {
            sheep_class: (mob.sheep_class || 'mixed'),
            year_group: mob.year_group != null ? String(mob.year_group) : '',
            sheep_tags: (mob.sheep_tags || []).join(', '),
          }
        }
      })
      return next
    })
  }, [mobs])

  const todaysLogs = useMemo(
    () => dailyLogs.filter((log) => isSameDay(log.date)).length,
    [dailyLogs]
  )

  const activePaddocks = useMemo(() => {
    const ids = new Set<number>()
    mobs.forEach((mob) => getMobPaddocks(mob).forEach((id) => ids.add(id)))
    return ids.size
  }, [mobs])

  const recentLogs = useMemo(
    () => [...dailyLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [dailyLogs]
  )

  const recentEvents = useMemo(
    () => [...mobEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [mobEvents]
  )

  const activityFeed = useMemo(() => {
    const checkItems = dailyLogs.map((log) => ({
      id: `daily-${log.id}`,
      kind: 'Daily check',
      date: log.date,
      mob_id: log.mob_id,
      summary:
        log.deaths_count > 0
          ? `${log.deaths_count} deaths reported${log.death_cause ? ` (${log.death_cause.replace('_', ' ')})` : ''}`
          : `${log.water_checked ? 'Water' : 'Water missing'} / ${log.feed_checked ? 'Feed' : 'Feed missing'}`,
    }))
    const moveItems = movements.map((mv) => ({
      id: `move-${mv.id}`,
      kind: 'Movement',
      date: mv.timestamp,
      mob_id: mv.mob_id,
      summary: `${paddockName(mv.from_paddock_id)} -> ${paddockName(mv.to_paddock_id)}`,
    }))
    const eventItems = mobEvents.map((ev) => ({
      id: `event-${ev.id}`,
      kind: eventTypeLabel(ev.event_type),
      date: ev.date,
      mob_id: ev.mob_id,
      summary:
        `${ev.count != null ? `${ev.count} head` : ''}${ev.value ? ` ${ev.value}` : ''}${ev.related_mob_id ? ` from ${mobName(ev.related_mob_id)}` : ''}${ev.notes ? ` - ${ev.notes}` : ''}`.trim() || 'Sheep event',
    }))
    return [...checkItems, ...moveItems, ...eventItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [dailyLogs, movements, mobEvents, paddocks, mobs])

  const toggleSelectedPaddock = (pid: number) => {
    setSelectedPaddockIds((prev) => (
      prev.includes(pid) ? prev.filter((v) => v !== pid) : [...prev, pid]
    ))
  }

  const toggleJoinTarget = (mobId: number) => {
    setJoinTargets((prev) => (
      prev.includes(mobId) ? prev.filter((id) => id !== mobId) : [...prev, mobId]
    ))
  }

  const createMob = async () => {
    const name = newMobName.trim()
    if (!name) return
    setCreatingMob(true)
    try {
      await axios.post(`${API}/v1/mobs/`, {
        name,
        count: Number.isFinite(newMobCount) ? newMobCount : 0,
        avg_weight: 0,
        paddock_id: null,
        sheep_class: newMobClass || null,
        year_group: newMobYear ? parseInt(newMobYear, 10) : null,
        sheep_tags: parseTags(newMobTags),
      })
      setNewMobName('')
      setNewMobCount(100)
      setNewMobClass('mixed')
      setNewMobYear('')
      setNewMobTags('')
      await loadCore()
      showToast('Mob created')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create mob')
    } finally {
      setCreatingMob(false)
    }
  }

  const createMobFromExisting = async () => {
    const name = splitMobName.trim()
    if (!name) {
      setError('New mob name is required')
      return
    }
    const parts = Object.entries(splitCounts)
      .map(([mobId, count]) => ({ mob_id: parseInt(mobId, 10), count: Math.max(0, Math.floor(Number(count || 0))) }))
      .filter((x) => x.count > 0)
    if (parts.length === 0) {
      setError('Enter at least one source mob count')
      return
    }
    setCreatingFromMobs(true)
    try {
      await axios.post(`${API}/v1/mobs/from-existing`, {
        name,
        sheep_class: splitMobClass || null,
        year_group: splitMobYear ? parseInt(splitMobYear, 10) : null,
        sheep_tags: parseTags(splitMobTags),
        parts,
      })
      setSplitMobName('')
      setSplitMobClass('lamb')
      setSplitMobYear('')
      setSplitMobTags('')
      setSplitCounts({})
      await Promise.all([loadCore(), loadMovements()])
      showToast('New mob created from source mobs')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create mob from existing mobs')
    } finally {
      setCreatingFromMobs(false)
    }
  }

  const uploadDailyImages = async (files: File[]) => {
    const urls: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const res = await axios.post(`${API}/v1/sheep/daily_logs/images`, form)
      if (typeof res.data?.url === 'string' && res.data.url.trim()) {
        urls.push(res.data.url)
      }
    }
    return urls
  }

  const uploadMobEventImages = async (files: File[]) => {
    const urls: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const res = await axios.post(`${API}/v1/sheep/mob_events/images`, form)
      if (typeof res.data?.url === 'string' && res.data.url.trim()) {
        urls.push(res.data.url)
      }
    }
    return urls
  }

  const saveDailyCheck = async () => {
    if (selectedMobId === '') {
      setError('Select a mob first')
      return
    }
    setSavingDaily(true)
    try {
      const imageUrls = await uploadDailyImages(photoFiles)
      await axios.post(`${API}/v1/sheep/daily_logs`, {
        mob_id: selectedMobId,
        paddock_ids: uniqIds(selectedPaddockIds),
        water_checked: waterChecked,
        feed_checked: feedChecked,
        deaths_count: Math.max(0, Number(deathsCount || 0)),
        death_cause: deathCause || null,
        notes: noteText.trim() || null,
        images: imageUrls,
      })
      setNoteText('')
      setPhotoFiles([])
      setDeathsCount(0)
      setDeathCause('')
      setWaterChecked(true)
      setFeedChecked(true)
      await loadDailyLogs()
      showToast('Daily sheep check saved')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save daily check')
    } finally {
      setSavingDaily(false)
    }
  }

  const saveJoiningFromMob = async () => {
    if (joinSourceMobId === '') {
      setError('Select source mob for joining')
      return
    }
    if (!joinApplyAll && joinTargets.length === 0) {
      setError('Select at least one target mob')
      return
    }
    setJoiningBusy(true)
    try {
      await axios.post(`${API}/v1/sheep/joining/from-mob`, {
        source_mob_id: joinSourceMobId,
        apply_to_all: joinApplyAll,
        target_mob_ids: joinApplyAll ? [] : uniqIds(joinTargets),
        notes: joinNotes.trim() || null,
      })
      setJoinNotes('')
      setJoinTargets([])
      await loadMobEvents()
      showToast('Joining event saved')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save joining event')
    } finally {
      setJoiningBusy(false)
    }
  }

  const saveLambing = async () => {
    if (lambingMobId === '') {
      setError('Select mob for lambing')
      return
    }
    setSavingLambing(true)
    try {
      const images = await uploadMobEventImages(lambingFiles)
      await axios.post(`${API}/v1/sheep/mob_events`, {
        mob_id: lambingMobId,
        event_type: 'lambing',
        count: Math.max(0, Number(lambingCount || 0)),
        value: `losses:${Math.max(0, Number(lambingLosses || 0))}`,
        notes: lambingNotes.trim() || null,
        images,
      })
      setLambingCount(0)
      setLambingLosses(0)
      setLambingNotes('')
      setLambingFiles([])
      await loadMobEvents()
      showToast('Lambing event saved')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save lambing event')
    } finally {
      setSavingLambing(false)
    }
  }

  const saveLambMarking = async () => {
    if (markingMobId === '') {
      setError('Select mob for lamb marking')
      return
    }
    setSavingMarking(true)
    try {
      const images = await uploadMobEventImages(markingFiles)
      const count = Math.max(0, Number(markingCount || 0))
      await axios.post(`${API}/v1/sheep/mob_events`, {
        mob_id: markingMobId,
        event_type: 'lamb_marking',
        count,
        notes: markingNotes.trim() || null,
        images,
      })
      await axios.post(`${API}/v1/sheep/marking`, {
        mob_id: markingMobId,
        notes: `Lamb marked: ${count}${markingNotes.trim() ? ` - ${markingNotes.trim()}` : ''}`,
      })
      setMarkingCount(0)
      setMarkingNotes('')
      setMarkingFiles([])
      await loadMobEvents()
      showToast('Lamb marking saved')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save lamb marking')
    } finally {
      setSavingMarking(false)
    }
  }

  const saveMobMeta = async (mob: Mob) => {
    const draft = mobMetaDraft[mob.id]
    if (!draft) return
    setSavingMobMeta((prev) => ({ ...prev, [mob.id]: true }))
    try {
      const sheep_class = draft.sheep_class ? draft.sheep_class.trim().toLowerCase() : null
      const year_group = draft.year_group ? parseInt(draft.year_group, 10) : null
      const sheep_tags = parseTags(draft.sheep_tags)

      await axios.patch(`${API}/v1/mobs/${mob.id}`, {
        sheep_class,
        year_group,
        sheep_tags,
      })

      if ((mob.year_group || null) !== (Number.isNaN(year_group as any) ? null : year_group)) {
        await axios.post(`${API}/v1/sheep/mob_events`, {
          mob_id: mob.id,
          event_type: 'year_update',
          value: year_group != null ? String(year_group) : 'cleared',
          notes: 'Year group updated',
        })
      }
      if ((mob.sheep_tags || []).join(',') !== sheep_tags.join(',')) {
        await axios.post(`${API}/v1/sheep/mob_events`, {
          mob_id: mob.id,
          event_type: 'tagging',
          value: sheep_tags.join(', '),
          notes: 'Mob tags updated',
        })
      }

      await Promise.all([loadCore(), loadMobEvents()])
      showToast(`Updated ${mob.name}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save mob metadata')
    } finally {
      setSavingMobMeta((prev) => ({ ...prev, [mob.id]: false }))
    }
  }

  if (loading) {
    return (
      <div className="jf-shell">
        <div className="jf-loading">Loading farm data...</div>
      </div>
    )
  }

  return (
    <div className="jf-shell">
      <header className="jf-hero">
        <div>
          <h1>Sheep Desk</h1>
          <p>Daily checks, joining, lambing, marking, mob tags and years.</p>
        </div>
        <div className="jf-metrics">
          <div className="jf-metric"><span>{mobs.length}</span>Mobs</div>
          <div className="jf-metric"><span>{activePaddocks}</span>Active fields</div>
          <div className="jf-metric"><span>{todaysLogs}</span>Checks today</div>
        </div>
      </header>

      <nav className="jf-tabs">
        <button className={tab === 'daily' ? 'active' : ''} onClick={() => setTab('daily')}>Daily Check</button>
        <button className={tab === 'mobs' ? 'active' : ''} onClick={() => setTab('mobs')}>Mobs & Sheep Ops</button>
        <button className={tab === 'fields' ? 'active' : ''} onClick={() => setTab('fields')}>Fields</button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity</button>
      </nav>

      {error && (
        <div className="jf-alert">
          <strong>Problem:</strong> {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {tab === 'daily' && (
        <main className="jf-grid jf-grid--two">
          <section className="jf-card">
            <h2>New Daily Sheep Check</h2>
            <p className="jf-subtle">Fast entry for water/food checks, photos, and death reports.</p>

            <label>Mob</label>
            <select
              value={selectedMobId as any}
              onChange={(e) => setSelectedMobId(e.target.value ? parseInt(e.target.value, 10) : '')}
            >
              <option value="">Select mob</option>
              {mobs.map((mob) => (
                <option key={mob.id} value={mob.id}>
                  {mob.name} ({mob.count})
                </option>
              ))}
            </select>

            <label>Fields this mob is currently using</label>
            <div className="jf-check-grid">
              {paddocks.map((p) => (
                <label key={p.id} className="jf-chip-check">
                  <input
                    type="checkbox"
                    checked={selectedPaddockIds.includes(p.id)}
                    onChange={() => toggleSelectedPaddock(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
              {paddocks.length === 0 && <div className="jf-subtle">Import paddocks first on the Fields tab.</div>}
            </div>

            <div className="jf-status-row">
              <label className={waterChecked ? 'ok' : 'warn'}>
                <input type="checkbox" checked={waterChecked} onChange={(e) => setWaterChecked(e.target.checked)} />
                Water checked
              </label>
              <label className={feedChecked ? 'ok' : 'warn'}>
                <input type="checkbox" checked={feedChecked} onChange={(e) => setFeedChecked(e.target.checked)} />
                Feed checked
              </label>
            </div>

            <div className="jf-inline">
              <div>
                <label>Deaths found</label>
                <input
                  type="number"
                  min={0}
                  value={deathsCount}
                  onChange={(e) => setDeathsCount(Math.max(0, parseInt(e.target.value || '0', 10)))}
                />
              </div>
              <div>
                <label>Cause</label>
                <select value={deathCause} onChange={(e) => setDeathCause(e.target.value)}>
                  <option value="">No death cause</option>
                  {DEATH_CAUSES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <label>Notes</label>
            <textarea
              rows={4}
              placeholder="Water trough low at south corner, fixed valve, hay topped up..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />

            <label>Photo evidence (optional)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
            />
            {photoFiles.length > 0 && (
              <div className="jf-file-list">
                {photoFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`}>{f.name}</div>
                ))}
              </div>
            )}

            <button className="jf-primary" onClick={saveDailyCheck} disabled={savingDaily || selectedMobId === ''}>
              {savingDaily ? 'Saving...' : 'Save Daily Check'}
            </button>
          </section>

          <section className="jf-card">
            <h2>Recent Checks</h2>
            <p className="jf-subtle">Latest notes and photo logs across all mobs.</p>
            <div className="jf-list">
              {recentLogs.slice(0, 30).map((log) => {
                const images = imageList(log.images)
                return (
                  <article key={log.id} className="jf-list-item">
                    <div className="jf-list-head">
                      <strong>{mobName(log.mob_id)}</strong>
                      <span>{formatDateTime(log.date)}</span>
                    </div>
                    <div className="jf-mini">
                      Fields: {log.paddock_ids.length > 0 ? log.paddock_ids.map((id) => paddockName(id)).join(', ') : 'None'}
                    </div>
                    <div className="jf-mini">
                      {log.water_checked ? 'Water ok' : 'Water issue'} | {log.feed_checked ? 'Feed ok' : 'Feed issue'}
                    </div>
                    {log.deaths_count > 0 && (
                      <div className="jf-danger">
                        {log.deaths_count} deaths
                        {log.death_cause ? ` (${log.death_cause.replace('_', ' ')})` : ''}
                      </div>
                    )}
                    {log.notes && <p>{log.notes}</p>}
                    {images.length > 0 && (
                      <div className="jf-image-row">
                        {images.map((img, idx) => (
                          <a key={`${img}-${idx}`} href={img} target="_blank" rel="noreferrer">
                            <img src={img} alt={`Daily check ${idx + 1}`} />
                          </a>
                        ))}
                      </div>
                    )}
                    <button
                      className="jf-ghost"
                      onClick={() => {
                        setTab('daily')
                        setSelectedMobId(log.mob_id)
                      }}
                    >
                      New note for this mob
                    </button>
                  </article>
                )
              })}
              {recentLogs.length === 0 && <div className="jf-subtle">No daily logs yet.</div>}
            </div>
          </section>
        </main>
      )}

      {tab === 'mobs' && (
        <main className="jf-grid jf-grid--single">
          <section className="jf-card">
            <h2>Create Mob</h2>
            <div className="jf-inline">
              <div>
                <label>Mob name</label>
                <input value={newMobName} onChange={(e) => setNewMobName(e.target.value)} placeholder="Ewes North" />
              </div>
              <div>
                <label>Head count</label>
                <input
                  type="number"
                  min={0}
                  value={newMobCount}
                  onChange={(e) => setNewMobCount(parseInt(e.target.value || '0', 10))}
                />
              </div>
            </div>
            <div className="jf-inline">
              <div>
                <label>Class</label>
                <select value={newMobClass} onChange={(e) => setNewMobClass(e.target.value)}>
                  {SHEEP_CLASSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label>Year Group</label>
                <input type="number" value={newMobYear} onChange={(e) => setNewMobYear(e.target.value)} placeholder="2025" />
              </div>
            </div>
            <label>Tags (comma separated)</label>
            <input value={newMobTags} onChange={(e) => setNewMobTags(e.target.value)} placeholder="maiden, twin-breeder" />
            <button className="jf-primary" onClick={createMob} disabled={creatingMob}>
              {creatingMob ? 'Creating...' : 'Add Mob'}
            </button>
          </section>

          <section className="jf-card">
            <h2>Create New Mob From Existing Mobs</h2>
            <p className="jf-subtle">Take numbers from one or many mobs to form a new mob.</p>
            <div className="jf-inline">
              <div>
                <label>New mob name</label>
                <input value={splitMobName} onChange={(e) => setSplitMobName(e.target.value)} placeholder="2026 Lamb Drop" />
              </div>
              <div>
                <label>Class</label>
                <select value={splitMobClass} onChange={(e) => setSplitMobClass(e.target.value)}>
                  {SHEEP_CLASSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="jf-inline">
              <div>
                <label>Year Group</label>
                <input type="number" value={splitMobYear} onChange={(e) => setSplitMobYear(e.target.value)} placeholder="2026" />
              </div>
              <div>
                <label>Tags</label>
                <input value={splitMobTags} onChange={(e) => setSplitMobTags(e.target.value)} placeholder="lambs, weaner" />
              </div>
            </div>
            <div className="jf-list">
              {mobs.map((mob) => (
                <div key={`split-${mob.id}`} className="jf-list-item">
                  <div className="jf-list-head">
                    <strong>{mob.name}</strong>
                    <span>Available: {mob.count}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={mob.count}
                    value={splitCounts[mob.id] ?? 0}
                    onChange={(e) => {
                      const value = Math.max(0, Math.min(mob.count, parseInt(e.target.value || '0', 10)))
                      setSplitCounts((prev) => ({ ...prev, [mob.id]: value }))
                    }}
                  />
                </div>
              ))}
            </div>
            <button className="jf-primary" onClick={createMobFromExisting} disabled={creatingFromMobs}>
              {creatingFromMobs ? 'Creating...' : 'Create From Existing Mobs'}
            </button>
          </section>

          <section className="jf-card">
            <h2>Joining From Mob</h2>
            <p className="jf-subtle">Use one mob as source and apply joining to selected mobs or all mobs.</p>
            <label>Source Mob</label>
            <select
              value={joinSourceMobId as any}
              onChange={(e) => setJoinSourceMobId(e.target.value ? parseInt(e.target.value, 10) : '')}
            >
              <option value="">Select source mob</option>
              {mobs.map((mob) => <option key={`src-${mob.id}`} value={mob.id}>{mob.name}</option>)}
            </select>
            <label className={joinApplyAll ? 'ok' : 'warn'}>
              <input type="checkbox" checked={joinApplyAll} onChange={(e) => setJoinApplyAll(e.target.checked)} />
              Apply from source to all other mobs
            </label>
            {!joinApplyAll && (
              <>
                <label>Target Mobs</label>
                <div className="jf-check-grid">
                  {mobs
                    .filter((mob) => mob.id !== joinSourceMobId)
                    .map((mob) => (
                      <label key={`join-${mob.id}`} className="jf-chip-check">
                        <input
                          type="checkbox"
                          checked={joinTargets.includes(mob.id)}
                          onChange={() => toggleJoinTarget(mob.id)}
                        />
                        <span>{mob.name}</span>
                      </label>
                    ))}
                </div>
              </>
            )}
            <label>Notes</label>
            <textarea value={joinNotes} onChange={(e) => setJoinNotes(e.target.value)} rows={3} placeholder="Joined ram mob into ewes" />
            <button className="jf-primary" onClick={saveJoiningFromMob} disabled={joiningBusy}>
              {joiningBusy ? 'Saving...' : 'Save Joining'}
            </button>
          </section>

          <section className="jf-card">
            <h2>Lambing</h2>
            <div className="jf-inline">
              <div>
                <label>Mob</label>
                <select
                  value={lambingMobId as any}
                  onChange={(e) => setLambingMobId(e.target.value ? parseInt(e.target.value, 10) : '')}
                >
                  <option value="">Select mob</option>
                  {mobs.map((mob) => <option key={`lmb-${mob.id}`} value={mob.id}>{mob.name}</option>)}
                </select>
              </div>
              <div>
                <label>Lambs born</label>
                <input type="number" min={0} value={lambingCount} onChange={(e) => setLambingCount(Math.max(0, parseInt(e.target.value || '0', 10)))} />
              </div>
            </div>
            <div className="jf-inline">
              <div>
                <label>Losses</label>
                <input type="number" min={0} value={lambingLosses} onChange={(e) => setLambingLosses(Math.max(0, parseInt(e.target.value || '0', 10)))} />
              </div>
              <div>
                <label>Photos (optional)</label>
                <input type="file" accept="image/*" multiple onChange={(e) => setLambingFiles(Array.from(e.target.files || []))} />
              </div>
            </div>
            <label>Notes</label>
            <textarea value={lambingNotes} onChange={(e) => setLambingNotes(e.target.value)} rows={3} />
            <button className="jf-primary" onClick={saveLambing} disabled={savingLambing}>
              {savingLambing ? 'Saving...' : 'Save Lambing'}
            </button>
          </section>

          <section className="jf-card">
            <h2>Lamb Marking</h2>
            <div className="jf-inline">
              <div>
                <label>Mob</label>
                <select
                  value={markingMobId as any}
                  onChange={(e) => setMarkingMobId(e.target.value ? parseInt(e.target.value, 10) : '')}
                >
                  <option value="">Select mob</option>
                  {mobs.map((mob) => <option key={`mrk-${mob.id}`} value={mob.id}>{mob.name}</option>)}
                </select>
              </div>
              <div>
                <label>Marked count</label>
                <input type="number" min={0} value={markingCount} onChange={(e) => setMarkingCount(Math.max(0, parseInt(e.target.value || '0', 10)))} />
              </div>
            </div>
            <div className="jf-inline">
              <div>
                <label>Photos (optional)</label>
                <input type="file" accept="image/*" multiple onChange={(e) => setMarkingFiles(Array.from(e.target.files || []))} />
              </div>
              <div />
            </div>
            <label>Notes</label>
            <textarea value={markingNotes} onChange={(e) => setMarkingNotes(e.target.value)} rows={3} />
            <button className="jf-primary" onClick={saveLambMarking} disabled={savingMarking}>
              {savingMarking ? 'Saving...' : 'Save Lamb Marking'}
            </button>
          </section>

          <section className="jf-card">
            <h2>Mob Tags, Years and Class</h2>
            <div className="jf-list">
              {mobs.map((mob) => {
                const draft = mobMetaDraft[mob.id] || { sheep_class: 'mixed', year_group: '', sheep_tags: '' }
                return (
                  <article key={`meta-${mob.id}`} className="jf-list-item">
                    <div className="jf-list-head">
                      <strong>{mob.name}</strong>
                      <span>{mob.count} head</span>
                    </div>
                    <div className="jf-inline">
                      <div>
                        <label>Class</label>
                        <select
                          value={draft.sheep_class}
                          onChange={(e) => setMobMetaDraft((prev) => ({ ...prev, [mob.id]: { ...draft, sheep_class: e.target.value } }))}
                        >
                          {SHEEP_CLASSES.map((s) => <option key={`${mob.id}-${s}`} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Year Group</label>
                        <input
                          type="number"
                          value={draft.year_group}
                          onChange={(e) => setMobMetaDraft((prev) => ({ ...prev, [mob.id]: { ...draft, year_group: e.target.value } }))}
                        />
                      </div>
                    </div>
                    <label>Tags</label>
                    <input
                      value={draft.sheep_tags}
                      onChange={(e) => setMobMetaDraft((prev) => ({ ...prev, [mob.id]: { ...draft, sheep_tags: e.target.value } }))}
                    />
                    <button className="jf-primary" onClick={() => saveMobMeta(mob)} disabled={!!savingMobMeta[mob.id]}>
                      {savingMobMeta[mob.id] ? 'Saving...' : 'Save Sheep Meta'}
                    </button>
                  </article>
                )
              })}
              {mobs.length === 0 && <div className="jf-subtle">Create mobs to manage sheep metadata.</div>}
            </div>
          </section>

          <section className="jf-card">
            <h2>Recent Sheep Events</h2>
            <div className="jf-list">
              {recentEvents.slice(0, 30).map((ev) => (
                <article key={`ev-${ev.id}`} className="jf-list-item">
                  <div className="jf-list-head">
                    <strong>{eventTypeLabel(ev.event_type)} · {mobName(ev.mob_id)}</strong>
                    <span>{formatDateTime(ev.date)}</span>
                  </div>
                  <div className="jf-mini">
                    {ev.related_mob_id ? `From: ${mobName(ev.related_mob_id)} · ` : ''}
                    {ev.count != null ? `${ev.count} head · ` : ''}
                    {ev.value || ''}
                  </div>
                  {ev.notes && <p>{ev.notes}</p>}
                  {imageList(ev.images).length > 0 && (
                    <div className="jf-image-row">
                      {imageList(ev.images).map((img, idx) => (
                        <a key={`${img}-${idx}`} href={img} target="_blank" rel="noreferrer">
                          <img src={img} alt={`Event ${idx + 1}`} />
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {recentEvents.length === 0 && <div className="jf-subtle">No sheep events recorded yet.</div>}
            </div>
          </section>
        </main>
      )}

      {tab === 'fields' && (
        <main className="jf-grid jf-grid--two">
          <section className="jf-card">
            <h2>Import/Update Paddocks</h2>
            <p className="jf-subtle">Upload KML when your field map changes.</p>
            <KmlUploader onUploaded={reloadAll} />
          </section>
          <section className="jf-card">
            <h2>Field List</h2>
            <div className="jf-list">
              {paddocks.map((p) => (
                <article key={p.id} className="jf-list-item">
                  <div className="jf-list-head">
                    <strong>{p.name}</strong>
                    <span>{p.area_ha.toFixed(2)} ha</span>
                  </div>
                  <div className="jf-mini">{p.crop_type ? `Crop: ${p.crop_type}` : 'No crop type set'}</div>
                </article>
              ))}
              {paddocks.length === 0 && <div className="jf-subtle">No paddocks loaded yet.</div>}
            </div>
          </section>
        </main>
      )}

      {tab === 'activity' && (
        <main className="jf-grid jf-grid--single">
          <section className="jf-card">
            <h2>Combined Activity Feed</h2>
            <p className="jf-subtle">Movements, daily checks, and sheep events in one timeline.</p>
            <div className="jf-list">
              {activityFeed.map((row) => (
                <article key={row.id} className="jf-list-item">
                  <div className="jf-list-head">
                    <strong>{row.kind}</strong>
                    <span>{formatDateTime(row.date)}</span>
                  </div>
                  <div className="jf-mini">{mobName(row.mob_id)}</div>
                  <p>{row.summary}</p>
                </article>
              ))}
              {activityFeed.length === 0 && <div className="jf-subtle">No activity yet.</div>}
            </div>
          </section>
        </main>
      )}

      {toast && <div className="jf-toast">{toast}</div>}
    </div>
  )
}
