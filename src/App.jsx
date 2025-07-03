import React, { useState, useCallback, useEffect, useRef } from "react";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import CanvasArea from "./components/layout/CanvasArea";
import Timeline from "./components/layout/Timeline";
import PropertiesPanel from "./components/layout/PropertiesPanel";
import ObjectAddPanel from "./components/layout/ObjectAddPanel";
import ProjectSelectionModal from "./components/modals/ProjectSelectionModal";
import LibraryPanel from "./components/layout/LibraryPanel";
import {
  getProject,
  createScene,
  updateScene,
  deleteScene,
  createObject, // 추가
  updateObject, // 추가
  deleteObject, // 추가
  updateObjectOrders, // 추가
  updateProject,
} from "./api/projects";

function App() {
  // Modal and Project State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(true);
  const [currentProjectName, setCurrentProjectName] = useState('');
  const [projectData, setProjectData] = useState(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('https://editonair-backend-production.up.railway.app/api');

  // Scene and Object State
  const [scenes, setScenes] = useState([]);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);
  const [canvasScale, setCanvasScale] = useState(0.54);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState({}); // { sceneId: boolean }
  const [isLoadingScene, setIsLoadingScene] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(10); // 기본 10초, 필요시 조정
  const [clipboard, setClipboard] = useState(null); // 복사된 객체(들) 저장
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryData, setLibraryData] = useState(null);
  const [pendingSelectObjectId, setPendingSelectObjectId] = useState(null);
  const [libraryPanelKey, setLibraryPanelKey] = useState(0);

  const selectedObjectIdRef = useRef(selectedObjectId);
  useEffect(() => { selectedObjectIdRef.current = selectedObjectId; }, [selectedObjectId]);

  // --- Project Loading ---
  useEffect(() => {
    if (currentProjectName) {
      const loadProjectData = async () => {
        setIsLoadingProject(true);
        setProjectLoadError(null);
        setProjectData(null);
        setScenes([]);
        setSelectedSceneId(null);
        setSelectedObjectId(null);

        try {
          const data = await getProject(apiBaseUrl, currentProjectName);
          setProjectData(data);
          const fetchedScenes = data.scenes || [];
          setScenes(
            fetchedScenes.map((s) => ({
              ...s,
              objects: Array.isArray(s.objects) ? s.objects : [],
            }))
          );
          if (fetchedScenes.length > 0) {
            setSelectedSceneId(fetchedScenes[0].id);
          }
        } catch (err) {
          console.error("Failed to load project:", err);
          setProjectLoadError(`Failed to load project: ${err.message}`);
        } finally {
          setIsLoadingProject(false);
        }
      };
      loadProjectData();
    }
  }, [currentProjectName, apiBaseUrl]);

  const handleProjectSelect = (project) => {
    if (!project || !project.name) {
      alert('프로젝트 정보가 올바르지 않습니다.');
      return;
    }
    const slug = slugify(project.name);
    setCurrentProjectName(slug);
    setIsProjectModalOpen(false);
    window.history.pushState({}, '', `/project/${slug}`);
  };

  const handleMoveObjectOrder = (objectId, direction) => {
    const sceneIndex = scenes.findIndex(s => s.id === selectedSceneId);
    if (sceneIndex === -1) return;

    const sceneToUpdate = scenes[sceneIndex];
    const currentObjects = [...sceneToUpdate.objects];
    const objectIndex = currentObjects.findIndex(obj => obj.id === objectId);
    if (objectIndex === -1) return;

    // Perform the swap
    let moved = false;
    if (direction === 'up' && objectIndex < currentObjects.length - 1) {
        [currentObjects[objectIndex], currentObjects[objectIndex + 1]] = [currentObjects[objectIndex + 1], currentObjects[objectIndex]];
        moved = true;
    } else if (direction === 'down' && objectIndex > 0) {
        [currentObjects[objectIndex], currentObjects[objectIndex - 1]] = [currentObjects[objectIndex - 1], currentObjects[objectIndex]];
        moved = true;
    }

    if (!moved) return; // No change was made

    // Create the final updated objects list with new order properties
    const updatedObjectsWithOrder = currentObjects.map((obj, index) => ({
        ...obj,
        order: index,
    }));

    // Create the new scene object
    const updatedScene = { ...sceneToUpdate, objects: updatedObjectsWithOrder };

    // Create the complete new scenes array for the state update
    const newScenes = [...scenes];
    newScenes[sceneIndex] = updatedScene;

    // 1. Update the UI state (Optimistic Update)
    setScenes(newScenes);

    // 2. Prepare data and call the backend API
    const objectOrders = updatedObjectsWithOrder.map(obj => ({ id: obj.id, order: obj.order }));
    updateObjectOrders(apiBaseUrl, selectedSceneId, objectOrders)
        .then(() => {
            console.log(`Object order for scene ${selectedSceneId} saved.`);
        })
        .catch(err => {
            console.error("Failed to save object order:", err);
            // Optional: Revert state to 'scenes' before the change
        });
  };

  const handleReorderObjects = (sceneIdToUpdate, sourceIndex, destinationIndex) => {
    let updatedSceneForAPI = null;
    setScenes(prevScenes => {
      const newScenes = prevScenes.map(scene => {
        if (scene.id === sceneIdToUpdate) {
          const currentObjects = scene.objects ? [...scene.objects] : [];
          const [removed] = currentObjects.splice(sourceIndex, 1);
          currentObjects.splice(destinationIndex, 0, removed);

          const updatedObjectsWithOrder = currentObjects.map((obj, index) => ({
            ...obj,
            order: index,
          }));
          
          updatedSceneForAPI = { ...scene, objects: updatedObjectsWithOrder };
          return updatedSceneForAPI;
        }
        return scene;
      });
      return newScenes;
    });

    if (updatedSceneForAPI) {
      // 백엔드에 객체 순서 저장
      const objectOrders = updatedSceneForAPI.objects.map(obj => ({ id: obj.id, order: obj.order }));
      updateObjectOrders(apiBaseUrl, sceneIdToUpdate, objectOrders)
        .then(() => {
          console.log("Objects reordered and saved to backend:", updatedSceneForAPI.objects);
        })
        .catch(err => {
          console.error("Failed to update object orders:", err);
          // TODO: 에러 처리 (예: 토스트 메시지 표시)
        });
    }
  };

  // --- Scene Handlers ---
  const handleSelectScene = async (sceneId) => {
    if (selectedSceneId && hasUnsavedChanges[selectedSceneId]) {
      const shouldDiscard = window.confirm(
        "저장되지 않은 변경사항이 있습니다. 계속하시겠습니까?"
      );
      if (!shouldDiscard) return;
    }

    setSelectedSceneId(sceneId);
    setSelectedObjectId(null);
    
    await loadSceneData(sceneId);
  };

  const handleAddScene = async () => {
    if (!currentProjectName) return;
    const newSceneName = `Scene ${scenes.length + 1}`;
    try {
      const newScene = await createScene(apiBaseUrl, currentProjectName, {
        name: newSceneName,
      });
      newScene.objects = Array.isArray(newScene.objects)
        ? newScene.objects
        : [];
      setScenes([...scenes, newScene]);
      setSelectedSceneId(newScene.id);
    } catch (err) {
      console.error("Failed to add scene:", err);
      // TODO: Show error toast to user
    }
  };

  const handleRenameScene = async (sceneId, newName) => {
    if (!newName.trim()) return; // Prevent renaming to empty string
    try {
      const updatedScene = await updateScene(apiBaseUrl, sceneId, { name: newName });
      setScenes(
        scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, name: updatedScene.name } : scene
        )
      );
    } catch (err) {
      console.error("Failed to rename scene:", err);
      // TODO: Show error toast to user
    }
  };

  const handleDeleteScene = async (sceneId) => {
    const sceneToDelete = scenes.find((s) => s.id === sceneId);
    if (!sceneToDelete) return;

    if (
      window.confirm(`Are you sure you want to delete "${sceneToDelete.name}"?`)
    ) {
      try {
        await deleteScene(apiBaseUrl, sceneId);
        const newScenes = scenes.filter((s) => s.id !== sceneId);
        setScenes(newScenes);

        if (selectedSceneId === sceneId) {
          setSelectedSceneId(newScenes[0]?.id || null);
        }
      } catch (err) {
        console.error("Failed to delete scene:", err);
        // TODO: Show error toast to user
      }
    }
  };

  // --- Object Handlers (Backend Synced) ---
  const handleSelectObject = (objectId) => {
    setSelectedObjectIdAndRef(objectId);
    setSelectedObjectIds(objectId ? [objectId] : []);
  };

  const handleSelectObjects = (objectId) => {
    setSelectedObjectIds(prev => {
      if (prev.includes(objectId)) {
        // 이미 선택된 경우 해제
        const newArr = prev.filter(id => id !== objectId);
        setSelectedObjectIdAndRef(newArr.length === 1 ? newArr[0] : null);
        return newArr;
      } else {
        // 추가 선택
        setSelectedObjectIdAndRef(objectId);
        return [...prev, objectId];
      }
    });
  };

  const handleAddObject = async (typeOrObject) => {
    if (!selectedSceneId) {
      alert("Please select a scene first to add an object.");
      return;
    }

    // 항상 최신 선택 상태를 기준으로 분기
    const currentSelectedObjectId = selectedObjectIdRef.current;
    if (currentSelectedObjectId && typeof typeOrObject === 'object' && typeOrObject !== null) {
      const scene = scenes.find(s => s.id === selectedSceneId);
      const obj = scene?.objects.find(o => o.id === currentSelectedObjectId);
      if (obj && obj.type === 'image') {
        // 이미지 URL과 name 모두 교체 (위치/크기 등은 유지)
        // 기존 properties 전체를 복사하고 src만 교체
        const updatedProps = {
          ...obj.properties,
          src: typeOrObject.properties.src
        };
        await handleUpdateObjectProperty(obj.id, 'properties', updatedProps);
        // name도 함께 변경
        await handleUpdateObjectProperty(obj.id, 'name', typeOrObject.name);
        // 서버 저장 후 최신 씬 데이터로 동기화
        const response = await fetch(`${apiBaseUrl}/scenes/${selectedSceneId}`);
        if (response.ok) {
          const updatedScene = await response.json();
          // src만큼은 최신값으로 강제 덮어쓰기 (깜빡임 방지)
          const fixedObjects = updatedScene.objects.map(o =>
            o.id === obj.id
              ? { ...o, properties: { ...o.properties, src: updatedProps.src } }
              : o
          );
          setScenes(prevScenes =>
            prevScenes.map(scene =>
              scene.id === selectedSceneId
                ? { ...updatedScene, objects: fixedObjects }
                : scene
            )
          );
        }
        setSelectedObjectId(null);
        setSelectedObjectIds([]);
        // 라이브러리 패널이 열려 있으면 완전히 초기화(remount)
        if (isLibraryOpen) {
          setIsLibraryOpen(false);
          setTimeout(() => {
            setLibraryPanelKey(prev => prev + 1);
            setIsLibraryOpen(true);
            setLibraryData(prev => ({ ...prev })); // 필요시 libraryData 복원
          }, 100);
        }
        return;
      }
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      return;
    }

    // 2. 선택된 객체가 없을 때만 새 객체 추가
    let newObjectData = null;
    if (typeof typeOrObject === 'object' && typeOrObject !== null) {
      newObjectData = typeOrObject;
      if (typeof newObjectData.order === 'undefined') {
        const selectedScene = scenes.find((s) => s.id === selectedSceneId);
        newObjectData.order = selectedScene?.objects?.length || 0;
      }
      if (!newObjectData.in_motion) {
        newObjectData.in_motion = { type: 'none', duration: 1, delay: 0, easing: 'ease' };
      }
      if (!newObjectData.out_motion) {
        newObjectData.out_motion = { type: 'none', duration: 1, delay: 0, easing: 'ease' };
      }
      if (!newObjectData.timing) {
        newObjectData.timing = { startTime: 0, endTime: 10, duration: 10 };
      }
    } else {
      // 기존 type(string) 처리 로직
      const type = typeOrObject;
      if (type === 'text') {
        newObjectData = {
          name: 'New Text',
          type: 'text',
          properties: {
            content: 'New Text',
            fontSize: 48,
            color: '#FFFFFF',
            fontFamily: 'Arial',
            fontWeight: 'bold',
            textAlign: 'center',
            x: 50,
            y: 100,
            width: 200,
            height: 60,
            useTextBackground: false,
            textBackgroundColor: '#000000',
            textBackgroundPadding: 8,
            textBackgroundBorderRadius: 0,
          }
        };
      } else if (type === 'timer') {
        newObjectData = {
          name: 'New Timer',
          type: 'timer',
          properties: {
            // 텍스트 속성
            content: '00:00',
            fontSize: 48,
            color: '#FFFFFF',
            fontFamily: 'Arial',
            fontWeight: 'bold',
            textAlign: 'center',
            x: 50,
            y: 100,
            width: 200,
            height: 60,
            // 타이머 전용 속성
            duration: 300,
            mode: 'countdown',
            timeFormat: 'MM:SS',
            isRunning: false,
            startTime: null,
            endTime: null,
          }
        };
      } else {
        newObjectData = {
          name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
          type: type,
          properties:
            type === "text" ? {
              content: "New Text",
              fontSize: "24px",
              color: "#FFFFFF",
              x: 50,
              y: 50,
              fontFamily: "Arial",
              width: 200,
              height: 29, // 기본 텍스트 높이 (24px * 1.2)
              textAlign: "left",
              useTextBackground: false,
              textBackgroundColor: "#000000",
              textBackgroundBorderRadius: 0,
              textBackgroundPadding: 5,
              textBorderWidth: 1,
              textBorderColor: "#FFFFFF"
            } : type === "image" ? {
              src: "https://via.placeholder.com/150",
              width: 150,
              height: 150,
              x: 50,
              y: 50,
            } : type === "shape" ? {
              width: 100,
              height: 100,
              x: 75,
              y: 75,
              shapeType: 'box',
              color: '#FF0000'
            } : {},
          order: selectedScene?.objects?.length || 0,
          // 기본 효과 설정 추가
          in_motion: {
            type: 'none',
            duration: 1,
            delay: 0,
            easing: 'ease'
          },
          out_motion: {
            type: 'none',
            duration: 1,
            delay: 0,
            easing: 'ease'
          },
          timing: {
            startTime: 0,
            endTime: 10,
            duration: 10
          }
        };
      }
    }

    try {
      const newObject = await createObject(apiBaseUrl, selectedSceneId, newObjectData);
      // 서버 저장 후 최신 씬 데이터로 동기화
      const response = await fetch(`${apiBaseUrl}/scenes/${selectedSceneId}`);
      if (response.ok) {
        const updatedScene = await response.json();
        setScenes(prevScenes => prevScenes.map(scene => scene.id === selectedSceneId ? updatedScene : scene));
        // 새로 추가된 객체를 자동 선택 (렌더링 후 보장)
        const addedObj = updatedScene.objects.find(o => o.id === newObject.id || o.name === newObject.name);
        if (addedObj) setPendingSelectObjectId(addedObj.id);
      } else {
        // 실패 시 기존 방식으로 추가
        setScenes(
          scenes.map((scene) =>
            scene.id === selectedSceneId
              ? { ...scene, objects: [...(scene.objects || []), newObject] }
              : scene
          )
        );
        setPendingSelectObjectId(newObject.id);
      }
      setSelectedObjectIds([]);
      // 라이브러리 패널이 열려 있으면 완전히 초기화(remount)
      if (isLibraryOpen) {
        setIsLibraryOpen(false);
        setTimeout(() => {
          setLibraryPanelKey(prev => prev + 1);
          setIsLibraryOpen(true);
          setLibraryData(prev => ({ ...prev })); // 필요시 libraryData 복원
        }, 100);
      }
    } catch (err) {
      console.error("Failed to add object:", err);
    }
  };

  const handleUpdateObjectProperty = async (
    objectId,
    propertyName,
    newValue
  ) => {
    let updatedObjectData = {};

    // 속성 이름 매핑
    const propertyMapping = {
      'outMotion': 'out_motion',
      'inMotion': 'in_motion'
    };

    const mappedPropertyName = propertyMapping[propertyName] || propertyName;

    const newScenes = scenes.map((scene) => {
      if (scene.id !== selectedSceneId) {
        return scene;
      }

      const newObjects = scene.objects.map((obj) => {
        if (obj.id === objectId) {
          // 로컬 상태 업데이트 시에도 매핑된 이름 사용
          const updatedObj = { ...obj, [mappedPropertyName]: newValue };
          updatedObjectData = { [mappedPropertyName]: newValue };
          return updatedObj;
        }
        return obj;
      });
      return { ...scene, objects: newObjects };
    });
    
    if (Object.keys(updatedObjectData).length === 0) {
      console.error("Update failed: object not found");
      return;
    }

    pushUndoState(); // 변경 직전에 undo 상태 저장
    setScenes(newScenes);
    setHasUnsavedChanges(prev => ({ ...prev, [selectedSceneId]: true }));

    // --- 추가: DB에 즉시 저장 ---
    try {
      console.log('Updating object:', objectId, 'with data:', updatedObjectData);
      console.log('Full request data:', { objectId, propertyName, newValue, mappedPropertyName, updatedObjectData });
      await updateObject(apiBaseUrl, objectId, updatedObjectData);
      // 서버 저장 후 최신 씬 데이터로 동기화
      const response = await fetch(`${apiBaseUrl}/scenes/${selectedSceneId}`);
      if (response.ok) {
        const updatedScene = await response.json();
        setScenes(prevScenes => prevScenes.map(scene => scene.id === selectedSceneId ? updatedScene : scene));
      }
    } catch (err) {
      console.error('DB 업데이트 실패:', err);
      // 에러 발생 시 이전 상태로 되돌리기
      setScenes(scenes);
    }
  };

  // Add new save scene handler
  const handleSaveScene = async (sceneId) => {
    const sceneToSave = scenes.find(s => s.id === sceneId);
    if (!sceneToSave) return;

    try {
      await updateScene(apiBaseUrl, sceneId, {
        name: sceneToSave.name,
        objects: sceneToSave.objects
      });
      
      setHasUnsavedChanges(prev => ({ ...prev, [sceneId]: false }));
    } catch (err) {
      console.error("Failed to save scene:", err);
      throw err;
    }
  };

  const handleDeleteObject = async (objectId) => {
    const objectToDelete = scenes
      .flatMap((s) => s.objects)
      .find((o) => o.id === objectId);
    if (!objectToDelete) return;

    if (
      window.confirm(
        `Are you sure you want to delete "${objectToDelete.name}"?`
      )
    ) {
      try {
        await deleteObject(apiBaseUrl, objectId);
        const newScenes = scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.filter((o) => o.id !== objectId),
        }));
        setScenes(newScenes);
        if (selectedObjectId === objectId) {
          setSelectedObjectId(null);
        }
      } catch (err) {
        console.error("Failed to delete object:", err);
        // TODO: Show error toast to user
      }
    }
  };

  // --- Keyboard Shortcuts ---
  // Utility for deep cloning objects
  const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    // Date objects need to be handled separately
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    // Arrays
    if (Array.isArray(obj)) {
      return obj.map(item => deepClone(item));
    }
    // Regular objects
    const clonedObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  };

  // 상태 변경 시 undoStack에 push (씬/객체 추가, 삭제, 수정 등 주요 변경 함수에 적용)
  const pushUndoState = useCallback(() => {
    setUndoStack(prev => [
      {
        scenes: deepClone(scenes),
        selectedSceneId,
        selectedObjectId
      },
      ...prev
    ]);
    setRedoStack([]); // 새 변경이 일어나면 redoStack은 초기화
  }, [scenes, selectedSceneId, selectedObjectId, deepClone]);

  const handleKeyDown = useCallback(
    (event) => {
      const key = event.key.toLowerCase(); // CapsLock 대응
      // Undo (Ctrl+Z)
      if (event.ctrlKey && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (undoStack.length > 0) {
          const prevState = undoStack[0];
          setRedoStack(r => [{ scenes: deepClone(scenes), selectedSceneId, selectedObjectId }, ...r]);
          setScenes(prevState.scenes);
          setSelectedSceneId(prevState.selectedSceneId);
          setSelectedObjectId(prevState.selectedObjectId);
          setUndoStack(undoStack.slice(1));
        }
        return;
      }
      // Redo (Ctrl+Shift+Z or Ctrl+Y)
      if ((event.ctrlKey && key === 'y') || (event.ctrlKey && key === 'z' && event.shiftKey)) {
        event.preventDefault();
        if (redoStack.length > 0) {
          const nextState = redoStack[0];
          setUndoStack(u => [{ scenes: deepClone(scenes), selectedSceneId, selectedObjectId }, ...u]);
          setScenes(nextState.scenes);
          setSelectedSceneId(nextState.selectedSceneId);
          setSelectedObjectId(nextState.selectedObjectId);
          setRedoStack(redoStack.slice(1));
        }
        return;
      }
      // Delete
      if (key === "delete" || key === "backspace") {
        if (
          document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA"
        ) {
          return; // Don't delete if user is typing in an input
        }
        event.preventDefault();
        if (selectedObjectId) {
          pushUndoState();
          handleDeleteObject(selectedObjectId);
        } else if (selectedSceneId) {
          pushUndoState();
          handleDeleteScene(selectedSceneId);
        }
      }
      // === 사용자 지정 단축키 ===
      // Alt+C: 선택 오브젝트를 캔버스 중앙으로 이동
      if (event.altKey && key === 'c') {
        if (selectedObjectIds && selectedObjectIds.length > 1 && selectedSceneId) {
          // 복수 선택일 때: 전체 영역의 중앙으로 이동
          const selectedObjects = scenes.find(s => s.id === selectedSceneId)?.objects.filter(o => selectedObjectIds.includes(o.id)) || [];
          if (selectedObjects.length > 0) {
            const left = Math.min(...selectedObjects.map(obj => obj.properties.x));
            const right = Math.max(...selectedObjects.map(obj => obj.properties.x + (obj.properties.width || 200)));
            const top = Math.min(...selectedObjects.map(obj => obj.properties.y));
            const bottom = Math.max(...selectedObjects.map(obj => obj.properties.y + (obj.properties.height || 100)));
            
            const groupWidth = right - left;
            const groupHeight = bottom - top;
            const centerX = Math.round((1920 - groupWidth) / 2);
            const centerY = Math.round((1080 - groupHeight) / 2);
            
            const updates = selectedObjects.map(obj => ({
              id: obj.id,
              props: {
                ...obj.properties,
                x: centerX + (obj.properties.x - left),
                y: centerY + (obj.properties.y - top)
              }
            }));
            handleBatchUpdateObjectProperties(updates);
          }
        } else if (selectedObjectIds && selectedObjectIds.length === 1 && selectedSceneId) {
          // 단일 선택일 때: 기존 동작 (화면 중앙으로 이동)
          const selectedObjectId = selectedObjectIds[0];
          const scene = scenes.find(s => s.id === selectedSceneId);
          const obj = scene?.objects.find(o => o.id === selectedObjectId);
          if (obj) {
            const width = obj.properties?.width || 200;
            const height = obj.properties?.height || 100;
            const newX = Math.round((1920 - width) / 2);
            const newY = Math.round((1080 - height) / 2);
            handleUpdateObjectProperty(selectedObjectId, 'properties', {
              ...obj.properties,
              x: newX,
              y: newY,
            });
          }
        }
      }
      // Alt+H: 선택 오브젝트의 X값만 중앙으로 이동 (Y 위치 유지)
      if (event.altKey && key === 'h') {
        if (selectedObjectIds && selectedObjectIds.length > 1 && selectedSceneId) {
          // 복수 선택일 때: 전체 영역의 X값만 중앙으로 이동
          const selectedObjects = scenes.find(s => s.id === selectedSceneId)?.objects.filter(o => selectedObjectIds.includes(o.id)) || [];
          if (selectedObjects.length > 0) {
            const left = Math.min(...selectedObjects.map(obj => obj.properties.x));
            const right = Math.max(...selectedObjects.map(obj => obj.properties.x + (obj.properties.width || 200)));
            const groupWidth = right - left;
            const centerX = Math.round((1920 - groupWidth) / 2);
            
            const updates = selectedObjects.map(obj => ({
              id: obj.id,
              props: {
                ...obj.properties,
                x: centerX + (obj.properties.x - left)
              }
            }));
            handleBatchUpdateObjectProperties(updates);
          }
        } else if (selectedObjectIds && selectedObjectIds.length === 1 && selectedSceneId) {
          // 단일 선택일 때: 기존 동작 (X값만 중앙으로 이동)
          const selectedObjectId = selectedObjectIds[0];
          const scene = scenes.find(s => s.id === selectedSceneId);
          const obj = scene?.objects.find(o => o.id === selectedObjectId);
          if (obj) {
            const width = obj.properties?.width || 200;
            const newX = Math.round((1920 - width) / 2);
            handleUpdateObjectProperty(selectedObjectId, 'properties', {
              ...obj.properties,
              x: newX,
            });
          }
        }
      }
      // Alt+D: 선택 오브젝트를 캔버스 하단 20px 위로 이동
      if (event.altKey && key === 'd') {
        event.preventDefault(); // 브라우저 기본 동작 방지 (크롬 주소창 포커스 등)
        if (selectedObjectIds && selectedObjectIds.length > 1 && selectedSceneId) {
          // 복수 선택일 때: 전체 영역의 하단 끝점을 기준으로 하단 20px 위로 이동
          const selectedObjects = scenes.find(s => s.id === selectedSceneId)?.objects.filter(o => selectedObjectIds.includes(o.id)) || [];
          if (selectedObjects.length > 0) {
            const top = Math.min(...selectedObjects.map(obj => obj.properties.y));
            const bottom = Math.max(...selectedObjects.map(obj => obj.properties.y + (obj.properties.height || 100)));
            const groupHeight = bottom - top;
            const newBottomY = Math.round(1080 - groupHeight - 20);
            
            const updates = selectedObjects.map(obj => ({
              id: obj.id,
              props: {
                ...obj.properties,
                y: newBottomY + (obj.properties.y - top)
              }
            }));
            handleBatchUpdateObjectProperties(updates);
          }
        } else if (selectedObjectIds && selectedObjectIds.length === 1 && selectedSceneId) {
          // 단일 선택일 때: 기존 동작 (하단 20px 위로 이동)
          const selectedObjectId = selectedObjectIds[0];
          const scene = scenes.find(s => s.id === selectedSceneId);
          const obj = scene?.objects.find(o => o.id === selectedObjectId);
          if (obj) {
            const height = obj.properties?.height || 100;
            const newY = Math.round(1080 - height - 20);
            handleUpdateObjectProperty(selectedObjectId, 'properties', {
              ...obj.properties,
              y: newY,
            });
          }
        }
      }
      // F5: 선택된 씬 송출(브라우저 새로고침 방지)
      if (event.key === 'F5') {
        event.preventDefault();
        if (selectedSceneId) {
          fetch(`${apiBaseUrl}/scenes/${selectedSceneId}/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).then(res => {
            if (!res.ok) alert('씬 송출 실패');
          }).catch(() => alert('씬 송출 에러'));
        }
        return;
      }
      // F9: 송출 중인 씬 아웃
      if (event.key === 'F9') {
        if (selectedSceneId) {
          fetch(`${apiBaseUrl}/scenes/${selectedSceneId}/out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).then(res => {
            if (!res.ok) alert('씬 아웃 실패');
          }).catch(() => alert('씬 아웃 에러'));
        }
      }
      // Ctrl+C for Copy
      if (event.ctrlKey && key === 'c') {
        if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
          return; // Don't interfere with text copying
        }
        event.preventDefault();
        if (selectedObjectId) {
          const scene = scenes.find(s => s.id === selectedSceneId);
          if (scene) {
            const objectToCopy = scene.objects.find(obj => obj.id === selectedObjectId);
            if (objectToCopy) {
              setClipboard(deepClone(objectToCopy));
              console.log('Object copied to clipboard:', objectToCopy);
            }
          }
        }
      }
      // Ctrl+V for Paste
      if (event.ctrlKey && key === 'v') {
        if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
          return; // Don't interfere with text pasting
        }
        event.preventDefault();
        if (clipboard && selectedSceneId) {
          const scene = scenes.find(s => s.id === selectedSceneId);
          if (scene) {
            const objectToPaste = deepClone(clipboard);
            delete objectToPaste.id;
            objectToPaste.properties.x = (objectToPaste.properties.x || 0) + 10;
            objectToPaste.properties.y = (objectToPaste.properties.y || 0) + 10;
            objectToPaste.order = scene.objects?.length || 0;
            (async () => {
              try {
                pushUndoState();
                const newObject = await createObject(apiBaseUrl, selectedSceneId, objectToPaste);
                setScenes(prevScenes =>
                  prevScenes.map(s =>
                    s.id === selectedSceneId
                      ? { ...s, objects: [...(s.objects || []), newObject] }
                      : s
                  )
                );
                setSelectedObjectId(newObject.id);
                setSelectedObjectIds([]);
                setClipboard(null);
                console.log('Object pasted:', newObject);
              } catch (err) {
                console.error('Failed to paste object:', err);
              }
            })();
          }
        }
      }
      // Ctrl+S for Save Scene
      if (event.ctrlKey && key === 's') {
        if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
          return; // Don't interfere with text saving in inputs
        }
        event.preventDefault(); // 브라우저 기본 저장 동작 방지
        if (selectedSceneId) {
          handleSaveScene(selectedSceneId);
        }
      }
      // F4: 라이브러리 패널 토글
      if (event.key === 'F4') {
        event.preventDefault();
        if (isLibraryOpen) {
          handleToggleLibrary(null);
        } else {
          handleToggleLibrary({
            projectName: currentProjectName,
            apiBaseUrl,
            onAddObject: handleAddObject,
            getServerBaseUrl: (() => {
              if (apiBaseUrl) {
                return apiBaseUrl.replace('/api', '');
              }
              return 'https://editonair-backend-production.up.railway.app';
            })()
          });
        }
        return;
      }
      // PageUp/PageDown: 씬 이동 (항상 적용)
      if (key === 'pagedown' || key === 'pageup') {
        event.preventDefault();
        if (scenes.length > 0 && selectedSceneId) {
          const idx = scenes.findIndex(s => s.id === selectedSceneId);
          if (key === 'pagedown' && idx < scenes.length - 1) {
            setSelectedSceneId(scenes[idx + 1].id);
          } else if (key === 'pageup' && idx > 0) {
            setSelectedSceneId(scenes[idx - 1].id);
          }
        } else if (scenes.length > 0 && !selectedSceneId) {
          setSelectedSceneId(scenes[0].id);
        }
        return;
      }
    },
    [selectedSceneId, selectedObjectId, scenes, clipboard, deepClone, undoStack, redoStack, pushUndoState, handleUpdateObjectProperty, isLibraryOpen, currentProjectName, apiBaseUrl, handleAddObject]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // --- Derived State for Rendering ---
  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const selectedSceneObjects = selectedScene?.objects || [];
  const selectedObject = selectedSceneObjects.find(
    (obj) => obj.id === selectedObjectId
  );

  // 씬 데이터 로드 함수
  const loadSceneData = async (sceneId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}`);
      if (!response.ok) {
        throw new Error('Failed to load scene');
      }
      const data = await response.json();
      setScenes(prevScenes => 
        prevScenes.map(scene => 
          scene.id === sceneId ? data : scene
        )
      );
      
      setHasUnsavedChanges(prev => ({ ...prev, [sceneId]: false }));
    } catch (error) {
      console.error('Failed to load scene:', error);
      // TODO: 에러 처리 UI 추가
    }
  };

  // 여러 객체의 properties를 한 번에 업데이트
  const handleBatchUpdateObjectProperties = (updates) => {
    if (!selectedSceneId) return;
    // 1. scenes의 복사본 생성
    const newScenes = scenes.map(scene => {
      if (scene.id !== selectedSceneId) return scene;
      const newObjects = scene.objects.map(obj => {
        const update = updates.find(u => u.id === obj.id);
        if (update) {
          return { ...obj, properties: { ...obj.properties, ...update.props } };
        }
        return obj;
      });
      return { ...scene, objects: newObjects };
    });
    pushUndoState();
    setScenes(newScenes);
    setHasUnsavedChanges(prev => ({ ...prev, [selectedSceneId]: true }));
    // 서버에도 저장
    updates.forEach(({ id, props }) => {
      updateObject(apiBaseUrl, id, { properties: props });
    });
  };

  const handleAlignObjects = (type) => {
    if (!selectedObjectIds || selectedObjectIds.length < 2) return;
    // 1. 현재 선택된 객체의 위치값을 임시로 저장
    const selectedObjs = selectedSceneObjects.filter(obj => selectedObjectIds.includes(obj.id));
    if (selectedObjs.length < 2) return;
    // 객체별 {id, x, y, width, height} 배열 생성
    const positions = selectedObjs.map(obj => ({
      id: obj.id,
      x: obj.properties.x || 0,
      y: obj.properties.y || 0,
      width: obj.properties.width || 0,
      height: obj.properties.height || 0,
    }));
    // 2. 정렬 계산
    let newPositions = [];
    if (type === 'left') {
      const baseX = positions[0].x;
      newPositions = positions.map(pos => ({ ...pos, x: baseX }));
    } else if (type === 'center') {
      const baseCenter = positions[0].x + positions[0].width / 2;
      newPositions = positions.map(pos => ({ ...pos, x: baseCenter - pos.width / 2 }));
    } else if (type === 'right') {
      const baseRight = positions[0].x + positions[0].width;
      newPositions = positions.map(pos => ({ ...pos, x: baseRight - pos.width }));
    } else if (type === 'top') {
      const baseY = positions[0].y;
      newPositions = positions.map(pos => ({ ...pos, y: baseY }));
    } else if (type === 'middle') {
      const baseCenter = positions[0].y + positions[0].height / 2;
      newPositions = positions.map(pos => ({ ...pos, y: baseCenter - pos.height / 2 }));
    } else if (type === 'bottom') {
      const baseBottom = positions[0].y + positions[0].height;
      newPositions = positions.map(pos => ({ ...pos, y: baseBottom - pos.height }));
    } else if (type === 'hspace' && positions.length > 2) {
      // 수평 간격 정렬: x 기준 정렬 후 균등 배치
      const sorted = [...positions].sort((a, b) => a.x - b.x);
      const left = sorted[0];
      const right = sorted[sorted.length - 1];
      const gap = (right.x - left.x) / (sorted.length - 1);
      newPositions = sorted.map((pos, i) => ({ ...pos, x: left.x + gap * i }));
      // 원래 순서대로 복원
      newPositions = positions.map(pos => newPositions.find(np => np.id === pos.id));
    } else if (type === 'vspace' && positions.length > 2) {
      // 수직 간격 정렬: y 기준 정렬 후 균등 배치
      const sorted = [...positions].sort((a, b) => a.y - b.y);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const gap = (bottom.y - top.y) / (sorted.length - 1);
      newPositions = sorted.map((pos, i) => ({ ...pos, y: top.y + gap * i }));
      // 원래 순서대로 복원
      newPositions = positions.map(pos => newPositions.find(np => np.id === pos.id));
    } else {
      // 지원하지 않는 타입이면 기존 위치 반환
      newPositions = positions;
    }
    // 3. 각 객체별로 위치값을 반환해서 일괄 업데이트
    const updates = newPositions.map(({ id, x, y }) => {
      const obj = selectedSceneObjects.find(o => o.id === id);
      if (!obj) return null;
      let newProps = { ...obj.properties };
      if (typeof x === 'number') newProps.x = x;
      if (typeof y === 'number') newProps.y = y;
      return { id, props: newProps };
    }).filter(Boolean);
    handleBatchUpdateObjectProperties(updates);
  };

  // 프로젝트명 slugify 함수
  function slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // 씬 순서 저장 함수
  const updateProjectOrder = async (newScenes) => {
    if (!currentProjectName) return;
    try {
      // scenes 배열 순서대로 order 값도 재설정
      const scenesForSave = newScenes.map((scene, idx) => ({
        ...scene,
        order: idx,
        // objects는 제거하지 않고 그대로 유지
      }));
      await updateProject(apiBaseUrl, currentProjectName, {
        name: projectData?.name || currentProjectName,
        scenes: scenesForSave,
      });
      setScenes(newScenes);
    } catch (err) {
      alert("씬 순서 저장 실패: " + err.message);
    }
  };

  // 라이브러리 팝업 토글 함수
  const handleToggleLibrary = (data) => {
    if (isLibraryOpen) {
      setIsLibraryOpen(false);
      setLibraryData(null);
    } else {
      setLibraryData(data);
      setIsLibraryOpen(true);
    }
  };

  // 라이브러리 팝업 이벤트 리스너
  useEffect(() => {
    const handleOpenLibrary = (event) => {
      setLibraryData(event.detail);
      setIsLibraryOpen(true);
    };

    window.addEventListener('openLibrary', handleOpenLibrary);
    return () => {
      window.removeEventListener('openLibrary', handleOpenLibrary);
    };
  }, []);

  // setSelectedObjectId와 ref를 항상 동기화하는 헬퍼
  const setSelectedObjectIdAndRef = (id) => {
    setSelectedObjectId(id);
    selectedObjectIdRef.current = id;
  };

  useEffect(() => {
    if (pendingSelectObjectId) {
      setSelectedObjectIdAndRef(pendingSelectObjectId);
      setPendingSelectObjectId(null);
    }
  }, [scenes, pendingSelectObjectId]);

  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        Loading Project...
      </div>
    );
  }

  if (projectLoadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-red-500">
        {projectLoadError}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white font-sans">
      <ProjectSelectionModal
        isOpen={isProjectModalOpen}
        onProjectSelect={handleProjectSelect}
        onProjectCreate={handleProjectSelect}
        setApiBaseUrl={setApiBaseUrl}
      />
      <Header 
        project={projectData} 
        scenes={scenes}
        setProject={setProjectData}
        setScenes={setScenes}
        apiBaseUrl={apiBaseUrl}
        setCurrentProjectName={setCurrentProjectName}
        getProject={getProject}
        currentProjectName={currentProjectName}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          scenes={scenes}
          selectedSceneId={selectedSceneId}
          setSelectedSceneId={setSelectedSceneId}
          updateProjectOrder={updateProjectOrder}
          onSelectScene={handleSelectScene}
          onAddScene={handleAddScene}
          onRenameScene={handleRenameScene}
          onDeleteScene={handleDeleteScene}
          onSaveScene={handleSaveScene}
          hasUnsavedChanges={hasUnsavedChanges}
          selectedObjectId={selectedObjectId}
          onSelectObject={setSelectedObjectId}
          onUpdateObjectProperty={handleUpdateObjectProperty}
          apiBaseUrl={apiBaseUrl}
        />
        <ObjectAddPanel
          onAddObject={handleAddObject}
          selectedSceneId={selectedSceneId}
          currentProjectId={null}
          projectName={currentProjectName}
          onAlignObjects={handleAlignObjects}
          canDistribute={selectedObjectIds.length > 2}
          selectedObject={selectedObject}
          onUpdateObjectProperty={handleUpdateObjectProperty}
          apiBaseUrl={apiBaseUrl}
          onToggleLibrary={handleToggleLibrary}
          isLibraryOpen={isLibraryOpen}
          libraryData={libraryData}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {isLoadingScene ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">씬 로딩 중...</div>
            </div>
          ) : (
            <CanvasArea
              selectedObject={selectedObject}
              selectedObjectIds={selectedObjectIds}
              onSelectObject={handleSelectObject}
              onSelectObjects={handleSelectObjects}
              key={selectedSceneId} // Force re-render on scene change
              objects={selectedSceneObjects}
              onUpdateObjectProperty={handleUpdateObjectProperty}
              canvasScale={canvasScale}
              onSetCanvasScale={setCanvasScale}
              currentTime={currentTime}
              isPlaying={isPlaying}
              projectName={currentProjectName}
              apiBaseUrl={apiBaseUrl}
              onAddObject={handleAddObject}
            />
          )}
          <Timeline
            sceneObjects={selectedSceneObjects}
            selectedObjectId={selectedObjectId}
            selectedObjectIds={selectedObjectIds}
            onSelectObject={handleSelectObject}
            onSelectObjects={handleSelectObjects}
            onUpdateObjectProperty={handleUpdateObjectProperty}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            duration={duration}
            setDuration={setDuration}
            handleReorderObjects={handleReorderObjects}
            selectedSceneId={selectedSceneId}
            canvasScale={canvasScale}
            setCanvasScale={setCanvasScale}
            projectName={currentProjectName}
            apiBaseUrl={apiBaseUrl}
            onAddObject={handleAddObject}
            getServerBaseUrl={() => apiBaseUrl.replace('/api', '')}
          />
        </div>
        <div className="relative">
          <PropertiesPanel
            selectedObject={selectedObject}
            onUpdateObjectProperty={handleUpdateObjectProperty}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
