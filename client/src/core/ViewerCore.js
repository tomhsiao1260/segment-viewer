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

export default class ViewerCore {
  constructor({ volumeMeta, segmentMeta }) {
    this.bvh = null
    this.renderer = null
    this.scene = null
    this.camera = null
    this.cmtexture = null
    this.clipGeometry = null
    this.focusGeometry = null
    this.focusSegmentID = null
    this.subVolumeMeta = null
    this.subSegmentMeta = null

    this.volumeMeta = volumeMeta
    this.segmentMeta = segmentMeta
    this.render = this.render.bind(this)
    this.canvas = document.querySelector('.webgl')

    this.card = null
    this.cardList = []

    this.params = {}
    this.params.surface = 7.5
    this.params.layer = 0
    this.params.layers = { select: 0, options: {} }

    this.init()
  }

  init() {
    // renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: this.canvas })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(0, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

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

    const controls = new OrbitControls(this.camera, this.canvas)
    controls.enableDamping = false
    controls.screenSpacePanning = true // pan orthogonal to world-space direction camera.up
    controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
    controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }
    controls.addEventListener('change', this.render)

    this.cmtexture = new THREE.TextureLoader().load(textureViridis)
    this.cmtexture.minFilter = THREE.NearestFilter
    this.cmtexture.magFilter = THREE.NearestFilter

    // list all layer options
    for (let i = 0; i < this.volumeMeta.volume.length; i++) {
      const { id } = this.volumeMeta.volume[i]
      this.params.layers.options[ id ] = i
    }
  }

  async updateVolume() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }

    const index = this.params.layers.select
    const { id, clip } = this.volumeMeta.volume[index]

    const volumeTex = await Loader.getVolumeData(`${id}.tif`)
    volumeTex.magFilter = THREE.NearestFilter
    volumeTex.minFilter = THREE.LinearFilter

    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
    const layerMaterial = new LayerMaterial()
    layerMaterial.uniforms.volumeAspect.value = clip.w / clip.h
    layerMaterial.uniforms.screenAspect.value = 2 / 2
    layerMaterial.uniforms.voldata.value = volumeTex
    layerMaterial.uniforms.cmdata.value = this.cmtexture

    this.card = new THREE.Mesh(geometry, layerMaterial)
    this.card.userData = { w: 2, h: 2, vw: clip.w, vh: clip.h, center: new THREE.Vector3() }
    this.scene.add(this.card)
  }

  async clipSegment() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }

    const index = this.params.layers.select
    const layer = this.segmentMeta.layer[index]

    this.subSegmentMeta = await Loader.getSubSegmentMeta(layer)
    this.subVolumeMeta = await Loader.getSubVolumeMeta(layer)

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
    for (let i = 0; i < chunkList.length; i += 1) {
      const { id: sID } = chunkList[i]
      if (sID === this.focusSegmentID) {
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
      if (maxIndex > hitIndex) {
        this.focusSegmentID = sID
        return { id: sID, clip } 
      }
    }
  }

  async enhance() {
    const mouse = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const intersects = raycaster.intersectObjects([ this.card ])
    if (!intersects.length) return

    const p = intersects[0].point
    const c = intersects[0].object.userData

    // x: 0~9 y: 0~9
    const { split } = this.subVolumeMeta
    const idx = Math.floor(split * ((p.x - c.center.x) / (c.w * 1.0) + 0.5))
    const idy = Math.floor(split * ((p.y - c.center.y) / (c.h * (c.vh / c.vw)) + 0.5))

    // return if already exist
    for (let i = 0; i < this.cardList.length; i++) {
      const { idx: vx, idy: vy } = this.cardList[i].userData
      if (idx === vx && idy === vy) return
    }

    const info = {}
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
    if (!this.renderer || !this.card) return

    this.card.material.uniforms.surface.value = this.params.surface
    this.cardList.forEach((card) => { card.material.uniforms.surface.value = this.params.surface })
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
