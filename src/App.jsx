import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import './index.css'
import { burmeseLabels } from './constants'

const COMMON_INPUT_CLASSES = "w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"

const VISA_TYPES = [
  { value: 'E9,D2,F2,E7', label: 'E9, D2, F2, E7' },
  { value: 'F6', label: 'F6' },
  { value: 'D4', label: 'D4' },
  { value: 'A1', label: 'A1' },
  { value: 'F', label: 'F' },
  { value: 'G1', label: 'G1' },
  { value: 'O,E10', label: 'O, E10' },
]

const VISA_RULES = {
  'E9,D2,F2,E7': [2, 3, 4, 5],
  'F6': [2, 3, 'olo3'],
  'D4': ['4 (if >4month)', 'olo3'],
  'A1': [2, 3, 4],
  'F': ['to confirm to office'],
  'G1': ['4 (if >4month)', 'olo3'],
  'O,E10': ['olo3'],
}

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

function multiplierForMonths(months) {
  if (months === 5) return 1.15
  if (months === 3 || months === 4) return 1.1
  return 1
}

function optionLabel(m) {
  if (typeof m === 'number' && Number.isFinite(m)) return `${m} month${m > 1 ? 's' : ''}`
  if (m === 'olo3') return 'olo3 (50/25/25)'
  return String(m)
}

function computePlanLabel(value) {
  if (value === 'olo3') return 'olo3 (50/25/25)'
  if (/^\d+$/.test(String(value))) return `${value} month${Number(value) > 1 ? 's' : ''}`
  return String(value || '')
}

function App() {
  const [visa, setVisa] = useState('')
  const [plan, setPlan] = useState('')
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('0')

  const [notes, setNotes] = useState([])
  const [noteInput, setNoteInput] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState('')

  const [images, setImages] = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef(null)

  const allowedPlans = useMemo(() => VISA_RULES[visa] || [], [visa])

  useEffect(() => {
    setPlan('')
  }, [visa])

  const calculation = useMemo(() => {
    const priceNum = Number(price) || 0
    const discountNum = Math.max(0, Number(discount) || 0)

    if (!plan || priceNum <= 0) {
      return { payments: [], total: null, monthly: null, planLabel: '', sum: null }
    }

    if (plan === 'olo3') {
      const k = multiplierForMonths(3)
      const total = priceNum * k
      const payments = [total * 0.5, Math.max(0, total * 0.25 - discountNum), total * 0.25]
      return {
        payments,
        total,
        monthly: null,
        planLabel: computePlanLabel(plan),
        sum: payments.reduce((a, b) => a + b, 0),
      }
    }

    if (/^\d+$/.test(plan)) {
      const months = parseInt(plan, 10)
      const k = multiplierForMonths(months)
      const total = priceNum * k
      const monthly = total / months
      const payments = Array.from({ length: months }, (_, i) => {
        if (i === 1) return Math.max(0, monthly - discountNum)
        return monthly
      })
      return {
        payments,
        total,
        monthly,
        planLabel: computePlanLabel(plan),
        sum: payments.reduce((a, b) => a + b, 0),
      }
    }

    return { payments: [], total: null, monthly: null, planLabel: '', sum: null }
  }, [plan, price, discount])

  const loadNotes = useCallback(async () => {
    setNotesLoading(true)
    const { data, error: err } = await supabase.from('notes').select('*').order('created_at', { ascending: false })
    if (err) setError(err.message || 'Failed to load notes')
    else {
      setNotes(data || [])
      setError('')
    }
    setNotesLoading(false)
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const loadImages = useCallback(async () => {
    const { data, error: err } = await supabase.from('images').select('*').order('created_at', { ascending: false })
    if (err) setError(err.message || 'Failed to load images')
    else setImages(data || [])
  }, [])

  useEffect(() => { loadImages() }, [loadImages])

  const saveNote = async () => {
    const text = noteInput.trim()
    if (!text) return
    setSavingNote(true)
    const { error: err } = await supabase.from('notes').insert({ text })
    if (err) setError(err.message || 'Failed to save note')
    else {
      setNoteInput('')
      await loadNotes()
    }
    setSavingNote(false)
  }

  const uploadImage = async (file) => {
    if (!file) return null
    const uniqueName = `${Date.now()}-${file.name}`
    const { data, error: uploadErr } = await supabase.storage
      .from('uploads')
      .upload(`uploads/${uniqueName}`, file, { cacheControl: '3600', upsert: false })
    if (uploadErr) {
      setError(uploadErr.message || 'Failed to upload image')
      return null
    }
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(data.path)
    return { name: file.name, url: urlData?.publicUrl, path: data.path }
  }

  const handleUploadAll = async () => {
    setImageUploading(true)
    setError('')
    const uploadedImageRecords = []
    for (const file of selectedFiles) {
      const record = await uploadImage(file)
      if (record) uploadedImageRecords.push(record)
    }
    if (uploadedImageRecords.length > 0) {
      const { error: insertErr } = await supabase.from('images').insert(uploadedImageRecords)
      if (insertErr) setError(insertErr.message || 'Failed to save image records')
      else {
        await loadImages()
        setSelectedFiles([])
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    setImageUploading(false)
  }

  const handleFileChange = (e) => {
    setSelectedFiles(Array.from(e.target.files))
  }

  const deleteImage = async (img) => {
    if (!img?.id) return
    setImageUploading(true)
    if (img.path) await supabase.storage.from('uploads').remove([img.path])
    const { error: err } = await supabase.from('images').delete().eq('id', img.id)
    if (err) setError(err.message || 'Failed to delete image')
    else await loadImages()
    setImageUploading(false)
  }

  const deleteNoteById = async (id) => {
    setSavingNote(true)
    const { error: err } = await supabase.from('notes').delete().eq('id', id)
    if (!err) await loadNotes()
    setSavingNote(false)
  }

  const clearAllNotes = async () => {
    setSavingNote(true)
    const { error: err } = await supabase.from('notes').delete().neq('id', '')
    if (!err) await loadNotes()
    setSavingNote(false)
  }

  const copySingleNote = (text) => {
    navigator.clipboard.writeText(text).then(() => alert('✅ Note copied!'))
  }

  const copySchedule = () => {
    if (!calculation.payments.length) return
    let text = `** Item လေးကို\nအရစ်ကျ plan လေးနဲ့သွင်းချင်တယ်ဆိုရင်ဆိုရင်တော့\n`
    calculation.payments.forEach((amt, i) => {
      text += `${burmeseLabels[i] || `${i + 1} လအတွက်က`} ${fmt.format(amt)}\n`
    })
    text += 'ပေးသွင်းရင်ရပါပြီရှင့်'
    navigator.clipboard.writeText(text).then(() => alert('✅ Payment schedule copied!'))
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        {/* Main Calculator Section */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Phone Installment Calculator</h1>
            <p className="mt-1 text-xs font-medium text-indigo-700 inline-flex items-center gap-2 px-2 py-1 rounded-full bg-indigo-50">
              <span>3/4 → ×1.10</span>
              <span>5 → ×1.15</span>
              <span>olo3 → ×1.10 then 50/25/25</span>
            </p>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Visa type</label>
              <select value={visa} onChange={(e) => setVisa(e.target.value)} className={COMMON_INPUT_CLASSES}>
                <option value="">Select Visa type…</option>
                {VISA_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Installment plan</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={!allowedPlans.length} className={`${COMMON_INPUT_CLASSES} disabled:bg-slate-50`}>
                <option value="">Select plan…</option>
                {allowedPlans.map((p) => <option key={String(p)} value={String(p)}>{optionLabel(p)}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone price</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g., 35990" className={COMMON_INPUT_CLASSES} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Second-month discount</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className={COMMON_INPUT_CLASSES} />
            </div>
          </div>

          <div className="mt-8 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-lg p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-800">Total:</span>
              <span className="text-lg font-bold text-indigo-900">{calculation.total != null ? fmt.format(calculation.total) : '–'}</span>
            </div>
          </div>

          {calculation.payments.length > 0 && (
            <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-700 uppercase">
                        <tr><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Amount</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {calculation.payments.map((amt, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-3">{i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`} payment</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">{fmt.format(amt)}</td>
                        </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          )}

          <button onClick={copySchedule} className="mt-6 w-full py-3 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition-all">
            Copy Payment Schedule
          </button>
        </div>

        {/* Notes Section */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-lg p-6 md:p-8 lg:sticky lg:top-8">
          <h3 className="text-xl font-bold text-slate-900">Notes</h3>
          <textarea rows="5" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Type your note here..." className={`${COMMON_INPUT_CLASSES} mt-4`}></textarea>
          <div className="mt-4 flex gap-3">
            <button onClick={saveNote} disabled={savingNote} className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-70">Save</button>
            <button onClick={clearAllNotes} disabled={savingNote || !notes.length} className="flex-1 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">Clear</button>
          </div>
          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-sm text-amber-900 break-words flex-1 mr-2">{note.text}</span>
                <div className="flex gap-2">
                  <button onClick={() => copySingleNote(note.text)} className="text-blue-500">📋</button>
                  <button onClick={() => deleteNoteById(note.id)} className="text-red-500">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Images Section - UPDATED FOR RESPONSIVENESS */}
      <div className="max-w-6xl mx-auto mt-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Images</h3>
              <p className="text-sm text-slate-600">Upload images for reference.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                disabled={imageUploading}
                className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 max-w-full"
              />
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleUploadAll}
                  disabled={imageUploading}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-70"
                >
                  {imageUploading ? 'Uploading…' : `Upload ${selectedFiles.length} Images`}
                </button>
              )}
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
              <h4 className="text-md font-medium text-blue-800 mb-2">Selected Files:</h4>
              <ul className="list-disc list-inside text-sm text-blue-700 break-all">
                {selectedFiles.map((file, index) => (
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4">
            {images.map((img) => (
              <div key={img.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 shadow-sm">
                <div className="w-full bg-white flex items-center justify-center p-2">
                  <img src={img.url} alt={img.name} className="max-w-full h-auto max-h-[70vh] object-contain" />
                </div>
                <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 truncate mr-4">{img.name}</span>
                  <button onClick={() => deleteImage(img)} className="text-sm font-semibold text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App