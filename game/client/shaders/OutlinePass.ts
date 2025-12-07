// OutlinePass.ts
// Custom pass for Three.js EffectComposer supporting both sprite and normal outlines
//
// Disclaimer: This is entirely AI generated because shaders are literal magic and I am scared of learning the dark arts.
// (Maybe one day I'll conquer these fears...) -lulzsun

import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";

export interface OutlineObject {
	object: THREE.Object3D;
	sprite?: boolean;
}

export class OutlinePass extends Pass {
	public renderScene: THREE.Scene;
	public renderCamera: THREE.Camera;
	public selectedObjects: OutlineObject[];
	public resolution: THREE.Vector2;

	public outlineColor: THREE.Color;
	public outlineThickness: number;
	public outlineAlpha: number;

	private maskBuffer: THREE.WebGLRenderTarget;
	private depthBuffer: THREE.WebGLRenderTarget;
	private outlineMaterial: THREE.ShaderMaterial;
	private spriteMaskMaterial: THREE.ShaderMaterial;
	private normalMaskMaterial: THREE.MeshBasicMaterial;
	private fsQuad: any;

	constructor(
		resolution: THREE.Vector2,
		scene: THREE.Scene,
		camera: THREE.Camera,
		selectedObjects: OutlineObject[] = [],
	) {
		super();

		this.renderScene = scene;
		this.renderCamera = camera;
		this.selectedObjects = selectedObjects;
		this.resolution = new THREE.Vector2(resolution.x, resolution.y);

		this.outlineColor = new THREE.Color(1, 1, 0);
		this.outlineThickness = 2.0;
		this.outlineAlpha = 1.0;

		// Create render targets
		this.maskBuffer = new THREE.WebGLRenderTarget(
			this.resolution.x,
			this.resolution.y,
		);
		this.maskBuffer.texture.generateMipmaps = false;

		this.depthBuffer = new THREE.WebGLRenderTarget(
			this.resolution.x,
			this.resolution.y,
		);
		this.depthBuffer.texture.generateMipmaps = false;
		this.depthBuffer.depthBuffer = true;
		this.depthBuffer.depthTexture = new THREE.DepthTexture(
			this.resolution.x,
			this.resolution.y,
		);

		// Outline detection material (handles both sprite and normal)
		this.outlineMaterial = new THREE.ShaderMaterial({
			uniforms: {
				tDiffuse: { value: null },
				tMask: { value: null },
				tDepth: { value: null },
				outlineColor: { value: this.outlineColor },
				outlineThickness: { value: this.outlineThickness },
				outlineAlpha: { value: this.outlineAlpha },
				resolution: { value: this.resolution },
				cameraNear: { value: 0.1 },
				cameraFar: { value: 1000 },
			},
			vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
			fragmentShader: `
        #include <packing>
        
        uniform sampler2D tDiffuse;
        uniform sampler2D tMask;
        uniform sampler2D tDepth;
        uniform vec3 outlineColor;
        uniform float outlineThickness;
        uniform float outlineAlpha;
        uniform vec2 resolution;
        uniform float cameraNear;
        uniform float cameraFar;
        
        varying vec2 vUv;
        
        float readDepth(sampler2D depthSampler, vec2 coord) {
          float fragCoordZ = texture2D(depthSampler, coord).x;
          float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
          return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
        }
        
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          float maskValue = texture2D(tMask, vUv).r;
          float depthValue = texture2D(tDepth, vUv).r;
          
          // If current pixel is masked, show original
          if (maskValue > 0.5) {
            gl_FragColor = texel;
            return;
          }
          
          // Sample surrounding pixels
          float outline = 0.0;
          vec2 pixelSize = 1.0 / resolution;
          float thickness = outlineThickness;
          
          // For depth-based outline (normal objects)
          if (depthValue < 1.0) {
            float depth = readDepth(tDepth, vUv);
            
            // Edge detection using depth
            for (float x = -1.0; x <= 1.0; x += 1.0) {
              for (float y = -1.0; y <= 1.0; y += 1.0) {
                if (x == 0.0 && y == 0.0) continue;
                
                vec2 offset = vec2(x, y) * pixelSize * thickness;
                float sampleDepth = readDepth(tDepth, vUv + offset);
                float depthDiff = abs(depth - sampleDepth);
                
                if (depthDiff > 0.01) {
                  outline = 1.0;
                  break;
                }
              }
              if (outline > 0.0) break;
            }
          }
          
          // For alpha-based outline (sprites)
          if (outline < 0.5) {
            // Sample in a circle pattern
            for (float angle = 0.0; angle < 6.28318; angle += 0.785398) {
              for (float dist = 1.0; dist <= thickness; dist += 1.0) {
                vec2 offset = vec2(cos(angle), sin(angle)) * dist * pixelSize;
                float sampleMask = texture2D(tMask, vUv + offset).r;
                
                if (sampleMask > 0.5) {
                  outline = 1.0;
                  break;
                }
              }
              if (outline > 0.0) break;
            }
          }
          
          if (outline > 0.0) {
            gl_FragColor = vec4(outlineColor, outlineAlpha);
          } else {
            gl_FragColor = texel;
          }
        }
      `,
			transparent: true,
		});

		// Material for sprite mask (alpha-based)
		this.spriteMaskMaterial = new THREE.ShaderMaterial({
			uniforms: {
				map: { value: null },
			},
			vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
			fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        
        void main() {
          vec4 texColor = texture2D(map, vUv);
          float mask = texColor.a > 0.1 ? 1.0 : 0.0;
          gl_FragColor = vec4(mask, mask, mask, 1.0);
        }
      `,
		});

		// Material for normal object mask
		this.normalMaskMaterial = new THREE.MeshBasicMaterial({
			color: 0xffffff,
		});

		// Full screen quad
		if ((THREE as any).FullScreenQuad !== undefined) {
			this.fsQuad = new (THREE as any).FullScreenQuad(
				this.outlineMaterial,
			);
		} else {
			this.fsQuad = new THREE.Mesh(
				new THREE.PlaneGeometry(2, 2),
				this.outlineMaterial,
			);
		}
	}

	public dispose(): void {
		this.maskBuffer.dispose();
		this.depthBuffer.dispose();
		this.outlineMaterial.dispose();
		this.spriteMaskMaterial.dispose();
		this.normalMaskMaterial.dispose();
		if (this.fsQuad.dispose) this.fsQuad.dispose();
	}

	public setSize(width: number, height: number): void {
		this.resolution.set(width, height);
		this.maskBuffer.setSize(width, height);
		this.depthBuffer.setSize(width, height);
		this.outlineMaterial.uniforms.resolution.value.set(width, height);
	}

	public render(
		renderer: THREE.WebGLRenderer,
		writeBuffer: THREE.WebGLRenderTarget,
		readBuffer: THREE.WebGLRenderTarget,
	): void {
		// Separate objects by type
		const spriteObjects: THREE.Object3D[] = [];
		const normalObjects: THREE.Object3D[] = [];

		this.selectedObjects.forEach((item) => {
			if (item.sprite) {
				spriteObjects.push(item.object);
			} else {
				normalObjects.push(item.object);
			}
		});

		// Store original materials and visibility
		const originalMaterials = new Map<
			THREE.Object3D,
			THREE.Material | THREE.Material[]
		>();
		const originalVisibility = new Map<THREE.Object3D, boolean>();

		// Hide everything first
		this.renderScene.traverse((child) => {
			originalVisibility.set(child, child.visible);
			child.visible = false;
		});

		// Show and prepare sprite objects
		spriteObjects.forEach((obj) => {
			let parent = obj.parent;
			while (parent) {
				parent.visible = true;
				parent = parent.parent;
			}

			obj.traverse((child) => {
				child.visible = true;

				if ((child as THREE.Mesh).isMesh) {
					const mesh = child as THREE.Mesh;
					if (mesh.material) {
						originalMaterials.set(child, mesh.material);

						const maskMat = this.spriteMaskMaterial.clone();
						const material = Array.isArray(mesh.material)
							? mesh.material[0]
							: mesh.material;
						if ((material as THREE.MeshStandardMaterial).map) {
							maskMat.uniforms.map.value = (
								material as THREE.MeshStandardMaterial
							).map;
						}
						mesh.material = maskMat;
					}
				}
			});
		});

		// Show and prepare normal objects
		normalObjects.forEach((obj) => {
			let parent = obj.parent;
			while (parent) {
				parent.visible = true;
				parent = parent.parent;
			}

			obj.traverse((child) => {
				child.visible = true;

				if ((child as THREE.Mesh).isMesh) {
					const mesh = child as THREE.Mesh;
					if (mesh.material) {
						originalMaterials.set(child, mesh.material);
						mesh.material = this.normalMaskMaterial;
					}
				}
			});
		});

		// Save renderer state
		const originalClearColor = new THREE.Color();
		renderer.getClearColor(originalClearColor);
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		// Render mask buffer
		renderer.setRenderTarget(this.maskBuffer);
		renderer.setClearColor(0x000000, 0);
		renderer.autoClear = true;
		renderer.clear();

		if (this.selectedObjects.length > 0) {
			renderer.render(this.renderScene, this.renderCamera);
		}

		// Render depth buffer (for normal objects)
		renderer.setRenderTarget(this.depthBuffer);
		renderer.clear(); // Always clear depth buffer

		if (normalObjects.length > 0) {
			renderer.render(this.renderScene, this.renderCamera);
		}

		// Restore original materials and visibility
		originalMaterials.forEach((material, child) => {
			(child as THREE.Mesh).material = material;
		});

		originalVisibility.forEach((visible, child) => {
			child.visible = visible;
		});

		// Restore renderer state
		renderer.setClearColor(originalClearColor, originalClearAlpha);
		renderer.autoClear = originalAutoClear;

		// Update uniforms
		this.outlineMaterial.uniforms.tDiffuse.value = readBuffer.texture;
		this.outlineMaterial.uniforms.tMask.value = this.maskBuffer.texture;
		this.outlineMaterial.uniforms.tDepth.value =
			this.depthBuffer.depthTexture;
		this.outlineMaterial.uniforms.outlineColor.value = this.outlineColor;
		this.outlineMaterial.uniforms.outlineThickness.value =
			this.outlineThickness;
		this.outlineMaterial.uniforms.outlineAlpha.value = this.outlineAlpha;

		if (
			(this.renderCamera as THREE.PerspectiveCamera).isPerspectiveCamera
		) {
			const cam = this.renderCamera as THREE.PerspectiveCamera;
			this.outlineMaterial.uniforms.cameraNear.value = cam.near;
			this.outlineMaterial.uniforms.cameraFar.value = cam.far;
		}

		// Render final output
		if (this.renderToScreen) {
			renderer.setRenderTarget(null);
		} else {
			renderer.setRenderTarget(writeBuffer);
			if (this.clear) renderer.clear();
		}

		if (this.fsQuad.render) {
			this.fsQuad.render(renderer);
		} else {
			const orthoCamera = new THREE.OrthographicCamera(
				-1,
				1,
				1,
				-1,
				0,
				1,
			);
			renderer.render(this.fsQuad, orthoCamera);
		}
	}
}

// Usage Example:
/*
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnifiedOutlinePass } from './UnifiedOutlinePass';

// Setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Create unified outline pass
const outlinePass = new UnifiedOutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera,
  [
    { object: playerSprite, sprite: true },  // Sprite outline
    { object: enemyMesh, sprite: false },    // Normal outline
    { object: boxMesh }                      // Normal outline (sprite defaults to false)
  ]
);

outlinePass.outlineColor.set(0xff0000);
outlinePass.outlineThickness = 3.0;
outlinePass.outlineAlpha = 1.0;

composer.addPass(outlinePass);

// In your render loop
composer.render();

// Change selected objects dynamically:
outlinePass.selectedObjects = [
  { object: newSprite, sprite: true }
];
*/
