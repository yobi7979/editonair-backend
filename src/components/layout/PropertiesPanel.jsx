import React, { useState, useEffect } from 'react';
import ShapeProperties from '../properties/ShapeProperties';
import TextProperties from '../properties/TextProperties';
import TimerProperties from '../properties/TimerProperties';

const SYSTEM_FONTS = [
  { family: 'Arial', name: 'Arial' },
  { family: 'Arial Black', name: 'Arial Black' },
  { family: 'Verdana', name: 'Verdana' },
  { family: 'Tahoma', name: 'Tahoma' },
  { family: 'Trebuchet MS', name: 'Trebuchet MS' },
  { family: 'Impact', name: 'Impact' },
  { family: 'Times New Roman', name: 'Times New Roman' },
  { family: 'Didot', name: 'Didot' },
  { family: 'Georgia', name: 'Georgia' },
  { family: 'American Typewriter', name: 'American Typewriter' },
  { family: 'Courier', name: 'Courier' },
  { family: 'Courier New', name: 'Courier New' },
  { family: 'Monaco', name: 'Monaco' },
  { family: 'Bradley Hand', name: 'Bradley Hand' },
  { family: 'Brush Script MT', name: 'Brush Script MT' },
  { family: 'Luminari', name: 'Luminari' },
  { family: 'Comic Sans MS', name: 'Comic Sans MS' },
  // 한글 폰트
  { family: '맑은 고딕', name: 'Malgun Gothic' },
  { family: '굴림', name: 'Gulim' },
  { family: '굴림체', name: 'GulimChe' },
  { family: '돋움', name: 'Dotum' },
  { family: '돋움체', name: 'DotumChe' },
  { family: '바탕', name: 'Batang' },
  { family: '바탕체', name: 'BatangChe' },
  { family: '궁서', name: 'Gungsuh' },
  { family: '궁서체', name: 'GungsuhChe' },
];

// Component to render specific properties based on object type
const ObjectSpecificProperties = ({ object, onUpdate, systemFonts }) => {

  const loadSystemFonts = async () => {
    try {
      if ('queryLocalFonts' in window) {
        try {
          // 권한 요청을 트리거하기 위해 queryLocalFonts를 먼저 호출
          const fonts = await window.queryLocalFonts();
          const uniqueFonts = Array.from(new Set(fonts.map(font => font.family)))
            .map(family => ({ family, name: family }))
            .sort((a, b) => a.family.localeCompare(b.family));
          setSystemFonts(uniqueFonts);
        } catch (permissionError) {
          if (permissionError.name === 'SecurityError') {
            // 권한이 거부된 경우
            alert('폰트 접근 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
          } else {
            throw permissionError; // 다른 에러는 외부 catch로 전달
          }
        }
      } else {
        alert('이 브라우저는 시스템 폰트 불러오기를 지원하지 않습니다.');
      }
    } catch (error) {
      console.warn('Failed to load system fonts:', error);
      alert('폰트 불러오기에 실패했습니다.');
    }
  };

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
      return <TextProperties 
        object={object} 
        systemFonts={systemFonts}
        onUpdate={(updatedObject) => {
          onUpdate(object.id, 'properties', updatedObject.properties);
        }} 
      />;
    case 'timer':
      return <TimerProperties 
        object={object} 
        systemFonts={systemFonts}
        onUpdate={(updatedObject) => {
          onUpdate(object.id, 'properties', updatedObject.properties);
        }} 
      />;
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
      );
    case 'shape':
      return <ShapeProperties object={object} onUpdate={(updatedObject) => {
        console.log('Shape 속성 업데이트:', updatedObject.properties); // 디버깅용 로그
        onUpdate(object.id, 'properties', updatedObject.properties);
      }} />;
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
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState('');
  const [systemFonts, setSystemFonts] = useState([
    { family: 'Arial', name: 'Arial' },
    { family: 'Verdana', name: 'Verdana' },
    { family: 'Times New Roman', name: 'Times New Roman' },
    { family: '맑은 고딕', name: 'Malgun Gothic' },
  ]);

  useEffect(() => {
    if (selectedObject) {
      setName(selectedObject.name || '');
    }
  }, [selectedObject]);

  const handleNameChange = (e) => {
    setName(e.target.value);
  };

  const handleNameSubmit = () => {
    if (selectedObject) {
      onUpdateObjectProperty(selectedObject.id, 'name', name);
      setIsRenaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    }
  };

  const loadSystemFonts = async () => {
    console.log('loadSystemFonts 함수 호출됨');
    try {
      // API 지원 여부 체크
      if (!window.queryLocalFonts) {
        console.log('Local Font Access API가 지원되지 않습니다');
        alert('이 브라우저는 시스템 폰트 불러오기를 지원하지 않습니다.\n크롬 브라우저 최신 버전을 사용해주세요.');
        return;
      }

      console.log('Local Font Access API 지원됨, 폰트 로딩 시도...');
      try {
        const fonts = await window.queryLocalFonts();
        console.log('로드된 폰트 수:', fonts.length);
        
        const uniqueFonts = Array.from(new Set(fonts.map(font => font.family)))
          .map(family => ({ family, name: family }))
          .sort((a, b) => a.family.localeCompare(b.family));
        
        console.log('정리된 폰트 수:', uniqueFonts.length);
        setSystemFonts(uniqueFonts);
        alert('폰트를 성공적으로 불러왔습니다.');
      } catch (permissionError) {
        console.error('폰트 로딩 중 에러 발생:', permissionError);
        if (permissionError.name === 'SecurityError') {
          alert('폰트 접근 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
        } else {
          throw permissionError;
        }
      }
    } catch (error) {
      console.error('폰트 로딩 실패:', error);
      alert('폰트 불러오기에 실패했습니다.');
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
                  className="w-full bg-gray-700 text-white text-sm p-1.5 rounded-md focus:outline-none" 
                  value={name} 
                  onChange={handleNameChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleNameSubmit}
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
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Details</h3>
                {(selectedObject.type === 'text' || selectedObject.type === 'timer') && (
                  <button
                    onClick={loadSystemFonts}
                    className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                    title="PC의 폰트 목록을 불러옵니다"
                  >
                    PC 폰트 가져오기
                  </button>
                )}
              </div>
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
              <ObjectSpecificProperties object={selectedObject} onUpdate={onUpdateObjectProperty} systemFonts={systemFonts} />
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
