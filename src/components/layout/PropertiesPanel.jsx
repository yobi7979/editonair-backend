import React from 'react';

// Component to render specific properties based on object type
const ObjectSpecificProperties = ({ object, onUpdate }) => {
  if (!object) {
    return <p className="text-xs text-gray-500 italic">Select an object to see its properties.</p>;
  }

  // Generic handler for properties within the 'properties' object
  const handleDetailChange = (propName, value) => {
    const newProperties = { ...object.properties, [propName]: value };
    onUpdate(object.id, 'properties', newProperties);
  };

  switch (object.type) {
    case 'text':
      return (
        <div className="space-y-3">
          <div>
            <label htmlFor="text-content" className="text-xs text-gray-500 block mb-1">Content</label>
            <textarea
              id="text-content"
              value={object.properties?.content || ''}
              onChange={(e) => handleDetailChange('content', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              placeholder="Enter text content..."
            />
          </div>
          <div>
            <label htmlFor="text-font-size" className="text-xs text-gray-500 block mb-1">Font Size (px)</label>
            <input
              type="number"
              id="text-font-size"
              value={parseInt(object.properties?.fontSize, 10) || 16}
              onChange={(e) => handleDetailChange('fontSize', parseInt(e.target.value, 10) || 16)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="8"
              max="200"
              placeholder="예: 24"
            />
          </div>
          <div>
            <label htmlFor="text-color" className="text-xs text-gray-500 block mb-1">Color</label>
            <input
              type="color"
              id="text-color"
              value={object.properties?.color || '#FFFFFF'}
              onChange={(e) => handleDetailChange('color', e.target.value)}
              className="w-full h-8 bg-gray-900 border-none rounded-md cursor-pointer"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="text-pos-x" className="text-xs text-gray-500 block mb-1">Position X</label>
              <input
                type="number"
                id="text-pos-x"
                value={object.properties?.x || 0}
                onChange={(e) => handleDetailChange('x', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="text-pos-y" className="text-xs text-gray-500 block mb-1">Position Y</label>
              <input
                type="number"
                id="text-pos-y"
                value={object.properties?.y || 0}
                onChange={(e) => handleDetailChange('y', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="text-rotation" className="text-xs text-gray-500 block mb-1">Rotation (degrees)</label>
            <input
              type="number"
              id="text-rotation"
              value={parseFloat((object.properties?.rotation || 0).toFixed(2))}
              onChange={(e) => handleDetailChange('rotation', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="0"
              max="360"
              step="0.01"
            />
          </div>
          <div>
            <label htmlFor="text-font-family" className="text-xs text-gray-500 block mb-1">Font Family</label>
            <select
              id="text-font-family"
              value={object.properties?.fontFamily || 'Arial'}
              onChange={(e) => handleDetailChange('fontFamily', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Arial">Arial</option>
              <option value="Verdana">Verdana</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="sans-serif">sans-serif</option>
              <option value="serif">serif</option>
              <option value="monospace">monospace</option>
            </select>
          </div>
          <div>
            <label htmlFor="text-font-weight" className="text-xs text-gray-500 block mb-1">Font Weight</label>
            <select
              id="text-font-weight"
              value={object.properties?.fontWeight || 'normal'}
              onChange={(e) => handleDetailChange('fontWeight', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
              <option value="400">400</option>
              <option value="500">500</option>
              <option value="600">600</option>
              <option value="700">700</option>
              <option value="800">800</option>
              <option value="900">900</option>
            </select>
          </div>
          <div>
            <label htmlFor="text-opacity" className="text-xs text-gray-500 block mb-1">Opacity ({Math.round((object.properties?.opacity ?? 1) * 100)}%)</label>
            <input
              type="range"
              id="text-opacity"
              min="0"
              max="1"
              step="0.01"
              value={object.properties?.opacity ?? 1}
              onChange={e => handleDetailChange('opacity', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>
          <div>
            <label htmlFor="text-align" className="text-xs text-gray-500 block mb-1">Text Alignment</label>
            <div className="flex space-x-2">
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded text-xs ${object.properties?.textAlign === 'left' ? 'bg-indigo-600' : 'bg-gray-600'}`}
                onClick={() => handleDetailChange('textAlign', 'left')}
              >
                Left
              </button>
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded text-xs ${object.properties?.textAlign === 'center' ? 'bg-indigo-600' : 'bg-gray-600'}`}
                onClick={() => handleDetailChange('textAlign', 'center')}
              >
                Center
              </button>
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded text-xs ${object.properties?.textAlign === 'right' ? 'bg-indigo-600' : 'bg-gray-600'}`}
                onClick={() => handleDetailChange('textAlign', 'right')}
              >
                Right
              </button>
            </div>
          </div>

          {/* Text Background Properties */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">Background</h4>
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id={`useTextBackground-${object.id}`}
                name="useTextBackground"
                checked={object.properties.useTextBackground || false}
                onChange={(e) => handleDetailChange('useTextBackground', e.target.checked)}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
              />
              <label htmlFor={`useTextBackground-${object.id}`} className="text-sm text-gray-400">Use Background</label>
            </div>
            {object.properties.useTextBackground && (
              <div className="space-y-3 pl-1">
                <div>
                  <label htmlFor={`textBackgroundColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Bg Color</label>
                  <input
                    type="color"
                    id={`textBackgroundColor-${object.id}`}
                    name="textBackgroundColor"
                    value={object.properties.textBackgroundColor || '#000000'}
                    onChange={(e) => handleDetailChange('textBackgroundColor', e.target.value)}
                    className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
                  />
                </div>
                <div>
                  <label htmlFor={`textBackgroundBorderRadius-${object.id}`} className="text-xs text-gray-500 block mb-1">Border Radius (px)</label>
                  <input
                    type="number"
                    id={`textBackgroundBorderRadius-${object.id}`}
                    name="textBackgroundBorderRadius"
                    value={object.properties.textBackgroundBorderRadius || 0}
                    onChange={(e) => handleDetailChange('textBackgroundBorderRadius', parseInt(e.target.value, 10) || 0)}
                    min="0"
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`textBackgroundPadding-${object.id}`} className="text-xs text-gray-500 block mb-1">Padding (px)</label>
                  <input
                    type="number"
                    id={`textBackgroundPadding-${object.id}`}
                    name="textBackgroundPadding"
                    value={object.properties.textBackgroundPadding || 0}
                    onChange={(e) => handleDetailChange('textBackgroundPadding', parseInt(e.target.value, 10) || 0)}
                    min="0"
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Text Border Properties */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">Border</h4>
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id={`useTextBorder-${object.id}`}
                name="useTextBorder"
                checked={object.properties.useTextBorder || false}
                onChange={(e) => handleDetailChange('useTextBorder', e.target.checked)}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
              />
              <label htmlFor={`useTextBorder-${object.id}`} className="text-sm text-gray-400">Use Border</label>
            </div>
            {object.properties.useTextBorder && (
              <div className="space-y-3 pl-1">
                <div>
                  <label htmlFor={`textBorderWidth-${object.id}`} className="text-xs text-gray-500 block mb-1">Width (px)</label>
                  <input
                    type="number"
                    id={`textBorderWidth-${object.id}`}
                    name="textBorderWidth"
                    value={object.properties.textBorderWidth || 1}
                    onChange={(e) => handleDetailChange('textBorderWidth', parseInt(e.target.value, 10) || 0)}
                    min="0"
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`textBorderColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Color</label>
                  <input
                    type="color"
                    id={`textBorderColor-${object.id}`}
                    name="textBorderColor"
                    value={object.properties.textBorderColor || '#FFFFFF'}
                    onChange={(e) => handleDetailChange('textBorderColor', e.target.value)}
                    className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Text Shadow Properties */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">Shadow</h4>
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id={`useTextShadow-${object.id}`}
                name="useTextShadow"
                checked={object.properties.useTextShadow || false}
                onChange={(e) => handleDetailChange('useTextShadow', e.target.checked)}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
              />
              <label htmlFor={`useTextShadow-${object.id}`} className="text-sm text-gray-400">Use Shadow</label>
            </div>
            {object.properties.useTextShadow && (
              <div className="space-y-3 pl-1">
                <div>
                  <label htmlFor={`textShadowOffsetX-${object.id}`} className="text-xs text-gray-500 block mb-1">Offset X (px)</label>
                  <input
                    type="number"
                    id={`textShadowOffsetX-${object.id}`}
                    name="textShadowOffsetX"
                    value={object.properties.textShadowOffsetX || 0}
                    onChange={(e) => handleDetailChange('textShadowOffsetX', parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`textShadowOffsetY-${object.id}`} className="text-xs text-gray-500 block mb-1">Offset Y (px)</label>
                  <input
                    type="number"
                    id={`textShadowOffsetY-${object.id}`}
                    name="textShadowOffsetY"
                    value={object.properties.textShadowOffsetY || 0}
                    onChange={(e) => handleDetailChange('textShadowOffsetY', parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`textShadowBlur-${object.id}`} className="text-xs text-gray-500 block mb-1">Blur (px)</label>
                  <input
                    type="number"
                    id={`textShadowBlur-${object.id}`}
                    name="textShadowBlur"
                    value={object.properties.textShadowBlur || 0}
                    onChange={(e) => handleDetailChange('textShadowBlur', parseInt(e.target.value, 10) || 0)}
                    min="0"
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`textShadowColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Color</label>
                  <input
                    type="color"
                    id={`textShadowColor-${object.id}`}
                    name="textShadowColor"
                    value={object.properties.textShadowColor || '#000000'}
                    onChange={(e) => handleDetailChange('textShadowColor', e.target.value)}
                    className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    case 'image':
      return (
        <div className="space-y-3">
          <div>
            <label htmlFor="image-src" className="text-xs text-gray-500 block mb-1">Image URL</label>
            <input
              type="text"
              id="image-src"
              value={object.properties?.src || ''}
              onChange={(e) => handleDetailChange('src', e.target.value)}
              placeholder="https://example.com/image.png"
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="image-width" className="text-xs text-gray-500 block mb-1">Width (px)</label>
              <input
                type="number"
                id="image-width"
                value={object.properties?.width || 150}
                onChange={(e) => handleDetailChange('width', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="image-height" className="text-xs text-gray-500 block mb-1">Height (px)</label>
              <input
                type="number"
                id="image-height"
                value={object.properties?.height || 150}
                onChange={(e) => handleDetailChange('height', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="image-pos-x" className="text-xs text-gray-500 block mb-1">Position X</label>
              <input
                type="number"
                id="image-pos-x"
                value={object.properties?.x || 0}
                onChange={(e) => handleDetailChange('x', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="image-pos-y" className="text-xs text-gray-500 block mb-1">Position Y</label>
              <input
                type="number"
                id="image-pos-y"
                value={object.properties?.y || 0}
                onChange={(e) => handleDetailChange('y', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="image-rotation" className="text-xs text-gray-500 block mb-1">Rotation (degrees)</label>
            <input
              type="number"
              id="image-rotation"
              value={parseFloat((object.properties?.rotation || 0).toFixed(2))}
              onChange={(e) => handleDetailChange('rotation', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="0"
              max="360"
              step="0.01"
            />
          </div>
          <div>
            <label htmlFor="image-opacity" className="text-xs text-gray-500 block mb-1">Opacity ({Math.round((object.properties?.opacity ?? 1) * 100)}%)</label>
            <input
              type="range"
              id="image-opacity"
              min="0"
              max="1"
              step="0.01"
              value={object.properties?.opacity ?? 1}
              onChange={e => handleDetailChange('opacity', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>
        </div>
      ); // Closing return for case 'image'
    case 'shape':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="shape-width" className="text-xs text-gray-500 block mb-1">Width (px)</label>
              <input
                type="number"
                id="shape-width"
                value={object.properties?.width || 100}
                onChange={(e) => handleDetailChange('width', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="shape-height" className="text-xs text-gray-500 block mb-1">Height (px)</label>
              <input
                type="number"
                id="shape-height"
                value={object.properties?.height || 100}
                onChange={(e) => handleDetailChange('height', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="shape-pos-x" className="text-xs text-gray-500 block mb-1">Position X</label>
              <input
                type="number"
                id="shape-pos-x"
                value={object.properties?.x || 0}
                onChange={(e) => handleDetailChange('x', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="shape-pos-y" className="text-xs text-gray-500 block mb-1">Position Y</label>
              <input
                type="number"
                id="shape-pos-y"
                value={object.properties?.y || 0}
                onChange={(e) => handleDetailChange('y', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="shape-rotation" className="text-xs text-gray-500 block mb-1">Rotation (degrees)</label>
            <input
              type="number"
              id="shape-rotation"
              value={parseFloat((object.properties?.rotation || 0).toFixed(2))}
              onChange={(e) => handleDetailChange('rotation', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="0"
              max="360"
              step="0.01"
            />
          </div>
          <div>
            <label htmlFor="shape-type" className="text-xs text-gray-500 block mb-1">Shape Type</label>
            <select
              id="shape-type"
              value={object.properties?.shapeType || 'box'}
              onChange={(e) => handleDetailChange('shapeType', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"
            >
              <option value="box">Box</option>
              <option value="circle">Circle</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>
          <div>
            <label htmlFor="shape-fill-type" className="text-xs text-gray-500 block mb-1">Fill Type</label>
            <select
              id="shape-fill-type"
              value={object.properties?.fillType || 'solid'}
              onChange={e => handleDetailChange('fillType', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"
            >
              <option value="solid">단색</option>
              <option value="gradient">그라데이션</option>
            </select>
            {object.properties?.fillType !== 'gradient' && (
              <>
                <label htmlFor="shape-color" className="text-xs text-gray-500 block mb-1">Fill Color</label>
                <input
                  type="color"
                  id="shape-color"
                  value={object.properties?.color || '#FF0000'}
                  onChange={e => handleDetailChange('color', e.target.value)}
                  className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
                />
                <div className="mt-2">
                  <label htmlFor="shape-opacity" className="text-xs text-gray-500 block mb-1">Opacity ({Math.round((object.properties?.opacity ?? 1) * 100)}%)</label>
                  <input
                    type="range"
                    id="shape-opacity"
                    min="0"
                    max="1"
                    step="0.01"
                    value={object.properties?.opacity ?? 1}
                    onChange={e => handleDetailChange('opacity', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
              </>
            )}
            {object.properties?.fillType === 'gradient' && (
              <div className="mt-2">
                <label className="text-xs text-gray-500 block mb-1">Gradient</label>
                
                {/* 그라데이션 각도 설정 */}
                <div className="mb-3">
                  <label className="text-xs text-gray-500 block mb-1">각도 (0~360°)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={object.properties?.gradient?.angle || 0}
                      onChange={e => {
                        const angle = parseInt(e.target.value);
                        handleDetailChange('gradient', { 
                          ...object.properties.gradient, 
                          angle: angle 
                        });
                      }}
                      className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={object.properties?.gradient?.angle || 0}
                      onChange={e => {
                        const angle = parseInt(e.target.value);
                        handleDetailChange('gradient', { 
                          ...object.properties.gradient, 
                          angle: angle 
                        });
                      }}
                      className="w-16 bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
                
                {/* 그라데이션 바 (양 끝 포인트, 클릭 시 컬러+투명도 선택) */}
                <div className="relative h-8 flex items-center">
                  {/* 좌측 포인트 */}
                  <div className="absolute left-0 z-10 flex flex-col items-center">
                    <input
                      type="color"
                      value={object.properties?.gradient?.stops?.[0]?.color || '#FF0000'}
                      onChange={e => {
                        const stops = [...(object.properties?.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                        stops[0] = {...stops[0], color: e.target.value};
                        handleDetailChange('gradient', { ...object.properties.gradient, stops });
                      }}
                      className="w-6 h-6 border border-gray-400 rounded-full cursor-pointer"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round((object.properties?.gradient?.stops?.[0]?.opacity ?? 1) * 100)}
                      onChange={e => {
                        let v = parseInt(e.target.value);
                        if (isNaN(v)) v = 100;
                        if (v < 0) v = 0;
                        if (v > 100) v = 100;
                        const opacity = v / 100;
                        const stops = [...(object.properties?.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                        stops[0] = {...stops[0], opacity: opacity};
                        handleDetailChange('gradient', { ...object.properties.gradient, stops });
                      }}
                      className="w-8 bg-gray-900 text-white text-xs p-1 rounded-md border border-gray-600 mt-1"
                      style={{ 
                        width: '100%',
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        appearance: 'none'
                      }}
                      title="투명도 (0~100%)"
                    />
                  </div>
                  {/* 그라데이션 바 */}
                  <div className="flex-1 h-3 mx-8 rounded bg-gradient-to-r" style={{background: `linear-gradient(to right, ${(object.properties?.gradient?.stops?.[0]?.color || '#FF0000')}, ${(object.properties?.gradient?.stops?.[1]?.color || '#0000FF')})`}} />
                  {/* 우측 포인트 */}
                  <div className="absolute right-0 z-10 flex flex-col items-center">
                    <input
                      type="color"
                      value={object.properties?.gradient?.stops?.[1]?.color || '#0000FF'}
                      onChange={e => {
                        const stops = [...(object.properties?.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                        stops[1] = {...stops[1], color: e.target.value};
                        handleDetailChange('gradient', { ...object.properties.gradient, stops });
                      }}
                      className="w-6 h-6 border border-gray-400 rounded-full cursor-pointer"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round((object.properties?.gradient?.stops?.[1]?.opacity ?? 1) * 100)}
                      onChange={e => {
                        let v = parseInt(e.target.value);
                        if (isNaN(v)) v = 100;
                        if (v < 0) v = 0;
                        if (v > 100) v = 100;
                        const opacity = v / 100;
                        const stops = [...(object.properties?.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                        stops[1] = {...stops[1], opacity: opacity};
                        handleDetailChange('gradient', { ...object.properties.gradient, stops });
                      }}
                      className="w-8 bg-gray-900 text-white text-xs p-1 rounded-md border border-gray-600 mt-1"
                      style={{ 
                        width: '100%',
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        appearance: 'none'
                      }}
                      title="투명도 (0~100%)"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Shape Border Properties */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">Border</h4>
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id={`useShapeBorder-${object.id}`}
                name="useShapeBorder"
                checked={object.properties.useShapeBorder || false}
                onChange={(e) => handleDetailChange('useShapeBorder', e.target.checked)}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
              />
              <label htmlFor={`useShapeBorder-${object.id}`} className="text-sm text-gray-400">Use Border</label>
            </div>
            {object.properties.useShapeBorder && (
              <div className="space-y-3 pl-1">
                <div>
                  <label htmlFor={`shapeBorderWidth-${object.id}`} className="text-xs text-gray-500 block mb-1">Width (px)</label>
                  <input
                    type="number"
                    id={`shapeBorderWidth-${object.id}`}
                    name="shapeBorderWidth"
                    value={object.properties.shapeBorderWidth || 1}
                    onChange={(e) => handleDetailChange('shapeBorderWidth', parseInt(e.target.value, 10) || 0)}
                    min="0"
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`shapeBorderColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Color</label>
                  <input
                    type="color"
                    id={`shapeBorderColor-${object.id}`}
                    name="shapeBorderColor"
                    value={object.properties.shapeBorderColor || '#FFFFFF'}
                    onChange={(e) => handleDetailChange('shapeBorderColor', e.target.value)}
                    className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
                  />
                </div>
                <div>
                  <label htmlFor={`shapeBorderStyle-${object.id}`} className="text-xs text-gray-500 block mb-1">Style</label>
                  <select
                    id={`shapeBorderStyle-${object.id}`}
                    name="shapeBorderStyle"
                    value={object.properties.shapeBorderStyle || 'solid'}
                    onChange={(e) => handleDetailChange('shapeBorderStyle', e.target.value)}
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Shape Shadow Properties */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">Shadow</h4>
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id={`useShapeShadow-${object.id}`}
                name="useShapeShadow"
                checked={object.properties.useShapeShadow || false}
                onChange={(e) => handleDetailChange('useShapeShadow', e.target.checked)}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
              />
              <label htmlFor={`useShapeShadow-${object.id}`} className="text-sm text-gray-400">Use Shadow</label>
            </div>
            {object.properties.useShapeShadow && (
              <div className="space-y-3 pl-1">
                <div>
                  <label htmlFor={`shapeShadowOffsetX-${object.id}`} className="text-xs text-gray-500 block mb-1">Offset X (px)</label>
                  <input
                    type="number"
                    id={`shapeShadowOffsetX-${object.id}`}
                    name="shapeShadowOffsetX"
                    value={object.properties.shapeShadowOffsetX || 0}
                    onChange={(e) => handleDetailChange('shapeShadowOffsetX', parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`shapeShadowOffsetY-${object.id}`} className="text-xs text-gray-500 block mb-1">Offset Y (px)</label>
                  <input
                    type="number"
                    id={`shapeShadowOffsetY-${object.id}`}
                    name="shapeShadowOffsetY"
                    value={object.properties.shapeShadowOffsetY || 0}
                    onChange={(e) => handleDetailChange('shapeShadowOffsetY', parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`shapeShadowBlur-${object.id}`} className="text-xs text-gray-500 block mb-1">Blur (px)</label>
                  <input
                    type="number"
                    id={`shapeShadowBlur-${object.id}`}
                    name="shapeShadowBlur"
                    value={object.properties.shapeShadowBlur || 0}
                    onChange={(e) => handleDetailChange('shapeShadowBlur', parseInt(e.target.value, 10) || 0)}
                    min="0"
                    className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor={`shapeShadowColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Color</label>
                  <input
                    type="color"
                    id={`shapeShadowColor-${object.id}`}
                    name="shapeShadowColor"
                    value={object.properties.shapeShadowColor || '#000000'}
                    onChange={(e) => handleDetailChange('shapeShadowColor', e.target.value)}
                    className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ); // Closing return for case 'shape'
    case 'timer':
      return (
        <div className="space-y-3">
          {/* Reusing text properties UI could be done by abstracting it into a component */}
          {/* For now, duplicating relevant fields for clarity */}
          <div>
            <label htmlFor="timer-content" className="text-xs text-gray-500 block mb-1">Display Text (manual override)</label>
            <textarea
              id="timer-content"
              value={object.properties?.content || ''}
              onChange={(e) => handleDetailChange('content', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex space-x-2">
            <div className="w-1/2">
              <label htmlFor="timer-pos-x" className="text-xs text-gray-500 block mb-1">Position X</label>
              <input
                type="number"
                id="timer-pos-x"
                value={object.properties?.x || 0}
                onChange={(e) => handleDetailChange('x', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="w-1/2">
              <label htmlFor="timer-pos-y" className="text-xs text-gray-500 block mb-1">Position Y</label>
              <input
                type="number"
                id="timer-pos-y"
                value={object.properties?.y || 0}
                onChange={(e) => handleDetailChange('y', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="timer-rotation" className="text-xs text-gray-500 block mb-1">Rotation (degrees)</label>
            <input
              type="number"
              id="timer-rotation"
              value={parseFloat((object.properties?.rotation || 0).toFixed(2))}
              onChange={(e) => handleDetailChange('rotation', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="0"
              max="360"
              step="0.01"
            />
          </div>
          <div>
            <label htmlFor="timer-font-family" className="text-xs text-gray-500 block mb-1">Font Family</label>
            <select
              id="timer-font-family"
              value={object.properties?.fontFamily || 'Arial'}
              onChange={(e) => handleDetailChange('fontFamily', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Arial">Arial</option>
              <option value="Verdana">Verdana</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="sans-serif">sans-serif</option>
              <option value="serif">serif</option>
              <option value="monospace">monospace</option>
            </select>
          </div>
          <div>
            <label htmlFor="timer-font-size" className="text-xs text-gray-500 block mb-1">Font Size (px)</label>
            <input
              type="number"
              id="timer-font-size"
              value={object.properties?.fontSize || 48}
              onChange={(e) => handleDetailChange('fontSize', parseInt(e.target.value, 10) || 48)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="8"
              max="200"
            />
          </div>
          <div>
            <label htmlFor="timer-color" className="text-xs text-gray-500 block mb-1">Font Color</label>
            <input
              type="color"
              id="timer-color"
              value={object.properties?.color || '#ffffff'}
              onChange={(e) => handleDetailChange('color', e.target.value)}
              className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
            />
          </div>
          <div>
            <label htmlFor="timer-font-weight" className="text-xs text-gray-500 block mb-1">Font Weight</label>
            <select
              id="timer-font-weight"
              value={object.properties?.fontWeight || 'normal'}
              onChange={(e) => handleDetailChange('fontWeight', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
              <option value="400">400</option>
              <option value="500">500</option>
              <option value="600">600</option>
              <option value="700">700</option>
              <option value="800">800</option>
              <option value="900">900</option>
            </select>
          </div>
          <div>
            <label htmlFor="timer-opacity" className="text-xs text-gray-500 block mb-1">Opacity ({Math.round((object.properties?.opacity ?? 1) * 100)}%)</label>
            <input
              type="range"
              id="timer-opacity"
              min="0"
              max="1"
              step="0.01"
              value={object.properties?.opacity ?? 1}
              onChange={e => handleDetailChange('opacity', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>
          <div>
            <label htmlFor="timer-align" className="text-xs text-gray-500 block mb-1">Text Alignment</label>
            <div className="flex space-x-2">
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded text-xs ${object.properties?.textAlign === 'left' ? 'bg-indigo-600' : 'bg-gray-600'}`}
                onClick={() => handleDetailChange('textAlign', 'left')}
              >
                Left
              </button>
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded text-xs ${object.properties?.textAlign === 'center' ? 'bg-indigo-600' : 'bg-gray-600'}`}
                onClick={() => handleDetailChange('textAlign', 'center')}
              >
                Center
              </button>
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded text-xs ${object.properties?.textAlign === 'right' ? 'bg-indigo-600' : 'bg-gray-600'}`}
                onClick={() => handleDetailChange('textAlign', 'right')}
              >
                Right
              </button>
            </div>
          </div>
          <hr className="border-gray-600 my-2" />
          {/* Timer Background Properties 삭제됨 */}
          <div>
            <label htmlFor="timer-mode" className="text-xs text-gray-500 block mb-1">Mode</label>
            <select
              id="timer-mode"
              value={object.properties?.mode || 'countdown'}
              onChange={(e) => handleDetailChange('mode', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="countdown">Countdown</option>
              <option value="countup">Count Up</option>
            </select>
          </div>
          <div>
            <label htmlFor="timer-duration" className="text-xs text-gray-500 block mb-1">Duration (seconds)</label>
            <input
              type="number"
              id="timer-duration"
              value={object.properties?.duration || 300}
              onChange={(e) => handleDetailChange('duration', parseInt(e.target.value, 10) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              min="0"
            />
          </div>
          <div>
            <label htmlFor="timer-timeformat" className="text-xs text-gray-500 block mb-1">Time Format</label>
            <select
              id="timer-timeformat"
              value={object.properties?.timeFormat || 'MM:SS'}
              onChange={(e) => handleDetailChange('timeFormat', e.target.value)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="HH:MM:SS">HH:MM:SS (e.g., 01:23:45)</option>
              <option value="MM:SS">MM:SS (e.g., 23:45)</option>
              <option value="MM:SS.s">MM:SS.s (e.g., 23:45.6)</option>
              <option value="MM:SS.ss">MM:SS.ss (e.g., 23:45.67)</option>
              <option value="SS">SS (e.g., 45)</option>
              <option value="SS.s">SS.s (e.g., 45.6)</option>
              <option value="SS.ss">SS.ss (e.g., 45.67)</option>
            </select>
          </div>
        </div>
      ); // Explicitly ensuring semicolon for timer case return
    case 'sequence':
      return (
        <div className="space-y-3">
          <div>
            <label htmlFor="sequence-loop" className="text-xs text-gray-500 block mb-1">루프 재생</label>
            <input
              type="checkbox"
              id="sequence-loop"
              checked={object.properties?.loop || false}
              onChange={e => handleDetailChange('loop', e.target.checked)}
              className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
            />
            <span className="text-sm text-gray-400">루프(반복) 재생</span>
          </div>
          {/* 시퀀스 관련 추가 속성 필요시 여기에 추가 */}
        </div>
      );
    default: // Ensuring default case is clean
      return <p className="text-xs text-gray-500 italic">No specific properties for type: '{object.type}'</p>;
  }
};


export default function PropertiesPanel({ selectedObject, onUpdateObjectProperty }) {
  const handleNameChange = (e) => {
    if (selectedObject) {
      onUpdateObjectProperty(selectedObject.id, 'name', e.target.value);
    }
  };

  return (
    <aside className="w-80 bg-gray-900 text-gray-200 p-4 border-l border-gray-800 shadow-lg h-full text-[70%] text-xs overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
      <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Properties</h2>
      
      {!selectedObject ? (
         <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-500 italic">No object selected</p>
         </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pb-6"> {/* Added pb-6 for bottom padding */}
          {/* Section for selected object's general properties */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">General</h3>
            <div className="space-y-2">
              <div>
                <label htmlFor="object-name" className="text-xs text-gray-500 block mb-1">Name</label>
                <input 
                  type="text" 
                  id="object-name" 
                  placeholder="Object Name" 
                  className="w-full bg-gray-700 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500" 
                  value={selectedObject.name} 
                  onChange={handleNameChange}
                />
              </div>
              <div className="text-xs text-gray-500">
                <span className="font-semibold">ID:</span> {selectedObject.id}
              </div>
               <div className="text-xs text-gray-500">
                <span className="font-semibold">Type:</span> {selectedObject.type}
              </div>
            </div>
          </div>

          {/* Section for specific properties based on object type */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Details</h3>
              {selectedObject?.type === 'timer' && (
                <div className="flex space-x-1">
                  <button
                    className={`px-1.5 py-0.5 text-xs rounded ${selectedObject.properties?.isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    onClick={() => {
                      const updatedProps = { 
                        ...selectedObject.properties, 
                        isRunning: !selectedObject.properties?.isRunning 
                      };
                      onUpdateObjectProperty(selectedObject.id, "properties", updatedProps);
                    }}
                  >
                    {selectedObject.properties?.isRunning ? 'Pause' : 'Start'}
                  </button>
                  <button
                    className="px-1.5 py-0.5 text-xs rounded bg-gray-600 hover:bg-gray-700"
                    onClick={() => {
                      // Reset timer
                      const updatedProps = { 
                        ...selectedObject.properties, 
                        isRunning: false,
                        content: selectedObject.properties.timeFormat.includes('HH') ? '00:00:00' : 
                                selectedObject.properties.timeFormat.includes('.ss') ? '00:00.00' :
                                selectedObject.properties.timeFormat.includes('.s') ? '00:00.0' :
                                selectedObject.properties.timeFormat === 'SS' ? '00' :
                                selectedObject.properties.timeFormat === 'SS.s' ? '00.0' :
                                selectedObject.properties.timeFormat === 'SS.ss' ? '00.00' :
                                '00:00'
                      };
                      onUpdateObjectProperty(selectedObject.id, "properties", updatedProps);
                    }}
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
            <div className="bg-gray-700/50 p-2 rounded-md">
              <ObjectSpecificProperties object={selectedObject} onUpdate={onUpdateObjectProperty} />
            </div>
          </div>

          {/* Section for motion effects */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Motion Effects</h3>
            <div className="bg-gray-700/50 p-2 rounded-md space-y-3">
              {/* Entrance Effect */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Entrance Effect</label>
                <div className="text-sm">
                  <span className="font-medium">Type:</span> {selectedObject.in_motion?.type || 'none'}<br />
                  <span className="font-medium">Duration:</span> {selectedObject.in_motion?.duration || 1}s<br />
                  <span className="font-medium">Delay:</span> {selectedObject.in_motion?.delay || 0}s<br />
                  <span className="font-medium">Easing:</span> {selectedObject.in_motion?.easing || 'ease'}
                </div>
              </div>

              {/* Exit Effect */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Exit Effect</label>
                <div className="text-sm">
                  <span className="font-medium">Type:</span> {selectedObject.out_motion?.type || 'none'}<br />
                  <span className="font-medium">Duration:</span> {selectedObject.out_motion?.duration || 1}s<br />
                  <span className="font-medium">Delay:</span> {selectedObject.out_motion?.delay || 0}s<br />
                  <span className="font-medium">Easing:</span> {selectedObject.out_motion?.easing || 'ease'}
                </div>
              </div>

              {/* Timing */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Timing</label>
                <div className="text-sm">
                  <span className="font-medium">Start Time:</span> {selectedObject.timing?.startTime || 0}s<br />
                  <span className="font-medium">End Time:</span> {selectedObject.timing?.endTime || 10}s<br />
                  <span className="font-medium">Duration:</span> {selectedObject.timing?.duration || 10}s
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
