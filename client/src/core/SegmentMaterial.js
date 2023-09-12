import { ShaderMaterial, BackSide } from 'three';

export class SegmentMaterial extends ShaderMaterial {
  constructor(params) {
    super({
      transparent: true,
      side: BackSide,

      uniforms: {
        surface : { value: 10.0 },
        sdfTex : { value: null },
        sdfTexFocus : { value: null },
        volumeAspect : { value: 810 / 789 },
        screenAspect : { value: 2 / 2 },
      },

      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = vec2(uv.x, 1.0 - uv.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,

      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float surface;
        uniform float volumeAspect;
        uniform float screenAspect;
        uniform sampler2D sdfTex;
        uniform sampler2D sdfTexFocus;

        void main() {
          float r = screenAspect / volumeAspect;
          float aspect = r;

          vec2 uv = vec2((vUv.x - 0.5), (vUv.y - 0.5) / aspect) + vec2(0.5);
          if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

          gl_FragColor = vec4(0.0);

          float dist = texture2D(sdfTex, vec2(uv.x, 1.0 - uv.y)).r - surface;
          bool s = dist < 0.0 && dist > -surface;
          if (s) gl_FragColor = vec4(0, 0, 0, 1.0);

          float f_dist = texture(sdfTexFocus, vec2(uv.x, 1.0 - uv.y)).r - surface;
          if (f_dist > -surface + 1e-6 && f_dist < 0.0 && dist < 0.0) gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
      `,
    });

    this.setValues(params);
  }
}
