import * as THREE from 'three'
import Loader from '../Loader'
import textureViridis from './textures/cm_viridis.png'
import { MeshBVH } from 'three-mesh-bvh'
import { MOUSE, TOUCH } from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import { LayerMaterial } from './LayerMaterial'
import { LayerEnhanceMaterial } from './LayerEnhanceMaterial'
import { GenerateSDFMaterial } from './GenerateSDFMaterial'

export default class ViewerLayer {
  constructor({ params, renderer, canvas }) {
    this.loading = false
    this.bvh = null
    this.scene = null
    this.camera = null
    this.controlDOM = null
    this.cmtexture = null
    this.clipGeometry = null
    this.focusGeometry = null
    this.subVolumeMeta = null
    this.subSegmentMeta = null

    this.canvas = canvas
    this.renderer = renderer
    this.volumeMeta = params.layers.volumeMeta
    this.segmentMeta = params.segments.segmentMeta
    this.render = this.render.bind(this)

    this.params = {}
    this.params.mode = 'layer'
    this.params.layers = params.layers
    this.params.segments = params.segments
    this.params.surface = 7.5
    this.params.colorBool = true

    this.card = null
    this.cardList = []
    this.marker = []

    this.init()
  }

  init() {
    // scene setup
    this.scene = new THREE.Scene()

    // camera setup
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new THREE.OrthographicCamera(-1 * aspect, 1 * aspect, 1, -1, 0.01, 100)
    this.camera.up.set(0, -1, 0)
    this.camera.position.z = -1.3

    window.addEventListener(
      'resize',
      () => {
        const aspect = window.innerWidth / window.innerHeight
        this.camera.left = -1 * aspect
        this.camera.right = 1 * aspect
        this.camera.top = 1
        this.camera.bottom = -1
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.render()
      },
      false
    )

    this.controlDOM = document.createElement('div')
    this.controlDOM.classList.add(this.params.mode)
    this.controlDOM.style.position = 'absolute'
    this.controlDOM.style.width = '100%'
    this.controlDOM.style.height = '100%'
    this.controlDOM.style.margin = '0'
    this.controlDOM.style.padding = '0'
    document.body.appendChild(this.controlDOM)

    this.controls = new OrbitControls(this.camera, this.controlDOM)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true // pan orthogonal to world-space direction camera.up
    this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', this.render)

    this.cmtexture = new THREE.TextureLoader().load(textureViridis)
    this.cmtexture.minFilter = THREE.NearestFilter
    this.cmtexture.magFilter = THREE.NearestFilter

    // marker at the screen center
    const materialMarker = new THREE.MeshBasicMaterial()
    const geoH = new THREE.BoxGeometry(0.005, 0.03, 0.01)
    const geoV = new THREE.BoxGeometry(0.03, 0.005, 0.01)
    const meshH = new THREE.Mesh(geoH, materialMarker)
    const meshV = new THREE.Mesh(geoV, materialMarker)
    meshH.position.set(0, 0, -0.5)
    meshV.position.set(0, 0, -0.5)
    this.scene.add(meshH, meshV)
    this.marker.push(meshH, meshV)
  }

  // set state via url params
  setURLParamState() {
    const url = new URLSearchParams(window.location.search)
    if (url.get('zoom')) this.camera.zoom = parseFloat(url.get('zoom'))
    if (url.get('layer')) {
      const step = this.params.layers.getLayer[1] - this.params.layers.getLayer[0]
      const layer = Math.round(url.get('layer') / step) * step
      this.params.layers.select = this.params.layers.options[ layer ]
    }
    if (url.get('x') && url.get('y')) {
      const pixelX = parseFloat(url.get('x'))
      const pixelY = parseFloat(url.get('y'))
      const { x, y } = this.pixelTocameraPosition(pixelX, pixelY)
      // still don't know why it works, but the order does matter
      this.controls.target = new THREE.Vector3(x, y, 0)
      this.camera.position.x = x
      this.camera.position.y = y
    }
    if (url.get('segment')) this.params.segments.select = this.params.segments.options[ url.get('segment') ]
    if(!this.params.segments.select) this.params.segments.select = 0
    this.camera.updateProjectionMatrix()
  }

  getClipInfo(sID) {
    for (let i = 0; i < this.segmentMeta.segment.length; i++) {
      const { id, clip } = this.segmentMeta.segment[i]

      if (sID === id) return { id, clip } 
    }
  }

  cameraPositionToPixel(x, y) {
    const { clip } = this.volumeMeta.volume[0]
    const plane = { w: 2, h: 2 }

    const pixelX = clip.w / 2 * x + clip.w / 2
    const pixelY = clip.w / 2 * y + clip.h / 2

    return { x: pixelX, y: pixelY }
  }

  pixelTocameraPosition(x, y) {
    const { clip } = this.volumeMeta.volume[0]
    const plane = { w: 2, h: 2 }

    const cameraX = 2 / clip.w * (x - clip.w / 2)
    const cameraY = 2 / clip.w * (y - clip.h / 2)

    return { x: cameraX, y: cameraY }
  }

  async updateVolume() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }

    const { segments, layers } = this.params
    const { id: sID, clip: sClip } = this.segmentMeta.segment[segments.select]
    const { id: vID, clip: vClip } = this.volumeMeta.volume[layers.select]

    const volumeTex = await Loader.getVolumeData(`${vID}.tif`)
    volumeTex.magFilter = THREE.NearestFilter
    volumeTex.minFilter = THREE.LinearFilter

    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
    const layerMaterial = new LayerMaterial()
    layerMaterial.uniforms.volumeAspect.value = vClip.w / vClip.h
    layerMaterial.uniforms.screenAspect.value = 2 / 2
    layerMaterial.uniforms.voldata.value = volumeTex
    layerMaterial.uniforms.cmdata.value = this.cmtexture

    this.card = new THREE.Mesh(geometry, layerMaterial)
    this.card.userData = { w: 2, h: 2, vw: vClip.w, vh: vClip.h, center: new THREE.Vector3() }
    this.scene.add(this.card)
  }

  async clipSegment() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }

    const index = this.params.layers.select
    const layer = this.segmentMeta.layer[index]

    this.subSegmentMeta = await Loader.getSubSegmentMeta(layer)
    this.subVolumeMeta = await Loader.getSubVolumeMeta(layer)
    // if (index < 11) { this.subVolumeMeta = await Loader.getSubVolumeMeta(layer) }

    await this.updateClipGeometry()
    await this.updateFocusGeometry()
  }

  async updateClipGeometry() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }
    if (!this.segmentMeta) { console.log('segment meta.json not found'); return }

    const loadingList = []
    const c_positions = []
    const chunkList = []

    const folder = this.subSegmentMeta.layer
    this.subSegmentMeta.segment.forEach(({ name }) => {
      const loading = Loader.getSegmentData(`${folder}/${name}`)
      loadingList.push(loading)
    })

    const clipMap = {}
    this.segmentMeta.segment.forEach(({ id, clip }) => { clipMap[id] = clip })

    await Promise.all(loadingList).then((list) => {
      list.forEach((object, i) => {
        const { id } = this.subSegmentMeta.segment[i]
        const positions = object.children[0].geometry.getAttribute('position').array
        c_positions.push(...positions)
        chunkList.push({ id, clip: clipMap[id], maxIndex: c_positions.length / 3  })
      })
    })

    this.clipGeometry = new THREE.BufferGeometry()
    this.clipGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c_positions), 3))
    this.clipGeometry.userData.chunkList = chunkList

    const gap = 5
    const index = this.params.layers.select
    const { clip } = this.volumeMeta.volume[index]

    const bufferWidth = Math.round(clip.w / 10)
    const bufferHeight = Math.round(clip.h / 10)
    const scaling = new THREE.Vector3(clip.w, clip.h, 2 * gap)
    const center = new THREE.Vector3(clip.w / 2, clip.h / 2, clip.z)
    const [ sdfTex, bvh ] = this.sdfTexGenerate(this.clipGeometry, center, scaling, bufferWidth, bufferHeight)
    this.card.material.uniforms.sdfTex.value = sdfTex.texture

    if (this.bvh) {
      this.bvh.geometry.dispose()
      this.bvh.geometry = null
      this.bvh = null
    }
    this.bvh = bvh
  }

  updateFocusGeometry() {
    const q = { start: 0, end: 0, sID: null, vID: null }
    const { chunkList } = this.clipGeometry.userData
    const focusSegmentID = this.params.segments.getID[this.params.segments.select]

    for (let i = 0; i < chunkList.length; i += 1) {
      const { id: sID } = chunkList[i]
      if (sID === focusSegmentID) {
        q.sID = sID
        q.vID = this.params.layers.select
        q.end = chunkList[i].maxIndex
        q.start = (i === 0) ? 0 : chunkList[i - 1].maxIndex
        break
      }
    }
    if (!q.end && !this.focusGeometry) return
    if (!q.end) { this.focusGeometry.dispose(); this.focusGeometry = null; return }
    // return if current focus geometry already exist
    const f = this.focusGeometry
    if (f && f.userData.sID === q.sID && f.userData.vID === q.vID) return

    const f_positions = this.clipGeometry.getAttribute('position').array.slice(q.start * 3, q.end * 3)
    this.focusGeometry = new THREE.BufferGeometry()
    this.focusGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f_positions), 3))
    this.focusGeometry.userData = q

    const gap = 5
    const index = this.params.layers.select
    const { clip } = this.volumeMeta.volume[index]

    const bufferWidth = Math.round(clip.w / 10)
    const bufferHeight = Math.round(clip.h / 10)
    const scaling = new THREE.Vector3(clip.w, clip.h, 2 * gap)
    const center = new THREE.Vector3(clip.w / 2, clip.h / 2, clip.z)
    const [ sdfTexFocus, _ ] = this.sdfTexGenerate(this.focusGeometry, center, scaling, bufferWidth, bufferHeight)
    this.card.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture

    this.cardList.forEach((card) => {
      const { idx, idy, clip } = card.userData
      const bufferWidth = clip.w
      const bufferHeight = clip.h
      const scaling = new THREE.Vector3(clip.w, clip.h, 2 * gap)
      const center = new THREE.Vector3(clip.x + clip.w / 2, clip.y + clip.h / 2, clip.z)
      const [ sdfTexFocus, _ ] = this.sdfTexGenerate(this.focusGeometry, center, scaling, bufferWidth, bufferHeight)
      card.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture
    })
  }

  sdfTexGenerate(geometry, center, scaling, bufferWidth, bufferHeight) {
    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    matrix.compose(center, quat, scaling)

    const bvh = new MeshBVH(geometry, { maxLeafTris: 1 })
    const generateSdfPass = new FullScreenQuad(new GenerateSDFMaterial())
    generateSdfPass.material.uniforms.bvh.value.updateFrom(bvh)
    generateSdfPass.material.uniforms.matrix.value.copy(matrix)
    generateSdfPass.material.uniforms.zValue.value = 0.5

    const sdfTex = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight)
    sdfTex.texture.format = THREE.RedFormat
    sdfTex.texture.type = THREE.FloatType
    sdfTex.texture.minFilter = THREE.LinearFilter
    sdfTex.texture.magFilter = THREE.LinearFilter

    this.renderer.setRenderTarget(sdfTex)
    generateSdfPass.render(this.renderer)
    generateSdfPass.material.dispose()
    this.renderer.setRenderTarget(null)

    return [ sdfTex, bvh ]
  }

  getLabel(mouse) {
    if (!mouse) {
      const { id, clip } = this.segmentMeta.segment[ this.params.segments.select ]
      return { id, clip }
    }

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const intersects = raycaster.intersectObjects([ this.card ])
    if (!intersects.length) return

    const index = this.params.layers.select
    const { clip } = this.volumeMeta.volume[index]

    const p = intersects[0].point
    const c = intersects[0].object.userData

    const point = new THREE.Vector3()
    point.x = (p.x - c.center.x) / (c.w / 2) / 2 + 0.5
    point.y = (p.y - c.center.y) / (c.h / 2) / 2 * (clip.w / clip.h) + 0.5
    point.x *= clip.w
    point.y *= clip.h
    point.z = clip.z

    const target = this.bvh.closestPointToPoint(point, {}, 0, 100)
    if (!target) return

    const { chunkList } = this.bvh.geometry.userData
    const hitIndex = this.bvh.geometry.index.array[target.faceIndex * 3]

    for (let i = 0; i < chunkList.length; i ++) {
      const { id: sID, clip, maxIndex } = chunkList[i]
      if (maxIndex > hitIndex) { return { id: sID, clip } }
    }
  }

  async enhance() {
    const enhanceID = this.needEnhance()
    if (!enhanceID) return

    this.loading = true

    const { idx, idy } = enhanceID
    await this.renderEnhance(idx, idy)

    this.loading = false
  }

  needEnhance() {
    // return if zoom too small
    if (this.camera.zoom < 10.0) return

    const p = this.camera.position
    const c = this.card.userData

    // x: 0~9 y: 0~9
    const { split } = this.subVolumeMeta
    const idx = Math.floor(split * ((p.x - c.center.x) / (c.w * 1.0) + 0.5))
    const idy = Math.floor(split * ((p.y - c.center.y) / (c.h * (c.vh / c.vw)) + 0.5))

    // return if already exist
    for (let i = 0; i < this.cardList.length; i++) {
      const { idx: vx, idy: vy } = this.cardList[i].userData
      if (idx === vx && idy === vy) return
    }
    // return if out of boundary
    if (idx < 0 || idx > 9 || idy < 0 || idy > 9) return

    return { idx, idy }
  }

  // enhance volume & segment in layer mode
  async renderEnhance(idx, idy) {
    const info = {}
    const p = this.camera.position
    const c = this.card.userData

    this.subVolumeMeta.volume.forEach(({ idx: vx, idy: vy, name, clip }) => {
      if (idx === vx && idy === vy) { info.name = name; info.clip = clip }
    })

    const w = c.w * 1.0 * (info.clip.w / c.vw)
    const h = w * (info.clip.h / info.clip.w)
    const uvx = (info.clip.x + info.clip.w / 2) / c.vw
    const uvy = (info.clip.y + info.clip.h / 2) / c.vh
    const x = c.center.x + (uvx - 0.5) * c.w * 1.0
    const y = c.center.y + (uvy - 0.5) * c.h * (c.vh / c.vw)

    const geometry = new THREE.PlaneGeometry(w, h, 1, 1)
    const material = new LayerEnhanceMaterial()
    material.uniforms.volumeAspect.value = w / h
    material.uniforms.screenAspect.value = w / h

    const card = new THREE.Mesh(geometry, material)
    card.position.set(x, y, -0.5)
    card.userData = { idx, idy, clip: info.clip, filename: info.name }

    this.scene.add(card)
    this.cardList.push(card)

    await this.enhanceVolume(card)
    await this.enhanceSegment(card)

    this.render()
  }

  async enhanceVolume(card) {
    const index = this.params.layers.select
    const { id } = this.volumeMeta.volume[index]
    const { filename } = card.userData

    const voldata = await Loader.getVolumeData(`${id}/${filename}`)
    voldata.magFilter = THREE.NearestFilter
    voldata.minFilter = THREE.LinearFilter

    card.material.uniforms.cmdata.value = this.cmtexture
    card.material.uniforms.voldata.value = voldata
  }

  async enhanceSegment(card) {
    const gap = 5
    const { idx, idy, clip } = card.userData
    const bufferWidth = clip.w
    const bufferHeight = clip.h
    const scaling = new THREE.Vector3(clip.w, clip.h, 2 * gap)
    const center = new THREE.Vector3(clip.x + clip.w / 2, clip.y + clip.h / 2, clip.z)
    const [ sdfTex, bvh ] = this.sdfTexGenerate(this.clipGeometry, center, scaling, bufferWidth, bufferHeight)

    card.material.uniforms.sdfTex.value = sdfTex.texture

    if (!this.focusGeometry) return
    const [ sdfTexFocus, _ ] = this.sdfTexGenerate(this.focusGeometry, center, scaling, bufferWidth, bufferHeight)
    card.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture
  }

  render() {
    if (!this.renderer || !this.card || this.controlDOM.style.display  !== 'inline') return

    const { x, y } = this.cameraPositionToPixel(this.camera.position.x, this.camera.position.y)

    const url = new URL(window.location.href)
    const searchParams = url.searchParams
    searchParams.set('mode', 'layer')
    searchParams.set('x', x.toFixed(0))
    searchParams.set('y', y.toFixed(0))
    searchParams.set('layer', this.params.layers.getLayer[ this.params.layers.select ])
    searchParams.set('segment', this.params.segments.getID[ this.params.segments.select ])
    searchParams.set('zoom', this.camera.zoom.toFixed(3))
    url.search = searchParams.toString()

    window.history.replaceState(undefined, undefined, url.href)

    this.card.material.uniforms.surface.value = this.params.surface
    this.card.material.uniforms.colorBool.value = this.params.colorBool
    this.cardList.forEach((card) => {
      card.material.uniforms.surface.value = this.params.surface
      card.material.uniforms.colorBool.value = this.params.colorBool
    })

    this.marker.forEach((mesh) => {
      const sc = 1 / this.camera.zoom
      mesh.position.x = this.camera.position.x
      mesh.position.y = this.camera.position.y
      mesh.scale.set(sc, sc, sc)
    })

    this.enhance()
    this.renderer.render(this.scene, this.camera)
  }

  clear() {
    if (this.bvh) { this.bvh.geometry.dispose(); this.bvh.geometry = null }
    if (this.clipGeometry) { this.clipGeometry.dispose(); this.clipGeometry = null }
    if (this.focusGeometry) { this.focusGeometry.dispose(); this.focusGeometry = null }

    if (this.card) {
      const { voldata, sdfTex, sdfTexFocus } = this.card.material.uniforms
      if (voldata.value) { voldata.value.dispose(); voldata.value = null }
      if (sdfTex.value) { sdfTex.value.dispose(); sdfTex.value = null }
      if (sdfTexFocus.value) { sdfTexFocus.value.dispose(); sdfTexFocus.value = null }

      this.card.geometry.dispose()
      this.card.material.dispose()
      this.card.geometry = null
      this.card.material = null
      this.scene.remove(this.card)
    }

    this.cardList.forEach((card) => {
      const { voldata, sdfTex, sdfTexFocus } = card.material.uniforms
      if (voldata.value) { voldata.value.dispose(); voldata.value = null }
      if (sdfTex.value) { sdfTex.value.dispose(); sdfTex.value = null }
      if (sdfTexFocus.value) { sdfTexFocus.value.dispose(); sdfTexFocus.value = null }

      card.geometry.dispose()
      card.material.dispose()
      card.geometry = null
      card.material = null
      this.scene.remove(card)
    })

    this.bvh = null
    this.card = null
    this.cardList = []
  }
}