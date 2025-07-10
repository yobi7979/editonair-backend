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
        
        # 프로젝트별 채널별 타이머 상태 저장
        # 구조: {project_name: {channel_id: {object_id: {is_running: bool, start_time: timestamp, elapsed: float, time_format: str}}}}
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
        """타이머 동기화 루프 (하이브리드 방식, 채널별)"""
        while self.timer_update_running:
            try:
                # 실행 중인 타이머들 동기화 (30초마다)
                running_timers = []
                for project_name, project_channels in self.timer_states.items():
                    for channel_id, channel_timers in project_channels.items():
                        for obj_id, timer_state in channel_timers.items():
                            if timer_state.get('is_running', False):
                                running_timers.append({
                                    'project_name': project_name,
                                    'channel_id': channel_id,
                                    'object_id': obj_id,
                                    'timer_state': timer_state
                                })
                
                if running_timers and self.websocket_update_callback:
                    print(f"⏰ 실행 중인 타이머 동기화 - 개수: {len(running_timers)}")
                    for timer_info in running_timers:
                        project_name = timer_info['project_name']
                        channel_id = timer_info['channel_id']
                        obj_id = timer_info['object_id']
                        timer_state = timer_info['timer_state']
                        
                        # 서버 시간 기준으로 경과 시간 계산
                        current_time = time.time()
                        start_time = timer_state['start_time']
                        elapsed = timer_state['elapsed'] + (current_time - start_time)
                        
                        # 동기화 데이터 전송
                        sync_data = {
                            'object_id': obj_id,
                            'action': 'sync',
                            'server_time': current_time,
                            'start_time': start_time,
                            'elapsed': elapsed,
                            'channel_id': channel_id,
                            'timestamp': datetime.now().isoformat()
                        }
                        
                        # 콜백 함수를 통해 WebSocket 동기화 전송
                        self.websocket_update_callback(sync_data, project_name)
                        print(f"⏰ 타이머 동기화 전송 완료 - 객체 ID: {obj_id}, 채널: {channel_id}, 경과: {elapsed:.1f}초")
                
                # 30초마다 동기화 (실시간 업데이트 대신)
                time.sleep(30)
                
            except Exception as e:
                print(f"타이머 동기화 루프 오류: {e}")
                time.sleep(30)
    
    def get_project_live_state(self, project_name: str, channel_id: str = 'default') -> Dict[int, Dict[str, Any]]:
        """프로젝트의 모든 라이브 상태 반환 (채널별)"""
        project_channels = self.live_states.get(project_name, {})
        return project_channels.get(channel_id, {})
    
    def get_object_live_state(self, project_name: str, object_id: int, channel_id: str = 'default') -> Optional[Dict[str, Any]]:
        """특정 객체의 라이브 상태 반환 (채널별)"""
        project_channels = self.live_states.get(project_name, {})
        channel_state = project_channels.get(channel_id, {})
        return channel_state.get(object_id)
    
    def set_object_live_state(self, project_name: str, object_id: int, properties: Dict[str, Any], channel_id: str = 'default'):
        """객체의 라이브 상태 설정 (채널별)"""
        if project_name not in self.live_states:
            self.live_states[project_name] = {}
        if channel_id not in self.live_states[project_name]:
            self.live_states[project_name][channel_id] = {}
        
        self.live_states[project_name][channel_id][object_id] = {
            'properties': properties,
            'last_updated': datetime.now().isoformat()
        }
    
    def update_object_property(self, project_name: str, object_id: int, property_name: str, value: Any, channel_id: str = 'default'):
        """객체의 특정 속성만 업데이트 (채널별)"""
        if project_name not in self.live_states:
            self.live_states[project_name] = {}
        if channel_id not in self.live_states[project_name]:
            self.live_states[project_name][channel_id] = {}
        
        if object_id not in self.live_states[project_name][channel_id]:
            self.live_states[project_name][channel_id][object_id] = {
                'properties': {},
                'last_updated': datetime.now().isoformat()
            }
        
        self.live_states[project_name][channel_id][object_id]['properties'][property_name] = value
        self.live_states[project_name][channel_id][object_id]['last_updated'] = datetime.now().isoformat()
    
    def clear_project_live_state(self, project_name: str, channel_id: str = None):
        """프로젝트의 라이브 상태 초기화 (채널별 또는 전체)"""
        if project_name in self.live_states:
            if channel_id is None:
                # 전체 프로젝트 초기화
                del self.live_states[project_name]
            else:
                # 특정 채널만 초기화
                if channel_id in self.live_states[project_name]:
                    del self.live_states[project_name][channel_id]
        
        if project_name in self.scene_states:
            if channel_id is None:
                # 전체 프로젝트 초기화
                del self.scene_states[project_name]
            else:
                # 특정 채널만 초기화
                if channel_id in self.scene_states[project_name]:
                    del self.scene_states[project_name][channel_id]
    
    # 씬 상태 관리
    def set_scene_live(self, project_name: str, scene_id: int, is_live: bool, channel_id: str = 'default'):
        """씬의 송출 상태 설정 (채널별)"""
        if project_name not in self.scene_states:
            self.scene_states[project_name] = {}
        if channel_id not in self.scene_states[project_name]:
            self.scene_states[project_name][channel_id] = {}
        
        self.scene_states[project_name][channel_id][scene_id] = {
            'is_live': is_live,
            'last_updated': datetime.now().isoformat()
        }
    
    def get_scene_live_state(self, project_name: str, scene_id: int, channel_id: str = 'default') -> bool:
        """씬의 송출 상태 반환 (채널별)"""
        project_channels = self.scene_states.get(project_name, {})
        channel_scenes = project_channels.get(channel_id, {})
        scene_state = channel_scenes.get(scene_id, {})
        return scene_state.get('is_live', False)
    
    def get_all_live_scenes(self, project_name: str, channel_id: str = 'default') -> Dict[int, bool]:
        """프로젝트의 모든 씬 송출 상태 반환 (채널별)"""
        project_channels = self.scene_states.get(project_name, {})
        channel_scenes = project_channels.get(channel_id, {})
        return {scene_id: state['is_live'] for scene_id, state in channel_scenes.items()}
    
    # 타이머 상태 관리
    def start_timer(self, object_id: int, project_name: str = None, time_format: str = 'MM:SS', channel_id: str = 'default'):
        """타이머 시작 (하이브리드 방식, 채널별)"""
        current_time = time.time()
        
        # 채널별 타이머 상태 초기화
        if project_name not in self.timer_states:
            self.timer_states[project_name] = {}
        if channel_id not in self.timer_states[project_name]:
            self.timer_states[project_name][channel_id] = {}
        
        # 이미 있는 타이머라면 elapsed 시간 누적
        if object_id in self.timer_states[project_name][channel_id]:
            elapsed = self.timer_states[project_name][channel_id][object_id].get('elapsed', 0)
        else:
            elapsed = 0
        
        self.timer_states[project_name][channel_id][object_id] = {
            'is_running': True,
            'start_time': current_time,
            'elapsed': elapsed,
            'time_format': time_format
        }
        
        # 타이머 시작 이벤트 전송 (클라이언트가 로컬 계산을 시작하도록)
        if self.websocket_update_callback and project_name:
            start_data = {
                'object_id': object_id,
                'action': 'start',
                'server_time': current_time,
                'start_time': current_time,
                'elapsed': elapsed,
                'time_format': time_format,
                'channel_id': channel_id,
                'timestamp': datetime.now().isoformat()
            }
            self.websocket_update_callback(start_data, project_name)
            print(f"⏰ 타이머 시작 이벤트 전송 - 객체 ID: {object_id}, 채널: {channel_id}, 서버 시간: {current_time}")
        
        # 클라이언트에 응답할 데이터 반환
        return {
            'start_time': current_time,
            'elapsed': elapsed,
            'time_format': time_format
        }
    
    def stop_timer(self, object_id: int, project_name: str = None, channel_id: str = 'default'):
        """타이머 정지 (하이브리드 방식, 채널별)"""
        if (project_name and project_name in self.timer_states and 
            channel_id in self.timer_states[project_name] and
            object_id in self.timer_states[project_name][channel_id] and 
            self.timer_states[project_name][channel_id][object_id]['is_running']):
            
            current_time = time.time()
            start_time = self.timer_states[project_name][channel_id][object_id]['start_time']
            elapsed = self.timer_states[project_name][channel_id][object_id]['elapsed']
            
            final_elapsed = elapsed + (current_time - start_time)
            
            self.timer_states[project_name][channel_id][object_id] = {
                **self.timer_states[project_name][channel_id][object_id],
                'is_running': False,
                'elapsed': final_elapsed
            }
            
            # 타이머 정지 이벤트 전송
            if self.websocket_update_callback and project_name:
                stop_data = {
                    'object_id': object_id,
                    'action': 'stop',
                    'server_time': current_time,
                    'elapsed': final_elapsed,
                    'channel_id': channel_id,
                    'timestamp': datetime.now().isoformat()
                }
                self.websocket_update_callback(stop_data, project_name)
                print(f"⏰ 타이머 정지 이벤트 전송 - 객체 ID: {object_id}, 채널: {channel_id}")
            
            # 클라이언트에 응답할 데이터 반환
            return {
                'elapsed': final_elapsed
            }
        
        # 타이머가 실행 중이지 않은 경우
        if (project_name and project_name in self.timer_states and 
            channel_id in self.timer_states[project_name] and
            object_id in self.timer_states[project_name][channel_id]):
            return {
                'elapsed': self.timer_states[project_name][channel_id][object_id].get('elapsed', 0)
            }
        else:
            return {
                'elapsed': 0
            }
    
    def reset_timer(self, object_id: int, project_name: str = None, channel_id: str = 'default'):
        """타이머 리셋 (하이브리드 방식, 채널별)"""
        # 채널별 타이머 상태 초기화
        if project_name not in self.timer_states:
            self.timer_states[project_name] = {}
        if channel_id not in self.timer_states[project_name]:
            self.timer_states[project_name][channel_id] = {}
        
        if object_id in self.timer_states[project_name][channel_id]:
            time_format = self.timer_states[project_name][channel_id][object_id].get('time_format', 'MM:SS')
        else:
            time_format = 'MM:SS'
        
        self.timer_states[project_name][channel_id][object_id] = {
            'is_running': False,
            'start_time': 0,
            'elapsed': 0,
            'time_format': time_format
        }
        
        # 타이머 리셋 이벤트 전송
        if self.websocket_update_callback and project_name:
            reset_data = {
                'object_id': object_id,
                'action': 'reset',
                'server_time': time.time(),
                'elapsed': 0,
                'channel_id': channel_id,
                'timestamp': datetime.now().isoformat()
            }
            self.websocket_update_callback(reset_data, project_name)
            print(f"⏰ 타이머 리셋 이벤트 전송 - 객체 ID: {object_id}, 채널: {channel_id}")
        
        # 클라이언트에 응답할 데이터 반환
        return {
            'elapsed': 0
        }
    
    def get_timer_state(self, object_id: int, time_format: str = 'MM:SS', project_name: str = None, channel_id: str = 'default') -> Dict[str, Any]:
        """타이머 상태 반환 (채널별)"""
        if (not project_name or project_name not in self.timer_states or 
            channel_id not in self.timer_states[project_name] or
            object_id not in self.timer_states[project_name][channel_id]):
            return {
                'is_running': False,
                'elapsed': 0,
                'current_time': self._format_time(0, time_format)
            }
        
        timer = self.timer_states[project_name][channel_id][object_id]
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