/**
 * Renders the PWA icon set from public/icons/icon.svg.
 *
 * Maskable variants inset the artwork to ~78% so nothing important is lost when
 * Android crops the icon to a circle or squircle.
 *
 * Run with: npm run icons
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconDir = join(root, 'public', 'icons')
const source = readFileSync(join(iconDir, 'icon.svg'))

const BACKGROUND = { r: 0x0b, g: 0x0f, b: 0x14, alpha: 1 }
const MASKABLE_SCALE = 0.78

async function plain(size, name) {
  await sharp(source, { density: 384 }).resize(size, size).png().toFile(join(iconDir, name))
  return name
}

async function maskable(size, name) {
  const inner = Math.round(size * MASKABLE_SCALE)
  const offset = Math.round((size - inner) / 2)
  const art = await sharp(source, { density: 384 }).resize(inner, inner).png().toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: art, top: offset, left: offset }])
    .png()
    .toFile(join(iconDir, name))

  return name
}

const written = await Promise.all([
  plain(192, 'icon-192.png'),
  plain(512, 'icon-512.png'),
  plain(180, 'apple-touch-icon.png'),
  plain(32, 'favicon-32.png'),
  maskable(192, 'icon-maskable-192.png'),
  maskable(512, 'icon-maskable-512.png'),
])

console.log(`Wrote ${written.length} icons:\n  ${written.join('\n  ')}`)
