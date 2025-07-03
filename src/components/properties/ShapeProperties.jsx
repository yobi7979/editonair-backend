import React from 'react';

export default function ShapeProperties({ object, onUpdate }) {
  if (!object) return null;

  // 그라데이션 타입, 각도, 색상 스톱 등 기본값 추출
  const properties = object.properties || {};
  const gradientType = properties.gradientType || 'linear';
  const gradientAngle = properties.gradientAngle || 0;
  const gradientColors = properties.gradientColors || [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' },
  ];

  // 변경 핸들러
  const handleChange = (prop, value) => {
    onUpdate({ ...object, properties: { ...properties, [prop]: value } });
  };

  // 색상 스톱 추가/삭제/변경 핸들러
  const handleColorChange = (idx, field, value) => {
    const newColors = gradientColors.map((stop, i) =>
      i === idx ? { ...stop, [field]: value } : stop
    );
    handleChange('gradientColors', newColors);
  };
  const handleAddColor = () => {
    handleChange('gradientColors', [...gradientColors, { offset: 1, color: '#000000' }]);
  };
  const handleRemoveColor = (idx) => {
    if (gradientColors.length <= 2) return;
    handleChange('gradientColors', gradientColors.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs mb-1">그라데이션 타입</label>
        <select
          value={gradientType}
          onChange={e => handleChange('gradientType', e.target.value)}
          className="w-full p-1.5 rounded bg-gray-800 text-white"
        >
          <option value="linear">선형(Linear)</option>
          <option value="radial">원형(Radial)</option>
        </select>
      </div>
      {gradientType === 'linear' && (
        <div>
          <label className="block text-xs mb-1">각도(0~360°)</label>
          <input
            type="range"
            min={0}
            max={360}
            value={gradientAngle}
            onChange={e => handleChange('gradientAngle', parseInt(e.target.value))}
            className="w-full"
          />
          <input
            type="number"
            min={0}
            max={360}
            value={gradientAngle}
            onChange={e => handleChange('gradientAngle', parseInt(e.target.value))}
            className="w-full bg-gray-800 text-white mt-1 p-1.5 rounded"
          />
        </div>
      )}
      <div>
        <label className="block text-xs mb-1">그라데이션 색상</label>
        {gradientColors.map((stop, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-1">
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={stop.offset}
              onChange={e => handleColorChange(idx, 'offset', parseFloat(e.target.value))}
              className="w-16 bg-gray-800 text-white p-1.5 rounded"
            />
            <input
              type="color"
              value={stop.color}
              onChange={e => handleColorChange(idx, 'color', e.target.value)}
              className="w-10 h-8"
            />
            {gradientColors.length > 2 && (
              <button onClick={() => handleRemoveColor(idx)} className="text-red-400 text-xs">삭제</button>
            )}
          </div>
        ))}
        <button onClick={handleAddColor} className="bg-gray-700 text-white px-2 py-1 rounded text-xs">색상 추가</button>
      </div>
    </div>
  );
}
