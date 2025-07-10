"""
라이브 상태 관리 시스템
- 원본 프로젝트 데이터와 분리된 임시 상태 관리
- 실시간 방송 중 객체 속성 변경
- 메모리 기반 상태 저장 (서버 재시작 시 초기화)
"""

import time
import threading
from typing import Dict, Any, Optional, Callable
from datetime import datetime

class LiveStateManager:
    def __init__(self):
        # 프로젝트별 채널별 라이브 상태 저장
        # 구조: {project_name: {channel_id: {object_id: {properties: {...}, last_updated: timestamp}}}}
        self.live_states: Dict[str, Dict[str, Dict[int, Dict[str, Any]]]] = {}
        
        # 프로젝트별 채널별 씬 송출 상태 저장
        # 구조: {project_name: {channel_id: {scene_id: {is_live: bool, last_updated: timestamp}}}}
        self.scene_states: Dict[str, Dict[str, Dict[int, Dict[str, Any]]]] = {}
        
        # 프로젝트별 채널별 타이머 상태 저장 (새로운 단순 구조)
        # 구조: {project_name: {channel_id: {object_id: {is_running: bool, start_time: float, elapsed: float, time_format: str}}}}
        self.timer_states: Dict[str, Dict[str, Dict[int, Dict[str, Any]]]] = {}
        
        # 타이머 업데이트 스레드
        self.timer_update_thread = None
        self.timer_update_running = False
        
        # WebSocket 업데이트 콜백 함수
        self.websocket_update_callback = None
        
        # 타이머 업데이트 시작
        self.start_timer_updates()
    
    def set_websocket_callback(self, callback: Callable):
        """WebSocket 업데이트 콜백 함수 설정"""
        self.websocket_update_callback = callback
    
    def start_timer_updates(self):
        """타이머 업데이트 스레드 시작 (단순화 - 비활성화)"""
        # 복잡한 서버 측 타이머 업데이트는 비활성화
        # 클라이언트 측에서 직접 타이머를 관리하도록 변경
        print("⏰ 서버 측 타이머 업데이트 스레드 비활성화 (클라이언트 중심 시스템)")
        pass
    
    def stop_timer_updates(self):
        """타이머 업데이트 스레드 정지 (단순화)"""
        print("⏰ 서버 측 타이머 업데이트 스레드 정지")
        pass
    
    def _timer_update_loop(self):
        """타이머 업데이트 루프 (단순화 - 비활성화)"""
        # 복잡한 서버 측 타이머 업데이트는 비활성화
        pass
    
    # 라이브 상태 관리
    def update_object_property(self, project_name: str, object_id: int, property_name: str, value: Any, channel_id: str = 'default'):
        """객체 속성 실시간 업데이트 (채널별)"""
        if project_name not in self.live_states:
            self.live_states[project_name] = {}
        if channel_id not in self.live_states[project_name]:
            self.live_states[project_name][channel_id] = {}
        if object_id not in self.live_states[project_name][channel_id]:
            self.live_states[project_name][channel_id][object_id] = {'properties': {}, 'last_updated': time.time()}
        
        self.live_states[project_name][channel_id][object_id]['properties'][property_name] = value
        self.live_states[project_name][channel_id][object_id]['last_updated'] = time.time()
    
    def get_object_property(self, project_name: str, object_id: int, property_name: str, channel_id: str = 'default') -> Any:
        """객체 속성 조회 (채널별)"""
        if (project_name in self.live_states and 
            channel_id in self.live_states[project_name] and
            object_id in self.live_states[project_name][channel_id] and
            property_name in self.live_states[project_name][channel_id][object_id]['properties']):
            return self.live_states[project_name][channel_id][object_id]['properties'][property_name]
        return None
    
    def get_project_live_state(self, project_name: str, channel_id: str = 'default') -> Dict[int, Dict[str, Any]]:
        """프로젝트 라이브 상태 조회 (채널별)"""
        if project_name in self.live_states and channel_id in self.live_states[project_name]:
            return self.live_states[project_name][channel_id]
        return {}
    
    def clear_project_live_state(self, project_name: str):
        """프로젝트 라이브 상태 초기화"""
        if project_name in self.live_states:
            del self.live_states[project_name]
        if project_name in self.timer_states:
            del self.timer_states[project_name]
        if project_name in self.scene_states:
            del self.scene_states[project_name]
    
    # 씬 상태 관리
    def set_scene_live(self, project_name: str, scene_id: int, is_live: bool, channel_id: str = 'default'):
        """씬 송출 상태 설정 (채널별)"""
        if project_name not in self.scene_states:
            self.scene_states[project_name] = {}
        if channel_id not in self.scene_states[project_name]:
            self.scene_states[project_name][channel_id] = {}
        
        self.scene_states[project_name][channel_id][scene_id] = {
            'is_live': is_live,
            'last_updated': time.time()
        }
    
    def get_scene_live_state(self, project_name: str, scene_id: int, channel_id: str = 'default') -> bool:
        """씬 송출 상태 조회 (채널별)"""
        if (project_name in self.scene_states and 
            channel_id in self.scene_states[project_name] and
            scene_id in self.scene_states[project_name][channel_id]):
            return self.scene_states[project_name][channel_id][scene_id]['is_live']
        return False
    
    # 타이머 상태 관리 (단순화)
    def start_timer(self, object_id: int, project_name: str, time_format: str = 'MM:SS', channel_id: str = 'default'):
        """타이머 시작 (단순화 - 상태 저장만)"""
        current_time = time.time()
        
        # 채널별 타이머 상태 초기화
        if project_name not in self.timer_states:
            self.timer_states[project_name] = {}
        if channel_id not in self.timer_states[project_name]:
            self.timer_states[project_name][channel_id] = {}
        
        # 타이머 상태 설정 (단순화)
        self.timer_states[project_name][channel_id][object_id] = {
            'is_running': True,
            'start_time': current_time,
            'elapsed': 0,
            'time_format': time_format
        }
        
        print(f"⏰ 타이머 상태 저장: {object_id} 시작 - 채널: {channel_id}")
        
        return {
            'start_time': current_time,
            'elapsed': 0,
            'time_format': time_format
        }
    
    def stop_timer(self, object_id: int, project_name: str, channel_id: str = 'default'):
        """타이머 정지 (단순화 - 상태 저장만)"""
        if (project_name in self.timer_states and 
            channel_id in self.timer_states[project_name] and
            object_id in self.timer_states[project_name][channel_id]):
            
            # 타이머 상태 업데이트
            self.timer_states[project_name][channel_id][object_id]['is_running'] = False
            
            print(f"⏰ 타이머 상태 저장: {object_id} 정지 - 채널: {channel_id}")
            
            return {
                'elapsed': self.timer_states[project_name][channel_id][object_id].get('elapsed', 0)
            }
        
        return {'elapsed': 0}
    
    def reset_timer(self, object_id: int, project_name: str, channel_id: str = 'default'):
        """타이머 리셋 (단순화 - 상태 저장만)"""
        # 채널별 타이머 상태 초기화
        if project_name not in self.timer_states:
            self.timer_states[project_name] = {}
        if channel_id not in self.timer_states[project_name]:
            self.timer_states[project_name][channel_id] = {}
        
        # 기존 시간 형식 유지
        time_format = 'MM:SS'
        if object_id in self.timer_states[project_name][channel_id]:
            time_format = self.timer_states[project_name][channel_id][object_id].get('time_format', 'MM:SS')
        
        # 타이머 상태 리셋
        self.timer_states[project_name][channel_id][object_id] = {
            'is_running': False,
            'start_time': 0,
            'elapsed': 0,
            'time_format': time_format
        }
        
        print(f"⏰ 타이머 상태 저장: {object_id} 리셋 - 채널: {channel_id}")
        
        return {'elapsed': 0}
    
    def get_timer_state(self, object_id: int, time_format: str = 'MM:SS', project_name: str = None, channel_id: str = 'default') -> Dict[str, Any]:
        """타이머 상태 반환 (채널별)"""
        if (not project_name or project_name not in self.timer_states or 
            channel_id not in self.timer_states[project_name] or
            object_id not in self.timer_states[project_name][channel_id]):
            return {
                'is_running': False,
                'start_time': None,
                'elapsed': 0,
                'current_time': self._format_time(0, time_format),
                'time_format': time_format
            }
        
        timer = self.timer_states[project_name][channel_id][object_id]
        elapsed = timer['elapsed']
        
        if timer['is_running']:
            current_time = time.time()
            elapsed += (current_time - timer['start_time'])
        
        # 시간 포맷팅
        current_time_str = self._format_time(elapsed, timer.get('time_format', time_format))
        
        return {
            'is_running': timer['is_running'],
            'start_time': timer.get('start_time'),
            'elapsed': elapsed,
            'current_time': current_time_str,
            'time_format': timer.get('time_format', time_format)
        }
    
    def _format_time(self, elapsed_seconds: float, time_format: str = 'MM:SS') -> str:
        """시간을 지정된 형식으로 포맷팅"""
        if time_format == 'SS':
            # 초만 표시
            return f"{int(elapsed_seconds):02d}"
        elif time_format == 'HH:MM:SS':
            # 시:분:초 형식
            hours = int(elapsed_seconds // 3600)
            minutes = int((elapsed_seconds % 3600) // 60)
            seconds = int(elapsed_seconds % 60)
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        else:
            # 기본 MM:SS 형식
            minutes = int(elapsed_seconds // 60)
            seconds = int(elapsed_seconds % 60)
            return f"{minutes:02d}:{seconds:02d}"

# 전역 라이브 상태 매니저 인스턴스
live_state_manager = LiveStateManager() 