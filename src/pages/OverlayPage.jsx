import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

export default function OverlayPage() {
    const { projectId } = useParams();
    const [socket, setSocket] = useState(null);
    const [currentScene, setCurrentScene] = useState(null);

    useEffect(() => {
        // Socket.IO 연결 설정 - project_id만 전달
        const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
            query: { project_id: projectId }
        });

        // 이벤트 핸들러 설정
        newSocket.on('connect', () => {
            console.log('WebSocket 연결됨');
        });

        newSocket.on('connect_error', (err) => {
            console.error('WebSocket 연결 실패:', err);
        });

        newSocket.on('scene_change', (data) => {
            console.log('씬 변경:', data);
            setCurrentScene(data);
        });

        newSocket.on('scene_out', () => {
            console.log('씬 아웃');
            setCurrentScene(null);
        });

        setSocket(newSocket);

        // 컴포넌트 언마운트 시 연결 해제
        return () => {
            newSocket.close();
        };
    }, [projectId]);

    return (
        <div className="overlay-container">
            {currentScene ? (
                <div className="scene-content">
                    {/* 씬 콘텐츠 렌더링 */}
                </div>
            ) : (
                <div className="empty-scene">
                    송출 대기 중...
                </div>
            )}
        </div>
    );
} 