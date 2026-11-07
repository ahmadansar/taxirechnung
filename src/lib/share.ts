declare const __DEMO_BUILD__: boolean

// When the demo runs as a hosted claude.ai artifact, plain downloads are blocked by the
// sandbox; the artifact's `downloads` capability offers the file to the viewer instead.
type Downloads = { save(r: { filename: string; data: Blob }): Promise<unknown> }
const w = window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }
const artifactDownloads: Promise<Downloads | null> =
  __DEMO_BUILD__ && w.claude?.use ? (w.claude.use('downloads') as Promise<Downloads | null>).catch(() => null) : Promise.resolve(null)
export const inArtifact = () => __DEMO_BUILD__ && !!w.claude?.use

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function downloadBlob(blob: Blob, filename: string) {
  const dl = await artifactDownloads
  if (dl) {
    try {
      await dl.save({ filename, data: blob })
    } catch {
      /* viewer declined or saving unavailable */
    }
    return
  }
  browserDownload(blob, filename)
}

/** Opens the phone's share sheet (Mail, WhatsApp, …) with the PDF attached.
 *  Falls back to a download where file sharing isn't supported. */
export async function shareFile(blob: Blob, filename: string, title: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!inArtifact() && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    }
  }
  await downloadBlob(blob, filename)
  return 'downloaded'
}

/** Share a text message (WhatsApp, SMS, Mail …); falls back to copying it. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (!inArtifact() && navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard?.writeText(text).catch(() => {})
  return 'copied'
}

/** Share several files at once (e.g. reminder + original invoice); downloads them where sharing isn't possible. */
export async function shareFiles(files: { blob: Blob; name: string }[], title: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/pdf' }))
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!inArtifact() && nav.share && nav.canShare?.({ files: list })) {
    try {
      await nav.share({ files: list, title, text })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    }
  }
  for (const f of files) await downloadBlob(f.blob, f.name)
  return 'downloaded'
}
