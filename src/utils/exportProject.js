/**
 * 프로젝트를 폴더로 내보내기 (File System Access API)
 * @param {Object} project - 프로젝트 데이터
 * @param {Array} scenes - 씬 배열
 * @param {string} apiBaseUrl - API 기본 URL
 * @param {Function} onProgress - 진행상황 콜백 (string)
 */
export const exportProject = async (project, scenes, apiBaseUrl, onProgress) => {
  try {
    if (!window.showDirectoryPicker) {
      throw new Error('이 브라우저는 폴더 저장 기능을 지원하지 않습니다. (Chrome/Edge 최신 버전 필요)');
    }

    const projectName = project?.name;
    if (!projectName) {
      throw new Error('프로젝트 이름이 없습니다.');
    }

    // apiBaseUrl이 제대로 전달되었는지 확인
    if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
      throw new Error('API Base URL이 올바르지 않습니다.');
    }

    // 끝에 슬래시가 있다면 제거
    const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;

    console.log('프로젝트 내보내기 시작:', {
      projectName,
      baseUrl,
      scenesCount: scenes.length
    });

    if (onProgress) onProgress('폴더 선택 대기 중...');
    // 1. 사용자에게 폴더 선택 요청
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (onProgress) onProgress('프로젝트 데이터 저장 중...');
    
    // 2. project.json 저장
    const projectData = {
      name: projectName,
      created_at: new Date().toISOString(),
      version: '1.0.0',
      scenes: scenes.map(scene => ({
        id: scene.id,
        name: scene.name,
        order: scene.order,
        objects: scene.objects.map(obj => {
          // 이미지 객체의 src URL을 상대 경로로 정규화
          if (obj.type === 'image' && obj.properties?.src) {
            const normalizedObj = { ...obj };
            normalizedObj.properties = { ...obj.properties };
            
            // 절대 URL에서 파일명만 추출
            const urlParts = obj.properties.src.split('/');
            const encodedFilename = urlParts[urlParts.length - 1];
            const filename = decodeURIComponent(encodedFilename);
            
            // 상대 경로로 정규화
            normalizedObj.properties.src = `./images/${filename}`;
            
            return {
              id: normalizedObj.id,
              name: normalizedObj.name,
              type: normalizedObj.type,
              order: normalizedObj.order,
              properties: normalizedObj.properties,
              in_motion: normalizedObj.in_motion,
              out_motion: normalizedObj.out_motion,
              timing: normalizedObj.timing,
              created_at: normalizedObj.created_at,
              updated_at: normalizedObj.updated_at
            };
          }
          
          return {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            order: obj.order,
            properties: obj.properties,
            in_motion: obj.in_motion,
            out_motion: obj.out_motion,
            timing: obj.timing,
            created_at: obj.created_at,
            updated_at: obj.updated_at
          };
        })
      }))
    };
    
    const projectFile = await dirHandle.getFileHandle('project.json', { create: true });
    const writable = await projectFile.createWritable();
    await writable.write(JSON.stringify(projectData, null, 2));
    await writable.close();

    // 3. 라이브러리의 모든 이미지와 시퀀스 목록 가져오기
    if (onProgress) onProgress('라이브러리 데이터 불러오는 중...');
    
    // baseUrl에서 /api를 제거한 URL 생성
    const fileBaseUrl = baseUrl.replace('/api', '');
    console.log('파일 다운로드 base URL:', fileBaseUrl);

    // JWT 토큰 가져오기
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 이미지 목록 가져오기
    const imagesUrl = `${baseUrl}/projects/${encodeURIComponent(projectName)}/library/images`;
    console.log('이미지 목록 요청:', imagesUrl);
    
    const imagesResponse = await fetch(imagesUrl, { headers });
    console.log('이미지 목록 응답 상태:', imagesResponse.status, imagesResponse.statusText);
    
    if (!imagesResponse.ok) {
      throw new Error(`이미지 목록을 가져오는데 실패했습니다. Status: ${imagesResponse.status}`);
    }
    
    const imagesText = await imagesResponse.text();
    console.log('이미지 목록 응답:', imagesText);
    
    let libraryImages;
    try {
      libraryImages = JSON.parse(imagesText);
      console.log('파싱된 이미지 목록:', libraryImages);
    } catch (e) {
      console.error('이미지 목록 파싱 실패:', {
        error: e,
        responseText: imagesText,
        url: imagesUrl
      });
      throw new Error('이미지 목록을 파싱하는데 실패했습니다.');
    }

    // 시퀀스 목록 가져오기
    const sequencesUrl = `${baseUrl}/projects/${encodeURIComponent(projectName)}/library/sequences`;
    console.log('시퀀스 목록 요청:', sequencesUrl);
    
    const sequencesResponse = await fetch(sequencesUrl, { headers });
    console.log('시퀀스 목록 응답 상태:', sequencesResponse.status, sequencesResponse.statusText);
    
    if (!sequencesResponse.ok) {
      throw new Error(`시퀀스 목록을 가져오는데 실패했습니다. Status: ${sequencesResponse.status}`);
    }
    
    const sequencesText = await sequencesResponse.text();
    console.log('시퀀스 목록 응답:', sequencesText);
    
    let librarySequences;
    try {
      librarySequences = JSON.parse(sequencesText);
      console.log('파싱된 시퀀스 목록:', librarySequences);
    } catch (e) {
      console.error('시퀀스 목록 파싱 실패:', {
        error: e,
        responseText: sequencesText,
        url: sequencesUrl
      });
      throw new Error('시퀀스 목록을 파싱하는데 실패했습니다.');
    }

    // 4. images/ 폴더 생성 및 모든 이미지 저장
    if (onProgress) onProgress('이미지 저장 중...');
    const imagesDir = await dirHandle.getDirectoryHandle('images', { create: true });
    
    for (const imageName of libraryImages) {
      try {
        const imageUrl = `${fileBaseUrl}/projects/${encodeURIComponent(projectName)}/library/images/${encodeURIComponent(imageName)}`;
        console.log('이미지 다운로드 시도:', imageUrl);
        
        const response = await fetch(imageUrl, { headers });
        if (!response.ok) {
          console.error(`이미지 다운로드 실패: ${imageName}, Status: ${response.status}`);
          if (onProgress) onProgress(`이미지 다운로드 실패: ${imageName}`);
          continue;
        }
        const blob = await response.blob();
        const fileHandle = await imagesDir.getFileHandle(imageName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        console.log('이미지 저장 완료:', imageName);
      } catch (e) {
        console.error(`이미지 저장 실패: ${imageName}`, e);
        if (onProgress) onProgress(`이미지 저장 실패: ${imageName}`);
      }
    }

    // 5. sequences/ 폴더 생성 및 모든 시퀀스 저장
    if (onProgress) onProgress('시퀀스 저장 중...');
    const sequencesDir = await dirHandle.getDirectoryHandle('sequences', { create: true });
    
    for (const sequence of librarySequences) {
      try {
        const seqDir = await sequencesDir.getDirectoryHandle(sequence.name, { create: true });
        
        // sprite.png 저장
        const spriteUrl = `${fileBaseUrl}/projects/${encodeURIComponent(projectName)}/library/sequences/${encodeURIComponent(sequence.name)}/sprite.png`;
        console.log('시퀀스 sprite 다운로드 시도:', spriteUrl);
        
        const spriteResponse = await fetch(spriteUrl, { headers });
        if (!spriteResponse.ok) {
          console.error(`sprite 다운로드 실패: ${sequence.name}, Status: ${spriteResponse.status}`);
          if (onProgress) onProgress(`sprite 다운로드 실패: ${sequence.name}`);
          continue;
        }
        const spriteBlob = await spriteResponse.blob();
        const spriteHandle = await seqDir.getFileHandle('sprite.png', { create: true });
        const spriteWritable = await spriteHandle.createWritable();
        await spriteWritable.write(spriteBlob);
        await spriteWritable.close();
        console.log('sprite 저장 완료:', sequence.name);

        // meta.json 저장
        const metaUrl = `${fileBaseUrl}/projects/${encodeURIComponent(projectName)}/library/sequences/${encodeURIComponent(sequence.name)}/meta.json`;
        console.log('시퀀스 meta 다운로드 시도:', metaUrl);
        
        const metaResponse = await fetch(metaUrl, { headers });
        if (!metaResponse.ok) {
          console.error(`meta.json 다운로드 실패: ${sequence.name}, Status: ${metaResponse.status}`);
          if (onProgress) onProgress(`meta.json 다운로드 실패: ${sequence.name}`);
          continue;
        }
        const metaBlob = await metaResponse.blob();
        const metaHandle = await seqDir.getFileHandle('meta.json', { create: true });
        const metaWritable = await metaHandle.createWritable();
        await metaWritable.write(metaBlob);
        await metaWritable.close();
        console.log('meta.json 저장 완료:', sequence.name);
      } catch (e) {
        console.error(`시퀀스 저장 실패: ${sequence.name}`, e);
        if (onProgress) onProgress(`시퀀스 저장 실패: ${sequence.name}`);
      }
    }

    if (onProgress) onProgress('프로젝트가 성공적으로 내보내졌습니다.');
    return { success: true, message: '프로젝트가 성공적으로 내보내졌습니다.' };
  } catch (error) {
    if (onProgress) onProgress(`프로젝트 내보내기에 실패했습니다: ${error.message}`);
    console.error('프로젝트 내보내기 실패:', error);
    return { success: false, message: error.message || '프로젝트 내보내기에 실패했습니다.' };
  }
}; 