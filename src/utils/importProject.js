import { createScene, uploadProjectImage, uploadProjectSequence } from '../api/projects';

/**
 * 폴더 업로드(webkitdirectory)로 프로젝트 불러오기
 * @param {FileList} files - 업로드된 폴더의 파일 목록
 * @param {Function} onProgress - 진행상황 콜백 (string)
 * @returns {Promise<Object>} 파싱된 프로젝트 데이터
 */
export const importProject = (files, onProgress) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (onProgress) onProgress('파일 목록 분석 중...');
      // FileList를 배열로 변환
      const fileArr = Array.from(files);
      // project.json 찾기
      const projectFile = fileArr.find(f => f.webkitRelativePath.endsWith('project.json'));
      if (!projectFile) throw new Error('project.json 파일이 없습니다.');
      if (onProgress) onProgress('project.json 읽는 중...');
      const projectText = await projectFile.text();
      const projectData = JSON.parse(projectText);
      if (!projectData.name || !Array.isArray(projectData.scenes)) {
        throw new Error('잘못된 프로젝트 파일 형식입니다.');
      }
      // 이미지/시퀀스 파일 매핑
      const imageMap = {};
      const sequenceMap = {};
      for (const file of fileArr) {
        if (file.webkitRelativePath.includes('/images/')) {
          // 전체 경로에서 날짜 부분을 제외한 파일 이름만 추출
          const pathParts = file.webkitRelativePath.split('/');
          const fileName = pathParts[pathParts.length - 1];
          imageMap[fileName] = file;
        }
        if (file.webkitRelativePath.includes('/sequences/')) {
          // 예: sequences/시퀀스명/sprite.png, sequences/시퀀스명/meta.json
          const parts = file.webkitRelativePath.split('/');
          const seqName = parts[parts.length - 2];
          if (!sequenceMap[seqName]) sequenceMap[seqName] = {};
          if (file.name === 'sprite.png') sequenceMap[seqName].sprite = file;
          if (file.name === 'meta.json') sequenceMap[seqName].meta = file;
        }
      }
      // 이미지/시퀀스 Blob URL로 변환 및 properties에 반영
      if (onProgress) onProgress('이미지/시퀀스 파일 매핑 중...');
      for (const scene of projectData.scenes) {
        for (const obj of scene.objects) {
          if (obj.type === 'image' && obj.properties?.src) {
            const imgFile = imageMap[obj.properties.src.split('/').pop()];
            if (imgFile) {
              obj.properties.src = URL.createObjectURL(imgFile);
            }
          }
          if (obj.type === 'sequence' && obj.properties?.spriteUrl) {
            const seqName = obj.properties.spriteUrl.split('/').slice(-2, -1)[0];
            const seq = sequenceMap[seqName];
            if (seq && seq.sprite && seq.meta) {
              obj.properties.spriteUrl = URL.createObjectURL(seq.sprite);
              // meta.json 정보도 필요시 파싱하여 properties에 추가 가능
              // (여기서는 spriteUrl만 Blob URL로 대체)
            }
          }
        }
      }
      if (onProgress) onProgress('프로젝트 데이터 적용 준비 완료');
      resolve({
        success: true,
        data: projectData,
        message: '프로젝트 파일이 성공적으로 로드되었습니다.',
        imageMap,
        sequenceMap
      });
    } catch (error) {
      if (onProgress) onProgress('프로젝트 파일을 읽을 수 없습니다.');
      console.error('프로젝트 파일 파싱 실패:', error);
      reject(new Error('프로젝트 파일을 읽을 수 없습니다. 파일이 손상되었거나 올바르지 않은 형식입니다.'));
    }
  });
};

/**
 * 프로젝트 데이터를 현재 상태에 적용
 * @param {Object} projectData - 불러온 프로젝트 데이터
 * @param {Function} setProject - 프로젝트 설정 함수
 * @param {Function} setScenes - 씬 설정 함수
 */
export const applyImportedProject = (projectData, setProject, setScenes) => {
  try {
    setProject({
      name: projectData.name,
      created_at: projectData.created_at,
      version: projectData.version
    });
    const processedScenes = projectData.scenes.map((scene, sceneIndex) => ({
      ...scene,
      id: `imported_scene_${Date.now()}_${sceneIndex}`,
      objects: scene.objects.map((obj, objIndex) => ({
        ...obj,
        id: `imported_obj_${Date.now()}_${sceneIndex}_${objIndex}`,
        scene_id: `imported_scene_${Date.now()}_${sceneIndex}`
      }))
    }));
    setScenes(processedScenes);
    return { success: true, message: '프로젝트가 성공적으로 적용되었습니다.' };
  } catch (error) {
    console.error('프로젝트 적용 실패:', error);
    return { success: false, message: '프로젝트 적용에 실패했습니다.' };
  }
};

/**
 * 이미지 이름으로 라이브러리에서 매칭되는 이미지 찾기
 * @param {string} imageName - 찾을 이미지 이름
 * @param {Array<string>} libraryImages - 라이브러리 이미지 목록
 * @returns {string|null} 매칭된 이미지 이름 또는 null
 */
const findMatchingImage = (imageName, libraryImages) => {
  const baseName = imageName.substring(0, imageName.lastIndexOf('.'));
  const ext = imageName.substring(imageName.lastIndexOf('.'));
  
  // 정확히 일치하는 이름 먼저 찾기
  const exactMatch = libraryImages.find(img => img === imageName);
  if (exactMatch) return exactMatch;
  
  // 넘버링이 붙은 버전 찾기 (예: logo(1).png)
  const numberedMatch = libraryImages.find(img => 
    img.startsWith(baseName + '(') && img.endsWith(ext)
  );
  return numberedMatch || null;
};

/**
 * 불러온 프로젝트의 씬들을 현재 프로젝트에 추가
 * @param {Object} projectData - 프로젝트 데이터
 * @param {Object} imageMap - 이미지 파일 맵
 * @param {Object} sequenceMap - 시퀀스 파일 맵
 * @param {string} apiBaseUrl - API 기본 URL
 * @param {string} currentProjectName - 현재 프로젝트명
 * @param {Function} onProgress - 진행상황 콜백
 * @returns {Promise<Object>} 저장 결과
 */
export const addImportedScenesToCurrentProject = async (projectData, imageMap, sequenceMap, apiBaseUrl, currentProjectName, onProgress) => {
  try {
    if (!currentProjectName) {
      throw new Error('현재 프로젝트가 선택되지 않았습니다.');
    }

    if (onProgress) onProgress('이미지 파일 업로드 중...');
    
    // 1. 현재 라이브러리의 이미지 목록 조회
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const existingImagesResponse = await fetch(`${apiBaseUrl}/projects/${currentProjectName}/library/images`, {
      headers
    });
    if (!existingImagesResponse.ok) {
      throw new Error('기존 이미지 목록을 가져오는데 실패했습니다.');
    }
    const existingImages = await existingImagesResponse.json();
    
    // 2. 모든 이미지 파일 업로드
    const uploadedImageMap = new Map(); // 원본 이름 -> 업로드된 이름 맵핑
    const imageFiles = Object.values(imageMap).map(file => {
      // 전체 경로에서 파일 이름만 추출
      const pathParts = file.webkitRelativePath.split('/');
      const originalName = pathParts[pathParts.length - 1];
      console.log('원본 이미지 이름:', originalName);
      
      // 이미 존재하는 이미지인지 확인
      if (!existingImages.includes(originalName)) {
        console.log('새로운 이미지 - 원본 이름으로 업로드:', originalName);
        uploadedImageMap.set(originalName, originalName);
        return new File([file], originalName, { type: file.type });
      }

      // 중복된 이름이 있는 경우 넘버링 처리
      const ext = originalName.substring(originalName.lastIndexOf('.'));
      const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
      let counter = 1;
      let newName;
      
      do {
        newName = `${nameWithoutExt}(${counter})${ext}`;
        counter++;
      } while (existingImages.includes(newName));
      
      console.log('중복된 이미지 - 새 이름으로 업로드:', originalName, '->', newName);
      uploadedImageMap.set(originalName, newName);
      return new File([file], newName, { type: file.type });
    });

    // 3. 이미지 업로드
    if (imageFiles.length > 0) {
      console.log('업로드할 이미지 파일 목록:', imageFiles.map(f => f.name));
      console.log('이미지 맵핑 정보:', Array.from(uploadedImageMap.entries()));
      const uploadResult = await uploadProjectImage(apiBaseUrl, currentProjectName, imageFiles, false);
      console.log('이미지 업로드 결과:', uploadResult);
    }
    
    // 4. 업로드 후 이미지 목록 다시 조회 (필요 시에만)
    // const updatedImagesResponse = await fetch(`${apiBaseUrl}/projects/${currentProjectName}/library/images`, {
    //   headers
    // });
    // if (!updatedImagesResponse.ok) {
    //   throw new Error('업데이트된 이미지 목록을 가져오는데 실패했습니다.');
    // }
    // const updatedImages = await updatedImagesResponse.json();
    // console.log('업데이트된 라이브러리 이미지 목록:', updatedImages);
    
    if (onProgress) onProgress('시퀀스 파일 업로드 중...');
    
    // 시퀀스 파일 업로드 전에 기존 시퀀스 목록 조회
    const existingSequencesResponse = await fetch(`${apiBaseUrl}/projects/${currentProjectName}/library/sequences`, {
      headers
    });
    if (!existingSequencesResponse.ok) {
      throw new Error('기존 시퀀스 목록을 가져오는데 실패했습니다.');
    }
    const existingSequences = await existingSequencesResponse.json();
    const existingSequenceNames = existingSequences.map(seq => seq.name);
    
    // 시퀀스 파일 업로드
    for (const [seqName, seqFiles] of Object.entries(sequenceMap)) {
      if (seqFiles.sprite && seqFiles.meta) {
        // 시퀀스 이름 중복 처리
        let newSeqName = seqName;
        let counter = 1;
        while (existingSequenceNames.includes(newSeqName)) {
          newSeqName = `${seqName}(${counter})`;
          counter++;
        }
        
        const formData = new FormData();
        formData.append('sprite', seqFiles.sprite);
        formData.append('meta', seqFiles.meta);
        formData.append('sequence_name', newSeqName);
        
        // JWT 토큰 가져오기
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${apiBaseUrl}/projects/${currentProjectName}/upload/sequence`, {
          method: 'POST',
          headers,
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`시퀀스 ${newSeqName} 업로드 실패`);
        }
        
        // 새 시퀀스 이름을 목록에 추가
        existingSequenceNames.push(newSeqName);
      }
    }
    
    if (onProgress) onProgress('씬들을 현재 프로젝트에 추가 중...');
    
    // 서버 기본 URL 생성 (API URL에서 /api 제거)
    const serverBaseUrl = apiBaseUrl.replace('/api', '');
    
    // 3. 씬들을 현재 프로젝트에 추가
    const createdScenes = [];
    for (const scene of projectData.scenes) {
      try {
        const newScene = await createScene(apiBaseUrl, currentProjectName, {
          name: scene.name,
          order: scene.order
        });
        
        // 씬의 객체들도 추가
        for (const obj of scene.objects) {
          // 이미지 객체인 경우 src 경로 업데이트
          if (obj.type === 'image' && obj.properties?.src) {
            let originalImageName;
            
            // 상대 경로인지 절대 URL인지 확인
            if (obj.properties.src.startsWith('./images/')) {
              // 상대 경로인 경우: "./images/filename.ext" 형태
              originalImageName = obj.properties.src.replace('./images/', '');
              console.log('상대 경로 이미지 파일명:', originalImageName);
            } else {
              // 절대 URL인 경우: 기존 방식대로 처리
              const encodedImageName = obj.properties.src.split('/').pop();
              // URL 디코딩하여 원본 파일명 추출 (중복 인코딩 방지)
              originalImageName = decodeURIComponent(encodedImageName);
              console.log('절대 URL에서 추출한 이미지 파일명:', originalImageName);
            }
            
            // uploadedImageMap에서 실제 업로드된 이름 찾기
            const uploadedImageName = uploadedImageMap.get(originalImageName) || originalImageName;
            console.log('매핑된 이미지 이름:', uploadedImageName);
            
            // 절대 URL로 업데이트 (서버 기본 URL + 경로)
            obj.properties.src = `${serverBaseUrl}/projects/${currentProjectName}/library/images/${encodeURIComponent(uploadedImageName)}`;
            console.log('최종 이미지 URL:', obj.properties.src);
          }
          
          // JWT 토큰 가져오기
          const token = localStorage.getItem('token');
          const headers = { 'Content-Type': 'application/json' };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          await fetch(`${apiBaseUrl}/scenes/${newScene.id}/objects`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: obj.name,
              type: obj.type,
              order: obj.order,
              properties: obj.properties,
              in_motion: obj.in_motion,
              out_motion: obj.out_motion,
              timing: obj.timing
            })
          });
        }
        
        createdScenes.push(newScene);
      } catch (sceneError) {
        console.error(`씬 ${scene.name} 추가 실패:`, sceneError);
      }
    }
    
    if (onProgress) onProgress('씬 추가 완료!');
    
    return { 
      success: true, 
      message: `${createdScenes.length}개의 씬이 현재 프로젝트에 성공적으로 추가되었습니다.`,
      createdScenes
    };
  } catch (error) {
    console.error('씬 추가 실패:', error);
    return { 
      success: false, 
      message: `씬 추가 실패: ${error.message}` 
    };
  }
}; 