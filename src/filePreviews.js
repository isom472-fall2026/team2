import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'

// Asking Supabase Storage for every file of an application at once left some requests
// unanswered until they timed out, so each file is fetched with a single request, two files at
// a time, and both its preview and its download link are made from that one copy.
const parallelDownloads = 2

async function renderPdfPages(blob) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    const images = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const originalViewport = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2, 1400 / originalViewport.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('A canvas could not be created to display a PDF page.')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      images.push(canvas.toDataURL('image/png'))
      page.cleanup()
    }
    return images
  } finally {
    await loadingTask.destroy()
  }
}

// files: [label, storage path] pairs. Returns { promise, cancel }; cancel() stops further
// downloads and frees the copies, so call it when the page that shows them goes away.
export function loadFilePreviews(bucket, files, fileNameOf) {
  const objectUrls = []
  let cancelled = false

  const loadOne = async ([label, path]) => {
    const { data: blob, error } = await supabase.storage.from(bucket).download(path)
    if (error) throw error
    const fileName = fileNameOf(path)
    const fileUrl = URL.createObjectURL(blob)
    if (cancelled) {
      URL.revokeObjectURL(fileUrl)
      return []
    }
    objectUrls.push(fileUrl)
    if (!/\.pdf$/i.test(fileName)) {
      return [{ key: path, label, fileName, previewUrl: fileUrl, fileUrl, pageNumber: null, pageCount: null }]
    }
    const images = await renderPdfPages(blob)
    return images.map((previewUrl, index) => ({
      key: `${path}-${index + 1}`,
      label,
      fileName,
      previewUrl,
      fileUrl,
      pageNumber: index + 1,
      pageCount: images.length,
    }))
  }

  const promise = (async () => {
    const results = []
    let next = 0
    const worker = async () => {
      while (!cancelled && next < files.length) {
        const index = next
        next += 1
        results[index] = await loadOne(files[index])
      }
    }
    await Promise.all(Array.from({ length: Math.min(parallelDownloads, files.length) }, worker))
    return results.flat().filter(Boolean)
  })()

  return {
    promise,
    cancel() {
      cancelled = true
      objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url))
    },
  }
}
