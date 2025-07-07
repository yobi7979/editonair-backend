import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Film, Trash2, X } from 'lucide-react';
import { getProjectImages, getProjectSequences, deleteProjectImage, deleteProjectSequence } from '../../api/projects';

export default function LibraryPanel({
  projectName,
  apiBaseUrl,
  onAddObject,
  getServerBaseUrl,
  onClose,
  initialTab = 'image',
}) {
  const [tab, setTab] = useState(initialTab); // 'image' | 'sequence'
  const [images, setImages] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedSequences, setSelectedSequences] = useState([]);
  const [refreshFlag, setRefreshFlag] = useState(0);

  // 이미지/시퀀스 불러오기
  useEffect(() => {
    if (!projectName) return;
    getProjectImages(apiBaseUrl, projectName)
      .then(setImages)
      .catch(() => setImages([]));
    getProjectSequences(apiBaseUrl, projectName)
      .then(setSequences)
      .catch(() => setSequences([]));
  }, [projectName, apiBaseUrl, refreshFlag]);

  // 외부에서 initialTab이 바뀌면 동기화
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // 이미지 선택/해제
  const toggleImage = (img) => {
    setSelectedImages((prev) =>
      prev.includes(img)
        ? prev.filter((i) => i !== img)
        : [...prev, img]
    );
  };
  // 시퀀스 선택/해제
  const toggleSequence = (seqName) => {
    setSelectedSequences((prev) =>
      prev.includes(seqName)
        ? prev.filter((n) => n !== seqName)
        : [...prev, seqName]
    );
  };

  // 이미지 다중 삭제
  const handleDeleteImages = async () => {
    if (!selectedImages.length) return;
    if (!window.confirm(`${selectedImages.join(', ')} 파일을 삭제할까요?`)) return;
    for (const img of selectedImages) {
      await deleteProjectImage(apiBaseUrl, projectName, img).catch(() => {});
    }
    setSelectedImages([]);
    setRefreshFlag((f) => f + 1);
  };
  // 시퀀스 다중 삭제
  const handleDeleteSequences = async () => {
    if (!selectedSequences.length) return;
    if (!window.confirm(`${selectedSequences.join(', ')} 시퀀스를 삭제할까요?`)) return;
    for (const seq of selectedSequences) {
      await deleteProjectSequence(apiBaseUrl, projectName, seq).catch(() => {});
    }
    setSelectedSequences([]);
    setRefreshFlag((f) => f + 1);
  };

  // 이미지 더블클릭 추가
  const handleImageDoubleClick = (img) => {
    const imgUrl = `${getServerBaseUrl()}/projects/${projectName}/library/images/${encodeURIComponent(img)}`;
    const image = new window.Image();
    image.onload = () => {
      onAddObject({
        type: 'image',
        name: img,
        properties: {
          src: imgUrl,
          width: image.width,
          height: image.height,
          x: 100,
          y: 100,
        },
      });
    };
    image.onerror = () => alert('이미지 로드 실패');
    image.src = imgUrl;
  };
  // 시퀀스 더블클릭 추가
  const handleSequenceDoubleClick = async (seq) => {
    const metaUrl = `${getServerBaseUrl()}/projects/${projectName}/library/sequences/${encodeURIComponent(seq.name)}/meta.json`;
    const spriteUrl = `${getServerBaseUrl()}/projects/${projectName}/library/sequences/${encodeURIComponent(seq.name)}/sprite.png`;
    try {
      const meta = await fetch(metaUrl).then((res) => res.json());
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
            fps: meta.fps || 24,
            loop: true,
          },
        });
      };
      img.onerror = () => alert('sprite sheet 이미지 로드 실패');
      img.src = spriteUrl;
    } catch (e) {
      alert('meta.json 로드 실패');
    }
  };

  // 애니메이션 클래스
  const [show, setShow] = useState(true);
  useEffect(() => {
    setShow(true);
    return () => setShow(false);
  }, []);

  return (
    <div
      className="transition-all duration-300 opacity-100 translate-y-0 pointer-events-none"
      style={{ width: '100%', height: '100%', borderRadius: '8px', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.25)', background: 'rgba(30,32,40,0.97)', backdropFilter: 'blur(4px)' }}
    >
      {/* 상단 탭/닫기 버튼 완전 삭제 */}
      <div className="p-3 h-full overflow-y-auto pointer-events-auto">
        {tab === 'image' && (
          <>
            <div className="flex mb-2 justify-between items-center">
              <span className="text-xs text-gray-400">이미지 {images.length}개</span>
              <button className="flex items-center gap-1 px-2 py-1 bg-red-700 hover:bg-red-800 text-xs rounded text-white disabled:opacity-50" disabled={!selectedImages.length} onClick={handleDeleteImages}><Trash2 size={14} />삭제</button>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {images.length === 0 && <div className="col-span-8 text-xs text-gray-400 text-center py-8">이미지가 없습니다.</div>}
              {images.map((img) => (
                <div key={img} className={`relative group border border-gray-800 rounded-lg p-0.5 flex flex-col items-center cursor-pointer select-none transition-all ${selectedImages.includes(img) ? 'ring-2 ring-indigo-400 bg-gray-800' : 'hover:bg-gray-700'}`}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) toggleImage(img);
                    else if (e.shiftKey) {
                      const lastIdx = images.findIndex(i => i === selectedImages[selectedImages.length - 1]);
                      const currIdx = images.findIndex(i => i === img);
                      if (lastIdx !== -1) {
                        const [start, end] = [lastIdx, currIdx].sort((a, b) => a - b);
                        setSelectedImages(Array.from(new Set([...selectedImages, ...images.slice(start, end + 1)])));
                      } else {
                        toggleImage(img);
                      }
                    } else {
                      setSelectedImages([img]);
                    }
                  }}
                  onDoubleClick={() => setTimeout(() => handleImageDoubleClick(img), 0)}
                  title={img}
                >
                  <img 
                    src={`${getServerBaseUrl()}/projects/${projectName}/library/thumbnails/${encodeURIComponent(img.replace(/\.[^/.]+$/, '.webp'))}`} 
                    alt={img} 
                    className="w-7 h-7 object-contain rounded bg-gray-900"
                    onError={(e) => {
                      // 썸네일 로드 실패시 원본 이미지로 대체
                      e.target.src = `${getServerBaseUrl()}/projects/${projectName}/library/images/${encodeURIComponent(img)}`;
                    }}
                  />
                  <div className="w-full text-[8px] text-gray-400 text-center truncate mt-0.5">{img}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'sequence' && (
          <>
            <div className="flex mb-2 justify-between items-center">
              <span className="text-xs text-gray-400">시퀀스 {sequences.length}개</span>
              <button className="flex items-center gap-1 px-2 py-1 bg-red-700 hover:bg-red-800 text-xs rounded text-white disabled:opacity-50" disabled={!selectedSequences.length} onClick={handleDeleteSequences}><Trash2 size={14} />삭제</button>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {sequences.length === 0 && <div className="col-span-8 text-xs text-gray-400 text-center py-8">시퀀스가 없습니다.</div>}
              {sequences.map((seq) => {
                const thumbnailUrl = `${getServerBaseUrl()}/projects/${projectName}/library/sequence_thumbnails/${encodeURIComponent(seq.name)}.webp`;
                return (
                  <div key={seq.name} className={`relative group border border-gray-800 rounded-lg p-0.5 flex flex-col items-center cursor-pointer select-none transition-all ${selectedSequences.includes(seq.name) ? 'ring-2 ring-indigo-400 bg-gray-800' : 'hover:bg-gray-700'}`}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) toggleSequence(seq.name);
                      else if (e.shiftKey) {
                        const lastIdx = sequences.findIndex(s => s.name === selectedSequences[selectedSequences.length - 1]);
                        const currIdx = sequences.findIndex(s => s.name === seq.name);
                        if (lastIdx !== -1) {
                          const [start, end] = [lastIdx, currIdx].sort((a, b) => a - b);
                          setSelectedSequences(Array.from(new Set([...selectedSequences, ...sequences.slice(start, end + 1).map(s => s.name)])));
                        } else {
                          toggleSequence(seq.name);
                        }
                      } else {
                        setSelectedSequences([seq.name]);
                      }
                    }}
                    onDoubleClick={() => setTimeout(() => handleSequenceDoubleClick(seq), 0)}
                    title={seq.name}
                  >
                    <img 
                      src={thumbnailUrl} 
                      alt={seq.name} 
                      className="w-7 h-7 object-cover rounded bg-gray-900" 
                      onError={(e) => {
                        // 썸네일 로드 실패시 스프라이트 이미지로 대체
                        e.target.src = `${getServerBaseUrl()}/projects/${projectName}/library/sequences/${encodeURIComponent(seq.name)}/sprite.png`;
                        e.target.onerror = () => {
                          e.target.src = 'https://via.placeholder.com/150/222/FFF?text=Error';
                        };
                      }} 
                    />
                    <div className="w-full text-[8px] text-gray-400 text-center truncate mt-0.5">{seq.name}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
} 