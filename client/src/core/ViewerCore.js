import * as THREE from 'three'
import Loader from '../Loader'
import textureViridis from './textures/cm_viridis.png'
import { MeshBVH } from 'three-mesh-bvh'
import { MOUSE, TOUCH } from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import { GenerateSDFMaterial } from './GenerateSDFMaterial'
import { SegmentSmallMaterial } from './SegmentSmallMaterial'
import { VolumeSmallMaterial } from './VolumeSmallMaterial'
import { SegmentMaterial } from './SegmentMaterial'
import { VolumeMaterial } from './VolumeMaterial'

export default class ViewerCore {
  constructor({ volumeMeta, segmentMeta }) {
    this.renderer = null
    this.scene = null
    this.camera = null
    this.cmtexture = null
    this.clipGeometry = null
    this.focusGeometry = null
    this.focusSegmentID = null
    this.bvh = null

    this.volumeMeta = volumeMeta
    this.segmentMeta = segmentMeta
    this.render = this.render.bind(this)
    this.canvas = document.querySelector('.webgl')

    this.cardV = null
    this.cardS = null
    this.cardVList = []
    this.cardSList = []
    this.enhanceList = []

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
  }

  clear() {
  }

  async updateVolume() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }

    const volumeTex = await Loader.getVolumeData('00000.png')
    volumeTex.magFilter = THREE.NearestFilter
    volumeTex.minFilter = THREE.LinearFilter

    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
    const volumeSmallMaterial = new VolumeSmallMaterial()
    volumeSmallMaterial.uniforms.voldata.value = volumeTex
    volumeSmallMaterial.uniforms.cmdata.value = this.cmtexture

    this.cardV = new THREE.Mesh(geometry, volumeSmallMaterial)
    this.cardV.userData = { w: 2, h: 2, vw: 810, vh: 789, center: new THREE.Vector3() }
    this.scene.add(this.cardV)
  }

  async clipSegment() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }

    await this.updateClipGeometry()
    await this.updateFocusGeometry()
  }

  async updateClipGeometry() {
    if (!this.volumeMeta) { console.log('volume meta.json not found'); return }
    if (!this.segmentMeta) { console.log('segment meta.json not found'); return }

    const loadingList = []
    const c_positions = []
    const chunkList = []

    this.segmentMeta.segment.forEach(({ id, clip }) => {
      const loading = Loader.getSegmentData(`00000/${id}_00000_points.obj`)
      loadingList.push(loading)
    })

    await Promise.all(loadingList).then((list) => {
      list.forEach((object, i) => {
        const { id, clip } = this.segmentMeta.segment[i]
        const positions = object.children[0].geometry.getAttribute('position').array
        c_positions.push(...positions)
        chunkList.push({ id, clip, maxIndex: c_positions.length / 3  })
      })
    })

    this.clipGeometry = new THREE.BufferGeometry()
    this.clipGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c_positions), 3))
    this.clipGeometry.userData.chunkList = chunkList

    const scaling = new THREE.Vector3(8096, 7888, 10)
    const center = new THREE.Vector3(8096 / 2, 7888 / 2, 0)
    const [ sdfTex, bvh ] = this.sdfTexGenerate(this.clipGeometry, center, scaling)

    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
    const segmentSmallMaterial = new SegmentSmallMaterial()
    segmentSmallMaterial.uniforms.sdfTex.value = sdfTex.texture

    this.cardS = new THREE.Mesh(geometry, segmentSmallMaterial)
    this.cardS.position.set(0, 0, -0.7)
    this.scene.add(this.cardS)

    if (this.bvh) {
      if (this.bvh.geometry.userData.id === id) return
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

    const scaling = new THREE.Vector3(8096, 7888, 10)
    const center = new THREE.Vector3(8096 / 2, 7888 / 2, 0)
    const [ sdfTexFocus, _ ] = this.sdfTexGenerate(this.focusGeometry, center, scaling)
    this.cardS.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture

    this.cardSList.forEach((card) => {
      const { idx, idy } = card.userData
      const scaling = new THREE.Vector3(8096/10, 7888/10, 10/10)
      const center = new THREE.Vector3(8096/20 * (2*idx + 1), 7888/20 * (2*idy + 1), 0)
      const [ sdfTexFocus, _ ] = this.sdfTexGenerate(this.focusGeometry, center, scaling)
      card.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture
    })
  }

  sdfTexGenerate(geometry, center, scaling) {
    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    matrix.compose(center, quat, scaling)

    const bvh = new MeshBVH(geometry, { maxLeafTris: 1 })
    const generateSdfPass = new FullScreenQuad(new GenerateSDFMaterial())
    generateSdfPass.material.uniforms.bvh.value.updateFrom(bvh)
    generateSdfPass.material.uniforms.matrix.value.copy(matrix)
    generateSdfPass.material.uniforms.zValue.value = 0.5

    const sdfTex = new THREE.WebGLRenderTarget(810, 789)
    sdfTex.texture.format = THREE.RedFormat
    sdfTex.texture.type = THREE.FloatType
    sdfTex.texture.minFilter = THREE.LinearFilter
    sdfTex.texture.magFilter = THREE.LinearFilter

    this.renderer.setRenderTarget(sdfTex)
    generateSdfPass.render(this.renderer)
    this.renderer.setRenderTarget(null)

    return [ sdfTex, bvh ]
  }

  getLabel(mouse) {
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const intersects = raycaster.intersectObjects([ this.cardV ])
    if (!intersects.length) return

    const p = intersects[0].point
    const c = intersects[0].object.userData

    const point = new THREE.Vector3()
    point.x = (p.x - c.center.x) / (c.w / 2) / 2 + 0.5
    point.y = (p.y - c.center.y) / (c.h / 2) / 2 * (810 / 789) + 0.5
    point.z = 0

    point.x *= 8096
    point.y *= 7888

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
    const intersects = raycaster.intersectObjects([ this.cardV ])
    if (!intersects.length) return

    const p = intersects[0].point
    const c = intersects[0].object.userData

    // x: 0~9 y: 0~9
    const idx = Math.floor(10 * (p.x - c.center.x + 1) / 2)
    const idy = Math.floor(10 * (p.y - c.center.y + 1) / 2)

    // return if already exist
    for (let i = 0; i < this.enhanceList.length; i++) {
      const [ vx, vy ] = this.enhanceList[i]
      if (idx === vx && idy === vy) return
    }
    this.enhanceList.push([idx, idy])

    const geometry = new THREE.PlaneGeometry(2 * (809 / 8096), 2 * (788 / 8096), 1, 1)
    const x = c.center.x - c.w / 2 * 1.0 + (idx + 0.5) * geometry.parameters.width
    const y = c.center.y - c.h / 2 * (c.vh / c.vw) + (idy + 0.5) * geometry.parameters.height

    await this.enhanceVolume(geometry, x, y, idx, idy)
    await this.enhanceSegment(geometry, x, y, idx, idy)
  }

  async enhanceVolume(geometry, x, y, idx, idy) {
    const voldata = await Loader.getVolumeData(`00000/cell_yxz_00${idy}_00${idx}_00000.png`)
    voldata.magFilter = THREE.NearestFilter
    voldata.minFilter = THREE.LinearFilter

    const volumeMaterial = new VolumeMaterial()
    volumeMaterial.uniforms.cmdata.value = this.cmtexture
    volumeMaterial.uniforms.voldata.value = voldata

    const card = new THREE.Mesh(geometry, volumeMaterial)
    card.position.set(x, y, -0.5)
    card.userData = { idx, idy }

    this.scene.add(card)
    this.cardVList.push(card)
  }

  async enhanceSegment(geometry, x, y, idx, idy) {
    const scaling = new THREE.Vector3(8096/10, 7888/10, 10/10)
    const center = new THREE.Vector3(8096/20 * (2*idx + 1), 7888/20 * (2*idy + 1), 0)
    const [ sdfTex, bvh ] = this.sdfTexGenerate(this.clipGeometry, center, scaling)

    const segmentMaterial = new SegmentMaterial()
    segmentMaterial.uniforms.sdfTex.value = sdfTex.texture

    const card = new THREE.Mesh(geometry, segmentMaterial)
    card.position.set(x, y, -0.85)
    card.userData = { idx, idy }

    this.scene.add(card)
    this.cardSList.push(card)
  }

  render() {
    if (!this.renderer) return

    this.cardS.material.uniforms.surface.value = this.params.surface
    this.cardSList.forEach((card) => { card.material.uniforms.surface.value = this.params.surface })
    this.renderer.render(this.scene, this.camera)
  }
}
