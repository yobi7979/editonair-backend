import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Play, Pause, SkipBack, SkipForward, Settings, ListTree, ChevronDown, LogIn, LogOut, ArrowLeft, GripVertical, Star, ArrowRight, ArrowUp, ArrowDown, ArrowLeft as ArrowLeftIcon, X, Sun, Maximize, RotateCw, Sparkles, Activity, Waves, Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import LibraryPanel from './LibraryPanel';

// Helper component for sortable items
function SortableObjectItem({ id, object, selectedObjectId, selectedObjectIds, editingObjectId, editText, setEditText, onSelectObject, onSelectObjects, onUpdateObjectProperty, setEditingObjectId, MotionSelectorComponent }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  const isLocked = object.locked;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-1 rounded-md transition-colors\n                  ${selectedObjectIds?.includes(object.id) ? 'bg-indigo-500 text-white' : 'bg-gray-600/50'}\n                  ${isDragging ? 'shadow-lg' : ''}`}
      onClick={e => {
        if (isLocked) return;
        if (e.ctrlKey || e.metaKey) {
          onSelectObjects(object.id);
        } else {
          onSelectObject(object.id);
        }
      }}
      {...(isLocked ? { draggable: false } : {})}
    >
      {/* 잠금/숨김 버튼 */}
      <button
        className={`mr-1 p-0.5 rounded ${isLocked ? 'bg-gray-700 text-yellow-400' : 'bg-gray-700 text-gray-400 hover:text-yellow-400'}`}
        title={isLocked ? '잠금 해제' : '잠금'}
        onClick={e => {
          e.stopPropagation();
          onUpdateObjectProperty(object.id, 'locked', !isLocked);
        }}
      >
        {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
      <button
        className={`mr-1 p-0.5 rounded ${object.visible === false ? 'bg-gray-700 text-red-400' : 'bg-gray-700 text-gray-400 hover:text-green-400'}`}
        title={object.visible === false ? '숨김 해제' : '숨김'}
        onClick={e => {
          e.stopPropagation();
          if (object.visible === false) {
            onUpdateObjectProperty(object.id, 'visible', true);
          } else {
            onUpdateObjectProperty(object.id, 'visible', false);
          }
        }}
      >
        {object.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button {...attributes} {...listeners} className="p-0.5 mr-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-200 focus:outline-none">
        <GripVertical size={14} />
      </button>
      <ListTree size={12} className="mr-1 text-gray-500 flex-shrink-0" />
      {editingObjectId === object.id ? (
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            if (editText.trim()) onUpdateObjectProperty(object.id, 'name', editText);
            setEditingObjectId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (editText.trim()) onUpdateObjectProperty(object.id, 'name', editText);
              setEditingObjectId(null);
              e.preventDefault();
            }
            if (e.key === 'Escape') {
              setEditingObjectId(null);
            }
          }}
          className="bg-gray-600 text-white text-[0.65rem] px-1 py-0.5 rounded-sm w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 flex-shrink-0"
          autoFocus
          onClick={(e) => e.stopPropagation()} // Prevent DND context from interfering with input focus
        />
      ) : (
        <span 
          className="truncate w-28 flex-shrink-0 text-[0.65rem] cursor-pointer"
          title={object.name}
          onClick={() => { if (editingObjectId !== object.id) onSelectObject(object.id); }}
          onDoubleClick={() => {
            setEditingObjectId(object.id);
            setEditText(object.name);
          }}
        >
          {object.name}
        </span>
      )}
      <div className="w-24 flex-shrink-0 mx-1">
        <MotionSelectorComponent 
          motionType={object.in_motion?.type || 'none'} 
          motionDirection="in"
          objectId={object.id} 
          onUpdateObjectProperty={onUpdateObjectProperty} 
        />
      </div>
      <div className="w-24 flex-shrink-0 mx-1">
        <MotionSelectorComponent 
          motionType={object.out_motion?.type || 'none'} 
          motionDirection="out"
          objectId={object.id} 
          onUpdateObjectProperty={onUpdateObjectProperty} 
        />
      </div>
      <div className="flex-grow h-full bg-gray-600 rounded-sm ml-2 relative group" style={{height: 20}}>
        {/* 눈금 표시 */}
        <div className="absolute left-0 top-0 w-full h-full flex items-center pointer-events-none z-0">
          {[...Array((object.timing?.duration || 5) + 1)].map((_, i) => (
            <div key={i} style={{position:'absolute',left:`${(i/(object.timing?.duration||5))*100}%`,height:'100%',width:2,background:'#fff2',top:0}}>
              <span style={{position:'absolute',top:'100%',left:'50%',transform:'translate(-50%,0)',fontSize:8,color:'#bbb'}}>{i}</span>
            </div>
          ))}
        </div>
        {/* 인/아웃 효과 시작점 핸들 */}
        <div className="absolute top-0 left-0 w-full h-full flex items-center z-10">
          {/* 인 효과 핸들 */}
          <div
            style={{
              position: 'absolute',
              left: `${((object.timing?.startTime || 0) / (object.timing?.duration || 5)) * 100}%`,
              zIndex: 2,
              cursor: 'ew-resize',
              width: 20,
              height: 20,
              background: '#22d3ee',
              borderRadius: 6,
              border: '2px solid #0ea5e9',
              boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              transform: 'translate(-50%, 0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              top: 0
            }}
            title="인 효과 시작점"
            draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', 'in');
            }}
            onDrag={e => {
              if (e.clientX === 0) return;
              const bar = e.target.parentElement;
              const rect = bar.getBoundingClientRect();
              const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
              const newStart = Math.round(percent * (object.timing?.duration || 5) * 100) / 100;
              // 인 핸들은 아웃 핸들보다 뒤로 못감
              if (newStart >= (object.timing?.endTime || (object.timing?.duration || 5))) return;
              onUpdateObjectProperty(object.id, 'timing', { ...object.timing, startTime: newStart });
            }}
          />
          {/* 아웃 효과 핸들 */}
          <div
            style={{
              position: 'absolute',
              left: `${((object.timing?.endTime || (object.timing?.duration || 5)) / (object.timing?.duration || 5)) * 100}%`,
              zIndex: 2,
              cursor: 'ew-resize',
              width: 20,
              height: 20,
              background: '#f472b6',
              borderRadius: 6,
              border: '2px solid #be185d',
              boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              transform: 'translate(-50%, 0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              top: 0
            }}
            title="아웃 효과 시작점"
            draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', 'out');
            }}
            onDrag={e => {
              if (e.clientX === 0) return;
              const bar = e.target.parentElement;
              const rect = bar.getBoundingClientRect();
              const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
              const newEnd = Math.round(percent * (object.timing?.duration || 5) * 100) / 100;
              // 아웃 핸들은 인 핸들보다 앞으로 못감
              if (newEnd <= (object.timing?.startTime || 0)) return;
              onUpdateObjectProperty(object.id, 'timing', { ...object.timing, endTime: newEnd });
            }}
          />
        </div>
        <div className="absolute left-0 top-0 h-full w-1/3 bg-indigo-500/70 rounded-sm"></div>
      </div>
    </div>
  );
}

export default function Timeline({ sceneObjects = [], selectedObjectId, selectedObjectIds = [], onSelectObject, onSelectObjects, onUpdateObjectProperty, isPlaying, setIsPlaying, currentTime, setCurrentTime, duration, setDuration, handleReorderObjects, selectedSceneId, canvasScale, setCanvasScale, projectName, apiBaseUrl, onAddObject, getServerBaseUrl }) {
  const [editingObjectId, setEditingObjectId] = useState(null);
  const [editText, setEditText] = useState('');
  const [expandedObjects, setExpandedObjects] = React.useState(new Set());
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStartY, setDragStartY] = React.useState(0);
  const [dragStartTime, setDragStartTime] = React.useState(0);
  const timelineRef = React.useRef(null);
  const scrollContainerRef = React.useRef(null);
  const objectRefs = React.useRef({});
  const animationRef = React.useRef(null);
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline' | 'library-image' | 'library-sequence'

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    const activeObj = sceneObjects.find(obj => obj.id === active.id);
    const overObj = sceneObjects.find(obj => obj.id === over?.id);
    if (activeObj?.locked || overObj?.locked) return; // 잠금 객체는 드래그 불가
    if (over && active.id !== over.id) {
      const oldIndex = sceneObjects.findIndex(obj => obj.id === active.id);
      const newIndex = sceneObjects.findIndex(obj => obj.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        if (handleReorderObjects && selectedSceneId != null) {
          handleReorderObjects(selectedSceneId, oldIndex, newIndex);
        } else {
          console.warn('Timeline: handleReorderObjects or selectedSceneId is not available.');
        }
      } else {
        console.warn('Timeline: Could not find dragged item indices.');
      }
    }
  }

  // 재생/일시정지 토글
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  // 시작으로 이동
  const goToStart = () => {
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // 끝으로 이동
  const goToEnd = () => {
    setCurrentTime(duration);
    setIsPlaying(false);
  };

  // 애니메이션 프레임 업데이트
  React.useEffect(() => {
    if (isPlaying) {
      const start = performance.now() - (currentTime * 1000);
      let frameId;
      const update = (now) => {
        const elapsed = (now - start) / 1000;
        if (elapsed >= duration) {
          setCurrentTime(duration);
          setIsPlaying(false);
          return;
        }
        setCurrentTime(elapsed);
        frameId = requestAnimationFrame(update);
      };
      frameId = requestAnimationFrame(update);
      return () => cancelAnimationFrame(frameId);
    }
  }, [isPlaying, duration]);

  // 시간 포맷팅 함수
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // 선택된 객체가 변경될 때 스크롤 조정
  React.useEffect(() => {
    if (selectedObjectId && objectRefs.current[selectedObjectId]) {
      const selectedElement = objectRefs.current[selectedObjectId];
      selectedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedObjectId]);

  const toggleObjectExpansion = (objectId) => {
    setExpandedObjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(objectId)) {
        newSet.delete(objectId);
      } else {
        newSet.add(objectId);
      }
      return newSet;
    });
  };

  const handleMouseDown = (e, objectId, startTime) => {
    if (e.button !== 0) return; // 좌클릭만 처리
    
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartTime(startTime);
    
    // 드래그 시작 시 객체 선택
    if (selectedObjectId !== objectId) {
      onSelectObject(objectId);
    }
  };

  // 씬이 로드될 때 타임라인을 아웃효과 시작지점으로 이동
  React.useEffect(() => {
    if (!sceneObjects || sceneObjects.length === 0) return;
    // 각 오브젝트의 아웃효과 시작점 계산
    const outStartTimes = sceneObjects.map(obj => {
      const timing = typeof obj.timing === 'string' ? JSON.parse(obj.timing) : (obj.timing || {});
      const outMotion = typeof obj.out_motion === 'string' ? JSON.parse(obj.out_motion) : (obj.out_motion || {});
      const endTime = timing.endTime ?? timing.duration ?? 5;
      const outDuration = outMotion.duration ?? 0;
      return endTime - outDuration;
    });
    // 가장 빠른 아웃효과 시작점으로 이동
    const minOutStart = Math.min(...outStartTimes);
    if (currentTime !== minOutStart && !isPlaying) {
      setCurrentTime(minOutStart);
    }
  }, [sceneObjects, isPlaying]);

  return (
    <div className="bg-gray-900 border-t border-gray-800 shadow-lg flex flex-col h-70 min-h-[280px] max-h-[280px] select-none">
      {/* 탭 UI */}
      <div className="flex items-center border-b border-gray-800 bg-gray-900">
        <button
          className={`px-4 py-2 text-sm font-semibold focus:outline-none transition-colors ${activeTab === 'timeline' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('timeline')}
        >
          타임라인
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold focus:outline-none transition-colors ${activeTab === 'library-image' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('library-image')}
        >
          이미지
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold focus:outline-none transition-colors ${activeTab === 'library-sequence' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('library-sequence')}
        >
          시퀀스이미지
        </button>
      </div>
      {/* 탭 컨텐츠 */}
      <div className={`flex-1 h-full ${activeTab === 'timeline' ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
        {activeTab === 'timeline' ? (
          <div className="h-70 bg-gray-800 border-t border-gray-700 text-gray-300 p-3 flex flex-col shadow-inner">
      {/* Timeline Controls */}
            <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <button 
            onClick={togglePlay}
                  className="p-1 rounded hover:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            title={isPlaying ? "일시정지" : "재생"}
          >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button 
            onClick={goToStart}
                  className="p-1 rounded hover:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            title="시작으로 이동"
          >
                  <SkipBack size={14} />
          </button>
          <button 
            onClick={goToEnd}
                  className="p-1 rounded hover:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            title="끝으로 이동"
          >
                  <SkipForward size={14} />
          </button>
                <span className="text-[0.65rem] text-gray-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
              <div className="flex items-center space-x-1">
                <button className="p-1 rounded hover:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500" title="Timeline Settings">
                  <Settings size={14} />
          </button>
          <input
            type="number"
            step="0.01"
            min="0.1"
            max="2"
            value={canvasScale}
            onChange={e => setCanvasScale(Number(e.target.value))}
                  className="w-14 px-1 py-0.5 rounded bg-gray-700 text-white text-[0.65rem] border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="캔버스 배율"
            style={{ marginLeft: 4 }}
          />
        </div>
      </div>

      {/* Timeline Tracks Area */}
            <div className="flex-1 bg-gray-700/30 rounded-md p-2 overflow-y-auto space-y-0.5" ref={scrollContainerRef}>
        {sceneObjects.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sceneObjects.map(obj => obj.id)} // Use stable IDs
              strategy={verticalListSortingStrategy}
            >
              {[...sceneObjects]
                .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
                .map(object => (
                  <SortableObjectItem
                    key={object.id}
                    id={object.id}
                    object={object}
                    selectedObjectId={selectedObjectId}
                    selectedObjectIds={selectedObjectIds}
                    editingObjectId={editingObjectId}
                    editText={editText}
                    setEditText={setEditText}
                    onSelectObject={onSelectObject}
                    onSelectObjects={onSelectObjects}
                    onUpdateObjectProperty={onUpdateObjectProperty}
                    setEditingObjectId={setEditingObjectId}
                    MotionSelectorComponent={MotionSelector} // Pass MotionSelector down
                  />
                ))}
            </SortableContext>
          </DndContext>
        ) : (
                <p className="text-[0.65rem] text-gray-500 italic text-center py-3">Select a scene to see its objects, or add objects to the current scene.</p>
              )}
            </div>
          </div>
        ) : (
          <LibraryPanel
            projectName={projectName}
            apiBaseUrl={apiBaseUrl}
            onAddObject={onAddObject}
            getServerBaseUrl={getServerBaseUrl}
            onClose={() => {}}
            initialTab={activeTab === 'library-sequence' ? 'sequence' : 'image'}
          />
        )}
      </div>
    </div>
  );
}

// Helper component for Motion Selection Dropdown (simplified)
const MotionSelector = ({ motionType, motionDirection, objectId, onUpdateObjectProperty }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const [currentSettings, setCurrentSettings] = React.useState(motionType || null);
  const containerRef = React.useRef(null);
  const [panelPos, setPanelPos] = React.useState({ left: 0, top: 0, width: 0 });
  const buttonRef = React.useRef();
  
  // motionType이 변경될 때 currentSettings 업데이트
  React.useEffect(() => {
    console.log('motionType changed:', motionType);
    if (motionType) {
      setCurrentSettings(motionType);
    }
  }, [motionType]);
  
  const motionCategories = {
    basic: {
      label: '기본 효과',
      icon: Star,
      effects: {
        none: { 
          label: '효과 없음', 
          icon: X,
          description: '효과를 적용하지 않습니다.'
        },
        fade: { 
          label: '페이드', 
          icon: Sun,
          description: '서서히 나타나거나 사라집니다.'
        }
      }
    },
    slide: {
      label: '슬라이드',
      icon: ArrowRight,
      effects: {
        slideUp: { 
          label: '위로 슬라이드', 
          icon: ArrowUp,
          description: '아래에서 위로 이동합니다.'
        },
        slideDown: { 
          label: '아래로 슬라이드', 
          icon: ArrowDown,
          description: '위에서 아래로 이동합니다.'
        },
        slideLeft: { 
          label: '왼쪽으로 슬라이드', 
          icon: ArrowLeftIcon,
          description: '오른쪽에서 왼쪽으로 이동합니다.'
        },
        slideRight: { 
          label: '오른쪽으로 슬라이드', 
          icon: ArrowRight,
          description: '왼쪽에서 오른쪽으로 이동합니다.'
        }
      }
    },
    transform: {
      label: '변형',
      icon: Maximize,
      effects: {
        scale: { 
          label: '확대/축소', 
          icon: Maximize,
          description: '크기가 커졌다가 원래대로 돌아옵니다.'
        },
        rotate: { 
          label: '회전', 
          icon: RotateCw,
          description: '한 바퀴 회전합니다.'
        }
      }
    },
    special: {
      label: '특수 효과',
      icon: Sparkles,
      effects: {
        bounce: { 
          label: '바운스', 
          icon: Activity,
          description: '튀어오르는 듯한 효과를 줍니다.'
        },
        elastic: { 
          label: '탄성', 
          icon: Waves,
          description: '고무줄처럼 늘어났다가 돌아옵니다.'
        }
      }
    }
  };

  const Icon = motionDirection === 'in' ? LogIn : LogOut;

  const handleApplySettings = () => {
    onUpdateObjectProperty(objectId, motionDirection === 'in' ? 'in_motion' : 'out_motion', currentSettings);
    setShowSettings(false);
    setIsOpen(false);
    setSelectedCategory(null);
  };

  const handleCloseSettings = () => {
    console.log('Closing settings without applying');
    setShowSettings(false);
    setIsOpen(false);
    setSelectedCategory(null);
  };

  const handleSelectMotion = (type) => {
    console.log('Selecting motion:', type);
    const effect = Object.values(motionCategories)
      .find(cat => type in cat.effects)
      ?.effects[type];
    
    if (effect) {
      const newSettings = {
        type,
        duration: 0.5,
        delay: 0,
        easing: 'ease',
        ...(type === 'scale' && { scale: 1.2 }),
        ...(type === 'rotate' && { angle: 360 }),
        ...(type === 'bounce' && { intensity: 0.3 }),
        ...(type === 'elastic' && { intensity: 0.5 })
      };
      
      console.log('Setting new settings:', newSettings);
      setCurrentSettings(newSettings);
      setShowSettings(true);
      setIsOpen(false);
    }
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  // 현재 적용된 효과의 라벨을 가져오는 함수
  const getCurrentEffectLabel = () => {
    console.log('Getting label for motionType:', motionType);
    if (!motionType) return '효과 없음';
    
    // motionType이 문자열인 경우 처리
    if (typeof motionType === 'string') {
      for (const category of Object.values(motionCategories)) {
        if (motionType in category.effects) {
          return category.effects[motionType].label;
        }
      }
      return '효과 없음';
    }
    
    // motionType이 객체인 경우 처리
    if (motionType.type) {
      for (const category of Object.values(motionCategories)) {
        if (motionType.type in category.effects) {
          return category.effects[motionType.type].label;
        }
      }
    }
    
    return '효과 없음';
  };

  // 외부 클릭 처리
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        if (showSettings) {
          handleApplySettings();
        } else if (isOpen && !selectedCategory) {
          setIsOpen(false);
          setSelectedCategory(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings, isOpen, currentSettings, selectedCategory]);

  const handleUpdateSettings = (newSettings) => {
    setCurrentSettings(newSettings);
  };

  // 버튼 클릭 시 위치 계산
  const handleOpen = () => {
    setIsOpen(true);
    setShowSettings(false);
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        left: rect.left,
        top: rect.top,
        width: rect.width,
      });
    }
  };

  // selectedCategory가 바뀔 때마다 위치 재계산
  React.useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        left: rect.left,
        top: rect.top,
        width: rect.width,
      });
    }
  }, [isOpen, selectedCategory]);

  // selectedCategory가 바뀔 때마다 패널이 반드시 열리도록 보장
  React.useEffect(() => {
    if (selectedCategory && !isOpen) {
      setIsOpen(true);
    }
  }, [selectedCategory]);

  // 패널 위치 계산 함수들
  const getCategoryPanelStyle = () => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top - 8,
      width: 256,
      transform: 'translateY(-100%)',
    };
  };
  const getEffectPanelStyle = () => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      left: rect.left + 256 + 8, // 카테고리 패널 오른쪽에 8px 띄움
      top: rect.top - 8,
      width: 256,
      transform: 'translateY(-100%)',
    };
  };
  const getSettingsPanelStyle = () => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      left: rect.left + 256 * 2 + 16, // 세부 효과 패널 오른쪽에 8px 더 띄움
      top: rect.top - 8,
      width: 256,
      transform: 'translateY(-100%)',
    };
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button 
        ref={buttonRef}
        onClick={handleOpen}
        className="w-full flex items-center justify-between text-[0.6rem] bg-gray-700 hover:bg-gray-600/70 px-1 py-0.5 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
      >
        <Icon size={10} className={`mr-1 ${motionDirection === 'in' ? 'text-green-400' : 'text-red-400'}`} />
        <span className="capitalize truncate flex-1 text-left">
          {getCurrentEffectLabel()}
        </span>
        <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', zIndex: 9999, left: buttonRef.current?.getBoundingClientRect().left, top: buttonRef.current?.getBoundingClientRect().top, transform: 'translateY(-100%)', display: 'flex', flexDirection: 'row' }}
          onMouseLeave={() => setSelectedCategory(null)}
        >
          <div
            className="w-64 bg-gray-700 border border-gray-600 rounded-md shadow-lg py-1 text-white"
            style={{ width: 256, minHeight: 256, maxHeight: 256, overflowY: 'auto' }}
          >
            {Object.entries(motionCategories).map(([category, { label, icon }]) => (
              <button 
                key={category}
                onMouseEnter={() => handleCategorySelect(category)}
                className="w-full text-left text-[0.7rem] px-2 py-1 hover:bg-indigo-600 hover:text-white transition-colors flex items-center"
              >
                <span className="mr-2">{motionCategories[category].icon && React.createElement(motionCategories[category].icon, { size: 16 })}</span>
                {label}
              </button>
            ))}
          </div>
          {selectedCategory && (
            <div
              className="w-64 bg-gray-700 border border-gray-600 rounded-md shadow-lg py-1 text-white"
              style={{ width: 256, minHeight: 256, maxHeight: 256, overflowY: 'auto', marginLeft: 8 }}
            >
              <button
                onClick={() => setSelectedCategory(null)}
                className="w-full text-left text-[0.7rem] px-2 py-1 hover:bg-indigo-600 hover:text-white transition-colors flex items-center border-b border-gray-600"
              >
                <ArrowLeft size={12} className="mr-2" />
                뒤로 가기
              </button>
              {Object.entries(motionCategories[selectedCategory].effects).map(([type, { label, icon, description }]) => (
                <button 
                  key={type}
                  onClick={() => handleSelectMotion(type)}
                  className="w-full text-left text-[0.7rem] px-2 py-1 hover:bg-indigo-600 hover:text-white transition-colors flex flex-col"
                >
                  <div className="flex items-center">
                    <span className="mr-2">{icon && React.createElement(icon, { size: 16 })}</span>
                    {label}
                  </div>
                  <span className="text-[0.65rem] text-gray-400 ml-6">{description}</span>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
      {showSettings && currentSettings && ReactDOM.createPortal(
        <div className="fixed z-[9999] w-64 bg-gray-700 border border-gray-600 rounded-md shadow-lg p-2" style={getSettingsPanelStyle()} onMouseDown={e => e.stopPropagation()}>
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[0.8rem] font-medium">
                {Object.values(motionCategories).find(cat => currentSettings.type in cat.effects)?.effects[currentSettings.type]?.label} 설정
              </h3>
              <div className="flex space-x-2">
                <button 
                  onClick={handleApplySettings}
                  className="text-[0.7rem] text-green-400 hover:text-green-300"
                >
                  적용
                </button>
                <button 
                  onClick={handleCloseSettings}
                  className="text-[0.7rem] text-gray-400 hover:text-white"
                >
                  닫기
                </button>
              </div>
            </div>
            <div>
              <label className="text-[0.7rem] text-gray-300">지속 시간 (초)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={currentSettings.duration || 0.5}
                onChange={(e) => handleUpdateSettings({ ...currentSettings, duration: parseFloat(e.target.value) })}
                className="w-full text-[0.7rem] bg-gray-600 border border-gray-500 rounded px-1 py-0.5"
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-gray-300">지연 시간 (초)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={currentSettings.delay || 0}
                onChange={(e) => handleUpdateSettings({ ...currentSettings, delay: parseFloat(e.target.value) })}
                className="w-full text-[0.7rem] bg-gray-600 border border-gray-500 rounded px-1 py-0.5"
              />
            </div>
            {currentSettings.type === 'scale' && (
              <div>
                <label className="text-[0.7rem] text-gray-300">크기 비율 (1.0 = 원래 크기)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={currentSettings.scale || 1.2}
                  onChange={(e) => handleUpdateSettings({ ...currentSettings, scale: parseFloat(e.target.value) })}
                  className="w-full text-[0.7rem] bg-gray-600 border border-gray-500 rounded px-1 py-0.5"
                />
              </div>
            )}
            {currentSettings.type === 'rotate' && (
              <div>
                <label className="text-[0.7rem] text-gray-300">회전 각도 (도)</label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  step="1"
                  value={currentSettings.angle || 360}
                  onChange={(e) => handleUpdateSettings({ ...currentSettings, angle: parseInt(e.target.value) })}
                  className="w-full text-[0.7rem] bg-gray-600 border border-gray-500 rounded px-1 py-0.5"
                />
              </div>
            )}
            {(currentSettings.type === 'bounce' || currentSettings.type === 'elastic') && (
              <div>
                <label className="text-[0.7rem] text-gray-300">효과 강도 (0.1 = 약함, 1.0 = 강함)</label>
                <input
                  type="number"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={currentSettings.intensity || 0.5}
                  onChange={(e) => handleUpdateSettings({ ...currentSettings, intensity: parseFloat(e.target.value) })}
                  className="w-full text-[0.7rem] bg-gray-600 border border-gray-500 rounded px-1 py-0.5"
                />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
