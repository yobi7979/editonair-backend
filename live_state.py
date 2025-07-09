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
        # 프로젝트별 라이브 상태 저장
        # 구조: {project_name: {object_id: {properties: {...}, last_updated: timestamp}}}
        self.live_states: Dict[str, Dict[int, Dict[str, Any]]] = {}
        
        # 씬 송출 상태 저장
        # 구조: {project_name: {scene_id: {is_live: bool, last_updated: timestamp}}}
        self.scene_states: Dict[str, Dict[int, Dict[str, Any]]] = {}
        
        # 타이머 상태 저장
        # 구조: {object_id: {is_running: bool, start_time: timestamp, elapsed: float, project_name: str, time_format: str}}
        self.timer_states: Dict[int, Dict[str, Any]] = {}
        
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
        """타이머 업데이트 스레드 시작"""
        if self.timer_update_thread is None or not self.timer_update_thread.is_alive():
            self.timer_update_running = True
            self.timer_update_thread = threading.Thread(target=self._timer_update_loop, daemon=True)
            self.timer_update_thread.start()
    
    def stop_timer_updates(self):
        """타이머 업데이트 스레드 정지"""
        self.timer_update_running = False
        if self.timer_update_thread and self.timer_update_thread.is_alive():
            self.timer_update_thread.join(timeout=1)
    
    def _timer_update_loop(self):
        """타이머 업데이트 루프"""
        while self.timer_update_running:
            try:
                # 실행 중인 타이머들 업데이트
                running_timers = {obj_id: state for obj_id, state in self.timer_states.items() 
                                if state.get('is_running', False)}
                
                if running_timers and self.websocket_update_callback:
                    for obj_id, timer_state in running_timers.items():
                        project_name = timer_state.get('project_name')
                        time_format = timer_state.get('time_format', 'MM:SS')
                        
                        if project_name:
                            # 타이머 상태 업데이트
                            updated_state = self.get_timer_state(obj_id, time_format)
                            
                            # 라이브 상태 업데이트
                            self.update_object_property(project_name, obj_id, 'content', updated_state['current_time'])
                            
                            # WebSocket으로 실시간 업데이트 전송
                            timer_update_data = {
                                'object_id': obj_id,
                                'action': 'update',
                                'timer_state': updated_state,
                                'timestamp': datetime.now().isoformat()
                            }
                            
                            # 콜백 함수를 통해 WebSocket 업데이트 전송
                            self.websocket_update_callback(timer_update_data, project_name)
                
                # 1초마다 업데이트
                time.sleep(1)
                
            except Exception as e:
                print(f"타이머 업데이트 루프 오류: {e}")
                time.sleep(1)
    
    def get_project_live_state(self, project_name: str) -> Dict[int, Dict[str, Any]]:
        """프로젝트의 모든 라이브 상태 반환"""
        return self.live_states.get(project_name, {})
    
    def get_object_live_state(self, project_name: str, object_id: int) -> Optional[Dict[str, Any]]:
        """특정 객체의 라이브 상태 반환"""
        project_state = self.live_states.get(project_name, {})
        return project_state.get(object_id)
    
    def set_object_live_state(self, project_name: str, object_id: int, properties: Dict[str, Any]):
        """객체의 라이브 상태 설정"""
        if project_name not in self.live_states:
            self.live_states[project_name] = {}
        
        self.live_states[project_name][object_id] = {
            'properties': properties,
            'last_updated': datetime.now().isoformat()
        }
    
    def update_object_property(self, project_name: str, object_id: int, property_name: str, value: Any):
        """객체의 특정 속성만 업데이트"""
        if project_name not in self.live_states:
            self.live_states[project_name] = {}
        
        if object_id not in self.live_states[project_name]:
            self.live_states[project_name][object_id] = {
                'properties': {},
                'last_updated': datetime.now().isoformat()
            }
        
        self.live_states[project_name][object_id]['properties'][property_name] = value
        self.live_states[project_name][object_id]['last_updated'] = datetime.now().isoformat()
    
    def clear_project_live_state(self, project_name: str):
        """프로젝트의 모든 라이브 상태 초기화"""
        if project_name in self.live_states:
            del self.live_states[project_name]
        if project_name in self.scene_states:
            del self.scene_states[project_name]
    
    # 씬 상태 관리
    def set_scene_live(self, project_name: str, scene_id: int, is_live: bool):
        """씬의 송출 상태 설정"""
        if project_name not in self.scene_states:
            self.scene_states[project_name] = {}
        
        self.scene_states[project_name][scene_id] = {
            'is_live': is_live,
            'last_updated': datetime.now().isoformat()
        }
    
    def get_scene_live_state(self, project_name: str, scene_id: int) -> bool:
        """씬의 송출 상태 반환"""
        project_scenes = self.scene_states.get(project_name, {})
        scene_state = project_scenes.get(scene_id, {})
        return scene_state.get('is_live', False)
    
    def get_all_live_scenes(self, project_name: str) -> Dict[int, bool]:
        """프로젝트의 모든 씬 송출 상태 반환"""
        project_scenes = self.scene_states.get(project_name, {})
        return {scene_id: state['is_live'] for scene_id, state in project_scenes.items()}
    
    # 타이머 상태 관리
    def start_timer(self, object_id: int, project_name: str = None, time_format: str = 'MM:SS'):
        """타이머 시작"""
        current_time = time.time()
        if object_id in self.timer_states:
            # 이미 있는 타이머라면 elapsed 시간 누적
            elapsed = self.timer_states[object_id].get('elapsed', 0)
        else:
            elapsed = 0
        
        self.timer_states[object_id] = {
            'is_running': True,
            'start_time': current_time,
            'elapsed': elapsed,
            'project_name': project_name,
            'time_format': time_format
        }
    
    def stop_timer(self, object_id: int):
        """타이머 정지"""
        if object_id in self.timer_states and self.timer_states[object_id]['is_running']:
            current_time = time.time()
            start_time = self.timer_states[object_id]['start_time']
            elapsed = self.timer_states[object_id]['elapsed']
            
            self.timer_states[object_id] = {
                **self.timer_states[object_id],
                'is_running': False,
                'elapsed': elapsed + (current_time - start_time)
            }
    
    def reset_timer(self, object_id: int):
        """타이머 리셋"""
        if object_id in self.timer_states:
            project_name = self.timer_states[object_id].get('project_name')
            time_format = self.timer_states[object_id].get('time_format', 'MM:SS')
            
            self.timer_states[object_id] = {
                'is_running': False,
                'start_time': 0,
                'elapsed': 0,
                'project_name': project_name,
                'time_format': time_format
            }
        else:
            self.timer_states[object_id] = {
                'is_running': False,
                'start_time': 0,
                'elapsed': 0,
                'project_name': None,
                'time_format': 'MM:SS'
            }
    
    def get_timer_state(self, object_id: int, time_format: str = 'MM:SS') -> Dict[str, Any]:
        """타이머 상태 반환"""
        if object_id not in self.timer_states:
            return {
                'is_running': False,
                'elapsed': 0,
                'current_time': self._format_time(0, time_format)
            }
        
        timer = self.timer_states[object_id]
        elapsed = timer['elapsed']
        
        if timer['is_running']:
            current_time = time.time()
            elapsed += (current_time - timer['start_time'])
        
        # 시간 포맷팅
        current_time_str = self._format_time(elapsed, time_format)
        
        return {
            'is_running': timer['is_running'],
            'elapsed': elapsed,
            'current_time': current_time_str
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

# 전역 라이브 상태 관리자 인스턴스
live_state_manager = LiveStateManager() 