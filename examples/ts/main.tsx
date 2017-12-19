/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import bind from 'bind-decorator';
const loadImage: (path: string) => Promise<HTMLImageElement> = require('image-promise');

import { Viewport, ViewportPersistent } from './viewport';
import { ViewerState, DEFAULT_VIEWER_STATE } from './model';
import { ImageWell } from './imagewell';

const envImages: string[] = [
    require('file-loader!../images/nissibeach2/posx.jpg'),
    require('file-loader!../images/nissibeach2/negx.jpg'),
    require('file-loader!../images/nissibeach2/posy.jpg'),
    require('file-loader!../images/nissibeach2/negy.jpg'),
    require('file-loader!../images/nissibeach2/posz.jpg'),
    require('file-loader!../images/nissibeach2/negz.jpg'),
];

interface State {
    viewportPersistent: ViewportPersistent;
    viewerState: ViewerState;
}

class App extends React.Component<{}, State> {
    constructor(props: {}) {
        super(props);
        this.state = {
            viewportPersistent: new ViewportPersistent(),
            viewerState: DEFAULT_VIEWER_STATE,
        };

        // Load the initial image
        for (let i = 0; i < 6; ++i) {
            (i => {
                loadImage(envImages[i]).then(image => {
                    this.setState(state => {
                        const faceImages = state.viewerState.faceImages.slice(0);
                        if (faceImages[i]) {
                            return state;
                        }
                        faceImages[i] = image;
                        return {
                            ... state,
                            viewerState: {
                                ... state.viewerState,
                                faceImages,
                            },
                        };
                    });
                });
            })(i);
        }
    }

    private handleImageChange(i: number, image: HTMLImageElement) {
        this.setState(state => {
            const faceImages = state.viewerState.faceImages.slice(0);
            faceImages[i] = image;
            return {
                ... state,
                viewerState: {
                    ... state.viewerState,
                    faceImages,
                },
            };
        });
    }

    @bind private handleImageChange0(image: HTMLImageElement) { this.handleImageChange(0, image); }
    @bind private handleImageChange1(image: HTMLImageElement) { this.handleImageChange(1, image); }
    @bind private handleImageChange2(image: HTMLImageElement) { this.handleImageChange(2, image); }
    @bind private handleImageChange3(image: HTMLImageElement) { this.handleImageChange(3, image); }
    @bind private handleImageChange4(image: HTMLImageElement) { this.handleImageChange(4, image); }
    @bind private handleImageChange5(image: HTMLImageElement) { this.handleImageChange(5, image); }

    @bind
    private handleChangeCubeMapSize(e: React.ChangeEvent<HTMLSelectElement>) {
        const value = parseInt(e.target.value, 10);
        this.setState(state => ({
            ... state,
            viewerState: {
                ... state.viewerState,
                cubeMapSize: value,
            },
        }));
    }

    @bind
    private handleChangeMinNumPasses(e: React.ChangeEvent<HTMLSelectElement>) {
        const value = parseInt(e.target.value, 10);
        this.setState(state => ({
            ... state,
            viewerState: {
                ... state.viewerState,
                minNumPasses: value,
            },
        }));
    }

    @bind
    private handleChangeKernelResolution(e: React.ChangeEvent<HTMLInputElement>) {
        const value = parseFloat(e.target.value);
        this.setState(state => ({
            ... state,
            viewerState: {
                ... state.viewerState,
                kernelResolution: value,
            },
        }));
    }

    render() {
        const {state} = this;

        return <div className='app-frame'>
            <Viewport persistent={state.viewportPersistent} viewerState={state.viewerState} />
            <div className='controls'>
                <h1>hyper3d-envmapgen demo</h1>
                <h2>Images</h2>
                <ul className='images'>
                    <li>
                        <span>+X</span>
                        <ImageWell onChange={this.handleImageChange0} image={state.viewerState.faceImages[0]} />
                    </li>
                    <li>
                        <span>-X</span>
                        <ImageWell onChange={this.handleImageChange1} image={state.viewerState.faceImages[1]} />
                    </li>
                    <li>
                        <span>+Y</span>
                        <ImageWell onChange={this.handleImageChange2} image={state.viewerState.faceImages[2]} />
                    </li>
                    <li>
                        <span>-Y</span>
                        <ImageWell onChange={this.handleImageChange3} image={state.viewerState.faceImages[3]} />
                    </li>
                    <li>
                        <span>+Z</span>
                        <ImageWell onChange={this.handleImageChange4} image={state.viewerState.faceImages[4]} />
                    </li>
                    <li>
                        <span>-Z</span>
                        <ImageWell onChange={this.handleImageChange5} image={state.viewerState.faceImages[5]} />
                    </li>
                </ul>
                <h2>Quality</h2>
                <p>
                    Size: <select
                        value={state.viewerState.cubeMapSize}
                        onChange={this.handleChangeCubeMapSize}>
                        <option value={32}>32</option>
                        <option value={64}>64</option>
                        <option value={128}>128</option>
                        <option value={256}>256</option>
                    </select>
                    &nbsp;# Pass: <select
                        value={state.viewerState.minNumPasses}
                        onChange={this.handleChangeMinNumPasses}>
                        <option value={1}>1 - Fast</option>
                        <option value={2}>2</option>
                        <option value={3}>3 - Nice</option>
                    </select><br />
                    Density: <input
                        type='range' min='0.4' max='2' step='0.2'
                        value={state.viewerState.kernelResolution}
                        onChange={this.handleChangeKernelResolution}
                        />
                </p>
                <h2>Copyright</h2>
                <p>
                    The default cube map image is a work by Emil Persson, aka <a href='http://www.humus.name'>Humus</a>.
                </p>
                <p>
                    <a href='https://github.com/Hyper3D/hyper3d-envmapgen'>hyper3d-envmapgen</a> © 2017 yvt
                </p>
            </div>
        </div>;
    }
}

ReactDOM.render(
    <App />,
    document.getElementById('app-root'),
);
