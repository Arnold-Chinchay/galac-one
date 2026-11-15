// Title-screen life: a 3D planet turning over the one in the illustration, the photo's own stars twinkling in place,
// and now and then a faint dot drifting across, which is what this site looks for.
import { useEffect, useRef } from 'react'

const IMG = '/planet-x.jpg'
const IMG_W = 1900, IMG_H = 1124            // size of planet-x.jpg
const PX = 776, PY = 462, PR = 352          // planet centre and radius in that image
const SUN = { x: 1430, y: 735, r: 70 }      // the bright distant sun: left out of the twinkle
const FIT = 0.8                             // the planet fills 80% of its canvas; the rest is halo

/** Where the image sits inside the hero: background-size cover, background-position from CSS. */
function layout(hero: HTMLElement) {
  const W = hero.clientWidth, H = hero.clientHeight, s = Math.max(W / IMG_W, H / IMG_H)
  const [fx, fy] = getComputedStyle(hero).backgroundPosition.split(' ').map(v => v.endsWith('%') ? parseFloat(v) / 100 : 0.5)
  return { W, H, s, ox: (W - IMG_W * s) * fx, oy: (H - IMG_H * s) * fy }
}

/** Bright stars of the illustration: local maxima of brightness away from the planet and the sun. */
async function findStars(): Promise<{ x: number; y: number; b: number }[]> {
  const img = new Image()
  img.src = IMG
  await img.decode()
  const w = IMG_W / 2, h = IMG_H / 2, c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const lum = (x: number, y: number) => { const i = (y * w + x) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] }
  const found: { x: number; y: number; b: number }[] = []
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    const v = lum(x, y)
    if (v < 150) continue
    const X = x * 2, Y = y * 2
    if (Math.hypot(X - PX, Y - PY) < PR + 14 || Math.hypot(X - SUN.x, Y - SUN.y) < SUN.r) continue
    let peak = true
    for (let dy = -3; dy <= 3 && peak; dy++) for (let dx = -3; dx <= 3; dx++) if ((dx || dy) && lum(x + dx, y + dy) > v) { peak = false; break }
    if (peak) found.push({ x: X, y: Y, b: v / 255 })
  }
  found.sort((a, b) => b.b - a.b)
  const keep: typeof found = []
  for (const s of found) if (keep.length < 80 && keep.every(k => Math.hypot(k.x - s.x, k.y - s.y) > 24)) keep.push(s)
  return keep
}

export default function IntroSky() {
  const sky = useRef<HTMLCanvasElement>(null), planetBox = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = sky.current, box = planetBox.current, hero = canvas?.parentElement
    if (!canvas || !box || !hero) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let stop = false, raf = 0, cleanup3d = () => {}
    const stars: { x: number; y: number; b: number; phase: number; speed: number }[] = []
    let mover: { x0: number; y0: number; vx: number; vy: number; t0: number } | null = null
    let L = layout(hero)

    function placePlanet() {
      const r = PR * L.s + 2, size = 2 * r / FIT
      Object.assign(box!.style, { width: `${size}px`, height: `${size}px`, left: `${L.ox + PX * L.s - size / 2}px`, top: `${L.oy + PY * L.s - size / 2}px` })
      return size
    }
    function resize() {
      L = layout(hero!)
      const dpr = Math.min(devicePixelRatio, 2)
      canvas!.width = L.W * dpr; canvas!.height = L.H * dpr
      canvas!.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
      onSize(placePlanet())
    }
    let onSize = (_: number) => {}

    // Twinkle: each star brightens and dims on its own rhythm, drawn as extra light over the photo.
    function draw(ms: number) {
      if (stop) return
      const ctx = canvas!.getContext('2d')!, t = ms / 1000
      ctx.clearRect(0, 0, L.W, L.H)
      ctx.globalCompositeOperation = 'lighter'
      for (const s of stars) {
        const x = L.ox + s.x * L.s, y = L.oy + s.y * L.s
        if (x < -10 || y < -10 || x > L.W + 10 || y > L.H + 10) continue
        const a = (still ? 0.25 : 0.5 + 0.5 * Math.sin(t * s.speed + s.phase)) ** 3 * (0.35 + 0.65 * s.b)
        const r = (1.2 + 2.6 * s.b) * Math.max(0.7, L.s * 1.6)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
        g.addColorStop(0, `rgba(255,246,230,${a})`); g.addColorStop(.35, `rgba(220,230,255,${a * .35})`); g.addColorStop(1, 'rgba(200,215,255,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
        if (s.b > .85 && a > .3) {                        // brightest stars get faint diffraction spikes
          ctx.strokeStyle = `rgba(235,240,255,${a * .35})`; ctx.lineWidth = .8
          ctx.beginPath(); ctx.moveTo(x - r * 6, y); ctx.lineTo(x + r * 6, y); ctx.moveTo(x, y - r * 6); ctx.lineTo(x, y + r * 6); ctx.stroke()
        }
      }
      // A faint object crossing slowly, every half minute or so: the kind of thing the site hunts for.
      if (!still) {
        if (!mover && Math.random() < 0.002) {
          const left = Math.random() < 0.5
          mover = { x0: left ? L.W * 0.05 : L.W * 0.35, y0: L.H * (0.2 + Math.random() * 0.6), vx: L.W * 0.012, vy: L.H * (Math.random() - 0.5) * 0.01, t0: t }
        }
        if (mover) {
          const age = t - mover.t0, life = 14
          if (age > life) mover = null
          else {
            const fade = Math.sin(Math.PI * age / life)
            for (let i = 0; i < 12; i++) {
              const ta = Math.max(0, age - i * 0.35), x = mover.x0 + mover.vx * ta, y = mover.y0 + mover.vy * ta
              ctx.fillStyle = `rgba(255,180,84,${fade * (i ? 0.18 * (1 - i / 12) : 0.9)})`
              ctx.beginPath(); ctx.arc(x, y, i ? 1.3 : 2, 0, Math.PI * 2); ctx.fill()
            }
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!still) raf = requestAnimationFrame(draw)
    }

    findStars().then(found => {
      if (stop) return
      for (const s of found) stars.push({ ...s, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 1.8 })
      raf = requestAnimationFrame(draw)
    }).catch(() => {})

    // The planet: three.js is loaded only for this screen.
    import('three').then(THREE => {
      if (stop) return
      const VUELTA = 20, VUELTA_NUBES = 25, INCLINACION = -0.25      // seconds per turn (surface, clouds) and axis tilt, as designed in gro1.0.html
      const LUZ = new THREE.Vector3(1, 0.4, -0.6).normalize()
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      box.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1 / FIT, 1 / FIT, 1 / FIT, -1 / FIT, 0.1, 10)
      camera.position.z = 5
      const sun = new THREE.DirectionalLight(0xffffff, 2.6)
      sun.position.copy(LUZ)
      scene.add(sun, new THREE.AmbientLight(0x223355, 0.12))
      const eje = new THREE.Group()
      eje.rotation.z = INCLINACION
      scene.add(eje)

      const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgb: string, a: number) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry)
        g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`)
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }
      const texture = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t }
      // Neptune-like bands, continuous in longitude so the turning sphere shows no seam.
      const surface = () => {
        const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H
        const ctx = c.getContext('2d')!, img = ctx.createImageData(W, H), d = img.data
        const dark = [8, 24, 62], light = [74, 128, 205]
        for (let y = 0; y < H; y++) {
          const lat = y / H, pole = Math.sin(lat * Math.PI)
          for (let x = 0; x < W; x++) {
            const lon = x / W * Math.PI * 2
            const v = lat * 16 + 0.5 * Math.sin(2 * lon + 9 * lat) + 0.25 * Math.sin(5 * lon + 1.3 + 21 * lat) + 0.12 * Math.sin(11 * lon + 2.1 + 40 * lat)
            let b = 0.5 + 0.5 * Math.sin(v)
            b = b * 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(lat * 60 + 0.4 * Math.sin(3 * lon)))
            b *= 0.55 + 0.45 * pole
            b += 0.04 * Math.sin(lon * 23 + lat * 90) * Math.sin(lat * 140)
            b = Math.min(1, Math.max(0, b))
            const i = (y * W + x) * 4
            for (let ch = 0; ch < 3; ch++) d[i + ch] = dark[ch] + (light[ch] - dark[ch]) * b
            d[i + 3] = 255
          }
        }
        ctx.putImageData(img, 0, 0)
        blob(ctx, 0.62 * W, 0.64 * H, 46, 20, '4,12,35', 0.85)
        blob(ctx, 0.62 * W, 0.60 * H, 40, 5, '200,215,255', 0.5)
        return texture(c)
      }
      const cloudsTex = () => {
        const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H
        const ctx = c.getContext('2d')!
        let seed = 42
        const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
        for (let k = 0; k < 16; k++) {
          const cx = 90 + r() * (W - 180), cy = 50 + r() * (H - 100), n = 3 + Math.floor(r() * 4)
          for (let j = 0; j < n; j++) blob(ctx, cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 10, 12 + r() * 30, 3 + r() * 5, '235,240,255', 0.45 + r() * 0.45)
        }
        return texture(c)
      }
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), new THREE.MeshStandardMaterial({ map: surface(), roughness: 1, metalness: 0 }))
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 128, 128), new THREE.MeshStandardMaterial({ map: cloudsTex(), transparent: true, depthWrite: false, roughness: 1 }))
      eje.add(planet, clouds)

      const vert = 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
      const uniforms = { uLight: { value: LUZ }, uColor: { value: new THREE.Color(0.45, 0.66, 1.0) } }
      // Additive blend that also adds alpha, so where there is no glow the canvas stays transparent.
      const glow = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor }
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.01, 96, 96), new THREE.ShaderMaterial({ ...glow, uniforms, vertexShader: vert,
        fragmentShader: 'uniform vec3 uLight; uniform vec3 uColor; varying vec3 vN; void main(){ float f = pow(1.0 - max(vN.z, 0.0), 2.5); float l = clamp(dot(vN, uLight) + 0.25, 0.0, 1.0); vec3 c = uColor * f * l * 1.6; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }' })))
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 96, 96), new THREE.ShaderMaterial({ ...glow, uniforms, vertexShader: vert, side: THREE.BackSide,
        fragmentShader: 'uniform vec3 uLight; uniform vec3 uColor; varying vec3 vN; void main(){ float f = pow(clamp(-vN.z * 2.0, 0.0, 1.0), 3.0); float l = clamp(dot(vN, uLight) + 0.2, 0.0, 1.0); vec3 c = uColor * f * l * 0.9; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }' })))

      onSize = size => renderer.setSize(size, size, false)
      onSize(placePlanet())
      const clock = new THREE.Clock()
      renderer.setAnimationLoop(() => {
        const dt = clock.getDelta()
        if (!still) { planet.rotation.y += dt * Math.PI * 2 / VUELTA; clouds.rotation.y += dt * Math.PI * 2 / VUELTA_NUBES }
        renderer.render(scene, camera)
      })
      cleanup3d = () => {
        renderer.setAnimationLoop(null)
        scene.traverse(o => { const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void; map?: { dispose(): void } } }; m.geometry?.dispose(); m.material?.map?.dispose(); m.material?.dispose() })
        renderer.dispose(); renderer.domElement.remove()
      }
    }).catch(() => {})

    const ro = new ResizeObserver(resize)
    ro.observe(hero)
    resize()
    return () => { stop = true; cancelAnimationFrame(raf); ro.disconnect(); cleanup3d() }
  }, [])

  return <>
    <canvas ref={sky} className="intro-stars" aria-hidden="true" />
    <div ref={planetBox} className="intro-planet" aria-hidden="true" />
  </>
}
