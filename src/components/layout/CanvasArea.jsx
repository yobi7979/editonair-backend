import React, { useState, useRef, useEffect, useCallback } from "react";

const VIRTUAL_CANVAS_WIDTH = 1920;
const VIRTUAL_CANVAS_HEIGHT = 1080;

// A simple component to render different object types for demonstration
const RenderedObject = ({
  object,
  isLocked,
  onSelectObject,
  onSelectObjects,
  isSelected,
  onUpdateObjectProperty,
  canvasRef,
  canvasScale = 0.6,
  currentTime = 0,
  getMotionStyle,
  isPlaying = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [editText, setEditText] = useState(object.properties?.content || '');
  const editInputRef = useRef(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const objectInitialPosRef = useRef({ x: 0, y: 0 });
  const resizeStartMousePosRef = useRef({ x: 0, y: 0 });
  const objectInitialMetricsRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const resizeHandleRef = useRef("");
  const objectRef = useRef(null);
  const dragDirectionRef = useRef(null); // 드래그 방향 저장 ('horizontal' 또는 'vertical')
  const animationFrameRef = useRef(null);
  // 리사이즈 중 임시 크기 상태
  const [tempSize, setTempSize] = useState(null);
  const [tempPosition, setTempPosition] = useState(null);
  // 회전 관련 상태
  const [tempRotation, setTempRotation] = useState(null);
  const rotationStartAngleRef = useRef(0);
  const objectCenterRef = useRef({ x: 0, y: 0 });

  const getScale = () => {
    return {
      scaleX: canvasScale,
      scaleY: canvasScale
    };
  };

  // JSON 파싱 시 기본값 설정
  const timing = typeof object.timing === 'string' ? JSON.parse(object.timing) : (object.timing || {});
  const inMotion = typeof object.in_motion === 'string' ? JSON.parse(object.in_motion) : (object.in_motion || {});
  const outMotion = typeof object.out_motion === 'string' ? JSON.parse(object.out_motion) : (object.out_motion || {});

  // 현재 시간에 따른 효과 적용 여부 확인
  const isVisible = currentTime >= (timing.startTime || 0) && 
                   currentTime <= (timing.endTime || 10);

  const shouldApplyInEffect = currentTime >= (timing.startTime || 0) && 
                            currentTime <= ((timing.startTime || 0) + (inMotion.duration || 1));
  
  const shouldApplyOutEffect = currentTime >= ((timing.endTime || 10) - (outMotion.duration || 1)) && 
                             currentTime <= (timing.endTime || 10);

  // 효과 스타일 계산
  const effectStyle = {
    ...(shouldApplyInEffect && getMotionStyle(inMotion, true)),
    ...(shouldApplyOutEffect && getMotionStyle(outMotion, false))
  };

  // 객체 스타일 계산
  const objectStyle = {
    position: 'absolute',
    left: `${object.properties?.x || 0}px`,
    top: `${object.properties?.y || 0}px`,
    width: `${object.properties?.width || 200}px`,
    height: `${object.properties?.height || 100}px`,
    transform: `rotate(${object.properties?.rotation || 0}deg)`,
    transformOrigin: 'center center',
    ...object.properties,
    ...effectStyle,
    ...(isSelected && {
      outline: '2px solid #3b82f6',
      boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.3)',
    })
  };

  // 리사이즈 중인 도형의 경우 임시 위치와 크기 적용
  if (isResizing && object.type === 'shape' && tempSize) {
    objectStyle.width = `${tempSize.width}px`;
    objectStyle.height = `${tempSize.height}px`;
  }
  if (isResizing && object.type === 'shape' && tempPosition) {
    objectStyle.left = `${tempPosition.x}px`;
    objectStyle.top = `${tempPosition.y}px`;
  }
  
  // 회전 중인 경우 임시 회전 적용
  if (isRotating && tempRotation !== null) {
    objectStyle.transform = `rotate(${tempRotation}deg)`;
  }

  const handleMouseDown = (e) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragDirectionRef.current = null;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    dragStartPosRef.current = {
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top,
    };
    objectInitialPosRef.current = {
      x: object.properties?.x || 0,
      y: object.properties?.y || 0,
    };
  };

  const handleResizeStart = (e, handle) => {
    e.stopPropagation();
    e.preventDefault();

    setIsResizing(true);
    resizeHandleRef.current = handle;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    resizeStartMousePosRef.current = {
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top,
    };

    objectInitialMetricsRef.current = {
      x: object.properties?.x || 0,
      y: object.properties?.y || 0,
      width: object.properties?.width || 200,
      height: object.properties?.height || 100,
    };

    // 임시 크기와 위치 초기화
    setTempSize(null);
    setTempPosition(null);
  };

  const handleRotateStart = (e) => {
    e.stopPropagation();
    e.preventDefault();

    console.log('회전 시작');
    setIsRotating(true);

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    // 객체의 중심점 계산
    const objectX = object.properties?.x || 0;
    const objectY = object.properties?.y || 0;
    const objectWidth = object.properties?.width || 200;
    const objectHeight = object.properties?.height || 100;

    objectCenterRef.current = {
      x: objectX + objectWidth / 2,
      y: objectY + objectHeight / 2,
    };

    // 마우스 위치를 캔버스 좌표로 변환
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;

    // 캔버스 스케일을 고려하여 마우스 위치를 가상 좌표로 변환
    const { scaleX, scaleY } = getScale();
    const virtualMouseX = mouseX / scaleX;
    const virtualMouseY = mouseY / scaleY;

    // 현재 회전 각도 계산
    const currentRotation = object.properties?.rotation || 0;
    
    // 마우스와 객체 중심점 사이의 각도 계산
    const deltaX = virtualMouseX - objectCenterRef.current.x;
    const deltaY = virtualMouseY - objectCenterRef.current.y;
    const mouseAngle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    
    // 시작 각도 저장 (현재 회전 각도에서 마우스 각도를 빼면 0도가 됨)
    rotationStartAngleRef.current = mouseAngle - currentRotation;

    // 임시 회전 초기화
    setTempRotation(null);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging && !isResizing && !isRotating || !canvasRef.current) {
        console.log('마우스 이동 조건 불만족:', { isDragging, isResizing, isRotating, hasCanvas: !!canvasRef.current });
        return;
      }

      // 이전 애니메이션 프레임 취소
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // requestAnimationFrame을 사용하여 부드러운 업데이트
      animationFrameRef.current = requestAnimationFrame(() => {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const currentMouseX = e.clientX - canvasRect.left;
        const currentMouseY = e.clientY - canvasRect.top;

        if (isDragging) {
          const deltaX = currentMouseX - dragStartPosRef.current.x;
          const deltaY = currentMouseY - dragStartPosRef.current.y;

          const { scaleX, scaleY } = getScale();
          const virtualDeltaX = deltaX / scaleX;
          const virtualDeltaY = deltaY / scaleY;

          let newX = objectInitialPosRef.current.x + virtualDeltaX;
          let newY = objectInitialPosRef.current.y + virtualDeltaY;

          // Shift 키를 누른 상태에서는 직선 이동
          if (isShiftPressed) {
            const totalDistance = Math.sqrt(virtualDeltaX * virtualDeltaX + virtualDeltaY * virtualDeltaY);
            
            // 8px 이상 이동했을 때만 방향 결정 (더 엄격한 임계값)
            if (totalDistance > 8) {
              if (dragDirectionRef.current === null) {
                // 방향이 아직 결정되지 않았다면 결정 (30도 기준으로 더 엄격하게)
                const angle = Math.atan2(Math.abs(virtualDeltaY), Math.abs(virtualDeltaX)) * 180 / Math.PI;
                dragDirectionRef.current = angle < 30 ? 'horizontal' : 'vertical';
              }
              
              // 결정된 방향에 따라 이동 제한
              if (dragDirectionRef.current === 'horizontal') {
                newY = objectInitialPosRef.current.y;
              } else {
                newX = objectInitialPosRef.current.x;
              }
            }
          }

          if (objectRef.current) {
            objectRef.current.style.left = `${newX}px`;
            objectRef.current.style.top = `${newY}px`;
          }
        }

        if (isResizing) {
          const deltaX = currentMouseX - resizeStartMousePosRef.current.x;
          const deltaY = currentMouseY - resizeStartMousePosRef.current.y;

          const { scaleX, scaleY } = getScale();
          const virtualDeltaX = deltaX / scaleX;
          const virtualDeltaY = deltaY / scaleY;

          let newX = objectInitialMetricsRef.current.x;
          let newY = objectInitialMetricsRef.current.y;
          let newWidth = objectInitialMetricsRef.current.width;
          let newHeight = objectInitialMetricsRef.current.height;

          const handle = resizeHandleRef.current;

          if (handle.includes("e")) {
            newWidth = objectInitialMetricsRef.current.width + virtualDeltaX;
          }
          if (handle.includes("w")) {
            newWidth = objectInitialMetricsRef.current.width - virtualDeltaX;
            newX = objectInitialMetricsRef.current.x + virtualDeltaX;
          }
          if (handle.includes("s")) {
            newHeight = objectInitialMetricsRef.current.height + virtualDeltaY;
          }
          if (handle.includes("n")) {
            newHeight = objectInitialMetricsRef.current.height - virtualDeltaY;
            newY = objectInitialMetricsRef.current.y + virtualDeltaY;
          }

          // Shift 키를 누르면 비율 유지
          if (isShiftPressed) {
            const originalRatio = objectInitialMetricsRef.current.width / objectInitialMetricsRef.current.height;
            
            // 현재 변경된 방향에 따라 비율 계산
            if (handle.includes("e") || handle.includes("w")) {
              // 가로 변경이 주된 경우, 세로를 비율에 맞춰 조정
              newHeight = newWidth / originalRatio;
              if (handle.includes("n")) {
                newY = objectInitialMetricsRef.current.y + (objectInitialMetricsRef.current.height - newHeight);
              }
            } else if (handle.includes("s") || handle.includes("n")) {
              // 세로 변경이 주된 경우, 가로를 비율에 맞춰 조정
              newWidth = newHeight * originalRatio;
              if (handle.includes("w")) {
                newX = objectInitialMetricsRef.current.x + (objectInitialMetricsRef.current.width - newWidth);
              }
            }
          }

          const minSize = 10;
          if (newWidth < minSize) {
            if (handle.includes("w")) newX += newWidth - minSize;
            newWidth = minSize;
          }
          if (newHeight < minSize) {
            if (handle.includes("n")) newY += newHeight - minSize;
            newHeight = minSize;
          }

          newX = Math.round(newX);
          newY = Math.round(newY);
          newWidth = Math.round(newWidth);
          newHeight = Math.round(newHeight);

          // 도형의 경우 임시 크기와 위치 상태 업데이트
          if (object.type === 'shape') {
            setTempSize({ width: newWidth, height: newHeight });
            setTempPosition({ x: newX, y: newY });
          } else {
            // 이미지나 다른 타입의 경우 직접 스타일 수정
            if (objectRef.current) {
              objectRef.current.style.left = `${newX}px`;
              objectRef.current.style.top = `${newY}px`;
              objectRef.current.style.width = `${newWidth}px`;
              objectRef.current.style.height = `${newHeight}px`;
            }
          }
        }

        if (isRotating) {
          console.log('회전 처리 시작');
          const canvasRect = canvasRef.current.getBoundingClientRect();
          const mouseX = e.clientX - canvasRect.left;
          const mouseY = e.clientY - canvasRect.top;

          // 캔버스 스케일을 고려하여 마우스 위치를 가상 좌표로 변환
          const { scaleX, scaleY } = getScale();
          const virtualMouseX = mouseX / scaleX;
          const virtualMouseY = mouseY / scaleY;

          console.log('마우스 위치:', { mouseX, mouseY, virtualMouseX, virtualMouseY });
          console.log('객체 중심점:', objectCenterRef.current);

          // 마우스와 객체 중심점 사이의 각도 계산
          const deltaX = virtualMouseX - objectCenterRef.current.x;
          const deltaY = virtualMouseY - objectCenterRef.current.y;
          const mouseAngle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;

          console.log('각도 계산:', { deltaX, deltaY, mouseAngle, startAngle: rotationStartAngleRef.current });

          // 새로운 회전 각도 계산
          let newRotation = mouseAngle - rotationStartAngleRef.current;

          // Shift 키를 누르면 15도 단위로 스냅
          if (isShiftPressed) {
            newRotation = Math.round(newRotation / 15) * 15;
          }

          // 각도를 0-360 범위로 정규화
          newRotation = ((newRotation % 360) + 360) % 360;

          // 소수점 2자리로 제한
          newRotation = parseFloat(newRotation.toFixed(2));

          // 임시 회전 상태 업데이트
          console.log('최종 회전 각도:', newRotation);
          setTempRotation(newRotation);
        }
      });
    };

    const handleMouseUp = (e) => {
      if (!isDragging && !isResizing && !isRotating) return;

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      if (isDragging) {
        const finalMouseX = e.clientX - canvasRect.left;
        const finalMouseY = e.clientY - canvasRect.top;

        const deltaX = finalMouseX - dragStartPosRef.current.x;
        const deltaY = finalMouseY - dragStartPosRef.current.y;

        const { scaleX, scaleY } = getScale();
        const virtualDeltaX = deltaX / scaleX;
        const virtualDeltaY = deltaY / scaleY;

        let newX = objectInitialPosRef.current.x + virtualDeltaX;
        let newY = objectInitialPosRef.current.y + virtualDeltaY;

        // Shift 키를 누른 상태에서는 직선 이동
        if (isShiftPressed) {
          const totalDistance = Math.sqrt(virtualDeltaX * virtualDeltaX + virtualDeltaY * virtualDeltaY);
          
          // 8px 이상 이동했을 때만 방향 결정 (더 엄격한 임계값)
          if (totalDistance > 8) {
            if (dragDirectionRef.current === null) {
              // 방향이 아직 결정되지 않았다면 결정 (30도 기준으로 더 엄격하게)
              const angle = Math.atan2(Math.abs(virtualDeltaY), Math.abs(virtualDeltaX)) * 180 / Math.PI;
              dragDirectionRef.current = angle < 30 ? 'horizontal' : 'vertical';
            }
            
            // 결정된 방향에 따라 이동 제한
            if (dragDirectionRef.current === 'horizontal') {
              newY = objectInitialPosRef.current.y;
            } else {
              newX = objectInitialPosRef.current.x;
            }
          }
        }

        newX = Math.round(newX);
        newY = Math.round(newY);

        onUpdateObjectProperty(object.id, "properties", {
          ...object.properties,
          x: newX,
          y: newY,
        });
      }

      if (isResizing) {
        const finalMouseX = e.clientX - canvasRect.left;
        const finalMouseY = e.clientY - canvasRect.top;

        const deltaX = finalMouseX - resizeStartMousePosRef.current.x;
        const deltaY = finalMouseY - resizeStartMousePosRef.current.y;

        const { scaleX, scaleY } = getScale();
        const virtualDeltaX = deltaX / scaleX;
        const virtualDeltaY = deltaY / scaleY;

        let newX = objectInitialMetricsRef.current.x;
        let newY = objectInitialMetricsRef.current.y;
        let newWidth = objectInitialMetricsRef.current.width;
        let newHeight = objectInitialMetricsRef.current.height;

        const handle = resizeHandleRef.current;

        if (handle.includes("e")) {
          newWidth = objectInitialMetricsRef.current.width + virtualDeltaX;
        }
        if (handle.includes("w")) {
          newWidth = objectInitialMetricsRef.current.width - virtualDeltaX;
          newX = objectInitialMetricsRef.current.x + virtualDeltaX;
        }
        if (handle.includes("s")) {
          newHeight = objectInitialMetricsRef.current.height + virtualDeltaY;
        }
        if (handle.includes("n")) {
          newHeight = objectInitialMetricsRef.current.height - virtualDeltaY;
          newY = objectInitialMetricsRef.current.y + virtualDeltaY;
        }

        // Shift 키를 누르면 비율 유지
        if (isShiftPressed) {
          const originalRatio = objectInitialMetricsRef.current.width / objectInitialMetricsRef.current.height;
          
          // 현재 변경된 방향에 따라 비율 계산
          if (handle.includes("e") || handle.includes("w")) {
            // 가로 변경이 주된 경우, 세로를 비율에 맞춰 조정
            newHeight = newWidth / originalRatio;
            if (handle.includes("n")) {
              newY = objectInitialMetricsRef.current.y + (objectInitialMetricsRef.current.height - newHeight);
            }
          } else if (handle.includes("s") || handle.includes("n")) {
            // 세로 변경이 주된 경우, 가로를 비율에 맞춰 조정
            newWidth = newHeight * originalRatio;
            if (handle.includes("w")) {
              newX = objectInitialMetricsRef.current.x + (objectInitialMetricsRef.current.width - newWidth);
            }
          }
        }

        const minSize = 10;
        if (newWidth < minSize) {
          if (handle.includes("w")) newX += newWidth - minSize;
          newWidth = minSize;
        }
        if (newHeight < minSize) {
          if (handle.includes("n")) newY += newHeight - minSize;
          newHeight = minSize;
        }

        newX = Math.round(newX);
        newY = Math.round(newY);
        newWidth = Math.round(newWidth);
        newHeight = Math.round(newHeight);

        onUpdateObjectProperty(object.id, "properties", {
          ...object.properties,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      }

      if (isRotating && tempRotation !== null) {
        console.log('회전 저장:', { objectId: object.id, tempRotation, finalRotation: parseFloat(tempRotation.toFixed(2)) });
        onUpdateObjectProperty(object.id, "properties", {
          ...object.properties,
          rotation: parseFloat(tempRotation.toFixed(2)),
        });
      }

      setIsDragging(false);
      setIsResizing(false);
      setIsRotating(false);
      
      // 임시 크기, 위치, 회전 초기화
      setTempSize(null);
      setTempPosition(null);
      setTempRotation(null);
      
      // 애니메이션 프레임 취소
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    if (isDragging || isResizing || isRotating) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDragging, isResizing, isRotating, tempRotation, onUpdateObjectProperty, object.id, canvasRef]);

  // Handle double click for text editing
  const handleDoubleClick = (e) => {
    if (isLocked) return;
    if (object.type === 'text') {
      e.stopPropagation();
      setIsEditing(true);
      setEditText(object.properties?.content || '');
      // Focus will be set in useEffect
    }
  };

  // Handle text editing
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      // Place cursor at the end of text
      const length = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

  // Handle escape key to exit editing mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditing && e.key === 'Escape') {
        setIsEditing(false);
        // Restore original text
        setEditText(object.properties?.content || '');
      }
    };

    if (isEditing) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, object.properties?.content]);

  // Handle Shift key for straight movement and aspect ratio
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle text input changes
  const handleTextChange = (e) => {
    setEditText(e.target.value);
  };

  // 텍스트 변경 시 기즈모 크기 자동 조절
  useEffect(() => {
    if (isEditing && editInputRef.current && object.type === 'text') {
      // 편집 중에는 textarea가 컨테이너 전체 높이를 사용하므로 높이 조절 불필요
      // 편집 완료 시 handleTextBlur에서 기즈모 크기 업데이트
    }
  }, [editText, isEditing, object.type, object.properties?.fontSize]);

  // Handle text input blur
  const handleTextBlur = () => {
    setIsEditing(false);
    if (editText !== object.properties?.content) {
      // 텍스트 높이 계산 (최소 높이 보장)
      const lines = editText.split('\n');
      const fontSize = parseInt(object.properties?.fontSize || '24');
      const lineHeight = fontSize * 1.2;
      const calculatedHeight = Math.max(lines.length * lineHeight, lineHeight);
      
      // 패딩 고려한 최종 높이 계산
      const padding = object.properties?.useTextBackground ? 
        (object.properties?.textBackgroundPadding || 8) * 2 : 0;
      const newHeight = calculatedHeight + padding;
      
      onUpdateObjectProperty(object.id, 'properties', {
        ...object.properties,
        content: editText,
        height: newHeight // 텍스트 높이에 맞춰 기즈모 높이 업데이트
      });
    }
  };

  // Update the object's container style based on its properties for initial render and non-drag updates
  // The drag logic will temporarily override left/top via direct DOM manipulation for smoothness
  const objectContainerStyleFromProps = {
    position: "absolute",
    left: `${object.properties?.x || 0}px`,
    top: `${object.properties?.y || 0}px`,
    width: object.properties?.width
      ? `${object.properties.width}px`
      : object.type === "image" || object.type === "shape"
      ? "100px"
      : "auto", // Default width for image/shape
    height: object.properties?.height
      ? `${object.properties.height}px`
      : object.type === "image" || object.type === "shape"
      ? "100px"
      : "auto", // Default height for image/shape
    border: `2px solid ${isSelected ? "#818cf8" : "transparent"}`, // Indigo-400 for selected
    // Padding was for the border visibility, but might interfere with content sizing.
    // Let content (text, image, shape) handle its own padding or box-sizing.
    // padding: '2px',
    cursor: isSelected ? "grab" : "pointer",
    transition:
      "border-color 150ms ease-in-out, width 150ms ease-in-out, height 150ms ease-in-out",
    boxSizing: "border-box", // Important for width/height to include border/padding if any
  };
  if (isDragging) {
    objectContainerStyleFromProps.cursor = "grabbing";
    objectContainerStyleFromProps.zIndex = 1000; // Bring to front while dragging
  }

  const handleClick = (e) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();

    // 타임라인과 동일한 방식으로 CTRL 키 상태에 따라 선택 처리
    if (e.ctrlKey || e.metaKey) {
      // 다중 선택 추가/제거
      onSelectObjects(object.id);
    } else {
      // 단일 선택
    onSelectObject(object.id);
    }
  };

  const renderContent = () => {
    const commonStyle = {
      // Common styles for content, if any, can go here
      // For text, specific styles are applied below
    };

    switch (object.type) {
      case "text":
        const textStyle = {
          ...commonStyle,
          fontSize: typeof object.properties?.fontSize === 'number'
            ? `${object.properties.fontSize}px`
            : (object.properties?.fontSize || "24px"),
          color: object.properties?.color || "#FFFFFF",
          fontFamily: object.properties?.fontFamily || "Arial",
          fontWeight: object.properties?.fontWeight || "normal",
          textAlign: object.properties?.textAlign || "left",
          width: "100%",
          minWidth: "50px",
          whiteSpace: "pre-wrap", // 줄바꿈 유지
          wordBreak: "break-word", // 단어 단위 줄바꿈
          lineHeight: object.properties?.lineHeight !== undefined ? object.properties.lineHeight : "1.2",
          margin: 0, // 마진 제거
          padding: 0, // 패딩 제거 (컨테이너에서 처리)
          letterSpacing: object.properties?.letterSpacing !== undefined ? `${object.properties.letterSpacing}px` : "0px",
        };

        // Apply text border if enabled
        if (object.properties?.useTextBorder) {
          textStyle.WebkitTextStrokeWidth = `${object.properties.textBorderWidth || 1}px`;
          textStyle.WebkitTextStrokeColor = object.properties.textBorderColor || '#FFFFFF';
        }

        // Apply text shadow if enabled
        if (object.properties?.useTextShadow) {
          textStyle.textShadow = `${object.properties.textShadowOffsetX || 0}px ${object.properties.textShadowOffsetY || 0}px ${object.properties.textShadowBlur || 0}px ${object.properties.textShadowColor || '#000000'}`;
        }

        // Create container style for background if enabled
        const textContainerStyle = {
          display: "flex",
          alignItems: "center",
          justifyContent: object.properties?.textAlign === "left" ? "flex-start" : 
                         object.properties?.textAlign === "right" ? "flex-end" : "center",
          width: "100%",
          height: "100%", // 기즈모 전체 높이 사용
          boxSizing: "border-box", // 패딩과 보더가 크기에 포함되도록
          opacity: object.properties?.opacity !== undefined ? object.properties.opacity : 1,
        };

        // Apply background styles if enabled
        if (object.properties?.useTextBackground) {
          textContainerStyle.backgroundColor = object.properties?.textBackgroundColor || "#000000";
          textContainerStyle.borderRadius = `${object.properties?.textBackgroundBorderRadius || 0}px`;
          textContainerStyle.padding = `${object.properties?.textBackgroundPadding || 8}px`;
        }

        return (
          <div style={textContainerStyle}>
            {isEditing ? (
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={handleTextChange}
                onBlur={handleTextBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleTextBlur(); // 편집 완료
                  } else if (e.key === 'Enter') {
                    // 엔터키 기본 동작 방지 (위로 올라가는 것 방지)
                    e.preventDefault();
                    // 줄바꿈 추가
                    const cursorPosition = e.target.selectionStart;
                    const textBefore = editText.substring(0, cursorPosition);
                    const textAfter = editText.substring(cursorPosition);
                    const newText = textBefore + '\n' + textAfter;
                    setEditText(newText);
                    
                    // 커서 위치 조정 (줄바꿈 후 위치)
                    setTimeout(() => {
                      e.target.setSelectionRange(cursorPosition + 1, cursorPosition + 1);
                    }, 0);
                  }
                }}
                style={{
                  ...textStyle,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: 0,
                  margin: 0,
                  width: '100%',
                  height: '100%', // 컨테이너 전체 높이 사용
                  minHeight: '1em', // 최소 높이 설정
                  position: 'relative', // absolute에서 relative로 변경
                  left: 'auto', // left 제거
                  top: 'auto', // top 제거
                  resize: 'none', // 크기 조절 비활성화
                  overflow: 'hidden', // 스크롤바 숨김
                  whiteSpace: 'pre-wrap', // 줄바꿈 유지
                  wordBreak: 'break-word', // 단어 단위 줄바꿈
                }}
              />
            ) : (
              <div 
                style={textStyle}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (object.type === 'text') {
                    setIsEditing(true);
                    setEditText(object.properties?.content || '');
                  }
                }}
              >
                {object.properties?.content || "New Text"}
              </div>
            )}
          </div>
        );
      case "image":
        const imageStyle = {
          ...commonStyle,
          width: object.properties?.width
            ? `${object.properties.width}px`
            : "auto",
          height: object.properties?.height
            ? `${object.properties.height}px`
            : "auto",
          maxWidth: "100%", // Ensure image is responsive within its container
          maxHeight: "100%",
          objectFit: "contain", // Or 'cover', 'fill', etc., depending on desired behavior
        };

        // 이미지 로딩 상태 관리
        const [imageLoaded, setImageLoaded] = useState(false);
        const [imageError, setImageError] = useState(false);

        const isPlaceholder = !object.properties?.src || object.properties?.src === "https://via.placeholder.com/150";
        if (isPlaceholder) {
          // 빈 이미지 객체 표시
          return (
            <div
              style={{
                ...imageStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `repeating-linear-gradient(45deg, #eee 0 10px, #ddd 10px 20px)`,
                border: '1.5px dashed #bbb',
                color: '#888',
                fontSize: 14,
                fontWeight: 500,
                position: 'relative',
                width: object.properties?.width || 150,
                height: object.properties?.height || 150,
                minWidth: 40,
                minHeight: 40,
                userSelect: 'none',
              }}
            >
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#bbb" style={{marginRight: 6}}><rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="2"/><path d="M3 7h18M7 3v4M17 3v4" strokeWidth="2"/></svg>
              <span style={{fontSize:12, color:'#888'}}>빈 이미지</span>
            </div>
          );
        }

        return (
          <img
            src={object.properties?.src || "https://via.placeholder.com/150"}
            alt={object.name}
            style={{
              ...imageStyle,
              opacity: imageLoaded ? (object.properties?.opacity !== undefined ? object.properties.opacity : 1) : 0,
              transition: 'opacity 0.3s ease-in-out'
            }}
            onLoad={() => {
              setImageLoaded(true);
              setImageError(false);
            }}
            onError={(e) => {
              setImageError(true);
              setImageLoaded(false);
              e.target.style.display = "none";
            }}
            key={object.properties?.src}
          />
        );
      case "sequence": {
        // sprite sheet 기반 시퀀스 애니메이션 렌더링
        const { spriteUrl, frameCount = 1, frameWidth, frameHeight, currentFrame = 0, width, height, fps = 24, loop } = object.properties || {};
        const [frameIdx, setFrameIdx] = useState(currentFrame);
        const canvasRef = useRef(null);
        const imgRef = useRef(null);
        
        useEffect(() => {
          if (!spriteUrl || !frameCount || !fps || !isPlaying) {
            setFrameIdx(currentFrame);
            return;
          }
          setFrameIdx(currentFrame);
          let stopped = false;
          const interval = setInterval(() => {
            setFrameIdx(prev => {
              if (loop === undefined ? false : loop) {
                return (prev + 1) % frameCount;
              } else {
                if (prev + 1 >= frameCount) {
                  stopped = true;
                  clearInterval(interval);
                  return frameCount - 1;
                }
                return prev + 1;
              }
            });
          }, 1000 / fps);
          return () => {
            stopped = true;
            clearInterval(interval);
          };
        }, [spriteUrl, frameCount, fps, currentFrame, isPlaying, loop]);
        
        useEffect(() => {
          if (!spriteUrl || !frameCount) return;
          const img = new window.Image();
          img.crossOrigin = 'anonymous'; // CORS 설정 추가
          img.onload = () => {
            imgRef.current = img;
            drawFrame();
          };
          img.onerror = () => {
            console.error('Failed to load sprite image:', spriteUrl);
          };
          img.src = spriteUrl;
          return () => { imgRef.current = null; };
          // eslint-disable-next-line
        }, [spriteUrl]);
        
        useEffect(() => {
          drawFrame();
          // eslint-disable-next-line
        }, [frameIdx, width, height]);
        
        const drawFrame = () => {
          const canvas = canvasRef.current;
          const img = imgRef.current;
          if (!canvas || !img) return;
          
          const ctx = canvas.getContext('2d');
          
          // 캔버스 크기 설정
          const canvasWidth = width || frameWidth || 320;
          const canvasHeight = height || frameHeight || 180;
          
          // 캔버스 크기가 변경된 경우 재설정
          if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
          }
          
          // 투명도 지원을 위한 캔버스 클리어
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // 이미지 스무딩 설정
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // 현재 프레임 그리기 (투명도 유지)
          ctx.drawImage(
            img,
            0, frameHeight * frameIdx, // 소스 x, y
            frameWidth, frameHeight,   // 소스 width, height
            0, 0,                     // 대상 x, y
            canvasWidth, canvasHeight  // 대상 width, height
          );
        };
        
        if (!spriteUrl) return <div style={{color:'#aaa'}}>No Sprite</div>;
        
        return (
          <canvas
            ref={canvasRef}
            width={width || frameWidth || 320}
            height={height || frameHeight || 180}
            style={{
              width: width ? `${width}px` : (frameWidth ? `${frameWidth}px` : 'auto'),
              height: height ? `${height}px` : (frameHeight ? `${frameHeight}px` : 'auto'),
              maxWidth: '100%',
              maxHeight: '100%',
              background: 'transparent', // 투명 배경으로 변경
              objectFit: 'contain',
              display: 'block',
            }}
          />
        );
      }
      case "shape": {
          // 리사이즈 중에는 임시 크기 사용, 그렇지 않으면 원래 크기 사용
          const width = tempSize ? tempSize.width : (object.properties?.width || 100);
          const height = tempSize ? tempSize.height : (object.properties?.height || 100);
        
        // 모든 도형을 SVG로 렌더링
        let fill = object.properties?.color || "#FF0000";
        let gradDef = null;
        
        // 그라데이션 처리
        if (object.properties?.fillType === 'gradient' && object.properties?.gradient && object.properties?.gradient.stops) {
          const gradId = `canvas-shape-grad-${object.id}`;
          fill = `url(#${gradId})`;
          
          // 그라데이션 각도 계산
          const angle = object.properties.gradient.angle || 0;
          const radians = (angle * Math.PI) / 180;
          const x1 = 0.5 - Math.cos(radians) * 0.5;
          const y1 = 0.5 - Math.sin(radians) * 0.5;
          const x2 = 0.5 + Math.cos(radians) * 0.5;
          const y2 = 0.5 + Math.sin(radians) * 0.5;
          
          gradDef = (
            <defs>
              <linearGradient 
                id={gradId} 
                x1={`${x1 * 100}%`} 
                y1={`${y1 * 100}%`} 
                x2={`${x2 * 100}%`} 
                y2={`${y2 * 100}%`}
              >
                {object.properties.gradient.stops.map((s, i) => (
                  <stop key={i} offset={`${(s.position||0)*100}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
                ))}
              </linearGradient>
            </defs>
          );
        }
        
        // SVG 생성
        const svgStyle = {
          width: `${width}px`,
          height: `${height}px`,
          display: "block",
        };
        
        let shapeElement;
        
        // 도형 타입별 SVG 요소 생성
        if (object.properties?.shapeType === 'triangle') {
          // 삼각형
          shapeElement = (
                <polygon
                  points={`${width/2},0 0,${height} ${width},${height}`}
                  fill={fill}
                  stroke={object.properties?.useShapeBorder ? (object.properties?.shapeBorderColor || '#FFFFFF') : 'none'}
                  strokeWidth={object.properties?.useShapeBorder ? (object.properties?.shapeBorderWidth || 1) : 0}
                  style={{
                    filter: object.properties?.useShapeShadow ? `drop-shadow(${object.properties?.shapeShadowOffsetX||0}px ${object.properties?.shapeShadowOffsetY||0}px ${object.properties?.shapeShadowBlur||0}px ${object.properties?.shapeShadowColor||'#000'})` : undefined
                  }}
                />
          );
        } else if (object.properties?.shapeType === 'circle' || object.properties?.shapeType === 'ellipse') {
          // 원형/타원
          shapeElement = (
            <ellipse
              cx={width/2}
              cy={height/2}
              rx={width/2}
              ry={height/2}
              fill={fill}
              stroke={object.properties?.useShapeBorder ? (object.properties?.shapeBorderColor || '#FFFFFF') : 'none'}
              strokeWidth={object.properties?.useShapeBorder ? (object.properties?.shapeBorderWidth || 1) : 0}
              style={{
                filter: object.properties?.useShapeShadow ? `drop-shadow(${object.properties?.shapeShadowOffsetX||0}px ${object.properties?.shapeShadowOffsetY||0}px ${object.properties?.shapeShadowBlur||0}px ${object.properties?.shapeShadowColor||'#000'})` : undefined
              }}
            />
            );
          } else {
          // 사각형 (box)
          shapeElement = (
            <rect
              x={0}
              y={0}
                width={width}
                height={height}
                  fill={fill}
                  stroke={object.properties?.useShapeBorder ? (object.properties?.shapeBorderColor || '#FFFFFF') : 'none'}
                  strokeWidth={object.properties?.useShapeBorder ? (object.properties?.shapeBorderWidth || 1) : 0}
                  style={{
                    filter: object.properties?.useShapeShadow ? `drop-shadow(${object.properties?.shapeShadowOffsetX||0}px ${object.properties?.shapeShadowOffsetY||0}px ${object.properties?.shapeShadowBlur||0}px ${object.properties?.shapeShadowColor||'#000'})` : undefined
                  }}
                />
            );
          }
        
        // 투명도 설정
        if (object.properties?.opacity !== undefined) {
          shapeElement = React.cloneElement(shapeElement, {
            opacity: object.properties.opacity
          });
        }

        return (
          <svg
            width={width}
            height={height}
            style={svgStyle}
          >
            {gradDef}
            {shapeElement}
          </svg>
        );
      }
      case "timer":
        // 오버레이와 동일하게 컨테이너에 배경, 내부에 텍스트 스타일 적용
        const timerContainerStyle = {
          display: "flex",
          alignItems: "center",
          justifyContent: object.properties?.textAlign === "left" ? "flex-start" : 
                         object.properties?.textAlign === "right" ? "flex-end" : "center",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          opacity: object.properties?.opacity !== undefined ? object.properties.opacity : 1,
        };
        const timerTextStyle = {
          color: object.properties?.color || "#FFFFFF",
          fontSize: typeof object.properties?.fontSize === 'number'
            ? `${object.properties.fontSize}px`
            : (object.properties?.fontSize || "48px"),
          fontFamily: object.properties?.fontFamily || "Arial",
          fontWeight: object.properties?.fontWeight || "bold",
          textAlign: object.properties?.textAlign || "center",
          lineHeight: object.properties?.lineHeight !== undefined ? object.properties.lineHeight : "1",
          width: "100%",
          margin: 0,
          padding: 0,
          letterSpacing: object.properties?.letterSpacing !== undefined ? `${object.properties.letterSpacing}px` : "0px",
        };
        // 타이머 동작(카운트다운/업) 구현
        const [displayTime, setDisplayTime] = React.useState(object.properties?.duration || 60);
        React.useEffect(() => {
          if (!object.properties?.isRunning) return;
          let timeLeft = object.properties?.duration || 60;
          let timerInterval = setInterval(() => {
            if (object.properties?.mode === 'countdown') {
              timeLeft = timeLeft > 0 ? timeLeft - 1 : 0;
            } else {
              timeLeft = timeLeft + 1;
            }
            setDisplayTime(timeLeft);
            if (object.properties?.mode === 'countdown' && timeLeft === 0) {
              clearInterval(timerInterval);
            }
          }, 1000);
          return () => clearInterval(timerInterval);
        }, [object.properties?.isRunning, object.properties?.duration, object.properties?.mode]);
        // 시간 포맷 변환
        const formatTime = (seconds) => {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };
        return (
          <div style={timerContainerStyle}>
            <div style={timerTextStyle}>
              {formatTime(displayTime)}
            </div>
          </div>
        );
      default:
        return (
          <p className="text-xs text-gray-400 p-2 bg-gray-700 rounded">
            Unsupported type: {object.type}
          </p>
        );
    }
  };

  // 이미 선택된 객체가 locked로 바뀌면 선택 해제 (부가적으로 필요시)
  useEffect(() => {
    if (isSelected && isLocked && onSelectObject) {
      onSelectObject(null);
    }
  }, [isLocked, isSelected, onSelectObject]);

  return (
    <div
      ref={objectRef}
      className={`rendered-object ${isSelected ? 'selected' : ''}`}
      style={{
        ...objectStyle,
        display: isVisible ? 'block' : 'none'
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      title={`Click to select ${object.name}${
        isSelected ? " (draggable)" : ""
      }`}
    >
      {/* Content of the object based on its type */}
      {renderContent()}

      {isSelected && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '-20px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              zIndex: 1002,
            }}
          >
            {object.type} - {object.id}
          </div>
          {["nw", "n", "ne", "w", "e", "sw", "s", "se"].map((handle) => {
            const handleStyle = {
              position: "absolute",
              width: "12px",
              height: "12px",
              backgroundColor: "#3b82f6",
              border: "2px solid white",
              borderRadius: "50%",
              zIndex: 1001,
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.1)",
            };

            if (handle.includes("n")) handleStyle.top = "-6px";
            if (handle.includes("s")) handleStyle.bottom = "-6px";
            if (handle.includes("w")) handleStyle.left = "-6px";
            if (handle.includes("e")) handleStyle.right = "-6px";
            if (handle === "n" || handle === "s") {
              handleStyle.left = "calc(50% - 6px)";
              handleStyle.cursor = "ns-resize";
            }
            if (handle === "w" || handle === "e") {
              handleStyle.top = "calc(50% - 6px)";
              handleStyle.cursor = "ew-resize";
            }
            if (handle === "nw" || handle === "se") handleStyle.cursor = "nwse-resize";
            if (handle === "ne" || handle === "sw") handleStyle.cursor = "nesw-resize";

            return (
              <div
                key={handle}
                className={`resize-handle-${handle}`}
                style={handleStyle}
                onMouseDown={(e) => handleResizeStart(e, handle)}
              />
            );
          })}
          
          {/* 회전 핸들 */}
          <div
            className="rotate-handle"
            style={{
              position: "absolute",
              top: "-40px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "16px",
              height: "16px",
              backgroundColor: "#10b981",
              border: "2px solid white",
              borderRadius: "50%",
              zIndex: 1001,
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.1)",
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
            onMouseDown={handleRotateStart}
            title="회전"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

const getMotionStyle = (motion, isIn) => {
  if (!motion || motion.type === 'none') return {};

  const baseStyle = {
    animationDuration: `${motion.duration || 1}s`,
    animationDelay: `${motion.delay || 0}s`,
    animationFillMode: 'forwards',
    animationTimingFunction: motion.easing || 'ease',
    animationPlayState: 'running'
  };

  switch (motion.type) {
    case 'fade':
      return {
        ...baseStyle,
        animationName: 'fade',
        opacity: isIn ? 0 : 1
      };
    case 'slideUp':
      return {
        ...baseStyle,
        animationName: 'slideUp',
        transform: isIn ? 'translateY(100%)' : 'translateY(0)',
        opacity: isIn ? 0 : 1
      };
    case 'slideDown':
      return {
        ...baseStyle,
        animationName: 'slideDown',
        transform: isIn ? 'translateY(-100%)' : 'translateY(0)',
        opacity: isIn ? 0 : 1
      };
    case 'slideLeft':
      return {
        ...baseStyle,
        animationName: 'slideLeft',
        transform: isIn ? 'translateX(100%)' : 'translateX(0)',
        opacity: isIn ? 0 : 1
      };
    case 'slideRight':
      return {
        ...baseStyle,
        animationName: 'slideRight',
        transform: isIn ? 'translateX(-100%)' : 'translateX(0)',
        opacity: isIn ? 0 : 1
      };
    case 'scale':
      return {
        ...baseStyle,
        animationName: 'scale',
        transform: isIn ? 'scale(1.2)' : 'scale(1)',
        opacity: isIn ? 0 : 1
      };
    case 'rotate':
      return {
        ...baseStyle,
        animationName: 'rotate',
        transform: isIn ? 'rotate(360deg)' : 'rotate(0deg)',
        opacity: isIn ? 0 : 1
      };
    case 'bounce':
      return {
        ...baseStyle,
        animationName: 'bounce',
        opacity: isIn ? 0 : 1
      };
    case 'elastic':
      return {
        ...baseStyle,
        animationName: 'elastic',
        opacity: isIn ? 0 : 1
      };
    default:
      return {};
  }
};

// CSS 애니메이션 키프레임 추가
const style = document.createElement('style');
style.textContent = `
  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  @keyframes slideDown {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
  }
  @keyframes slideLeft {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes slideRight {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  @keyframes scale {
    from { transform: scale(1.2); }
    to { transform: scale(1); }
  }
  @keyframes rotate {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }
  @keyframes bounce {
    0% { transform: translateY(100%); }
    50% { transform: translateY(-20%); }
    70% { transform: translateY(10%); }
    85% { transform: translateY(-5%); }
    100% { transform: translateY(0); }
  }
  @keyframes elastic {
    0% { transform: scale(0.3); }
    50% { transform: scale(1.2); }
    70% { transform: scale(0.9); }
    85% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(style);

const getScale = () => {
  return {
    scaleX: canvasScale,
    scaleY: canvasScale
  };
};

export default function CanvasArea({
  objects = [],
  selectedObject,
  selectedObjectIds = [],
  onSelectObject,
  onSelectObjects,
  onUpdateObjectProperty,
  currentTime = 0,
  canvasScale,
  onSetCanvasScale,
  isPlaying = false,
  projectName,
  apiBaseUrl,
  onAddObject,
}) {
  const canvasRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleCanvasClick = () => {
    // Deselect object when clicking on the canvas background
    onSelectObject(null);
  };

  // 드래그&드롭 이벤트 핸들러들
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 이미지 파일인지 확인
    const hasImageFiles = Array.from(e.dataTransfer.types).some(type => 
      type === 'Files' || type.startsWith('image/')
    );
    if (hasImageFiles) {
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 이미지 파일인지 확인
    const hasImageFiles = Array.from(e.dataTransfer.types).some(type => 
      type === 'Files' || type.startsWith('image/')
    );
    if (hasImageFiles) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 드래그가 실제로 캔버스를 벗어났는지 확인
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!projectName || !apiBaseUrl || !onAddObject) {
      console.warn('드래그&드롭을 위한 필수 props가 없습니다.');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      alert('이미지 파일만 드롭할 수 있습니다.');
      return;
    }

    setIsUploading(true);

    try {
      // 이미지 업로드
      const { uploadProjectImage } = await import('../../api/projects');
      const result = await uploadProjectImage(apiBaseUrl, projectName, imageFiles, true); // overwrite=true

      if (result && result.conflict) {
        if (window.confirm(`이미 존재하는 파일이 있습니다:\n${result.exists.join(', ')}\n덮어쓰시겠습니까?`)) {
          await uploadProjectImage(apiBaseUrl, projectName, imageFiles, true);
        } else {
          setIsUploading(false);
          return;
        }
      }

      // 업로드된 이미지들을 캔버스에 추가
      const uploadedFiles = result?.uploaded || imageFiles.map(f => f.name);
      
      for (const fileName of uploadedFiles) {
        const imgUrl = `${apiBaseUrl.replace('/api', '')}/projects/${projectName}/library/images/${encodeURIComponent(fileName)}`;
        
        // 이미지 크기 확인 후 오브젝트 추가
        const img = new window.Image();
        img.onload = () => {
          onAddObject({
            type: 'image',
            name: fileName,
            properties: {
              src: imgUrl,
              width: img.width,
              height: img.height,
              x: 100,
              y: 100,
            }
          });
        };
        img.onerror = () => {
          console.error('이미지 로드 실패:', fileName);
        };
        img.src = imgUrl;
      }

      alert(`${uploadedFiles.length}개 이미지가 업로드되고 캔버스에 추가되었습니다!`);

    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      alert('이미지 업로드 실패: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const handleArrowKeyMove = (e) => {
      if (!selectedObject) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        onUpdateObjectProperty(selectedObject.id, "properties", {
          ...selectedObject.properties,
          x: (selectedObject.properties.x || 0) + dx,
          y: (selectedObject.properties.y || 0) + dy,
        });
      }
    };
    window.addEventListener("keydown", handleArrowKeyMove);
    return () => window.removeEventListener("keydown", handleArrowKeyMove);
  }, [selectedObject, onUpdateObjectProperty]);

  return (
    <main 
      className="flex-1 bg-gray-800 overflow-hidden p-4 flex items-center justify-center relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그 오버 시 하이라이트 */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-20 border-4 border-dashed border-blue-400 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-blue-100 text-xl font-bold">이미지를 여기에 드롭하세요</div>
        </div>
      )}

      {/* 업로드 중 로딩 표시 */}
      {isUploading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-white text-lg font-bold">이미지 업로드 중...</div>
        </div>
      )}

      {/* Outer container with fixed size and scale */}
      <div
        style={{
          overflow: "hidden",
        }}
        onClick={handleCanvasClick}
      >
        {/* Fixed size canvas with scaling */}
        <div
          ref={canvasRef}
          style={{
            width: "1920px",
            height: "1080px",
            // backgroundColor: "black",
            backgroundImage: `
              linear-gradient(45deg, #444 25%, transparent 25%),
              linear-gradient(-45deg, #444 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #444 75%),
              linear-gradient(-45deg, transparent 75%, #444 75%)
            `,
            backgroundSize: "40px 40px",
            backgroundPosition: "0 0, 0 20px, 20px -20px, -20px 0px",
            position: "relative",
            left: 10,
            transform: `scale(${canvasScale})`,
            transformOrigin: "left center",
            border: "2px solid rgb(55, 65, 81)",
          }}
        >
          {/* Visual border inside the padding */}
          <div className="absolute inset-0 border-2 border-dashed border-gray-600 pointer-events-none"></div>

          {[...objects]
            .filter(obj => obj.visible !== false)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((obj) => (
              <RenderedObject
                key={obj.id}
                object={obj}
                isLocked={obj.locked}
                onSelectObject={(id) => {
                  if (obj.locked) return;
                  onSelectObject(id);
                }}
                onSelectObjects={onSelectObjects}
                isSelected={selectedObjectIds.includes(obj.id)}
                onUpdateObjectProperty={onUpdateObjectProperty}
                canvasRef={canvasRef}
                canvasScale={canvasScale}
                currentTime={currentTime}
                getMotionStyle={getMotionStyle}
                isPlaying={isPlaying}
              />
            ))}
          {objects.length === 0 && (
            <div className="flex flex-col justify-center items-center h-full text-center">
              <p className="text-gray-400 italic text-lg">Canvas</p>
              <p className="text-sm text-gray-500 mt-1">
                No objects in this scene.
              </p>
              <p className="text-xs text-gray-600 mt-4">
                Use the 'Add Object' panel to add one.
              </p>
              <p className="text-xs text-blue-400 mt-2">
                또는 이미지를 여기로 드래그&드롭하세요
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
