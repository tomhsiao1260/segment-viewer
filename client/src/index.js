import * as THREE from 'three'
import Loader from './Loader'
import ViewerLayer from './core/ViewerLayer'
import ViewerSegment from './core/ViewerSegment'
import ViewerWrapping from './core/ViewerWrapping'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min'

init()

async function init() {
  const volumeMeta = await Loader.getVolumeMeta()
  const segmentMeta = await Loader.getSegmentMeta()
  const segmentLayerMeta = await Loader.getSegmentLayerMeta()
  const segmentCenterData = await Loader.getSegmentCenterData()
  const params = setParams(volumeMeta, segmentMeta, segmentLayerMeta, segmentCenterData)

  // renderer setup
  const canvas = document.querySelector('.webgl')
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const vLayer = new ViewerLayer({ params, renderer, canvas })
  const vSegment = new ViewerSegment({ params, renderer, canvas })
  const vWrapping = new ViewerWrapping({ params, renderer, canvas })

  const url = new URLSearchParams(window.location.search)
  const mode = url.get('mode') ? url.get('mode') : 'segment'
  const viewerList = { select: mode, options: { 'layer': vLayer, 'segment': vSegment, 'wrapping': vWrapping } }
  setMode(viewerList)

  setLoading(vLayer, vSegment)
  setLayerLabeling(vLayer)
  setSegmentLabeling(vSegment)
}

function setMode(viewerList) {
  const mode = viewerList.select
  const viewer = viewerList.options[mode]

  const labelDiv = document.querySelector('#label')
  if (labelDiv) labelDiv.style.display = 'none'

  viewerList.options.layer.controlDOM.style.display = 'none'
  viewerList.options.segment.controlDOM.style.display = 'none'
  viewerList.options.wrapping.controlDOM.style.display = 'none'
  viewer.controlDOM.style.display = 'inline'

  viewer.setURLParamState()
  if (mode === 'layer') updateViewer(viewer, 'layer')
  if (mode === 'segment') updateViewer(viewer, 'segment')
  if (mode === 'wrapping') updateViewer(viewer, 'wrapping')

  updateGUI(viewerList)
}

function setParams(volumeMeta, segmentMeta, segmentLayerMeta, segmentCenterData) {
  const params = {}
  params.layers = { select: 0, options: {}, getLayer: {}, volumeMeta }
  params.segments = { select: 0, options: {}, getID: {}, segmentMeta }
  params.segmentLayers = { select: 0, options: {}, getID: {}, segmentLayerMeta }
  params.segmentCenter = segmentCenterData

  // list all layer options
  for (let i = 0; i < volumeMeta.volume.length; i++) {
    const id = parseInt(volumeMeta.volume[i].id)
    params.layers.options[ id ] = i
    params.layers.getLayer[ i ] = id
  }
  // list all segment options
  for (let i = 0; i < segmentMeta.segment.length; i++) {
    const id = segmentMeta.segment[i].id
    params.segments.options[ id ] = i
    params.segments.getID[ i ] = id
  }
  // list all segment options (with cutting)
  for (let i = 0; i < segmentLayerMeta.segment.length; i++) {
    const id = segmentLayerMeta.segment[i].id
    params.segmentLayers.options[ id ] = i
    params.segmentLayers.getID[ i ] = id
  }

  return params
}

async function updateViewer(viewer, mode) {
  if (mode === 'layer') {
    viewer.loading = true
    viewer.clear()
    await viewer.updateVolume()
    await viewer.clipSegment()
    viewer.render()
    viewer.loading = false
  }
  if (mode === 'segment') {
    viewer.loading = true
    viewer.clear()
    await viewer.updateSegment()
    viewer.updateGeometry()
    viewer.render()

    // draw all related points when clicking
    const url = new URLSearchParams(window.location.search)
    const x = parseInt(url.get('x'))
    const y = parseInt(url.get('y'))
    const z = parseInt(url.get('layer'))

    if (x && y && z) {
      const c = viewer.getCenter(z)
      const intersects = viewer.getIntersectFromCenter(c.x, c.y, c.z, x, y, z)
      const color = randomColor()
      viewer.drawMarker(intersects, color)
    }

    viewer.render()
    viewer.loading = false
  }
  if (mode === 'wrapping') {
    viewer.loading = true
    viewer.clear()
    viewer.setup()
    viewer.render()
    viewer.loading = false
  }
}

let gui

function updateGUI(viewerList) {
  const mode = viewerList.select
  const viewer = viewerList.options[mode]

  if (gui) { gui.destroy() }

  gui = new GUI()
  gui.title('2024/01/24')
  gui.add({ select: mode }, 'select', [ 'layer', 'segment', 'wrapping' ]).name('mode').onChange((mode) => {
    viewerList.select = mode
    setMode(viewerList)
  })

  if (mode === 'layer') {
    gui.add(viewer.params.layers, 'select', viewer.params.layers.options).name('layers').listen().onChange(() => updateViewer(viewer, 'layer'))
    gui.add(viewer.params.segments, 'select', viewer.params.segments.options).name('segments').listen().onChange(async() => {
      const sID = viewer.params.segments.getID[ viewer.params.segments.select ]
      const { id, clip } = viewer.getClipInfo(sID)

      // move to the segment
      const pixelX = clip.x + clip.w / 2
      const pixelY = clip.y + clip.h / 2
      const { x, y } = viewer.pixelTocameraPosition(pixelX, pixelY)
      viewer.controls.target = new THREE.Vector3(x, y, 0)
      viewer.camera.position.x = x
      viewer.camera.position.y = y
      viewer.camera.zoom = 2.5
      viewer.camera.updateProjectionMatrix()

      viewer.params.layers.select = Math.ceil(clip.z / 50)
      await updateViewer(viewer, 'layer')

      const labelDiv = document.querySelector('#label')
      labelDiv.style.display = 'inline'
      labelDiv.style.left = '50%'
      labelDiv.style.top = '50%'
      labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
    })
    gui.add(viewer.params, 'surface', 0, 10).name('thickness').onChange(viewer.render)
    gui.add(viewer.params, 'colorBool').name('color').onChange(viewer.render)
  }

  if (mode === 'segment') {
    gui.add(viewer.params.segmentLayers, 'select', viewer.params.segmentLayers.options).name('segments').onChange(() => {
      updateViewer(viewer, 'segment')
      updateGUI(viewerList)
    })

    const flattenController = gui.add(viewer.params, 'flatten', 0, 1, 0.01)
    flattenController.onChange(viewer.render)
    flattenController.onFinishChange(() => {
      viewer.updateGeometry()
      viewer.render()
    })

    const { select, segmentLayerMeta } = viewer.params.segmentLayers
    segmentLayerMeta.segment[select].chunk.forEach((v, i) => { gui.add(viewer.params, i+1).listen().onChange(viewer.render) })

    const folder = gui.addFolder('options')
    folder.add(viewer.params, 'color').onChange(viewer.render)
    folder.add(viewer.params, 'inklabels').onChange(viewer.render)
    folder.add(viewer.params, 'marker').onChange(viewer.render)
    folder.add(viewer.params, 'surface').onChange(viewer.render)
    uploadPrediction(folder, viewer)
    folder.close()
  }

  if (mode === 'wrapping') {
    gui.add(viewer.params, 'wrapping', 0, 26.99, 0.01).name('wrapping').listen().onChange(viewer.updateWrapping)
  }
}

// gui button for users to upload their personal ink predictions
function uploadPrediction(gui, viewer) {
  const fileInput = { div: document.querySelector('#prediction') }

  if (!fileInput.div) {
    fileInput.div = document.createElement('input')
    fileInput.div.id = 'prediction'
    fileInput.div.type = 'file'
    fileInput.div.accept = 'image/*'
    fileInput.div.style.display = 'none'
    fileInput.div.addEventListener('change', handleFileSelect, false)
    document.body.appendChild(fileInput.div)
  }
  gui.add({ loadFile: () => fileInput.div.click() }, 'loadFile').name('Upload Prediction')

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = function (event) {
        const maskURL = event.target.result
        viewer.uploadPrediction(maskURL)
      }
      reader.readAsDataURL(file)
    }
  }
}

// loading div element
function setLoading(vLayer, vSegment) {
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'loading'
  loadingDiv.innerHTML = 'Loading ...'
  document.body.appendChild(loadingDiv)

  window.setInterval(() => {
    const isLoading = vLayer.loading || vSegment.loading
    loadingDiv.style.display = isLoading ? 'inline' : 'none'
  }, 500)
}

// labeling
function setLayerLabeling(viewer) {
  const mouse = new THREE.Vector2()
  const labelDiv = document.createElement('div')
  labelDiv.id = 'label'
  document.body.appendChild(labelDiv)

  const { id, clip } = viewer.getLabel()
  labelDiv.style.display = 'inline'
  labelDiv.style.left = '50%'
  labelDiv.style.top = '50%'
  labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`

  if (viewer.controlDOM.style.display !== 'inline') labelDiv.style.display = 'none'

  window.addEventListener('mousedown', (e) => {
    if (e.target.className !== 'layer') return

    mouse.x = e.clientX / window.innerWidth * 2 - 1
    mouse.y = - (e.clientY / window.innerHeight) * 2 + 1

    const loadingDiv = document.querySelector('#loading')
    if (loadingDiv.style.display === 'inline') return

    const labelDiv = document.querySelector('#label')
    if (labelDiv) labelDiv.style.display = 'none'
 
    // only this line is important
    const sTarget = viewer.getLabel(mouse)
    if (!sTarget) { return }

    const { id, clip } = sTarget
    labelDiv.style.display = 'inline'
    labelDiv.style.left = (e.clientX + 20) + 'px'
    labelDiv.style.top = (e.clientY + 20) + 'px'
    labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
    // as well as these lines
    viewer.params.segments.select = viewer.params.segments.options[id]
    viewer.updateFocusGeometry()
    viewer.render()
  })
}

function setSegmentLabeling(viewer) {
  const mouse = new THREE.Vector2()

  window.addEventListener('mousedown', (e) => {
    if (e.target.className !== 'segment') return

    mouse.x = e.clientX / window.innerWidth * 2 - 1
    mouse.y = - (e.clientY / window.innerHeight) * 2 + 1

    const labelDiv = document.querySelector('#label')
    if (labelDiv) labelDiv.style.display = 'none'

    const p = viewer.getLabel(mouse)
    if (!p) { return }

    // draw all related points when clicking
    const c = viewer.getCenter(p.z)
    const intersects = viewer.getIntersectFromCenter(c.x, c.y, c.z, p.x, p.y, p.z)
    const color = randomColor()
    viewer.drawMarker(intersects, color)

    labelDiv.style.display = 'inline'
    labelDiv.style.left = (e.clientX + 20) + 'px'
    labelDiv.style.top = (e.clientY + 20) + 'px'
    labelDiv.innerHTML = `x: ${p.x}<br/>y: ${p.y}<br/>z: ${p.z}`
  })

  // screen shot for analyzing
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return

    viewer.render()
    snapshotOnce(viewer, 'origin')

    // zLayer that you want to analyze
    const zLayers = [ 1050, 3650, 5050, 7200, 8800, 12000 ]
    const meta = []
    const center = []

    zLayers.forEach(zLayer => {
      const c = viewer.getCenter(zLayer)
      center.push({ zLayer, x: parseInt(c.x), y: parseInt(c.y) })

      const r = 4000
      const dotNum = 20
      const colors = [ '#E8DDFC', '#BB99FB', '#E9AEDC', '#99BBCD', '#FEFECD', '#DCEAEC', '#FDCFB8', '#F9F88B', '#BDF8B9', '#CC8ABF', '#ACDADF', '#E8DFBC', '#CB9DE9', '#DEBBBD', '#D8EAEC', '#8CAE8D', '#DA8BAD', '#9CFDEE', '#BDFDBF', '#EDFA9E' ]

      for (let i = 0; i < dotNum; i++) {
        const theta = 2 * Math.PI * (i / dotNum)
        const intersects = viewer.getIntersectFromCenter(c.x, c.y, c.z, c.x + r * Math.cos(theta), c.y + r * Math.sin(theta), c.z)
        const { x, y, z } = viewer.getPositionFromIntersect(intersects)
        const color = colors[i]
        viewer.drawMarker(intersects, color)

        meta.push({ zLayer, i, x, y, color })
      }
    })
    saveJson({ center, meta }, 'meta')

    viewer.meshList.forEach((mesh, i) => { viewer.params[i] = (i % 2 === 0) })
    viewer.render()
    snapshotOnce(viewer, 'even')
    viewer.meshList.forEach((mesh, i) => { viewer.params[i] = (i % 2 === 1) })
    viewer.render()
    snapshotOnce(viewer, 'odd')
  })
}

// generate random color
function randomColor() {
  const color = { value: '#', palette: '89ABCDEF' }
  for (let i = 0; i < 6; i++) {
    color.value += color.palette[ Math.floor(Math.random() * color.palette.length) ]
  }
  return color.value
}

async function snapshotOnce(viewer, filename) {
  const imgData = viewer.renderer.domElement.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = imgData
  link.download = filename
  link.click()
}

async function saveJson(data, filename) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([ json ], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}

