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
  if (/^\\d+$/.test(String(value))) return `${value} month${Number(value) > 1 ? 's' : ''}`
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
  const [imageProgress, setImageProgress] = useState(0)
  const fileInputRef = useRef(null)

  const allowedPlans = useMemo(() => VISA_RULES[visa] || [], [visa])

  useEffect(() => {
    setPlan('')
  }, [visa])

  const calculation = useMemo(() => {
    const priceNum = Number(price) || 0
    const discountNum = Math.max(0, Number(discount) || 0)

    if (!plan || priceNum <= 0) {
      return {
        payments: [],
        total: null,
        monthly: null,
        planLabel: '',
        sum: null,
      }
    }

    if (plan === 'olo3') {
      const k = multiplierForMonths(3)
      const total = priceNum * k
      const payments = [
        total * 0.5,
        Math.max(0, total * 0.25 - discountNum),
        total * 0.25,
      ]
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

    return {
      payments: [],
      total: null,
      monthly: null,
      planLabel: '',
      sum: null,
    }
  }, [plan, price, discount])

  const loadNotes = useCallback(async () => {
    setNotesLoading(true)
    const { data, error: err } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message || 'Failed to load notes')
    } else {
      setNotes(data || [])
      setError('')
    }
    setNotesLoading(false)
  }, [])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const loadImages = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('images')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message || 'Failed to load images')
    } else {
      setImages(data || [])
    }
  }, [])

  useEffect(() => {
    loadImages()
  }, [loadImages])

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
    const publicUrl = urlData?.publicUrl
    return { name: file.name, url: publicUrl, path: data.path }
  }

  const handleUploadAll = async () => {
    setImageUploading(true)
    setError('')
    const uploadedImageRecords = []
    for (const file of selectedFiles) {
      const record = await uploadImage(file)
      if (record) {
        uploadedImageRecords.push(record)
      }
    }
    if (uploadedImageRecords.length > 0) {
      const { error: insertErr } = await supabase.from('images').insert(uploadedImageRecords)
      if (insertErr) {
        setError(insertErr.message || 'Failed to save image records')
      } else {
        await loadImages()
        setSelectedFiles([])
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    setImageUploading(false)
  }

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    setSelectedFiles(files)
  }

  const deleteImage = async (img) => {
    if (!img?.id) return
    setImageUploading(true)
    setError('')
    if (img.path) {
      await supabase.storage.from('uploads').remove([img.path])
    }
    const { error: err } = await supabase.from('images').delete().eq('id', img.id)
    if (err) setError(err.message || 'Failed to delete image')
    else await loadImages()
    setImageUploading(false)
  }

  const deleteNoteById = async (id) => {
    setSavingNote(true)
    const { error: err } = await supabase.from('notes').delete().eq('id', id)
    if (err) setError(err.message || 'Failed to delete note')
    else await loadNotes()
    setSavingNote(false)
  }

  const clearAllNotes = async () => {
    setSavingNote(true)
    const { error: err } = await supabase.from('notes').delete().neq('id', '')
    if (err) setError(err.message || 'Failed to clear notes')
    else await loadNotes()
    setSavingNote(false)
  }

  const copySingleNote = (text) => {
    const fallbackCopy = () => {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      try {
        document.execCommand('copy')
        alert('✅ Note copied!')
      } catch {
        alert('Copy failed. Please copy the text manually.')
      }
      document.body.removeChild(textarea)
    }

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => alert('✅ Note copied!'))
        .catch(fallbackCopy)
    } else {
      fallbackCopy()
    }
  }


  const copySchedule = () => {
    if (!calculation.payments.length) {
      alert('ရွေးချယ်ပြီးတွက်ပြီးမှ ကော်ပီလုပ်နိုင်ပါတယ်။')
      return
    }

    const itemName = 'Item'; // Placeholder: replace with actual item name if available
    let text = `** ${itemName} လေးကို\nအရစ်ကျ plan လေးနဲ့သွင်းချင်တယ်ဆိုရင်ဆိုရင်တော့\n`;

    calculation.payments.forEach((amt, i) => {
      const label = burmeseLabels[i] || `${i + 1} လအတွက်က`;
      text += `${label} ${fmt.format(amt)}\n`;
    });

    text += 'ပေးသွင်းရင်ရပါပြီရှင့်';

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      try {
        document.execCommand('copy')
        alert('✅ Payment schedule copied!')
      } catch {
        alert('Copy failed. Please copy the text manually.')
      }
      document.body.removeChild(textarea)
    }

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => alert('✅ Payment schedule copied!'))
        .catch(fallbackCopy)
    } else {
      fallbackCopy()
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Phone Installment Calculator</h1>
            <p className="mt-1 text-xs font-medium text-indigo-700 inline-flex items-center gap-2 px-2 py-1 rounded-full bg-indigo-50">
              <span>3/4 → ×1.10</span>
              <span>5 → ×1.15</span>
              <span>olo3 → ×1.10 then 50/25/25</span>
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="visa" className="text-sm font-medium text-slate-700">
                Visa type
              </label>
              <select
                id="visa"
                value={visa}
                onChange={(e) => setVisa(e.target.value)}
                className={COMMON_INPUT_CLASSES}
              >
                <option value="">Select Visa type…</option>
                {VISA_TYPES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500">
                Choose card group; it controls which plans are allowed.
              </div>
              <div className="text-xs text-slate-500">သတ်တမ်းနည်းပြီး အရစ်ကျလ ပိုလိုချင်ရင် ရုံးကိုမေး</div>
            </div>

            <div className="space-y-2">
              <label htmlFor="months" className="text-sm font-medium text-slate-700">
                Installment plan
              </label>
              <select
                id="months"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                disabled={!allowedPlans.length}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
              >
                <option value="">Select plan…</option>
                {allowedPlans.map((p) => (
                  <option key={String(p)} value={String(p)}>
                    {optionLabel(p)}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500">
                Options depend on Visa type (supports numbers &quot;olo3&quot;).
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="price" className="text-sm font-medium text-slate-700">
                Phone price
              </label>
              <input
                id="price"
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g., 35990"
                className={COMMON_INPUT_CLASSES}
              />
              <div className="text-xs text-slate-500">Multiplier by plan: 3/4 → ×1.10, 5 → ×1.15.</div>
            </div>

            <div className="space-y-2">
              <label htmlFor="discount" className="text-sm font-medium text-slate-700">
                Second-month discount
              </label>
              <input
                id="discount"
                type="number"
                min="0"
                step="1"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className={COMMON_INPUT_CLASSES}
              />
              <div className="text-xs text-slate-500">This amount is subtracted from the 2nd payment only.</div>
            </div>
          </div>

          <div className="mt-8 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-lg p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-800">Total (after multiplier):</span>
              <span className="text-lg font-bold text-indigo-900">
                {calculation.total != null ? fmt.format(calculation.total) : '–'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-medium text-indigo-800">Monthly payment:</span>
              <span className="text-lg font-bold text-indigo-900">
                {calculation.monthly != null ? fmt.format(calculation.monthly) : calculation.payments.length ? 'Varies' : '–'}
              </span>
            </div>
            <p className="text-xs text-indigo-700 mt-3">
              For equal plans: Monthly = Total ÷ Months. For olo3: 50% / 25% / 25% of Total.
            </p>
          </div>

          <table
            className={`w-full mt-6 text-sm text-left ${calculation.payments.length ? '' : 'hidden'}`}
          >
            <thead className="bg-slate-50 text-xs text-slate-700 uppercase">
              <tr>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {calculation.payments.map((amt, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {i === 0 ? 'First' : i === 1 ? 'Second' : i === 2 ? 'Third' : `${i + 1}th`} payment
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{fmt.format(amt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-semibold">
              <tr>
                <td className="px-4 py-3 text-slate-900">Total of payments shown</td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {calculation.sum != null ? fmt.format(calculation.sum) : '–'}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-8">
            <button
              type="button"
              onClick={copySchedule}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all"
            >
              Copy Payment Schedule
            </button>
          </div>
        </div>

        <div className="lg:col-span-1 bg-white rounded-2xl shadow-lg p-6 md:p-8 sticky top-8">
          <h3 className="text-xl font-bold text-slate-900">Notes</h3>
          <div className="space-y-2 mt-4">
            <label htmlFor="noteInput" className="text-sm font-medium text-slate-700">
              Add a note
            </label>
            <textarea
              id="noteInput"
              rows="5"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Type your note here... (e.g., customer name, special deal)"
              className={COMMON_INPUT_CLASSES}
            ></textarea>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={saveNote}
              disabled={savingNote}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-70"
            >
              {savingNote ? 'Saving…' : 'Save Note'}
            </button>
            <button
              type="button"
              onClick={clearAllNotes}
              disabled={savingNote || !notes.length}
              className="flex-1 px-4 py-2 border border-red-200 bg-red-50 text-red-600 text-sm font-medium rounded-lg shadow-sm hover:border-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all disabled:opacity-60"
            >
              Clear All Notes
            </button>
      </div>

          <div
            className={`mt-5 p-4 border rounded-lg space-y-3 ${
              notes.length ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
            }`}
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {notesLoading ? (
              <div className="text-sm text-slate-600">Loading notes…</div>
            ) : notes.length === 0 ? (
              <div className="text-sm text-slate-600">No notes yet.</div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="note-item flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-amber-200"
                >
                  <span className="text-sm text-amber-900">{note.text}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copySingleNote(note.text)}
                      className="p-1 text-blue-500 hover:text-blue-700 rounded-full hover:bg-blue-100 transition-colors"
                      title="Copy note"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" fill="none"></path>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNoteById(note.id)}
                      className="ml-3 p-1 text-red-500 hover:text-red-700 rounded-full hover:bg-red-100 transition-colors disabled:opacity-60"
                      disabled={savingNote}
                    >
                      ✕
          </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Images</h3>
              <p className="text-sm text-slate-600">Upload an image; it will be stored and listed below.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                disabled={imageUploading}
                className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleUploadAll}
                  disabled={imageUploading}
                  className="ml-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-70"
                >
                  {imageUploading ? 'Uploading…' : `Upload ${selectedFiles.length} Images`}
                </button>
              )}
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
              <h4 className="text-md font-medium text-blue-800 mb-2">Selected Files:</h4>
              <ul className="list-disc list-inside text-sm text-blue-700">
                {selectedFiles.map((file, index) => (
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            {images.length === 0 ? (
              <div className="text-sm text-slate-600">No images uploaded yet.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 shadow-sm"
                  >
                    <div className="w-full aspect-video max-h-[80vh] bg-white flex items-center justify-center">
                      <img
                        src={img.url}
                        alt={img.name || 'uploaded'}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="p-2 flex items-center justify-between text-xs text-slate-700">
                      <span className="truncate" title={img.name}>
                        {img.name || 'image'}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteImage(img)}
                        disabled={imageUploading}
                        className="text-xl text-red-500 hover:text-red-700 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
