import React from 'react';
import TextProperties from './TextProperties';
import ImageProperties from './ImageProperties';
import ShapeProperties from './ShapeProperties';
import TimerProperties from './TimerProperties';

const ObjectProperties = ({ object }) => {
    if (!object) return null;

    switch (object.type) {
        case 'text':
            return <TextProperties object={object} />;
        case 'image':
            return <ImageProperties object={object} />;
        case 'shape':
            return <ShapeProperties object={object} />;
        case 'timer':
            return <TimerProperties object={object} />;
        default:
            return null;
    }
};

export default ObjectProperties; 