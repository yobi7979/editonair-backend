/**
 * JWT 토큰을 포함한 헤더 생성
 * @returns {Object} Authorization 헤더가 포함된 헤더 객체
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * JWT 토큰을 포함한 헤더 생성 (파일 업로드용 - Content-Type 제외)
 * @returns {Object} Authorization 헤더만 포함된 헤더 객체
 */
const getAuthHeadersForUpload = () => {
  const token = localStorage.getItem('token');
  const headers = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

/**
 * A helper function to handle API responses, parse JSON, and throw errors.
 * @param {Response} response - The fetch API response object.
 * @returns {Promise<any>} The JSON data from the response.
 */
const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ // Try to get error details from body
      message: response.statusText,
    }));
    throw new Error(errorData.error || errorData.message || 'Something went wrong');
  }
  return response.json();
};

// --- Project Management ---

/**
 * Fetches all projects from the backend.
 * @param {string} apiBaseUrl - API 서버의 base URL (예: http://localhost:5000/api)
 * @returns {Promise<Array<Object>>}
 */
export const getProjects = async (apiBaseUrl) => {
  const response = await fetch(`${apiBaseUrl}/projects`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Fetches a single project by its ID.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @returns {Promise<Object>}
 */
export const getProject = async (apiBaseUrl, projectId) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Creates a new project.
 * @param {string} apiBaseUrl
 * @param {Object} projectData
 * @returns {Promise<Object>}
 */
export const createProject = async (apiBaseUrl, projectData) => {
  const response = await fetch(`${apiBaseUrl}/projects`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(projectData),
  });
  return handleResponse(response);
};

/**
 * Updates an existing project.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @param {Object} projectData
 * @returns {Promise<Object>}
 */
export const updateProject = async (apiBaseUrl, projectId, projectData) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(projectData),
  });
  return handleResponse(response);
};

/**
 * Deletes a project by its name (slugified).
 * @param {string} apiBaseUrl
 * @param {string} projectName
 * @returns {Promise<Object>}
 */
export const deleteProject = async (apiBaseUrl, projectName) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectName}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// --- Scene Management ---

/**
 * Creates a new scene in a project.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @param {Object} sceneData
 * @returns {Promise<Object>}
 */
export const createScene = async (apiBaseUrl, projectId, sceneData) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/scenes`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(sceneData),
  });
  return handleResponse(response);
};

/**
 * Updates an existing scene.
 * @param {string} apiBaseUrl
 * @param {number|string} sceneId
 * @param {Object} sceneData
 * @returns {Promise<Object>}
 */
export const updateScene = async (apiBaseUrl, sceneId, sceneData) => {
  const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(sceneData)
  });
  return handleResponse(response);
};

/**
 * Deletes a scene by its ID.
 * @param {string} apiBaseUrl
 * @param {number|string} sceneId
 * @returns {Promise<Object>}
 */
export const deleteScene = async (apiBaseUrl, sceneId) => {
  const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// --- Object Management ---

/**
 * Creates a new object in a scene.
 * @param {string} apiBaseUrl
 * @param {number} sceneId
 * @param {object} objectData
 * @returns {Promise<object>}
 */
export const createObject = async (apiBaseUrl, sceneId, objectData) => {
  const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}/objects`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(objectData),
  });
  return handleResponse(response);
};

/**
 * Updates an existing object.
 * @param {string} apiBaseUrl
 * @param {number} objectId
 * @param {object} objectData
 * @returns {Promise<object>}
 */
export const updateObject = async (apiBaseUrl, objectId, objectData) => {
  const response = await fetch(`${apiBaseUrl}/objects/${objectId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(objectData),
  });
  return handleResponse(response);
};

/**
 * Deletes an object.
 * @param {string} apiBaseUrl
 * @param {number} objectId
 * @returns {Promise<object>}
 */
export const deleteObject = async (apiBaseUrl, objectId) => {
  const response = await fetch(`${apiBaseUrl}/objects/${objectId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Updates the order of objects in a scene.
 * @param {string} apiBaseUrl
 * @param {number} sceneId
 * @param {Array<{id: number, order: number}>} objectOrders
 * @returns {Promise<object>}
 */
export const updateObjectOrders = async (apiBaseUrl, sceneId, objectOrders) => {
  const response = await fetch(`${apiBaseUrl}/scenes/${sceneId}/object-orders`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ objectOrders }),
  });
  return handleResponse(response);
};

/**
 * Uploads one or more images to the project's image library.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @param {FileList|Array<File>} files
 * @param {boolean} overwrite
 * @returns {Promise<Object>}
 */
export const uploadProjectImage = async (apiBaseUrl, projectId, files, overwrite = false) => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('file', file);
  }
  if (overwrite) {
    formData.append('overwrite', 'true');
  }
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/upload/image`, {
    method: 'POST',
    headers: getAuthHeadersForUpload(),
    body: formData,
  });
  if (response.status === 409) {
    const data = await response.json();
    return { exists: data.exists, uploaded: data.uploaded, conflict: true };
  }
  return handleResponse(response);
};

/**
 * Uploads a sequence (folder of images) to the project's sequence library.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @param {FileList|Array<File>} files
 * @param {string} sequenceName
 * @returns {Promise<Object>}
 */
export const uploadProjectSequence = async (apiBaseUrl, projectId, files, sequenceName) => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  formData.append('sequence_name', sequenceName);
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/upload/sequence`, {
    method: 'POST',
    headers: getAuthHeadersForUpload(),
    body: formData,
  });
  return handleResponse(response);
};

/**
 * Gets the list of images in the project's image library.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @returns {Promise<Array<string>>}
 */
export const getProjectImages = async (apiBaseUrl, projectId) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/library/images`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Gets the list of sequences in the project's sequence library.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @returns {Promise<Array<{name: string, frames: Array<string>}>>}
 */
export const getProjectSequences = async (apiBaseUrl, projectId) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/library/sequences`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Deletes a project image by its filename.
 * @param {string} apiBaseUrl
 * @param {number|string} projectId
 * @param {string} filename
 * @returns {Promise<Object>}
 */
export const deleteProjectImage = async (apiBaseUrl, projectId, filename) => {
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/library/images/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('삭제 실패');
  return response.json();
};

/**
 * Deletes a project sequence by its name.
 * @param {string} apiBaseUrl
 * @param {string} projectName
 * @param {string} sequenceName
 * @returns {Promise<Object>}
 */
export const deleteProjectSequence = async (apiBaseUrl, projectName, sequenceName) => {
  const response = await fetch(
    `${apiBaseUrl}/projects/${projectName}/library/sequences/${encodeURIComponent(sequenceName)}`,
    { method: "DELETE", headers: getAuthHeaders() }
  );
  if (!response.ok) throw new Error('삭제 실패');
  return response.json();
};

// --- User Management ---

/**
 * 현재 로그인한 사용자 정보를 가져옵니다.
 * @param {string} apiBaseUrl
 * @returns {Promise<Object>}
 */
export const getCurrentUser = async (apiBaseUrl) => {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};
