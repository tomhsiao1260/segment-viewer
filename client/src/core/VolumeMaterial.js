import { ShaderMaterial, BackSide } from 'three';

export class VolumeMaterial extends ShaderMaterial {
  constructor(params) {
    super({
      transparent: true,
      side: BackSide,

      uniforms: {
        voldata : { value: null },
        cmdata : { value: null },
      },

      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = vec2(uv.x, 1.0 - uv.y);
          // gl_Position = vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,

      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D voldata;
        uniform sampler2D cmdata;

        vec4 apply_colormap(float val) {
          val = (val - 0.5) / (0.9 - 0.5);
          return texture2D(cmdata, vec2(val, 0.5));
        }

        void main() {
          float intensity = texture2D(voldata, vUv).r;
          vec4 color = apply_colormap(intensity);

          gl_FragColor = color;
          #include <colorspace_fragment>
        }
      `,
    });

    this.setValues(params);
  }
}
