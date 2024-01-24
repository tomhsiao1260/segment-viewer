import { ShaderMaterial, DoubleSide } from "three"

export class Grid extends ShaderMaterial {
  constructor(params) {
    super({
      side: DoubleSide,
      transparent: true,

      uniforms: {
      },

      vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
          vec4 modelPosition = modelMatrix * vec4(position, 1.0);
          vec4 viewPosition = viewMatrix * modelPosition;
          vec4 projectedPosition = projectionMatrix * viewPosition;

          gl_Position = projectedPosition;
          vUv = uv;
        }
      `,

      fragmentShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
          float t = 0.03;
          float h = 0.008;

          if (vUv.x > t && vUv.x < 1.0-t) { if (vUv.y > h && vUv.y < 1.0-h) discard; }

          gl_FragColor = vec4(1.0, 1.0, 1.0, 0.3);
        }
      `
    });

    this.setValues(params);
  }
}
