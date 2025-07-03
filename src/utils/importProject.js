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
          imageMap[file.name] = file;
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
    
    // 1. 이미지 파일 업로드
    const imageFiles = Object.values(imageMap);
    if (imageFiles.length > 0) {
      await uploadProjectImage(apiBaseUrl, currentProjectName, imageFiles, true); // overwrite=true
    }
    
    if (onProgress) onProgress('시퀀스 파일 업로드 중...');
    
    // 2. 시퀀스 파일 업로드
    for (const [seqName, seqFiles] of Object.entries(sequenceMap)) {
      if (seqFiles.sprite && seqFiles.meta) {
        const formData = new FormData();
        formData.append('sprite', seqFiles.sprite);
        formData.append('meta', seqFiles.meta);
        formData.append('sequence_name', seqName);
        
        const response = await fetch(`${apiBaseUrl}/projects/${currentProjectName}/upload/sequence`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`시퀀스 ${seqName} 업로드 실패`);
        }
      }
    }
    
    if (onProgress) onProgress('씬들을 현재 프로젝트에 추가 중...');
    
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
          await fetch(`${apiBaseUrl}/scenes/${newScene.id}/objects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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