import * as THREE from 'three'
import Loader from '../Loader'
import { MOUSE, TOUCH } from 'three'
import { ArcballControls } from 'three/addons/controls/ArcballControls.js'
import { TextureLoader } from 'three'
import { FragmentShader } from './FragmentShader'
import { TIFFLoader } from 'three/addons/loaders/TIFFLoader.js'

export default class ViewerSegment {
  constructor({ params, renderer, canvas }) {
    this.loading = false
    this.scene = null
    this.camera = null
    this.controlDOM = null
    this.subVolumeMeta = null
    this.subSegmentMeta = null

    this.canvas = canvas
    this.renderer = renderer
    this.render = this.render.bind(this)

    this.meshList = []
    this.originGeoList = []
    this.flattenGeoList = []

    this.params = {}
    this.params.mode = 'segment'
    this.params.segmentLayers = params.segmentLayers
    this.params.flatten = 1.0
    this.params.inklabels = true

    for (let i = 0; i < 15; i++) { this.params[i + 1] = true }

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

    this.controls = new ArcballControls(this.camera, this.controlDOM, this.scene)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', this.render)

    const url = new URLSearchParams(window.location.search)
    if (url.get('segment')) this.params.segmentLayers.select = this.params.segmentLayers.options[ url.get('segment') ]
    if(!this.params.segmentLayers.select) this.params.segmentLayers.select = 0
  }

  async updateSegment() {
    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { id, clip, area, inklabels, texture, chunk } = sTarget
    chunk.forEach((v, i) => { this.params[i + 1] = true })

    const loadingList = []
    const surfaceTexture = await new TextureLoader().loadAsync(`segment-layer/${id}/${texture}`)
    const maskTexture = await new TextureLoader().loadAsync(`segment-layer/${id}/${inklabels}`)

    const s = 1 / ((clip.w + clip.h + clip.d) / 3)
    const center = new THREE.Vector3(clip.x + clip.w/2, clip.y + clip.h/2, clip.z + clip.d/2)

    this.normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    this.inkMaterial = new FragmentShader()
    this.inkMaterial.uniforms.tDiffuse.value = surfaceTexture
    this.inkMaterial.uniforms.uMask.value = maskTexture
    this.inkMaterial.uniforms.uArea.value = area
    this.inkMaterial.uniforms.opacity.value = 1.0
    this.inkMaterial.uniforms.uCenter.value = center
    this.inkMaterial.uniforms.uTifsize.value = new THREE.Vector2(surfaceTexture.image.width, surfaceTexture.image.height)
    this.inkMaterial.uniforms.uFlatten.value = this.params.flatten

    chunk.forEach((sID_Layer, i) => {
      const loading = Loader.getSegmentLayerData(`${id}/${sID_Layer}.obj`)
      loading.then((object) => {
        const index = i + 1
        const geometry = object.children[0].geometry                       
        const mesh = new THREE.Mesh(geometry, this.inkMaterial)
        mesh.name = id

        mesh.scale.set(s, s, s)
        mesh.userData = { index }
        // mesh.userData = sTarget
        mesh.position.copy(center.clone().multiplyScalar(-s))

        this.meshList.push(mesh)
        this.scene.add(mesh)
      })
      loadingList.push(loading)
    })
    await Promise.all(loadingList)

    // compute the flattened geometry (for raycasting when mouse click)
    this.calculateGeometry()

    // update url parameters
    const url = new URL(window.location.href)
    const searchParams = url.searchParams
    searchParams.set('mode', 'segment')
    searchParams.set('segment', id)
    url.search = searchParams.toString()
    window.history.replaceState(undefined, undefined, url.href)
  }

  calculateGeometry() {
    const uCenter = this.inkMaterial.uniforms.uCenter.value
    const uArea = this.inkMaterial.uniforms.uArea.value
    const uTifsize = this.inkMaterial.uniforms.uTifsize.value

    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { clip } = sTarget
    const s = 1 / ((clip.w + clip.h + clip.d) / 3)

    this.meshList.forEach((mesh, indx) => {
      const flip = 1
      const r = uTifsize.y / uTifsize.x
      const scale = Math.sqrt(uArea / r)

      const o_positions = []
      const f_positions = []
      const o_uvs = []
      const f_uvs = []
      const o_normals = []
      const f_normals = []

      const positions = mesh.geometry.getAttribute('position').array
      const uvs = mesh.geometry.getAttribute('uv').array
      const normals = mesh.geometry.getAttribute('normal').array

      for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[3 * i + 0]
        const y = positions[3 * i + 1]
        const z = positions[3 * i + 2]

        const uvx = uvs[2 * i + 0]
        const uvy = uvs[2 * i + 1]

        const dir = new THREE.Vector3((0.5 - uvx) * 1.0, (0.5 - uvy) * r * flip, 0.0)

        const flattenX = uCenter.x + dir.x * scale
        const flattenY = uCenter.y + dir.y * scale
        const flattenZ = uCenter.z + dir.z * scale

        o_positions.push(x, y, z)
        f_positions.push(flattenX, flattenY, flattenZ)
      }

      const originalGeometry = new THREE.BufferGeometry()
      originalGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      originalGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(o_positions), 3))
      originalGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
      this.originGeoList.push(originalGeometry)

      const flattenGeometry = new THREE.BufferGeometry()
      flattenGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      flattenGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f_positions), 3))
      flattenGeometry.computeVertexNormals()
      this.flattenGeoList.push(flattenGeometry)

      // const mesh1 = new THREE.Mesh(originalGeometry, this.inkMaterial)
      const mesh1 = new THREE.Mesh(originalGeometry, this.normalMaterial)
      const mesh2 = new THREE.Mesh(flattenGeometry, this.normalMaterial)
      // const mesh2 = new THREE.Mesh(flattenGeometry, this.inkMaterial)

      mesh1.scale.set(s, s, s)
      mesh1.position.copy(uCenter.clone().multiplyScalar(-s))
      mesh2.scale.set(s, s, s)
      mesh2.position.copy(uCenter.clone().multiplyScalar(-s))

      this.scene.add(mesh1)
      this.scene.add(mesh2)
    })
  }

  getLabel(mouse) {
    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { id, clip } = sTarget

    if (!mouse) { return { id, clip } }

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const intersects = raycaster.intersectObjects(this.meshList)
    if (!intersects.length) return

    return { id, clip }
  }

  render() {
    if (!this.renderer || this.controlDOM.style.display  !== 'inline') return

    this.scene.children.forEach((mesh) => {
      const index = mesh.userData.index
      if (!index) return
      mesh.visible = this.params[index]
      this.inkMaterial.uniforms.uFlatten.value = this.params.flatten
      mesh.material = this.params.inklabels ? this.inkMaterial : this.normalMaterial
    })

    this.renderer.render(this.scene, this.camera)
  }

  clear() {
    this.meshList.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.geometry = null
      mesh.material = null
      this.scene.remove(mesh)
    })

    this.originGeoList.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.geometry = null
      mesh.material = null
      this.scene.remove(mesh)
    })

    this.flattenGeoList.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.geometry = null
      mesh.material = null
      this.scene.remove(mesh)
    })

    this.meshList = []
    this.originGeoList = []
    this.flattenGeoList = []
  }
}