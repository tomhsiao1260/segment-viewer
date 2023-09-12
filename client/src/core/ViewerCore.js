import * as THREE from 'three'
import { MOUSE, TOUCH } from 'three'
import Loader from '../Loader'
import textureViridis from './textures/cm_viridis.png'
import { MeshBVH } from 'three-mesh-bvh'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import { GenerateSDFMaterial } from './GenerateSDFMaterial'
import { SegmentSmallMaterial } from './SegmentSmallMaterial'
import { VolumeSmallMaterial } from './VolumeSmallMaterial'
import { SegmentMaterial } from './SegmentMaterial'
import { VolumeMaterial } from './VolumeMaterial'

export default class ViewerCore {
  constructor({ volumeMeta, segmentMeta }) {
    this.volumeMeta = volumeMeta
    this.segmentMeta = segmentMeta

    this.init()
  }

  init() {
    const sizes = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    // const gui = new GUI()
    // gui.add({ enhance: generateTile }, 'enhance')

    const canvas = document.querySelector('canvas.webgl')
    const scene = new THREE.Scene()
    const renderer = new THREE.WebGLRenderer({ canvas })
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    let card, cardS, clipGeometry, focusGeometry, bvhh, sdfTexx

    const cmTexture = new THREE.TextureLoader().load(textureViridis)
    const tifTexture = new THREE.TextureLoader().load('volume/00000.png', tick)
    cmTexture.minFilter = THREE.NearestFilter
    cmTexture.magFilter = THREE.NearestFilter
    tifTexture.magFilter = THREE.NearestFilter
    tifTexture.minFilter = THREE.LinearFilter

    const segmentSmallMaterial = new SegmentSmallMaterial()
    const volumeSmallMaterial = new VolumeSmallMaterial()

    const promiseList = []

    this.segmentMeta.segment.forEach(({ id, clip }) => {
      const loading = Loader.getSegmentData(`00000/${id}_00000_points.obj`)
      promiseList.push(loading)
    })

    Promise.all(promiseList).then((res) => {
      const c_positions = []
      const chunkList = []

      const [ texture ] = res

      res.forEach((group, i) => {
        const { id, clip } = this.segmentMeta.segment[i]
        const positions = group.children[0].geometry.getAttribute('position').array
        c_positions.push(...positions)
        chunkList.push({ id, maxIndex: c_positions.length / 3, clip  })
      })

      clipGeometry = new THREE.BufferGeometry()
      clipGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c_positions), 3))
      clipGeometry.userData.chunkList = chunkList
      // clipGeometry.userData.id = id

      const [ sdfTex, bvh ] = sdfTexGenerate(clipGeometry)
      bvhh = bvh
      sdfTexx = sdfTex

      const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
      volumeSmallMaterial.uniforms.utifTexture.value = tifTexture
      volumeSmallMaterial.uniforms.cmdata.value = cmTexture

      card = new THREE.Mesh(geometry, volumeSmallMaterial)
      card.userData = { w: 2, h: 2, vw: 810, vh: 789, center: new THREE.Vector3() }
      scene.add(card)

      const geometryS = new THREE.PlaneGeometry(2, 2, 1, 1)
      segmentSmallMaterial.uniforms.sdfTex.value = sdfTexx.texture

      cardS = new THREE.Mesh(geometryS, segmentSmallMaterial)
      cardS.position.set(0, 0, -0.7)
      // scene.add(cardS)

      // gui.add(segmentSmallMaterial.uniforms.surface, 'value', 0, 10.0).name('surface').onChange(tick)

      tick()
    })

    const geometryP = new THREE.PlaneGeometry(2 * (809/8096), 2 * (788/8096), 1, 1)

    function generateTile() {
      const mouse = new THREE.Vector2()
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects([ card ])

      if (!intersects.length) return

      const p = intersects[0].point
      const c = intersects[0].object.userData

      // 0~9
      const idx = Math.floor(10 * (p.x - c.center.x + 1) / 2)
      const idy = Math.floor(10 * (p.y - c.center.y + 1) / 2)
      const tifPTexture = new THREE.TextureLoader().loadAsync(`volume/00000/cell_yxz_00${idy}_00${idx}_00000.png`)

      Promise.all([ meta, tifPTexture ]).then((res) => {
        const [ meta, texture ] = res
        const { id, clip, subclip } = meta.volume[0]

        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.LinearFilter

        const x = c.center.x - c.w / 2 * 1.0 + (idx + 0.5) * geometryP.parameters.width
        const y = c.center.y - c.h / 2 * (c.vh / c.vw) + (idy + 0.5) * geometryP.parameters.height

        const volumeMaterial = new VolumeMaterial()
        volumeMaterial.uniforms.cmdata.value = cmTexture

        const cardP = new THREE.Mesh(geometryP, volumeMaterial)
        cardP.position.set(x, y, -0.5)
        scene.add(cardP)

        cardP.material.uniforms.utifPTexture.value = texture

        const segmentMaterial = new SegmentMaterial()
        segmentSmallMaterial.uniforms.sdfTex.value = sdfTexx.texture

        const cardPP = new THREE.Mesh(geometryP, segmentMaterial)
        cardPP.position.set(x, y, -0.8)
        // scene.add(cardPP)

        tick()
      })
    }

    function updateFocusGeometry(clickID) {
      const q = { start: 0, end: 0, sID: null, vID: null }
      const { chunkList } = clipGeometry.userData
      for (let i = 0; i < chunkList.length; i += 1) {
        const { id: sID } = chunkList[i]
        if (sID === clickID) {
          q.sID = sID
          // q.vID = this.params.layers.select
          q.end = chunkList[i].maxIndex
          q.start = (i === 0) ? 0 : chunkList[i - 1].maxIndex
          break
        }
      }

      if (!q.end && !focusGeometry) return
      if (!q.end) { focusGeometry.dispose(); focusGeometry = null; return }
      // return if current focus geometry already exist
      const f = focusGeometry
      // if (f && f.userData.sID === q.sID && f.userData.vID === q.vID) return
      if (f && f.userData.sID === q.sID) return

      const f_positions = clipGeometry.getAttribute('position').array.slice(q.start * 3, q.end * 3)

      const focusGeometry_ = new THREE.BufferGeometry()
      focusGeometry_.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f_positions), 3))
      focusGeometry_.userData = q

      return focusGeometry_
    }

    window.addEventListener('resize', () => {
      // Update sizes
      sizes.width = window.innerWidth
      sizes.height = window.innerHeight

      // Update camera
      // camera.aspect = sizes.width / sizes.height
      camera.left = -1 * sizes.width / sizes.height
      camera.right = 1 * sizes.width / sizes.height
      camera.top = 1
      camera.bottom = -1

      camera.updateProjectionMatrix()

      // Update renderer
      renderer.setSize(sizes.width, sizes.height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      tick()
    })

    // const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.01, 100)
    const camera = new THREE.OrthographicCamera(-1 * sizes.width / sizes.height, 1 * sizes.width / sizes.height, 1, -1, 0.01, 100)
    camera.up.set(0, -1, 0)
    camera.position.z = -1.3
    scene.add(camera)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = false
    controls.screenSpacePanning = true // pan orthogonal to world-space direction camera.up
    controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
    controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }

    controls.addEventListener('change', tick)

    function tick() {
      renderer.render(scene, camera)
    }

    function sdfTexGenerate(geometry) {
      const nrrd = { w: 810, h: 789, d: 1 }
      const s = 1 / Math.max(nrrd.w, nrrd.h, nrrd.d)

      const matrix = new THREE.Matrix4()
      // const center = new THREE.Vector3()
      const center = new THREE.Vector3(8096 / 2, 7888 / 2, 0)
      const quat = new THREE.Quaternion()
      const scaling = new THREE.Vector3()

      scaling.set(8096, 7888, 10)
      matrix.compose(center, quat, scaling)

      const bvh = new MeshBVH(geometry, { maxLeafTris: 1 })
      const generateSdfPass = new FullScreenQuad(new GenerateSDFMaterial())
      generateSdfPass.material.uniforms.bvh.value.updateFrom(bvh)
      generateSdfPass.material.uniforms.matrix.value.copy(matrix)
      generateSdfPass.material.uniforms.zValue.value = 0.5

      // const sdfTex = new THREE.WebGLRenderTarget(nrrd.w * 10, nrrd.h * 10)
      const sdfTex = new THREE.WebGLRenderTarget(nrrd.w, nrrd.h)
      sdfTex.texture.format = THREE.RedFormat
      sdfTex.texture.type = THREE.FloatType
      sdfTex.texture.minFilter = THREE.LinearFilter
      sdfTex.texture.magFilter = THREE.LinearFilter
      renderer.setRenderTarget(sdfTex)
      generateSdfPass.render(renderer)
      renderer.setRenderTarget(null)

      return [ sdfTex, bvh ]
    }

    function getLabel(mouse) {
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects([ card ])

      if (!intersects.length) return

      const p = intersects[0].point
      const c = intersects[0].object.userData

      const point = new THREE.Vector3()
      point.x = (p.x - c.center.x) / (c.w / 2) / 2 + 0.5
      point.y = (p.y - c.center.y) / (c.h / 2) / 2 * (810 / 789) + 0.5
      point.z = 0

      point.x *= 8096
      point.y *= 7888

      const target = bvhh.closestPointToPoint(point, {}, 0, 100)
      if (!target) return

      const { chunkList } = bvhh.geometry.userData
      const hitIndex = bvhh.geometry.index.array[target.faceIndex * 3]

      for (let i = 0; i < chunkList.length; i ++) {
        const { id: sID, maxIndex, clip } = chunkList[i]
        if (maxIndex > hitIndex) {
          return { id: sID, clip  }
        }
      }
    }

    // segment labeling
    function labeling() {
      const mouse = new THREE.Vector2()
      const labelDiv = document.createElement('div')
      labelDiv.id = 'label'
      document.body.appendChild(labelDiv)

      window.addEventListener('mousedown', (e) => {
        if (!(e.target instanceof HTMLCanvasElement)) return
        mouse.x = e.clientX / window.innerWidth * 2 - 1
        mouse.y = - (e.clientY / window.innerHeight) * 2 + 1

        // const { mode } = viewer.params
        labelDiv.style.display = 'none'

        // const loadingDiv = document.querySelector('#loading')
        // if (loadingDiv.style.display === 'inline') return

        if (true) {
          // only this line is important
          const sTarget = getLabel(mouse)
          if (!sTarget) { return }

          const { id, clip } = sTarget
          labelDiv.style.display = 'inline'
          labelDiv.style.left = (e.clientX + 20) + 'px'
          labelDiv.style.top = (e.clientY + 20) + 'px'
          labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
          // as well as this line
          updateViewer(id)
        }
      })
    }

    labeling()

    function updateViewer(clickID) {
      const focusGeometry = updateFocusGeometry(clickID)
      if (!focusGeometry) return
      const [ sdfTexFocus, _ ] = sdfTexGenerate(focusGeometry)
      cardS.material.uniforms.sdfTexFocus.value = sdfTexFocus.texture

      tick()
    }
  }
}
