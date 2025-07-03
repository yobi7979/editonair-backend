import { Save, PlaySquare, UserCircle, Settings, FolderOpen, Upload, Home } from 'lucide-react';
import { exportProject } from '../../utils/exportProject';
import { importProject, applyImportedProject, addImportedScenesToCurrentProject } from '../../utils/importProject';
import { useRef, useState } from 'react';

export default function Header({ project, scenes, setProject, setScenes, apiBaseUrl, setCurrentProjectName, getProject, currentProjectName, onOpenProjectModal }) {
  const folderInputRef = useRef(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressError, setProgressError] = useState('');
  const [importedData, setImportedData] = useState(null); // 불러온 데이터 저장

  // 프로젝트명을 slug로 변환하는 함수
  const slugify = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // 폴더 내보내기
  const handleExportProject = async () => {
    if (!project || !scenes || scenes.length === 0) {
      alert('내보낼 프로젝트가 없습니다.');
      return;
    }
    setProgressOpen(true);
    setProgressMsg('시작 중...');
    setProgressError('');
    try {
      const result = await exportProject(project, scenes, msg => setProgressMsg(msg));
      if (!result.success) {
        setProgressError(result.message);
      } else {
        setProgressMsg(result.message);
        setTimeout(() => setProgressOpen(false), 1200);
      }
    } catch (e) {
      setProgressError(e.message);
    }
  };

  // 폴더 불러오기
  const handleImportProject = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    if (!currentProjectName) {
      alert('먼저 프로젝트를 선택해주세요.');
      return;
    }
    
    setProgressOpen(true);
    setProgressMsg('시작 중...');
    setProgressError('');
    try {
      const result = await importProject(files, msg => setProgressMsg(msg));
      if (result.success) {
        const importedDataObj = {
          projectData: result.data,
          imageMap: result.imageMap,
          sequenceMap: result.sequenceMap
        };
        setImportedData(importedDataObj);
        setProgressMsg('폴더 로드 완료! 씬들을 현재 프로젝트에 추가 중...');
        // importedData를 직접 전달하여 비동기 상태 업데이트 문제 해결
        await handleAddScenesToCurrentProject(importedDataObj);
      } else {
        setProgressError(result.message);
      }
    } catch (error) {
      setProgressError(error.message);
    }
    event.target.value = '';
  };

  // 현재 프로젝트에 씬 추가
  const handleAddScenesToCurrentProject = async (dataToUse = null) => {
    const data = dataToUse || importedData;
    if (!data || !apiBaseUrl || !currentProjectName) {
      alert('추가할 씬이 없거나 프로젝트가 선택되지 않았습니다.');
      return;
    }
    // setProgressOpen(true); // 이미 handleImportProject에서 호출됨
    setProgressMsg('현재 프로젝트에 씬 추가 시작...');
    setProgressError('');
    try {
      const result = await addImportedScenesToCurrentProject(
        data.projectData,
        data.imageMap,
        data.sequenceMap,
        apiBaseUrl,
        currentProjectName,
        msg => setProgressMsg(msg)
      );
      if (result.success) {
        setProgressMsg('씬 추가 완료! 프로젝트를 새로고침 중...');
        setImportedData(null); // 추가 완료 후 초기화
        
        // 현재 프로젝트를 다시 불러와서 새로 추가된 씬들 포함
        try {
          const serverProject = await getProject(apiBaseUrl, currentProjectName);
          setProject(serverProject);
          const fetchedScenes = serverProject.scenes || [];
          setScenes(
            fetchedScenes.map((s) => ({
              ...s,
              objects: Array.isArray(s.objects) ? s.objects : [],
            }))
          );
          setProgressMsg('프로젝트가 성공적으로 업데이트되었습니다!');
          setTimeout(() => setProgressOpen(false), 2000);
        } catch (loadError) {
          setProgressError(`씬 추가는 완료되었지만 프로젝트 새로고침 실패: ${loadError.message}`);
        }
      } else {
        setProgressError(result.message);
      }
    } catch (error) {
      setProgressError(error.message);
    }
  };

  // 폴더 선택 다이얼로그 열기
  const handleImportClick = () => {
    if (!currentProjectName) {
      alert('먼저 프로젝트를 선택해주세요.');
      return;
    }
    folderInputRef.current?.click();
  };

  return (
    <header className="bg-gray-800 text-white p-3 shadow-md flex items-center justify-between h-16 z-50">
      {/* 진행상황/오류 모달 */}
      {progressOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[9999]">
          <div className="bg-gray-900 rounded-lg p-6 min-w-[320px] max-w-[90vw] shadow-xl border border-gray-700">
            <div className="text-lg font-bold mb-2 text-indigo-400">진행상황</div>
            <div className="text-gray-200 mb-2 whitespace-pre-line min-h-[2em]">{progressMsg}</div>
            {progressError && <div className="text-red-400 mb-2">{progressError}</div>}
            <button className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded" onClick={() => setProgressOpen(false)}>닫기</button>
          </div>
        </div>
      )}
      {/* Left Section: App Title/Logo & Actions */}
      <div className="flex items-center">
        {/* <img src="/logo.svg" alt="EditOnAir Logo" className="h-8 w-auto mr-3" /> */}
        <h1 className="text-xl font-bold tracking-tight">EditOnAir</h1>
        {/* Left-aligned Action Buttons */}
        <div className="flex items-center space-x-2 ml-4">
          <button
            title="프로젝트 선택"
            className="p-2 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onClick={onOpenProjectModal}
          >
            <Home size={20} />
          </button>
          <button
            title="폴더로 내보내기"
            className="p-2 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onClick={handleExportProject}
          >
            <Save size={20} />
          </button>
          <button
            title="폴더 불러와서 현재 프로젝트에 씬 추가"
            className="p-2 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onClick={handleImportClick}
          >
            <FolderOpen size={20} />
          </button>
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleImportProject}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Center Section: Project Name */}
      <div className="flex-1 text-center">
        <span className="text-lg text-gray-300">{project?.name || 'Untitled Project'}</span>
        {!currentProjectName && (
          <div className="text-xs text-yellow-400 mt-1">프로젝트를 선택해주세요</div>
        )}
      </div>

      {/* Right Section: Action Buttons */}
      <div className="flex items-center space-x-2">
        <button
          title="Preview Output"
          className="p-2 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <PlaySquare size={20} />
        </button>
        <button
          title="User Profile"
          className="p-2 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <UserCircle size={20} />
        </button>
        <button
          title="Settings"
          className="p-2 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
