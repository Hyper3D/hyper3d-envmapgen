/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';
import bind from 'bind-decorator';
import * as THREE from 'three';
import * as emg from '../../dist/index';

import { Port } from './port';
import { ViewerState, SceneState } from './model';

// Load three.js sample components
const three = (window as any).THREE = THREE;
require('three/examples/js/controls/OrbitControls');
require('three/examples/js/geometries/TeapotBufferGeometry');

// envmapgen
const MIN_SIGMA = 2 ** -6;
const emgCore = emg.CoreInstance.create();

const ACES = `
mediump vec3 acesToneMapping(mediump vec3 x)
{
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
`;

const SKYBOX_VERTEX = `
varying vec3 v_WSPosition;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    v_WSPosition = position;
}
`;

const SKYBOX_FRAGMENT = `
uniform samplerCube u_EnvironmentTexture;
varying vec3 v_WSPosition;

${ACES}

void main() {
    vec3 image = textureCube(u_EnvironmentTexture, v_WSPosition).xyz;
    gl_FragColor.xyz = image * image;

    // Tone mapping
    gl_FragColor.xyz = acesToneMapping(gl_FragColor.xyz);

    // Gamma correct
    gl_FragColor.xyz = sqrt(gl_FragColor.xyz);

    gl_FragColor.w = 1.0;
}
`;

const OBJECT_VERTEX = `
varying vec3 v_WSPosition;
varying vec3 v_WSReflect;
varying vec3 v_WSNormal;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    v_WSPosition = position;

    v_WSNormal = normal;

    vec3 ws_position_rel = normalize(v_WSPosition.xyz - cameraPosition);
    v_WSReflect = reflect(ws_position_rel, v_WSNormal);
}
`;

const OBJECT_FRAGMENT = `
#define PI 3.141592654
uniform samplerCube u_EnvironmentTexture;
varying vec3 v_WSPosition;
varying vec3 v_WSReflect;
varying vec3 v_WSNormal;

${ACES}

void main() {
    vec3 ws_light_dir = normalize(vec3(0.3, 1.0, 0.3));

    // Blinn-Phong power
    float t = fract(dot(v_WSPosition, vec3(1.0, 1.0, 0.0)) * 0.01);
    t = abs(t - 0.5);
    float power = t < 0.1 ? 256.0 :
                  t < 0.4 ? 64.0 :
                            16.0;

    gl_FragColor.xyz = vec3(0.0);

    // Puctual light
    vec3 ws_normal = normalize(v_WSNormal);
    float dot_nl = dot(ws_normal, ws_light_dir);
    if (dot_nl > 0.0) {
        float sp_brdf = (power + 2.0) / (2.0 * PI) *
            pow(max(dot(ws_light_dir, normalize(v_WSReflect)), 0.0), power) * dot_nl;
        gl_FragColor.xyz = vec3(sp_brdf);
    }

    // IBL
    float spec_sigma = 1.0 / sqrt(power);
    float image_lod = log2(spec_sigma / ${MIN_SIGMA}) - 1.0; // FIXME: What is the source of this bias?
    vec3 image = textureCubeLodEXT(u_EnvironmentTexture, v_WSReflect, image_lod).xyz;
    gl_FragColor.xyz += image * image;

    // Tone mapping
    gl_FragColor.xyz = acesToneMapping(gl_FragColor.xyz);

    // Gamma correct
    gl_FragColor.xyz = sqrt(gl_FragColor.xyz);

    gl_FragColor.w = 1.0;
}
`;

export class ViewportPersistent {
    readonly renderer = new THREE.WebGLRenderer();
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera(40, 1, 10, 100000);
    readonly material: THREE.ShaderMaterial;
    readonly skyboxMaterial: THREE.ShaderMaterial;

    readonly sphereObject: THREE.Mesh;
    readonly teapotObject: THREE.Mesh;

    sceneState: SceneState | null = null;

    constructor()
    {
        const sphereGeometry = new THREE.SphereBufferGeometry(100, 128, 64);
        const teapotGeometry = new (three as any).TeapotBufferGeometry(70, 16);
        const material = this.material = new THREE.ShaderMaterial({
            uniforms: {
                u_EnvironmentTexture: {
                    type: 't', value: 0,
                },
            },
            vertexShader: OBJECT_VERTEX,
            fragmentShader: OBJECT_FRAGMENT,
        });
        material.extensions.shaderTextureLOD = true;

        const skyboxMaterial = this.skyboxMaterial = new THREE.ShaderMaterial({
            vertexShader: SKYBOX_VERTEX,
            fragmentShader: SKYBOX_FRAGMENT,
            uniforms: {
                u_EnvironmentTexture: {
                    type: 't', value: 0,
                },
            },
            depthWrite: false,
            side: THREE.BackSide,
        });

        const skybox = new THREE.Mesh(new THREE.BoxBufferGeometry(40000, 40000, 40000), skyboxMaterial);
        this.scene.add(skybox);

        const sphereObject = this.sphereObject = new THREE.Mesh(sphereGeometry, material);
        this.scene.add(sphereObject);

        const teapotObject = this.teapotObject = new THREE.Mesh(teapotGeometry, material);
        this.scene.add(teapotObject);

        this.camera.position.set(0, 0, 400);
        // webpack does not know the existence of `THREE.OrbitControls`
        const controls = new three.OrbitControls(this.camera, this.canvas);
        controls.minDistance = 200;
        controls.maxDistance = 1000;

        this.renderer.autoClear = false;

        this.update();
    }

    get canvas(): HTMLCanvasElement { return this.renderer.domElement; }

    @bind
    private update(): void
    {
        requestAnimationFrame(this.update);

        if (!this.canvas.parentElement || !this.sceneState) {
            return;
        }

        this.sphereObject.visible = this.sceneState.geometry === 'sphere';
        this.teapotObject.visible = this.sceneState.geometry === 'teapot';

        const bounds = this.canvas.parentElement!.getBoundingClientRect();
        const newWidth = Math.max(1, bounds.width) | 0;
        const newHeight = Math.max(1, bounds.height) | 0;
        this.renderer.setSize(newWidth, newHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.camera.aspect = newWidth / newHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.render(this.scene, this.camera);
    }

    setTexture(texture: THREE.Texture): void
    {
        const prev = this.skyboxMaterial.uniforms['u_EnvironmentTexture'].value;
        if (prev) {
            prev.dispose();
        }

        this.skyboxMaterial.uniforms['u_EnvironmentTexture'].value = texture;
        this.material.uniforms['u_EnvironmentTexture'].value = texture;
        // this.material.uniforms[]
    }
}

export interface ViewportProps {
    persistent: ViewportPersistent;
    viewerState: ViewerState;
    sceneState: SceneState;
}

interface State {
}

export class Viewport extends React.Component<ViewportProps, State> {
    private currentViewerState: ViewerState | null = null;

    private async update(): Promise<void> {
        const {viewerState, sceneState} = this.props;

        this.props.persistent.sceneState = sceneState;

        if (viewerState == this.currentViewerState) {
            return;
        }
        this.currentViewerState = viewerState;

        // Are all image slots filled?
        for (const image of viewerState.faceImages) {
            if (!image) {
                return;
            }
        }

        // Create a PMREM cube map
        // Note: This synchronous constructor is only available when `core` is
        //       supplied.
        const options: emg.LtasgOptions = {
            core: await emgCore,
            imageSize: viewerState.cubeMapSize,
            mipLevelSigmas: Array.from(new Array(9), (_, i) => MIN_SIGMA * 2 ** Math.min(i, 4)),
            minNumPasses: viewerState.minNumPasses,
            kernelResolution: viewerState.kernelResolution,
        };
        console.log(options);

        console.time('LTASG plan');
        const ltasg = new emg.LtasgBlur(options);
        console.timeEnd('LTASG plan');

        console.time('LTASG process');
        const output = ltasg.process(viewerState.faceImages as any, emg.ImageFormat.Srgbx8, emg.ImageFormat.Srgbx8);
        console.timeEnd('LTASG process');

        // I absolutely have no idea what is the canonical way to pass a PMREM
        // data to three.js
        // Also, I'd like to use sRGB encoding, but there does not seem to be an
        // easy way to get it working.
        const baseSize = ltasg.size;
        const threeCubeImages = Array.from(new Array(6), (_, face) => ({
            isDataTexture: true,
            image: {
                width: baseSize,
                height: baseSize,
                data: output[0][face],
                mipmaps: output.map((image, level) => {
                    return {
                        width: baseSize >> level,
                        height: baseSize >> level,
                        data: image[face] as Uint8Array,
                    };
                }),
            },
        }));
        const texture = new THREE.DataTexture(null!, baseSize, baseSize);
        (texture as any).image = threeCubeImages;
        (texture as any).isCubeTexture = true;
        (texture as any).isCompressedTexture = true; // Force manual mipmap upload
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.version = 1;

        this.props.persistent.setTexture(texture);
    }

    componentDidUpdate(prevProps: ViewportProps, prevState: State): void {
        this.update();
    }

    render() {
        return <Port element={this.props.persistent.canvas} className='viewport' />;
    }
}
