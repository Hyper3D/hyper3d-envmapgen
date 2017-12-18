/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';

export interface PortProps {
    element: HTMLElement;

    className?: string;
    style?: React.CSSProperties;
}

/**
 * Displays a given element in a `<div>` wrapper. Useful for stateful elements.
 */
export class Port extends React.PureComponent<PortProps, {}> {
    private wrapper: null | HTMLDivElement = null;

    componentDidMount(): void {
        if (!this.wrapper) {
            throw new Error();
        }
        this.wrapper.appendChild(this.props.element);
    }

    componentWillUnmount(): void {
        if (!this.wrapper) {
            throw new Error();
        }
        this.wrapper.removeChild(this.props.element);
    }

    componentDidUpdate(prevProps: PortProps, prevState: {}): void {
        if (this.props.element === prevProps.element) {
            return;
        }
        if (!this.wrapper) {
            throw new Error();
        }
        this.wrapper.removeChild(prevProps.element);
        this.wrapper.appendChild(this.props.element);
    }

    render() {
        return <div
            className={this.props.className}
            style={this.props.style}
            ref={(e) => {this.wrapper = e}} />;
    }
}
