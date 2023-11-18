import { TIFFLoader } from 'three/addons/loaders/TIFFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

export default class Loader {
  constructor() {
  }

  static getVolumeMeta() { return fetch('volume/meta.json').then((res) => res.json()) }

  static getSegmentMeta() { return fetch('segment/meta.json').then((res) => res.json()) }

  static getSegmentLayerMeta() { return fetch('segment-layer/meta.json').then((res) => res.json()) }

  static getSubVolumeMeta(folder) { return fetch(`volume/${folder}/meta.json`).then((res) => res.json()) }

  static getSubSegmentMeta(folder) { return fetch(`segment/${folder}/meta.json`).then((res) => res.json()) }

  static getVolumeData(filename) { return new TIFFLoader().loadAsync('volume/' + filename) }

  static getSegmentData(filename) { return new OBJLoader().loadAsync('segment/' + filename) }

  static getSegmentLayerData(filename) { return new OBJLoader().loadAsync('segment-layer/' + filename) }
}
