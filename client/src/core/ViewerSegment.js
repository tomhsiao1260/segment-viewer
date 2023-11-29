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
    this.meshVirtualList = []
    this.markerList = []

    this.params = {}
    this.params.mode = 'segment'
    this.params.flatten = 1.0
    this.params.surface = false
    this.params.inklabels = true
    this.params.marker = true
    this.params.color = true
    this.params.segmentLayers = params.segmentLayers
    this.params.segmentCenter = params.segmentCenter

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
  }

  // set state via url params
  setURLParamState() {
    const url = new URLSearchParams(window.location.search)
    if (url.get('segment')) this.params.segmentLayers.select = this.params.segmentLayers.options[ url.get('segment') ]
    if(!this.params.segmentLayers.select) this.params.segmentLayers.select = 0
  }

  async updateSegment() {
    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { id, clip, area, inklabels, texture, chunk } = sTarget

    chunk.forEach((v, i) => { this.params[i + 1] = true })
    this.meshList = Array(chunk.length).fill(null)

    const loadingList = []
    const surfaceTexture = await new TIFFLoader().loadAsync(`segment-layer/${id}/${texture}`)
    const maskTexture = await new TextureLoader().loadAsync(`segment-layer/${id}/${inklabels}`)

    surfaceTexture.minFilter = THREE.NearestFilter
    surfaceTexture.magFilter = THREE.NearestFilter
    maskTexture.minFilter = THREE.NearestFilter
    maskTexture.magFilter = THREE.NearestFilter

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
    this.inkMaterial.uniforms.uInklabels.value = this.params.inklabels
    this.inkMaterial.uniforms.uColor.value = this.params.color

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

        this.meshList[i] = mesh
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

  async uploadPrediction(maskURL) {
    const maskTexture = await new THREE.TextureLoader().loadAsync(maskURL)
    this.inkMaterial.uniforms.uMask.value = maskTexture
    this.render()
  }

  calculateGeometry() {
    const center = this.inkMaterial.uniforms.uCenter.value
    const area = this.inkMaterial.uniforms.uArea.value
    const tifsize = this.inkMaterial.uniforms.uTifsize.value

    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { clip } = sTarget
    const s = 1 / ((clip.w + clip.h + clip.d) / 3)

    this.meshList.forEach((mesh, i) => {
      const flip = -1
      const r = tifsize.y / tifsize.x
      const scale = Math.sqrt(area / r)

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

        const dir = new THREE.Vector3((uvx - 0.5) * 1.0, (uvy - 0.5) * flip * r, 0.0)

        const flattenX = center.x + dir.x * scale
        const flattenY = center.y + dir.y * scale
        const flattenZ = center.z + dir.z * scale

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

      const currentGeometry = new THREE.BufferGeometry()
      currentGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      currentGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f_positions), 3))
      currentGeometry.computeVertexNormals()

      const meshV = new THREE.Mesh(currentGeometry, this.normalMaterial)
      meshV.userData = mesh.userData
      meshV.scale.set(s, s, s)
      meshV.position.copy(center.clone().multiplyScalar(-s))
      meshV.visible = false
      this.meshVirtualList.push(meshV)
      this.scene.add(meshV)
    })
  }

  updateGeometry() {
    const flatten = this.inkMaterial.uniforms.uFlatten.value

    this.meshVirtualList.forEach((meshV, i) => {
      const originGeometry = this.originGeoList[i]
      const flattenGeometry = this.flattenGeoList[i]

      const o_positions = originGeometry.getAttribute('position').array
      const f_positions = flattenGeometry.getAttribute('position').array
      const c_positions = []

      for (let i = 0; i < o_positions.length / 3; i++) {
        const ox = o_positions[3 * i + 0]
        const oy = o_positions[3 * i + 1]
        const oz = o_positions[3 * i + 2]
        const fx = f_positions[3 * i + 0]
        const fy = f_positions[3 * i + 1]
        const fz = f_positions[3 * i + 2]

        const cx = ox + (fx - ox) * flatten
        const cy = oy + (fy - oy) * flatten
        const cz = oz + (fz - oz) * flatten

        c_positions.push(cx, cy, cz)
      }

      meshV.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c_positions), 3))
      meshV.geometry.computeVertexNormals()
      meshV.geometry.computeBoundingSphere()
    })
  }

  getScalingInfo() {
    const center = this.inkMaterial.uniforms.uCenter.value

    const select = this.params.segmentLayers.select
    const sTarget = this.params.segmentLayers.segmentLayerMeta.segment[select]
    const { clip } = sTarget
    const s = 1 / ((clip.w + clip.h + clip.d) / 3)

    return { center, s }
  }

  getLabel(mouse) {
    if (this.params.surface) return
    const list = []

    // only select activate pieces
    this.meshVirtualList.forEach((meshV, i) => {
      const index = meshV.userData.index
      if (this.params[ index ]) { list.push(meshV) }
    })

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const intersects = raycaster.intersectObjects(list)
    if (!intersects.length) return

    const { x, y, z } = this.getPositionFromIntersect(intersects)
    if (!x || !y || !z) return

    const url = new URL(window.location.href)
    const searchParams = url.searchParams
    searchParams.set('x', x)
    searchParams.set('y', y)
    searchParams.set('layer', z)
    url.search = searchParams.toString()
    window.history.replaceState(undefined, undefined, url.href)

    return { x, y, z }
  }

  getPositionFromIntersect(intersects) {
    // use intersect point & uv to trace back to the original position
    const { uv, face, object } = intersects[0]
    const { index } = object.userData

    // find that point (weighted average on a intersect triangle)
    for (let i = 0; i < this.originGeoList.length; i++) {
      if (index !== (i + 1)) continue

      const originalGeometry = this.originGeoList[i]
      const pos = originalGeometry.getAttribute('position').array
      const uvs = originalGeometry.getAttribute('uv').array

      const { a, b, c } = face
      const pa = new THREE.Vector3(pos[3 * a + 0], pos[3 * a + 1], pos[3 * a + 2])
      const pb = new THREE.Vector3(pos[3 * b + 0], pos[3 * b + 1], pos[3 * b + 2])
      const pc = new THREE.Vector3(pos[3 * c + 0], pos[3 * c + 1], pos[3 * c + 2])
      const ua = new THREE.Vector2(uvs[2 * a + 0], uvs[2 * a + 1])
      const ub = new THREE.Vector2(uvs[2 * b + 0], uvs[2 * b + 1])
      const uc = new THREE.Vector2(uvs[2 * c + 0], uvs[2 * c + 1])

      const da = 1 / uv.distanceTo(ua)
      const db = 1 / uv.distanceTo(ub)
      const dc = 1 / uv.distanceTo(uc)
      const wa = da / (da + db + dc)
      const wb = db / (da + db + dc)
      const wc = dc / (da + db + dc)

      const x = Math.round(pa.x * wa + pb.x * wb + pc.x * wc)
      const y = Math.round(pa.y * wa + pb.y * wb + pc.y * wc)
      const z = Math.round(pa.z * wa + pb.z * wb + pc.z * wc)

      return { x, y, z }
    }
  }

  // nearest scroll center position (interpolation)
  getCenter(z) {
    const geometry = this.params.segmentCenter.children[0].geometry
    const positions = geometry.getAttribute('position').array

    const n = parseInt(positions.length / 3) - 1
    const zMin = positions[0 * 3 + 2]
    const zMax = positions[n * 3 + 2]

    const zc = Math.max(zMin, Math.min(z, zMax))
    const nc = n * (zc - zMin) / (zMax - zMin)
    const ns = Math.floor(nc)
    const ne = Math.ceil(nc)

    const xs = positions[ns * 3 + 0]
    const ys = positions[ns * 3 + 1]
    const zs = positions[ns * 3 + 2]
    const xe = positions[ne * 3 + 0]
    const ye = positions[ne * 3 + 1]
    const ze = positions[ne * 3 + 2]

    const ds = (zc === zs) ? 0.0001: Math.abs(zc - zs)
    const de = (zc === ze) ? 0.0001: Math.abs(zc - ze)
    const xc = (xs * de + xe * ds) / (ds + de)
    const yc = (ys * de + ye * ds) / (ds + de)

    return { x: xc, y: yc, z }
  }

  // intersect UV points for a ray casting from the scroll center
  getIntersectFromCenter(xo, yo, zo, xp, yp, zp) {
    // only select activate pieces
    const list = []

    this.meshList.forEach((mesh, i) => {
      const index = mesh.userData.index
      if (this.params[ index ]) { list.push(mesh) }
    })

    // casting ray
    const { center, s } = this.getScalingInfo()
    const rayOrigin = new THREE.Vector3(xo, yo, zo).sub(center).multiplyScalar(s)
    const rayPoint = new THREE.Vector3(xp, yp, zp).sub(center).multiplyScalar(s)
    const rayDirection = rayPoint.sub(rayOrigin).normalize()

    const raycaster = new THREE.Raycaster()
    raycaster.set(rayOrigin, rayDirection)

    const intersects = raycaster.intersectObjects(list)
    return intersects
  }

  drawMarker(intersects, color) {
    const { center, s } = this.getScalingInfo()

    // draw marker on the flatten plane via UV coordinate
    intersects.forEach(({ uv, point }) => {
      const area = this.inkMaterial.uniforms.uArea.value
      const tifsize = this.inkMaterial.uniforms.uTifsize.value
      const flip = -1
      const r = tifsize.y / tifsize.x
      const scale = Math.sqrt(area / r)

      const dir = new THREE.Vector3((uv.x - 0.5) * 1.0, (uv.y - 0.5) * flip * r, 0.0)

      const flattenX = center.x + dir.x * scale
      const flattenY = center.y + dir.y * scale
      const flattenZ = center.z + dir.z * scale

      const fx = (flattenX - center.x) * s
      const fy = (flattenY - center.y) * s
      const fz = (flattenZ - center.z) * s

      const originPoint = point.clone()
      const flattenPoint = new THREE.Vector3(fx, fy, fz)
      const fp = flattenPoint.clone().multiplyScalar(this.params.flatten)
      const op = originPoint.clone().multiplyScalar(1 - this.params.flatten)
      const currentPoint = fp.add(op)

      const geometry = new THREE.SphereGeometry(0.005, 6, 6)
      const material = new THREE.MeshBasicMaterial({ color })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData = { originPoint, flattenPoint }
      mesh.position.copy(currentPoint)

      this.markerList.push(mesh)
      this.scene.add(mesh)
    })
  }

  render() {
    if (!this.renderer || this.controlDOM.style.display  !== 'inline') return

    this.meshList.forEach((mesh) => {
      const index = mesh.userData.index
      mesh.visible = this.params[index]
      mesh.material = this.params.surface ? this.normalMaterial : this.inkMaterial
      this.inkMaterial.uniforms.uFlatten.value = this.params.flatten
      this.inkMaterial.uniforms.uInklabels.value = this.params.inklabels
      this.inkMaterial.uniforms.uColor.value = this.params.color
    })

    const visible = !this.params.surface && this.params.marker
    this.markerList.forEach((mesh) => {
      const { originPoint, flattenPoint } = mesh.userData
      const fp = flattenPoint.clone().multiplyScalar(this.params.flatten)
      const op = originPoint.clone().multiplyScalar(1 - this.params.flatten)
      const currentPoint = fp.add(op)

      mesh.position.copy(currentPoint)
      mesh.visible = visible
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

    this.originGeoList.forEach((geometry) => {
      geometry.dispose()
      geometry = null
    })

    this.flattenGeoList.forEach((geometry) => {
      geometry.dispose()
      geometry = null
    })

    this.meshVirtualList.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.geometry = null
      mesh.material = null
      this.scene.remove(mesh)
    })

    this.markerList.forEach((mesh) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.geometry = null
      mesh.material = null
      this.scene.remove(mesh)
    })

    if (this.inkMaterial) {
      const surfaceTexture = this.inkMaterial.uniforms.tDiffuse.value
      const maskTexture = this.inkMaterial.uniforms.uMask.value
      surfaceTexture.dispose()
      maskTexture.dispose()
      this.inkMaterial.dispose()
    }

    this.meshList = []
    this.originGeoList = []
    this.flattenGeoList = []
    this.meshVirtualList = []
    this.markerList = []
  }
}