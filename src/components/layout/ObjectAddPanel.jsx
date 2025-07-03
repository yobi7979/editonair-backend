import React, { useRef, useState, useEffect } from 'react';
import { Type, Image as ImageIcon, Square, Timer, PlusCircle, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, ImageUp, Film, X } from 'lucide-react';
import { uploadProjectImage, uploadProjectSequence, getProjectImages, getProjectSequences, deleteProjectImage, deleteProjectSequence } from '../../api/projects';
import LibraryPanel from './LibraryPanel';

// 시퀀스 업로드 모달 컴포넌트
function SequenceUploadModal({ isOpen, onClose, onUpload, files, projectName, apiBaseUrl }) {
  const [sequenceName, setSequenceName] = useState('');
  const [format, setFormat] = useState('PNG');
  const [quality, setQuality] = useState(95);
  const [createSprite, setCreateSprite] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSequenceName('New-Sequence');
      setFormat('PNG');
      setQuality(95);
      setCreateSprite(true);
      setUploadProgress('');
      setUploadError('');
    }
  }, [isOpen]);

  const handleUpload = async () => {
    if (!sequenceName.trim()) {
      setUploadError('시퀀스 이름을 입력해주세요.');
      return;
    }

    setIsUploading(true);
    setUploadProgress('업로드 준비 중...');
    setUploadError('');

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('sequence_name', sequenceName);
      formData.append('format', format);
      formData.append('quality', quality.toString());
      formData.append('create_sprite', createSprite.toString());

      setUploadProgress('파일 업로드 중...');

      // 타임아웃 설정 (5분)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const response = await fetch(`${apiBaseUrl}/projects/${projectName}/upload/sequence`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.error || errorData.message || 'Upload failed');
      }

      setUploadProgress('처리 완료!');
      const result = await response.json();
      
      setTimeout(() => {
        onUpload(result);
        onClose();
      }, 1000);

    } catch (error) {
      if (error.name === 'AbortError') {
        setUploadError('업로드 시간이 초과되었습니다. (5분)');
      } else {
        setUploadError('시퀀스 업로드 실패: ' + error.message);
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-96 max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">시퀀스 업로드</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isUploading}>
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              시퀀스 이름
            </label>
            <input
              type="text"
              value={sequenceName}
              onChange={(e) => setSequenceName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="시퀀스 이름을 입력하세요"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              출력 포맷
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isUploading}
            >
              <option value="PNG">PNG (투명도 지원)</option>
              <option value="WEBP">WebP (고압축)</option>
              <option value="JPEG">JPEG (작은 용량)</option>
            </select>
          </div>

          {format === 'JPEG' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                품질 ({quality}%)
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value))}
                className="w-full"
                disabled={isUploading}
              />
            </div>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="createSprite"
              checked={createSprite}
              onChange={(e) => setCreateSprite(e.target.checked)}
              className="mr-2"
              disabled={isUploading}
            />
            <label htmlFor="createSprite" className="text-sm text-gray-300">
              스프라이트 시트 생성 (애니메이션용)
            </label>
          </div>

          <div className="text-xs text-gray-400 bg-gray-900 p-3 rounded">
            <div className="font-medium mb-1">업로드 정보:</div>
            <div>• 선택된 파일: {files.length}개</div>
            <div>• 출력 포맷: {format}</div>
            {format === 'JPEG' && <div>• 품질: {quality}%</div>}
            <div>• 스프라이트 시트: {createSprite ? '생성' : '생성 안함'}</div>
            <div>• 최대 파일 크기: 50MB</div>
            <div>• 타임아웃: 5분</div>
          </div>

          {/* 진행 상황 표시 */}
          {isUploading && (
            <div className="bg-blue-900 p-3 rounded">
              <div className="text-blue-200 text-sm font-medium mb-1">업로드 진행 중...</div>
              <div className="text-blue-300 text-xs">{uploadProgress}</div>
              <div className="mt-2 w-full bg-blue-700 rounded-full h-2">
                <div className="bg-blue-400 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {uploadError && (
            <div className="bg-red-900 p-3 rounded">
              <div className="text-red-200 text-sm">{uploadError}</div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              disabled={isUploading}
            >
              취소
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || !sequenceName.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? '업로드 중...' : '업로드'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ObjectAddPanel({ onAddObject, selectedSceneId, currentProjectId, projectName, onAlignObjects, canDistribute, selectedObject, onUpdateObjectProperty, apiBaseUrl, onToggleLibrary, isLibraryOpen, libraryData }) {
  const addObjectButtons = [
    { type: 'text', label: 'Text', icon: Type },
    { type: 'image', label: 'Image', icon: ImageIcon },
    { type: 'shape', label: 'Shape', icon: Square },
    { type: 'timer', label: 'Timer', icon: Timer },
  ];

  // 업로드 input ref
  const imageInputRef = useRef();
  const sequenceInputRef = useRef();
  const panelRef = useRef();

  // 시퀀스 업로드 모달 상태
  const [sequenceModalOpen, setSequenceModalOpen] = useState(false);
  const [selectedSequenceFiles, setSelectedSequenceFiles] = useState([]);

  // ObjectAddPanel 컴포넌트 내에 아래 상태 추가
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [sequenceName, setSequenceName] = useState('New-Sequence');
  const [format, setFormat] = useState('PNG');
  const [quality, setQuality] = useState(95);
  const [createSprite, setCreateSprite] = useState(true);
  const uploadControllerRef = useRef(null);

  // API 기본 URL에서 서버 주소 추출
  const getServerBaseUrl = () => {
    if (apiBaseUrl) {
      return apiBaseUrl.replace('/api', '');
    }
    return 'https://editonair-backend-production.up.railway.app';
  };

  // 업로드 버튼 클릭 핸들러
  const handleImageUploadClick = () => {
    imageInputRef.current?.click();
  };
  
  const handleSequenceUploadClick = () => {
    sequenceInputRef.current?.click();
  };

  // 시퀀스 파일 선택 핸들러
  const handleSequenceFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedSequenceFiles(files);
      setSequenceModalOpen(true);
    }
    e.target.value = '';
  };

  // 시퀀스 업로드 완료 핸들러
  const handleSequenceUploadComplete = (result) => {
    getProjectSequences(apiBaseUrl, projectName).then(setLibrarySequences).catch(() => setLibrarySequences([]));
    alert('시퀀스 업로드 완료!');
  };

  // 라이브러리 이미지/시퀀스 불러오기
  useEffect(() => {
    if (projectName) {
      getProjectImages(apiBaseUrl, projectName)
        .then(setLibraryImages)
        .catch(() => setLibraryImages([]));
      getProjectSequences(apiBaseUrl, projectName)
        .then(setLibrarySequences)
        .catch(() => setLibrarySequences([]));
    }
  }, [projectName, apiBaseUrl]);

  // 라이브러리 이미지 클릭 시 이미지 객체를 캔버스에 자동 생성
  const handleLibraryImageClick = (imgName) => {
    if (!projectName) return;
    const imgUrl = `${getServerBaseUrl()}/projects/${projectName}/library/images/${encodeURIComponent(imgName)}`;
    // 이미지 크기 동기화(비동기)
    const img = new window.Image();
    img.onload = () => {
      // 이미지 객체 생성
      onAddObject({
        type: 'image',
        name: imgName,
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
      alert('이미지 로드 실패');
    };
    img.src = imgUrl;
  };

  // 시퀀스 썸네일 클릭 시 sprite sheet 기반 시퀀스 객체 생성
  const handleLibrarySequenceClick = async (seq) => {
    if (!projectName) return;
    const metaUrl = `${getServerBaseUrl()}/projects/${projectName}/library/sequences/${encodeURIComponent(seq.name)}/meta.json`;
    const spriteUrl = `${getServerBaseUrl()}/projects/${projectName}/library/sequences/${encodeURIComponent(seq.name)}/sprite.png`;
    try {
      const meta = await fetch(metaUrl).then(res => res.json());
      // sprite sheet 이미지 크기 동기화
      const img = new window.Image();
      img.onload = () => {
        onAddObject({
          type: 'sequence',
          name: meta.name,
          properties: {
            spriteUrl,
            frameCount: meta.frame_count,
            frameWidth: meta.frame_width,
            frameHeight: meta.frame_height,
            currentFrame: 0,
            x: 100,
            y: 100,
            width: meta.frame_width,
            height: meta.frame_height,
            fps: 24, // 필요시 meta에 fps 추가
            loop: false, // 한 번만 실행되도록 설정
          }
        });
      };
      img.onerror = () => {
        alert('sprite sheet 이미지 로드 실패');
      };
      img.src = spriteUrl;
    } catch (e) {
      alert('meta.json 로드 실패');
    }
  };

  // 라이브러리 이미지 삭제 함수
  const handleDeleteImage = async (imgName) => {
    if (!window.confirm(`${imgName} 파일을 삭제할까요?`)) return;
    try {
      await deleteProjectImage(apiBaseUrl, projectName, imgName);
      getProjectImages(apiBaseUrl, projectName).then(setLibraryImages).catch(() => setLibraryImages([]));
      alert('삭제 완료!');
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  };

  // 이미지 업로드 핸들러
  const handleImageInputChange = async (e) => {
    if (!projectName) return;
    const files = Array.from(e.target.files);
    if (!files.length) return;
    try {
      const result = await uploadProjectImage(apiBaseUrl, projectName, files);
      if (result && result.conflict) {
        if (window.confirm(`이미 존재하는 파일이 있습니다:\n${result.exists.join(', ')}\n덮어쓰시겠습니까?`)) {
          await uploadProjectImage(apiBaseUrl, projectName, files, true);
          getProjectImages(apiBaseUrl, projectName).then(setLibraryImages).catch(() => setLibraryImages([]));
          alert('이미지 덮어쓰기 완료!');
        } else {
          alert('업로드가 취소되었습니다.');
        }
      } else {
        getProjectImages(apiBaseUrl, projectName).then(setLibraryImages).catch(() => setLibraryImages([]));
        alert('이미지 업로드 완료!');
      }
    } catch (err) {
      alert('이미지 업로드 실패: ' + err.message);
    }
    e.target.value = '';
  };

  const handleAddClick = (type) => {
    if (!selectedSceneId) {
      alert('Please select a scene first to add an object.');
      return;
    }
    onAddObject(type);
  };

  const alignButtonsRow1 = [
    { type: 'left', label: '좌측정렬', icon: AlignLeft },
    { type: 'center', label: '중앙정렬', icon: AlignCenter },
    { type: 'right', label: '우측정렬', icon: AlignRight },
  ];
  const alignButtonsRow2 = [
    { type: 'top', label: '상', isText: true },
    { type: 'middle', label: '중', isText: true },
    { type: 'bottom', label: '하', isText: true },
  ];
  const alignButtonsRow3 = [
    { type: 'vspace', label: '수직 간격', icon: AlignVerticalDistributeCenter, distribute: true },
    { type: 'hspace', label: '수평 간격', icon: AlignHorizontalDistributeCenter, distribute: true },
  ];

  // 라이브러리 이미지 목록 상태
  const [libraryImages, setLibraryImages] = useState([]);
  // 시퀀스 라이브러리 목록 상태
  const [librarySequences, setLibrarySequences] = useState([]);

  // 시퀀스 업로드 핸들러 리팩토링
  const handleSequenceUpload = async () => {
    if (!sequenceName.trim()) {
      setUploadError('시퀀스 이름을 입력해주세요.');
      return;
    }
    setIsUploading(true);
    setUploadProgress('스프라이트 시트 생성 준비 중...');
    setUploadError('');
    try {
      // 1. 이미지 파일 로드
      const images = await Promise.all(selectedSequenceFiles.map(file => {
        return new Promise((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
      }));
      setUploadProgress('스프라이트 시트 생성 중...');
      // 2. 스프라이트 시트(canvas) 생성
      const frameWidth = images[0].width;
      const frameHeight = images[0].height;
      const frameCount = images.length;
      const canvas = document.createElement('canvas');
      canvas.width = frameWidth;
      canvas.height = frameHeight * frameCount;
      const ctx = canvas.getContext('2d');
      images.forEach((img, idx) => {
        ctx.drawImage(img, 0, frameHeight * idx, frameWidth, frameHeight);
      });
      setUploadProgress('스프라이트 시트 파일 변환 중...');
      // 3. canvas → Blob (선택 포맷)
      let spriteBlob;
      if (format === 'PNG') {
        spriteBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      } else if (format === 'WEBP') {
        spriteBlob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality / 100));
      } else if (format === 'JPEG') {
        spriteBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality / 100));
      }
      // 4. meta.json 생성
      setUploadProgress('meta.json 생성 중...');
      const meta = {
        name: sequenceName,
        frame_width: frameWidth,
        frame_height: frameHeight,
        frame_count: frameCount,
        fps: 24,
        // 필요시 추가 정보
      };
      const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
      // 5. FormData로 서버 업로드
      setUploadProgress('서버로 업로드 중...');
      const formData = new FormData();
      formData.append('sprite', new File([spriteBlob], 'sprite.png', { type: spriteBlob.type }));
      formData.append('meta', new File([metaBlob], 'meta.json', { type: 'application/json' }));
      formData.append('sequence_name', sequenceName);
      // 서버 업로드
      const controller = new AbortController();
      uploadControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);
      const response = await fetch(`${apiBaseUrl}/projects/${projectName}/upload/sequence`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.error || errorData.message || 'Upload failed');
      }
      setUploadProgress('완료!');
      const result = await response.json();
      setTimeout(() => {
        handleSequenceUploadComplete(result);
        setSequenceModalOpen(false);
        setIsUploading(false);
        setUploadProgress('');
        setUploadError('');
        setSelectedSequenceFiles([]);
      }, 1000);
    } catch (error) {
      if (error.name === 'AbortError') {
        setUploadError('업로드 시간이 초과되었습니다. (5분)');
      } else {
        setUploadError('시퀀스 업로드 실패: ' + error.message);
      }
    } finally {
      setIsUploading(false);
      uploadControllerRef.current = null;
    }
  };

  // 업로드 취소 핸들러
  const handleCancelUpload = () => {
    if (uploadControllerRef.current) {
      uploadControllerRef.current.abort();
    }
    setIsUploading(false);
    setUploadProgress('');
    setUploadError('업로드가 취소되었습니다.');
  };

  return (
    <aside ref={panelRef} className="relative w-56 bg-gray-800 text-gray-300 p-4 flex flex-col space-y-3 shadow-lg border-r border-gray-700">
      <h2 className="text-md font-semibold text-white border-b border-gray-700 pb-2 mb-2 flex items-center">
        <PlusCircle size={18} className="mr-2 text-indigo-400" />
        Add Object
      </h2>
      {/* 시퀀스 업로드 모달 */}
      {sequenceModalOpen && (
        <div className="absolute left-2 bottom-2 z-40" style={{ width: 240 }}>
          <div className="bg-gray-900 rounded-lg p-3 shadow-lg w-full max-w-full">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-semibold text-white">시퀀스 업로드</h3>
              <button onClick={() => setSequenceModalOpen(false)} className="text-gray-400 hover:text-white" disabled={isUploading}>
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-0.5">시퀀스 이름</label>
                <input type="text" value={sequenceName} onChange={e => setSequenceName(e.target.value)} className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs" placeholder="시퀀스 이름" disabled={isUploading} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-0.5">출력 포맷</label>
                <select value={format} onChange={e => setFormat(e.target.value)} className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs" disabled={isUploading}>
                  <option value="PNG">PNG</option>
                  <option value="WEBP">WebP</option>
                  <option value="JPEG">JPEG</option>
                </select>
              </div>
              {format === 'JPEG' && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-0.5">품질 ({quality}%)</label>
                  <input type="range" min="1" max="100" value={quality} onChange={e => setQuality(parseInt(e.target.value))} className="w-full" disabled={isUploading} />
                </div>
              )}
              <div className="flex items-center">
                <input type="checkbox" id="createSprite" checked={createSprite} onChange={e => setCreateSprite(e.target.checked)} className="mr-1" disabled={isUploading} />
                <label htmlFor="createSprite" className="text-xs text-gray-300">스프라이트 시트</label>
              </div>
              <div className="text-[11px] text-gray-400 bg-gray-800 p-1 rounded">
                <div>• 파일: {selectedSequenceFiles.length}개</div>
                <div>• 포맷: {format}</div>
                {format === 'JPEG' && <div>• 품질: {quality}%</div>}
                <div>• 스프라이트: {createSprite ? '생성' : '안함'}</div>
              </div>
              {/* 진행상황 표시 */}
              {isUploading && (
                <div className="bg-blue-900 p-1 rounded mt-1">
                  <div className="text-blue-200 text-xs font-medium mb-0.5">업로드 중...</div>
                  <div className="text-blue-300 text-[11px]">{uploadProgress}</div>
                  <div className="mt-1 w-full bg-blue-700 rounded-full h-1">
                    <div className="bg-blue-400 h-1 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                  </div>
                  <button onClick={handleCancelUpload} className="mt-1 px-2 py-0.5 bg-gray-700 text-white rounded text-xs">취소</button>
                </div>
              )}
              {/* 에러 메시지 */}
              {uploadError && (
                <div className="bg-red-900 p-1 rounded mt-1">
                  <div className="text-red-200 text-xs">{uploadError}</div>
                </div>
              )}
              <div className="flex gap-1 pt-1">
                <button onClick={() => setSequenceModalOpen(false)} className="flex-1 px-2 py-0.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-xs" disabled={isUploading}>취소</button>
                <button onClick={handleSequenceUpload} disabled={isUploading || !sequenceName.trim()} className="flex-1 px-2 py-0.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs">{isUploading ? '업로드 중...' : '업로드'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col space-y-2">
        {addObjectButtons.map(({ type, label, icon: IconComponent }) => (
          <button 
            key={type} 
            onClick={() => handleAddClick(type)} 
            disabled={!selectedSceneId} 
            className="w-full flex items-center p-2.5 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-left"
            title={`Add ${label}`}
          >
            <IconComponent size={18} className="mr-3 flex-shrink-0" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>
      {/* 업로드 버튼 영역 */}
      <div className="mt-4 flex gap-2 justify-between">
        <button onClick={handleImageUploadClick} className="flex-1 flex flex-col items-center p-2 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500" title="이미지 업로드">
          <ImageUp size={22} />
        </button>
        <button onClick={handleSequenceUploadClick} className="flex-1 flex flex-col items-center p-2 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500" title="시퀀스 업로드">
          <Film size={22} />
        </button>
        {/* 실제 input은 숨김 */}
        <input type="file" multiple accept="image/*" ref={imageInputRef} style={{ display: 'none' }} onChange={handleImageInputChange} />
        <input type="file" multiple accept="image/*" ref={sequenceInputRef} style={{ display: 'none' }} onChange={handleSequenceFileSelect} />
      </div>
      {/* 정렬 버튼 영역 */}
      <div className="mt-6 pt-3 border-t border-gray-700 flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {alignButtonsRow1.map(({ type, label, icon: IconComponent }) => (
            <button
              key={type}
              onClick={() => onAlignObjects(type)}
              className="flex items-center justify-center p-3 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title={label}
            >
              <IconComponent size={22} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {alignButtonsRow2.map(({ type, label, isText }) => (
            <button
              key={type}
              onClick={() => onAlignObjects(type)}
              className="flex items-center justify-center p-3 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-base font-bold"
              title={label}
            >
              {isText ? label : null}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {alignButtonsRow3.map(({ type, label, icon: IconComponent, distribute }) => (
            <button
              key={type}
              onClick={() => onAlignObjects(type)}
              disabled={distribute ? !canDistribute : false}
              className="flex items-center justify-center p-3 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title={label}
            >
              <IconComponent size={22} />
            </button>
          ))}
        </div>
      </div>
      {/* 라이브러리 버튼 추가 */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            if (onToggleLibrary) {
              onToggleLibrary(isLibraryOpen ? null : {
                projectName,
                apiBaseUrl,
                onAddObject,
                getServerBaseUrl: getServerBaseUrl()
              });
            }
          }}
          className="p-2 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="라이브러리"
          style={{ width: 36, height: 36 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="2"/><path d="M3 7h18M7 3v4M17 3v4" strokeWidth="2"/></svg>
        </button>
      </div>
    </aside>
  );
}
