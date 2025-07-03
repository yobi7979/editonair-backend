import React, { useState, useEffect } from 'react';
import { Film, PlusCircle, Trash2, FileEdit, Save, CheckCircle2, AlertCircle, Circle, Radio, LogOut, ClipboardCopy, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function Sidebar({ scenes, selectedSceneId, setSelectedSceneId, updateProjectOrder, onSelectScene, onAddScene, onRenameScene, onDeleteScene, onSaveScene, hasUnsavedChanges, selectedObjectId, onSelectObject, onUpdateObjectProperty, apiBaseUrl }) {
  const [editingSceneId, setEditingSceneId] = useState(null);
  const [editText, setEditText] = useState('');
  const [saveStatus, setSaveStatus] = useState({}); // { sceneId: 'saved' | 'saving' | 'error' }
  const [copiedUrl, setCopiedUrl] = useState('');
  const [pushedSceneId, setPushedSceneId] = useState(null);
  const [outSceneId, setOutSceneId] = useState(null);
  // === [임시] API 호출 콘솔 패널 ===
  const [apiLogs, setApiLogs] = useState([]); // 최근 20개 로그
  const addApiLog = (msg) => {
    setApiLogs((logs) => [...logs.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };
  // === [임시] API 호출 텍스트박스 ===
  const [apiInput, setApiInput] = useState('');
  const [apiMethod, setApiMethod] = useState('GET');
  const handleApiCall = async () => {
    if (!apiInput.trim()) return;
    const url = apiInput.trim();
    addApiLog(`[요청] ${apiMethod} ${url}`);
    try {
      const res = await fetch(url, { method: apiMethod });
      const text = await res.text();
      addApiLog(`[응답] ${res.status} ${url}`);
      addApiLog(`[본문] ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
    } catch (err) {
      addApiLog(`[에러] ${url} - ${err.message}`);
    }
  };

  const handleCopyLogs = () => {
    const logText = apiLogs.join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      addApiLog('--- 로그가 클립보드에 복사되었습니다 ---');
    });
  };

  const handleClearLogs = () => {
    setApiLogs([]);
  };

  const handleSaveScene = async (sceneId) => {
    setSaveStatus(prev => ({ ...prev, [sceneId]: 'saving' }));
    try {
      await onSaveScene(sceneId);
      setSaveStatus(prev => ({ ...prev, [sceneId]: 'saved' }));
      // 3초 후 저장 상태 메시지 제거
      setTimeout(() => {
        setSaveStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[sceneId];
          return newStatus;
        });
      }, 3000);
    } catch (error) {
      setSaveStatus(prev => ({ ...prev, [sceneId]: 'error' }));
      // 5초 후 에러 상태 메시지 제거
      setTimeout(() => {
        setSaveStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[sceneId];
          return newStatus;
        });
      }, 5000);
    }
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(''), 2000);
  };

  const handlePushScene = async (sceneId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        setPushedSceneId(sceneId);
        setTimeout(() => setPushedSceneId(null), 2000);
      } else {
        console.error('Failed to push scene');
      }
    } catch (error) {
      console.error('Error pushing scene:', error);
    }
  };

  const handleOutScene = async (sceneId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}/out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        setOutSceneId(sceneId);
        setTimeout(() => setOutSceneId(null), 2000);
      } else {
        console.error('Failed to out scene');
      }
    } catch (error) {
      console.error('Error out scene:', error);
    }
  };

  const getMainUrl = () => {
    const projectId = window.location.pathname.split('/')[2];
    if (!projectId) return '';
    return `${apiBaseUrl.replace(/\/api$/, '')}/overlay/project/${projectId}`;
  };

  const getSceneUrl = (sceneId) => {
    const projectId = window.location.pathname.split('/')[2];
    if (!projectId) return '';
    return `${apiBaseUrl.replace(/\/api$/, '')}/overlay/project/${projectId}/scene/${sceneId}`;
  };

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // 드래그앤드롭 종료 시 순서만 프론트에서 변경 + 저장
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = scenes.findIndex((scene) => scene.id === active.id);
      const newIndex = scenes.findIndex((scene) => scene.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newScenes = arrayMove(scenes, oldIndex, newIndex);
        setLocalScenes(newScenes);
        if (updateProjectOrder) updateProjectOrder(newScenes);
      }
    }
  };
  // 로컬 상태로만 순서 관리
  const [localScenes, setLocalScenes] = useState(scenes);
  // scenes prop이 바뀌면 동기화
  useEffect(() => {
    setLocalScenes(scenes);
  }, [scenes]);

  // 씬 리스트 키보드 이동 핸들러
  const handleKeyDown = (e) => {
    if (!localScenes.length) return;
    const idx = localScenes.findIndex(s => s.id === selectedSceneId);
    if (e.key === 'PageDown') {
      if (idx < localScenes.length - 1) setSelectedSceneId(localScenes[idx + 1].id);
    } else if (e.key === 'PageUp') {
      if (idx > 0) setSelectedSceneId(localScenes[idx - 1].id);
    }
  };

  // Sortable 씬 아이템
  function SortableSceneItem({ scene, children }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: scene.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 100 : 'auto',
      opacity: isDragging ? 0.8 : 1,
    };
    return (
      <div ref={setNodeRef} style={style}>
        {children({ attributes, listeners })}
      </div>
    );
  }

  return (
    <aside className="bg-gray-800 text-gray-300 w-72 p-4 flex flex-col shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Scenes</h2>
        <button
          onClick={onAddScene}
          title="Add New Scene"
          className="p-1.5 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <PlusCircle size={20} />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto space-y-1 pr-1 -mr-1_5"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {localScenes.map((scene) => (
              <SortableSceneItem key={scene.id} scene={scene}>
                {({ attributes, listeners }) => (
                <div
                  className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors \
                        ${scene.id === selectedSceneId 
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-gray-700/70'
                        }`}
          >
                    {/* 드래그 핸들 */}
                    <button 
                      {...attributes} 
                      {...listeners}
                      className="p-1 mr-2 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-200 focus:outline-none"
                      style={{ pointerEvents: 'auto', zIndex: 2 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical size={14} />
                    </button>
                    {/* 씬 이름 영역 - 더블클릭만 편집 진입 */}
                    <div 
                      className="flex items-center flex-1 select-none"
                      onClick={() => { if (editingSceneId !== scene.id) onSelectScene(scene.id); }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingSceneId(scene.id);
                        setEditText(scene.name);
                      }}
                      style={{ cursor: 'pointer', userSelect: 'none', zIndex: 1 }}
                    >
              <Film size={16} className="mr-2 flex-shrink-0" />
              {editingSceneId === scene.id ? (
                <input 
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => {
                    if (editText.trim()) onRenameScene(scene.id, editText);
                    setEditingSceneId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editText.trim()) onRenameScene(scene.id, editText);
                      setEditingSceneId(null);
                      e.preventDefault();
                    }
                    if (e.key === 'Escape') {
                      setEditingSceneId(null);
                    }
                  }}
                  className="bg-gray-600 text-white text-sm px-1 py-0.5 rounded-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                          onClick={(e) => e.stopPropagation()}
                />
              ) : (
                        <div 
                          className="flex items-center flex-1"
                        >
                  <span className="text-sm truncate" title={scene.name}>{scene.name}</span>
                  {hasUnsavedChanges[scene.id] && (
                    <Circle size={8} className="ml-2 text-yellow-500" />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center ml-auto pl-2 space-x-1">
              {/* Save Status Indicator */}
              {saveStatus[scene.id] && (
                <div className="flex items-center">
                  {saveStatus[scene.id] === 'saving' && (
                    <span className="text-xs text-gray-400">저장 중...</span>
                  )}
                  {saveStatus[scene.id] === 'saved' && (
                    <CheckCircle2 size={14} className="text-green-500" />
                  )}
                  {saveStatus[scene.id] === 'error' && (
                    <AlertCircle size={14} className="text-red-500" />
                  )}
                </div>
              )}
              {/* Push Scene Button */}
              <button 
                title="Push Scene to Main Output"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePushScene(scene.id);
                }}
                className={`p-1 rounded hover:bg-blue-500/80 text-gray-400 hover:text-white ${
                  pushedSceneId === scene.id ? 'text-green-500' : ''
                }`}
              >
                <Radio size={14} />
              </button>
              {/* Out Scene Button */}
              <button 
                title="Out Scene"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOutScene(scene.id);
                }}
                className={`p-1 rounded hover:bg-red-500/80 text-gray-400 hover:text-white ${
                  outSceneId === scene.id ? 'text-red-500' : ''
                }`}
              >
                <LogOut size={14} />
              </button>
              {/* Save Button */}
              <button 
                title="Save Scene"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveScene(scene.id);
                }}
                className={`p-1 rounded hover:bg-green-500/80 text-gray-400 hover:text-white ${
                  hasUnsavedChanges[scene.id] ? 'text-yellow-500' : ''
                }`}
              >
                <Save size={14} />
              </button>
              {/* Delete Button */}
              <button 
                title="Delete Scene"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to delete scene "${scene.name}"?`)) {
                    onDeleteScene(scene.id);
                  }
                }}
                className="p-1 rounded hover:bg-red-500/80 text-gray-400 hover:text-white"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
                )}
              </SortableSceneItem>
        ))}
          </SortableContext>
        </DndContext>
        {scenes.length === 0 && (
          <p className="text-xs text-gray-500 italic text-center py-4">No scenes yet. Click '+' to add.</p>
        )}
      </div>
      
      <div className="pt-2 border-t border-gray-700 space-y-2">
        <div className="text-xs text-gray-500">
          Total Scenes: {scenes.length}
        </div>
        
        {/* Main Output URL */}
        <div className="space-y-1">
          <div className="text-xs text-gray-400">메인 송출 URL:</div>
          <div className="flex items-center space-x-1">
            <input
              type="text"
              value={getMainUrl()}
              readOnly
              className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded focus:outline-none"
            />
            <button
              onClick={() => handleCopyUrl(getMainUrl())}
              className="p-1 rounded hover:bg-blue-500/80 text-gray-400 hover:text-white"
              title="Copy URL"
            >
              <FileEdit size={14} />
            </button>
          </div>
        </div>

        {/* Scene URL */}
        {selectedSceneId && (
          <div className="space-y-1">
            <div className="text-xs text-gray-400">오버레이 송출 URL:</div>
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={getSceneUrl(selectedSceneId)}
                readOnly
                className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded focus:outline-none"
              />
              <button
                onClick={() => handleCopyUrl(getSceneUrl(selectedSceneId))}
                className="p-1 rounded hover:bg-blue-500/80 text-gray-400 hover:text-white"
                title="Copy URL"
              >
                <FileEdit size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Copy Success Message */}
        {copiedUrl && (
          <div className="text-xs text-green-500 animate-fade-out">
            URL이 클립보드에 복사되었습니다
          </div>
        )}
        {/* === [임시] API 호출 콘솔 패널 (나중에 삭제 가능) === */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>API 호출 콘솔 (임시)</span>
            <div className="flex items-center space-x-1">
              <button
                onClick={handleCopyLogs}
                title="Copy Logs"
                className="p-1 rounded hover:bg-gray-700"
              >
                <ClipboardCopy size={12} />
              </button>
              <button
                onClick={handleClearLogs}
                title="Clear Logs"
                className="p-1 rounded hover:bg-gray-700"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div className="bg-black/70 rounded p-2 h-24 overflow-y-auto text-xs font-mono text-green-300">
            {apiLogs.length === 0
              ? <div className="text-gray-500">API 호출 내역이 없습니다.</div>
              : apiLogs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
          {/* === [임시] API 호출 텍스트박스 (나중에 삭제 가능) === */}
          <div className="flex items-center mt-2 space-x-1">
            <select value={apiMethod} onChange={e => setApiMethod(e.target.value)} className="bg-gray-700 text-xs text-white rounded px-1 py-0.5">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input
              type="text"
              value={apiInput}
              onChange={e => setApiInput(e.target.value)}
              placeholder="API 엔드포인트 URL 입력"
              className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter') handleApiCall(); }}
            />
            <button
              onClick={handleApiCall}
              className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >호출</button>
          </div>
          {/* === [임시] API 호출 텍스트박스 끝 === */}
        </div>
        {/* === [임시] API 호출 콘솔 패널 끝 === */}
      </div>
    </aside>
  );
}
