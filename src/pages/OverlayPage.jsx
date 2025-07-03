import React, { useEffect, useState, useRef } from 'react';
import { getProject } from '../api/projects';
import { io } from 'socket.io-client';

const API_BASE_URL = 'https://editonair-backend-production.up.railway.app/api';

function SequencePlayer({ properties }) {
  const { spriteUrl, frameCount = 1, frameWidth, frameHeight, width, height, fps = 24, loop } = properties || {};
  const [frameIdx, setFrameIdx] = useState(0);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!spriteUrl || !frameCount || !fps) return;
    setFrameIdx(0);
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
  }, [spriteUrl, frameCount, fps, loop]);

  useEffect(() => {
    if (!spriteUrl || !frameCount) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      drawFrame();
    };
    img.onerror = () => {
      imgRef.current = null;
    };
    img.src = spriteUrl;
    return () => { imgRef.current = null; };
  }, [spriteUrl]);

  useEffect(() => {
    drawFrame();
    // eslint-disable-next-line
  }, [frameIdx, width, height]);

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const canvasWidth = width || frameWidth || 320;
    const canvasHeight = height || frameHeight || 180;
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      0, frameHeight * frameIdx,
      frameWidth, frameHeight,
      0, 0,
      canvasWidth, canvasHeight
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
        background: 'transparent',
        objectFit: 'contain',
        display: 'block',
        position: 'absolute',
        left: properties.x || 0,
        top: properties.y || 0,
      }}
    />
  );
}

export default function OverlayPage() {
  const [loading, setLoading] = useState(true);
  const [isSceneOut, setIsSceneOut] = useState(false); // 씬 아웃 상태

  useEffect(() => {
    // 소켓 연결
    console.log('소켓 연결 시도...');
    const socket = io('wss://editonair-backend-production.up.railway.app', {
      path: '/socket.io',
      transports: ['websocket'],
    });
    
    socket.on('connect', () => {
      console.log('소켓 연결 성공!');
    });
    
    socket.on('connect_error', (error) => {
      console.log('소켓 연결 실패:', error);
    });
    
    socket.on('scene_out', () => {
      console.log('scene_out 이벤트 수신!');
      setIsSceneOut(true);
    });
    // 씬이 다시 송출될 때(예: scene_change 등)에는 isSceneOut을 false로 돌릴 수 있음
    socket.on('scene_change', () => {
      console.log('scene_change 이벤트 수신!');
      setIsSceneOut(false);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    // 로딩 시뮬레이션 (실제로는 더미 페이지를 바로 표시)
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
  return (
      <div style={{ width: 1920, height: 1080, background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        로딩 중...
      </div>
    );
  }

  if (isSceneOut) {
    // 더미 송출 페이지
    return (
      <div style={{ width: 1920, height: 1080, background: 'black', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* 더미 텍스트 */}
        <div style={{ 
          color: 'white', 
          fontSize: '48px', 
          fontWeight: 'bold',
          textAlign: 'center',
          textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
        }}>
          <div>더미 송출 페이지</div>
          <div style={{ fontSize: '24px', marginTop: '20px', color: '#ccc' }}>
            실제 씬이 송출되기 전까지 표시됩니다
          </div>
          <div style={{ fontSize: '16px', marginTop: '40px', color: '#888' }}>
            {new Date().toLocaleString()}
          </div>
        </div>
        {/* 더미 그래픽 요소들 */}
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '50px',
          width: '200px',
          height: '200px',
          background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
          borderRadius: '50%',
          opacity: 0.3
        }} />
        <div style={{
          position: 'absolute',
          bottom: '50px',
          left: '50px',
          width: '150px',
          height: '150px',
          background: 'linear-gradient(45deg, #a8edea, #fed6e3)',
          borderRadius: '10px',
          opacity: 0.4
        }} />
      </div>
            );
  }

  // 더미 페이지 컨텐츠
  return (
    <div style={{ width: 1920, height: 1080, background: 'black', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* 더미 텍스트 */}
      <div style={{ 
        color: 'white', 
        fontSize: '48px', 
        fontWeight: 'bold',
        textAlign: 'center',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        <div>더미 송출 페이지</div>
        <div style={{ fontSize: '24px', marginTop: '20px', color: '#ccc' }}>
          실제 씬이 송출되기 전까지 표시됩니다
        </div>
        <div style={{ fontSize: '16px', marginTop: '40px', color: '#888' }}>
          {new Date().toLocaleString()}
        </div>
      </div>
      
      {/* 더미 그래픽 요소들 */}
      <div style={{
        position: 'absolute',
        top: '50px',
        right: '50px',
        width: '200px',
        height: '200px',
        background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
        borderRadius: '50%',
        opacity: 0.3
      }} />
      
      <div style={{
        position: 'absolute',
        bottom: '50px',
        left: '50px',
        width: '150px',
        height: '150px',
        background: 'linear-gradient(45deg, #a8edea, #fed6e3)',
        borderRadius: '10px',
        opacity: 0.4
      }} />
    </div>
  );
} 