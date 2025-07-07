import React from 'react';

export default function TimerProperties({ object, onUpdate, systemFonts }) {
  if (!object) return null;

  const properties = object.properties || {};

  const handleChange = (prop, value) => {
    console.log('속성 변경:', prop, value);
    onUpdate({ ...object, properties: { ...properties, [prop]: value } });
  };

  return (
    <div className="space-y-3">
      {/* 타이머 스타일 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="timer-font-family" className="text-xs text-gray-500 block mb-1">Font Family</label>
          <select
            id="timer-font-family"
            value={properties.fontFamily || 'Arial'}
            onChange={(e) => handleChange('fontFamily', e.target.value)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            {systemFonts.map(font => (
              <option key={font.family} value={font.family}>{font.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="timer-font-size" className="text-xs text-gray-500 block mb-1">Font Size (px)</label>
          <input
            type="number"
            id="timer-font-size"
            value={properties.fontSize || 48}
            onChange={(e) => handleChange('fontSize', parseInt(e.target.value, 10) || 48)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Font Weight와 Text Align */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="timer-font-weight" className="text-xs text-gray-500 block mb-1">Font Weight</label>
          <select
            id="timer-font-weight"
            value={properties.fontWeight || 'bold'}
            onChange={(e) => handleChange('fontWeight', e.target.value)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
            <option value="lighter">Lighter</option>
          </select>
        </div>
        <div>
          <label htmlFor="timer-align" className="text-xs text-gray-500 block mb-1">Text Align</label>
          <select
            id="timer-align"
            value={properties.textAlign || 'center'}
            onChange={(e) => handleChange('textAlign', e.target.value)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      {/* Position X, Y */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="timer-pos-x" className="text-xs text-gray-500 block mb-1">Position X</label>
          <input
            type="number"
            id="timer-pos-x"
            value={properties.x || 0}
            onChange={(e) => handleChange('x', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="timer-pos-y" className="text-xs text-gray-500 block mb-1">Position Y</label>
          <input
            type="number"
            id="timer-pos-y"
            value={properties.y || 0}
            onChange={(e) => handleChange('y', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 채우기 타입 선택 */}
      <div>
        <label htmlFor="timer-fill-type" className="text-xs text-gray-500 block mb-1">Fill Type</label>
        <select
          id="timer-fill-type"
          value={properties.fillType || 'solid'}
          onChange={e => handleChange('fillType', e.target.value)}
          className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"
        >
          <option value="solid">단색</option>
          <option value="gradient">그라데이션</option>
        </select>

        {properties.fillType !== 'gradient' && (
          <>
            <label htmlFor="timer-color" className="text-xs text-gray-500 block mb-1">Timer Color</label>
            <input
              type="color"
              id="timer-color"
              value={properties.color || '#FFFFFF'}
              onChange={e => handleChange('color', e.target.value)}
              className="w-full h-8 p-0.5 border-gray-600 rounded bg-gray-800 cursor-pointer"
            />
            <div className="mt-2">
              <label htmlFor="timer-opacity" className="text-xs text-gray-500 block mb-1">
                Opacity ({Math.round((properties.opacity ?? 1) * 100)}%)
              </label>
              <input
                type="range"
                id="timer-opacity"
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
                    const stops = [...(properties.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                    stops[0] = {...stops[0], opacity: parseInt(e.target.value) / 100};
                    handleChange('gradient', { ...properties.gradient, stops });
                  }}
                  className="w-12 bg-gray-900 text-white text-xs p-1 rounded-md border border-gray-600 mt-1"
                  style={{
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
                    const stops = [...(properties.gradient?.stops || [{color:'#FF0000',opacity:1,position:0},{color:'#0000FF',opacity:1,position:1}])];
                    stops[1] = {...stops[1], opacity: parseInt(e.target.value) / 100};
                    handleChange('gradient', { ...properties.gradient, stops });
                  }}
                  className="w-12 bg-gray-900 text-white text-xs p-1 rounded-md border border-gray-600 mt-1"
                  style={{
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

      {/* Width, Height 섹션을 그라데이션 섹션 아래로 이동 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="timer-width" className="text-xs text-gray-500 block mb-1">Width (px)</label>
          <input
            type="number"
            id="timer-width"
            value={properties.width || 200}
            onChange={(e) => handleChange('width', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="timer-height" className="text-xs text-gray-500 block mb-1">Height (px)</label>
          <input
            type="number"
            id="timer-height"
            value={properties.height || 100}
            onChange={(e) => handleChange('height', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-gray-900 text-white text-sm p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  );
} 