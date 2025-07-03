/**
 * 프로젝트를 폴더로 내보내기 (File System Access API)
 * @param {Object} project - 프로젝트 데이터
 * @param {Array} scenes - 씬 배열
 * @param {Function} onProgress - 진행상황 콜백 (string)
 */
export const exportProject = async (project, scenes, onProgress) => {
  try {
    if (!window.showDirectoryPicker) {
      throw new Error('이 브라우저는 폴더 저장 기능을 지원하지 않습니다. (Chrome/Edge 최신 버전 필요)');
    }
    if (onProgress) onProgress('폴더 선택 대기 중...');
    // 1. 사용자에게 폴더 선택 요청
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (onProgress) onProgress('프로젝트 데이터 저장 중...');
    // 2. project.json 저장
    const projectData = {
      name: project?.name || 'Untitled Project',
      created_at: new Date().toISOString(),
      version: '1.0.0',
      scenes: scenes.map(scene => ({
        id: scene.id,
        name: scene.name,
        order: scene.order,
        objects: scene.objects.map(obj => ({
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
        }))
      }))
    };
    const projectFile = await dirHandle.getFileHandle('project.json', { create: true });
    const writable = await projectFile.createWritable();
    await writable.write(JSON.stringify(projectData, null, 2));
    await writable.close();

    // 3. 이미지/시퀀스 파일 경로 수집
    const imageSrcs = new Set();
    const sequenceSprites = new Set();
    const sequenceMetas = new Set();
    projectData.scenes.forEach(scene => {
      scene.objects.forEach(obj => {
        if (obj.type === 'image' && obj.properties?.src) {
          imageSrcs.add(obj.properties.src);
        }
        if (obj.type === 'sequence' && obj.properties?.spriteUrl) {
          sequenceSprites.add(obj.properties.spriteUrl);
          const metaUrl = obj.properties.spriteUrl.replace(/sprite\.(png|webp|jpg|jpeg)$/i, 'meta.json');
          sequenceMetas.add(metaUrl);
        }
      });
    });

    // 4. images/ 폴더 생성 및 이미지 저장
    if (onProgress) onProgress('이미지 저장 중...');
    let imagesDir = null;
    for (const src of imageSrcs) {
      if (!imagesDir) imagesDir = await dirHandle.getDirectoryHandle('images', { create: true });
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error('이미지 다운로드 실패');
        const blob = await response.blob();
        const parts = src.split('/');
        const filename = parts[parts.length - 1];
        const fileHandle = await imagesDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (e) {
        if (onProgress) onProgress(`이미지 저장 실패: ${src}`);
      }
    }

    // 5. sequences/ 폴더 생성 및 시퀀스 저장
    if (onProgress) onProgress('시퀀스 저장 중...');
    let sequencesDir = null;
    for (const spriteUrl of sequenceSprites) {
      const parts = spriteUrl.split('/');
      const seqName = parts[parts.length - 2];
      if (!sequencesDir) sequencesDir = await dirHandle.getDirectoryHandle('sequences', { create: true });
      const seqDir = await sequencesDir.getDirectoryHandle(seqName, { create: true });
      // sprite.png 저장
      try {
        const response = await fetch(spriteUrl);
        if (!response.ok) throw new Error('sprite 다운로드 실패');
        const blob = await response.blob();
        const fileHandle = await seqDir.getFileHandle('sprite.png', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (e) {
        if (onProgress) onProgress(`sprite 저장 실패: ${spriteUrl}`);
      }
    }
    for (const metaUrl of sequenceMetas) {
      const parts = metaUrl.split('/');
      const seqName = parts[parts.length - 2];
      if (!sequencesDir) sequencesDir = await dirHandle.getDirectoryHandle('sequences', { create: true });
      const seqDir = await sequencesDir.getDirectoryHandle(seqName, { create: true });
      // meta.json 저장
      try {
        const response = await fetch(metaUrl);
        if (!response.ok) throw new Error('meta.json 다운로드 실패');
        const blob = await response.blob();
        const fileHandle = await seqDir.getFileHandle('meta.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (e) {
        if (onProgress) onProgress(`meta.json 저장 실패: ${metaUrl}`);
      }
    }

    if (onProgress) onProgress('프로젝트가 성공적으로 내보내졌습니다.');
    return { success: true, message: '프로젝트가 성공적으로 내보내졌습니다.' };
  } catch (error) {
    if (onProgress) onProgress('프로젝트 내보내기에 실패했습니다.');
    console.error('프로젝트 내보내기 실패:', error);
    return { success: false, message: error.message || '프로젝트 내보내기에 실패했습니다.' };
  }
}; 