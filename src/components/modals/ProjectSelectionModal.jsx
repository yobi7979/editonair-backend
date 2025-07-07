import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, createProject, deleteProject, getCurrentUser } from '../../api/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, FolderOpen, Trash2, LogOut, User } from 'lucide-react';

const LOCAL_API = "http://localhost:5000/api";
const IP_API = "https://editonair-backend-production.up.railway.app/api";

const ProjectSelectionModal = ({ isOpen, onProjectSelect, onProjectCreate, setApiBaseUrl }) => {
  const navigate = useNavigate();
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiUrl, setApiUrl] = useState(IP_API);
  const [activeApiUrl, setActiveApiUrl] = useState(IP_API);
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(false);

  const handleConnect = () => {
    setActiveApiUrl(apiUrl);
    if (setApiBaseUrl) setApiBaseUrl(apiUrl);
  };

  const fetchCurrentUser = async () => {
    setUserLoading(true);
    try {
      const user = await getCurrentUser(activeApiUrl);
      setCurrentUser(user);
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      // 토큰이 유효하지 않으면 로그인 페이지로 이동
      if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        handleLogout();
      }
    } finally {
      setUserLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      fetchCurrentUser();
    }
  }, [isOpen, activeApiUrl]);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedProjects = await getProjects(activeApiUrl);
      setProjects(fetchedProjects || []);
    } catch (err) {
      setError('Failed to load projects. Please try again.');
      console.error(err);
    }
    setIsLoading(false);
  };

  // 프로젝트 이름 유효성 검사 함수
  const validateProjectName = (name) => {
    const errors = [];
    
    if (!name.trim()) {
      errors.push('프로젝트 이름을 입력해주세요.');
      return errors;
    }
    
    // 영문 대문자 검사
    if (/[A-Z]/.test(name)) {
      errors.push('영문 대문자는 사용할 수 없습니다. 소문자를 사용해주세요.');
    }
    
    // 띄어쓰기 검사
    if (/\s/.test(name)) {
      errors.push('띄어쓰기는 사용할 수 없습니다. 하이픈(-) 또는 언더스코어(_)를 사용해주세요.');
    }
    
    // 중복 이름 검사 (대소문자 구분 없이)
    if (projects.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
      errors.push('이미 존재하는 프로젝트 이름입니다.');
    }
    
    return errors;
  };

  const handleCreateNewProject = async () => {
    const validationErrors = validateProjectName(newProjectName);
    
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const newProject = await createProject(activeApiUrl, { name: newProjectName.trim() });
      if (onProjectSelect) {
        onProjectSelect(newProject);
      }
      setNewProjectName('');
      setShowCreateInput(false);
    } catch (err) {
      // 서버 측 에러 메시지 처리
      if (err.message && err.message.includes('already exists')) {
        setError('이미 존재하는 프로젝트 이름입니다. 다른 이름을 사용해주세요.');
      } else if (err.message && err.message.includes('duplicate')) {
        setError('중복된 프로젝트 이름입니다. 다른 이름을 사용해주세요.');
      } else {
        setError('프로젝트 생성에 실패했습니다. 다시 시도해주세요.');
      }
      console.error('Project creation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 실시간 중복 체크 함수 (더 이상 사용하지 않음)
  const checkDuplicateName = (name) => {
    if (!name.trim()) return false;
    return projects.some(p => p.name.toLowerCase() === name.trim().toLowerCase());
  };

  // 입력값 변경 시 실시간 유효성 검사
  const handleNameChange = (e) => {
    const value = e.target.value;
    setNewProjectName(value);
    
    // 실시간으로 유효성 검사하고 에러 메시지 표시
    if (value.trim()) {
      const validationErrors = validateProjectName(value);
      if (validationErrors.length > 0) {
        setError(validationErrors.join(' '));
      } else {
        setError(null);
      }
    } else {
      setError(null);
    }
  };

  const handleDeleteProject = async (e, projectId, projectName) => {
    e.stopPropagation();
    if (!window.confirm(`"${projectName}" 프로젝트를 삭제하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await deleteProject(activeApiUrl, projectName);
      fetchProjects();
    } catch (err) {
      setError('Failed to delete project. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProject = (project) => {
    if (onProjectSelect) {
      onProjectSelect(project);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => { /* Controlled by isOpen prop */ }}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Open or Create Project</DialogTitle>
              <DialogDescription>
                Select an existing project to open or create a new one.
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              {userLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : currentUser ? (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-md">
                    <User className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-800">{currentUser.username}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="flex items-center space-x-1 hover:bg-red-50 hover:border-red-200"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>로그아웃</span>
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-red-500">사용자 정보 없음</div>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="mb-2 flex items-center">
          <span className="font-medium text-sm mr-2">API 서버 선택:</span>
          <label className="mr-4">
            <input
              type="radio"
              name="api"
              value={LOCAL_API}
              checked={apiUrl === LOCAL_API}
              onChange={() => setApiUrl(LOCAL_API)}
            /> localhost
          </label>
          <label>
            <input
              type="radio"
              name="api"
              value={IP_API}
              checked={apiUrl === IP_API}
              onChange={() => setApiUrl(IP_API)}
            /> 내 IP
          </label>
          <Button className="ml-4" onClick={handleConnect}>접속</Button>
        </div>
        <div className="grid gap-4 py-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {!showCreateInput ? (
            <Button onClick={() => setShowCreateInput(true)} className="w-full justify-start">
              <PlusCircle className="mr-2 h-4 w-4" /> Create New Project
            </Button>
          ) : (
            <div className="flex w-full max-w-sm items-center space-x-2">
              <Input 
                type="text" 
                placeholder="프로젝트 이름을 입력하세요 (소문자, 하이픈, 언더스코어만 사용)" 
                value={newProjectName}
                onChange={handleNameChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const validationErrors = validateProjectName(newProjectName);
                    if (validationErrors.length === 0) {
                      handleCreateNewProject();
                    }
                  }
                }}
                autoFocus
                className={error ? 'border-red-500' : ''}
              />
              <Button 
                onClick={handleCreateNewProject} 
                disabled={isLoading || validateProjectName(newProjectName).length > 0}
              >
                생성
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCreateInput(false);
                setNewProjectName('');
                setError(null);
              }}>Cancel</Button>
            </div>
          )}
          
          <h3 className="text-sm font-medium mt-4 mb-2">Existing Projects:</h3>
          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
            {isLoading && projects.length === 0 && <p>Loading projects...</p>}
            {!isLoading && projects.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">No projects found. Create a new one!</p>
            )}
            {projects.map((project) => (
              <div 
                key={project.id} 
                className="flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer"
                onClick={() => handleSelectProject(project)}
              >
                <div className="flex items-center flex-grow min-w-0">
                  <FolderOpen className="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{project.name}</span>
                </div>
                <div className="flex items-center flex-shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground mr-4">
                        {project.updated_at ? new Date(project.updated_at).toLocaleDateString() : ''}
                    </span>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={(e) => handleDeleteProject(e, project.id, encodeURIComponent(project.name))}
                    >
                        <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700" />
                    </Button>
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>
        <DialogFooter>
          {/* Optional: Add a close button if needed, though selection usually closes it */}
          {/* <Button variant="outline" onClick={() => {}}>Close</Button> */}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectSelectionModal;
