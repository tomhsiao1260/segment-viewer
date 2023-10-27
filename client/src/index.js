import * as THREE from 'three'
import Loader from './Loader'
import ViewerCore from './core/ViewerCore'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min'

init()

async function init() {
  const volumeMeta = await Loader.getVolumeMeta()
  const segmentMeta = await Loader.getSegmentMeta()

  const viewer = new ViewerCore({ volumeMeta, segmentMeta })
  viewer.controls.addEventListener('change', () => {
    setURLPamams(viewer)
    enhance(viewer)
  })
  getURLPamams(viewer)

  loading()
  update(viewer)
  labeling(viewer)
}

function getURLPamams(viewer) {
  const url = new URLSearchParams(window.location.search)
  if (url.get('x')) viewer.camera.position.x = parseFloat(url.get('x'))
  if (url.get('y')) viewer.camera.position.y = parseFloat(url.get('y'))
  if (url.get('zoom')) viewer.camera.zoom = parseFloat(url.get('zoom'))
  if (url.get('segment')) viewer.focusSegmentID = url.get('segment')
  viewer.camera.updateProjectionMatrix()
}

function setURLPamams(viewer) {
  const url = new URL(window.location.href)

  const searchParams = url.searchParams
  searchParams.set('x', viewer.camera.position.x.toFixed(3))
  searchParams.set('y', viewer.camera.position.y.toFixed(3))
  searchParams.set('zoom', viewer.camera.zoom.toFixed(3))
  searchParams.set('segment', viewer.focusSegmentID)
  url.search = searchParams.toString()

  window.history.pushState({ path: url.href }, '', url.href)
}

function update(viewer) {
  updateViewer(viewer, 'layer')
  updateGUI(viewer)
}

async function updateViewer(viewer, trigger) {
  const loadingDiv = document.querySelector('#loading')
  if (loadingDiv) loadingDiv.style.display = 'inline'

  viewer.clear()

  await viewer.updateVolume(trigger)
  await viewer.clipSegment()

  viewer.render()

  if (loadingDiv) loadingDiv.style.display = 'none'
}

let gui

function updateGUI(viewer) {
  if (gui) { gui.destroy() }
  gui = new GUI()
  gui.title('2023/10/27')
  gui.add(viewer.params, 'colorBool').name('color').onChange(viewer.render)
  gui.add(viewer.params.layers, 'select', viewer.params.layers.options).name('layers').listen().onChange(() => updateViewer(viewer, 'layer'))
  gui.add(viewer.params.segments, 'select', viewer.params.segments.options).name('segments').listen().onChange(async() => {
    for (let [ sID, v ] of Object.entries(viewer.params.segments.options)) {
      if (viewer.params.segments.select === v) {
        viewer.focusSegmentID = sID
        await updateViewer(viewer, 'segment')

        const labelDiv = document.querySelector('#label')
        const { id, clip } = viewer.getClipInfo(sID)
        labelDiv.style.display = 'inline'
        labelDiv.style.left = '50%'
        labelDiv.style.top = '50%'
        labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
        return
      }
    }
  })
  gui.add(viewer.params, 'surface', 0, 10).name('thickness').onChange(viewer.render)
  // gui.add({ enhance: () => enhance(viewer) }, 'enhance')
}

// enhance volume & segment
async function enhance(viewer) {
  const loadingDiv = document.querySelector('#loading')
  if (loadingDiv) loadingDiv.style.display = 'inline'

  if(viewer.camera.zoom > 5.0) await viewer.enhance()
  viewer.render()

  if (loadingDiv) loadingDiv.style.display = 'none'
}

// loading div element
function loading() {
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'loading'
  loadingDiv.innerHTML = 'Loading ...'
  document.body.appendChild(loadingDiv)
}

// segment labeling
function labeling(viewer) {
  const mouse = new THREE.Vector2()
  const labelDiv = document.createElement('div')
  labelDiv.id = 'label'
  document.body.appendChild(labelDiv)

  window.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLCanvasElement)) return
    mouse.x = e.clientX / window.innerWidth * 2 - 1
    mouse.y = - (e.clientY / window.innerHeight) * 2 + 1

    labelDiv.style.display = 'none'

    const loadingDiv = document.querySelector('#loading')
    if (loadingDiv.style.display === 'inline') return

    // only this line is important
    const sTarget = viewer.getLabel(mouse)
    if (!sTarget) { return }

    const { id, clip } = sTarget
    labelDiv.style.display = 'inline'
    labelDiv.style.left = (e.clientX + 20) + 'px'
    labelDiv.style.top = (e.clientY + 20) + 'px'
    labelDiv.innerHTML = `${id}<br>layer: ${clip.z}~${clip.z+clip.d}`
    // as well as these lines
    viewer.updateFocusGeometry()
    setURLPamams(viewer)
    viewer.render()
  })
}

