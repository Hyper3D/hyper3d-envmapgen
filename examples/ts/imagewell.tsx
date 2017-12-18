/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';
import bind from 'bind-decorator';
import * as Dropzone from 'react-dropzone';
const loadImage: (path: string) => Promise<HTMLImageElement> = require('image-promise');

import { Port } from './port';

const DropzoneComponent: typeof Dropzone = (Dropzone as any).default;

export interface ImageWellProps {
    image: HTMLImageElement | null;
    onChange: (image: HTMLImageElement) => void;

    className?: string;
    style?: React.CSSProperties;
}

interface State {}

export class ImageWell extends React.PureComponent<ImageWellProps, State> {
    @bind
    private async handleDrop(acceptedFiles: Dropzone.ImageFile[], rejectedFiles: Dropzone.ImageFile[]): Promise<void> {
        const image = acceptedFiles[0];
        if (!image) {
            return;
        }

        const url = URL.createObjectURL(image);
        try {
            const image = await loadImage(url);
            this.props.onChange(image);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    render() {
        const {props} = this;
        return <DropzoneComponent
            onDrop={this.handleDrop}
            disablePreview
            className={'imagewell ' + (props.className || '')}
            acceptClassName='accept'
            style={props.style}>
            { props.image && <Port element={props.image} /> }
        </DropzoneComponent>;
    }
}
