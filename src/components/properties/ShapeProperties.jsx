import React, { useEffect } from 'react';

export default function ShapeProperties({ object, onUpdate }) {
  if (!object) return null;

  const properties = object.properties || {};
  const cornerRadius = properties.cornerRadius || { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };

  const handleChange = (prop, value) => {
    console.log('속성 변경:', prop, value);
    onUpdate({ ...object, properties: { ...properties, [prop]: value } });
  };

  const handleCornerRadiusChange = (corner, value) => {
    console.log('모서리 변경 전:', cornerRadius);
    console.log('변경할 모서리:', corner, '새 값:', value);
    const newCornerRadius = { ...cornerRadius, [corner]: value };
    console.log('모서리 변경 후:', newCornerRadius);
    console.log('전체 속성:', properties);
    console.log('업데이트할 속성:', { cornerRadius: newCornerRadius });
    handleChange('cornerRadius', newCornerRadius);
  };

  useEffect(() => {
    console.log('ShapeProperties - 속성 변경됨:', properties);
    if (properties.cornerRadius) {
      console.log('현재 cornerRadius:', properties.cornerRadius);
    }
  }, [properties]);

  return (
    <div className="space-y-3">
      {/* 기본 속성 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="shape-width" className="text-xs text-gray-500 block mb-1">Width (px)</label>
          <input
            type="number"
            id="shape-width"
            value={properties.width || 100}
            onChange={(e) => handleChange('width', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="shape-height" className="text-xs text-gray-500 block mb-1">Height (px)</label>
          <input
            type="number"
            id="shape-height"
            value={properties.height || 100}
            onChange={(e) => handleChange('height', parseInt(e.target.value, 10) || 0)}
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
            value={properties.x || 0}
            onChange={(e) => handleChange('x', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="shape-pos-y" className="text-xs text-gray-500 block mb-1">Position Y</label>
          <input
            type="number"
            id="shape-pos-y"
            value={properties.y || 0}
            onChange={(e) => handleChange('y', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="shape-rotation" className="text-xs text-gray-500 block mb-1">Rotation (degrees)</label>
        <input
          type="number"
          id="shape-rotation"
          value={parseFloat((properties.rotation || 0).toFixed(2))}
          onChange={(e) => handleChange('rotation', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
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
          value={properties.shapeType || 'box'}
          onChange={(e) => handleChange('shapeType', e.target.value)}
          className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"
        >
          <option value="box">Box</option>
          <option value="circle">Circle</option>
          <option value="triangle">Triangle</option>
        </select>
      </div>

      {/* 모서리 둥글기 */}
      <div>
        <label className="block text-xs mb-1">모서리 둥글기 (px)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs">좌상</span>
            <input
              type="number"
              min={0}
              value={cornerRadius.topLeft}
              onChange={e => handleCornerRadiusChange('topLeft', parseInt(e.target.value) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mt-1"
            />
          </div>
          <div>
            <span className="text-xs">우상</span>
            <input
              type="number"
              min={0}
              value={cornerRadius.topRight}
              onChange={e => handleCornerRadiusChange('topRight', parseInt(e.target.value) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mt-1"
            />
          </div>
          <div>
            <span className="text-xs">좌하</span>
            <input
              type="number"
              min={0}
              value={cornerRadius.bottomLeft}
              onChange={e => handleCornerRadiusChange('bottomLeft', parseInt(e.target.value) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mt-1"
            />
          </div>
          <div>
            <span className="text-xs">우하</span>
            <input
              type="number"
              min={0}
              value={cornerRadius.bottomRight}
              onChange={e => handleCornerRadiusChange('bottomRight', parseInt(e.target.value) || 0)}
              className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mt-1"
            />
          </div>
        </div>
      </div>

      {/* 색상 및 채우기 */}
      <div>
        <label htmlFor="shape-fill-type" className="text-xs text-gray-500 block mb-1">Fill Type</label>
        <select
          id="shape-fill-type"
          value={properties.fillType || 'solid'}
          onChange={e => handleChange('fillType', e.target.value)}
          className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"
        >
          <option value="solid">단색</option>
          <option value="gradient">그라데이션</option>
        </select>

        {properties.fillType !== 'gradient' && (
          <>
            <label htmlFor="shape-color" className="text-xs text-gray-500 block mb-1">Fill Color</label>
            <input
              type="color"
              id="shape-color"
              value={properties.color || '#FF0000'}
              onChange={e => handleChange('color', e.target.value)}
              className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
            />
            <div className="mt-2">
              <label htmlFor="shape-opacity" className="text-xs text-gray-500 block mb-1">
                Opacity ({Math.round((properties.opacity ?? 1) * 100)}%)
              </label>
              <input
                type="range"
                id="shape-opacity"
                min="0"
                max="1"
                step="0.01"
                value={properties.opacity ?? 1}
                onChange={e => handleChange('opacity', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </>
        )}

        {properties.fillType === 'gradient' && (
          <div className="mt-2">
            <label className="text-xs text-gray-500 block mb-1">Gradient</label>
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1">각도 (0~360°)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={properties.gradient?.angle || 0}
                  onChange={e => {
                    const angle = parseInt(e.target.value);
                    handleChange('gradient', {
                      ...properties.gradient,
                      angle: angle
                    });
                  }}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={properties.gradient?.angle || 0}
                  onChange={e => {
                    const angle = parseInt(e.target.value);
                    handleChange('gradient', {
                      ...properties.gradient,
                      angle: angle
                    });
                  }}
                  className="w-16 bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="relative h-8 flex items-center">
              <div className="absolute left-0 z-10 flex flex-col items-center">
                <input
                  type="color"
                  value={properties.gradient?.stops?.[0]?.color || '#FF0000'}
                  onChange={e => {
                    const stops = [...(properties.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                    stops[0] = {...stops[0], color: e.target.value};
                    handleChange('gradient', { ...properties.gradient, stops });
                  }}
                  className="w-6 h-6 border border-gray-400 rounded-full cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((properties.gradient?.stops?.[0]?.opacity ?? 1) * 100)}
                  onChange={e => {
                    let v = parseInt(e.target.value);
                    if (isNaN(v)) v = 100;
                    if (v < 0) v = 0;
                    if (v > 100) v = 100;
                    const opacity = v / 100;
                    const stops = [...(properties.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                    stops[0] = {...stops[0], opacity: opacity};
                    handleChange('gradient', { ...properties.gradient, stops });
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
              <div
                className="flex-1 h-3 mx-8 rounded bg-gradient-to-r"
                style={{
                  background: `linear-gradient(to right, ${properties.gradient?.stops?.[0]?.color || '#FF0000'}, ${properties.gradient?.stops?.[1]?.color || '#0000FF'})`
                }}
              />
              <div className="absolute right-0 z-10 flex flex-col items-center">
                <input
                  type="color"
                  value={properties.gradient?.stops?.[1]?.color || '#0000FF'}
                  onChange={e => {
                    const stops = [...(properties.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                    stops[1] = {...stops[1], color: e.target.value};
                    handleChange('gradient', { ...properties.gradient, stops });
                  }}
                  className="w-6 h-6 border border-gray-400 rounded-full cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((properties.gradient?.stops?.[1]?.opacity ?? 1) * 100)}
                  onChange={e => {
                    let v = parseInt(e.target.value);
                    if (isNaN(v)) v = 100;
                    if (v < 0) v = 0;
                    if (v > 100) v = 100;
                    const opacity = v / 100;
                    const stops = [...(properties.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                    stops[1] = {...stops[1], opacity: opacity};
                    handleChange('gradient', { ...properties.gradient, stops });
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

      {/* Border Properties */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <h4 className="text-sm font-semibold mb-2 text-gray-300">Border</h4>
        <div className="flex items-center mb-2">
          <input
            type="checkbox"
            id={`useShapeBorder-${object.id}`}
            checked={properties.useShapeBorder || false}
            onChange={(e) => handleChange('useShapeBorder', e.target.checked)}
            className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
          />
          <label htmlFor={`useShapeBorder-${object.id}`} className="text-sm text-gray-400">Use Border</label>
        </div>
        {properties.useShapeBorder && (
          <div className="space-y-3 pl-1">
            <div>
              <label htmlFor={`shapeBorderWidth-${object.id}`} className="text-xs text-gray-500 block mb-1">Width (px)</label>
              <input
                type="number"
                id={`shapeBorderWidth-${object.id}`}
                value={properties.shapeBorderWidth || 1}
                onChange={(e) => handleChange('shapeBorderWidth', parseInt(e.target.value, 10) || 0)}
                min="0"
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor={`shapeBorderColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Color</label>
              <input
                type="color"
                id={`shapeBorderColor-${object.id}`}
                value={properties.shapeBorderColor || '#FFFFFF'}
                onChange={(e) => handleChange('shapeBorderColor', e.target.value)}
                className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
              />
            </div>
            <div>
              <label htmlFor={`shapeBorderStyle-${object.id}`} className="text-xs text-gray-500 block mb-1">Style</label>
              <select
                id={`shapeBorderStyle-${object.id}`}
                value={properties.shapeBorderStyle || 'solid'}
                onChange={(e) => handleChange('shapeBorderStyle', e.target.value)}
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

      {/* Shadow Properties */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <h4 className="text-sm font-semibold mb-2 text-gray-300">Shadow</h4>
        <div className="flex items-center mb-2">
          <input
            type="checkbox"
            id={`useShapeShadow-${object.id}`}
            checked={properties.useShapeShadow || false}
            onChange={(e) => handleChange('useShapeShadow', e.target.checked)}
            className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
          />
          <label htmlFor={`useShapeShadow-${object.id}`} className="text-sm text-gray-400">Use Shadow</label>
        </div>
        {properties.useShapeShadow && (
          <div className="space-y-3 pl-1">
            <div>
              <label htmlFor={`shapeShadowOffsetX-${object.id}`} className="text-xs text-gray-500 block mb-1">Offset X (px)</label>
              <input
                type="number"
                id={`shapeShadowOffsetX-${object.id}`}
                value={properties.shapeShadowOffsetX || 0}
                onChange={(e) => handleChange('shapeShadowOffsetX', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor={`shapeShadowOffsetY-${object.id}`} className="text-xs text-gray-500 block mb-1">Offset Y (px)</label>
              <input
                type="number"
                id={`shapeShadowOffsetY-${object.id}`}
                value={properties.shapeShadowOffsetY || 0}
                onChange={(e) => handleChange('shapeShadowOffsetY', parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor={`shapeShadowBlur-${object.id}`} className="text-xs text-gray-500 block mb-1">Blur (px)</label>
              <input
                type="number"
                id={`shapeShadowBlur-${object.id}`}
                value={properties.shapeShadowBlur || 0}
                onChange={(e) => handleChange('shapeShadowBlur', parseInt(e.target.value, 10) || 0)}
                min="0"
                className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor={`shapeShadowColor-${object.id}`} className="text-xs text-gray-500 block mb-1">Color</label>
              <input
                type="color"
                id={`shapeShadowColor-${object.id}`}
                value={properties.shapeShadowColor || '#000000'}
                onChange={(e) => handleChange('shapeShadowColor', e.target.value)}
                className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
