/**
 * Photo verification — the Phase 1 default.
 *
 * The capture is timestamped by burning the time into the image itself rather
 * than trusting metadata, so the proof survives export and cannot be quietly
 * edited later. The blob is stored locally in IndexedDB and never uploaded.
 */

const MAX_EDGE = 1440

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function stampText(when: Date): string {
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
  return `${date}  ${time}`
}

function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, when: Date): void {
  const scale = Math.max(w, h) / 1000
  const fontSize = Math.round(30 * scale)
  const padX = Math.round(28 * scale)
  const padY = Math.round(28 * scale)
  const barHeight = Math.round(fontSize * 3.1)

  const gradient = ctx.createLinearGradient(0, h - barHeight * 1.6, 0, h)
  gradient.addColorStop(0, 'rgba(11,15,20,0)')
  gradient.addColorStop(1, 'rgba(11,15,20,0.82)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, h - barHeight * 1.6, w, barHeight * 1.6)

  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 ${Math.round(fontSize * 0.62)}px ui-monospace, Menlo, Consolas, monospace`
  ctx.fillStyle = '#FF6B35'
  ctx.fillText('5AM RUN CLUB', padX, h - padY - fontSize * 1.25)

  ctx.font = `500 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`
  ctx.fillStyle = '#E7EDF3'
  ctx.fillText(stampText(when), padX, h - padY)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo.'))),
      'image/jpeg',
      0.86,
    )
  })
}

function fitted(sourceW: number, sourceH: number): { w: number; h: number } {
  const longest = Math.max(sourceW, sourceH)
  if (longest <= MAX_EDGE) return { w: sourceW, h: sourceH }
  const ratio = MAX_EDGE / longest
  return { w: Math.round(sourceW * ratio), h: Math.round(sourceH * ratio) }
}

export async function captureFromVideo(
  video: HTMLVideoElement,
  when: Date = new Date(),
): Promise<Blob> {
  const { w, h } = fitted(video.videoWidth, video.videoHeight)
  if (w === 0 || h === 0) throw new Error('The camera is not ready yet.')

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a drawing context.')

  ctx.drawImage(video, 0, 0, w, h)
  drawStamp(ctx, w, h, when)
  return canvasToBlob(canvas)
}

/** Fallback path for browsers where getUserMedia is blocked: `<input capture>`. */
export async function stampImageFile(file: File, when: Date = new Date()): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const { w, h } = fitted(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a drawing context.')

    ctx.drawImage(bitmap, 0, 0, w, h)
    drawStamp(ctx, w, h, when)
    return await canvasToBlob(canvas)
  } finally {
    bitmap.close()
  }
}

export async function startCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser will not open the camera directly.')
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    audio: false,
  })
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
