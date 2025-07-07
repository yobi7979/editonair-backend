import { useRouteError, Link } from 'react-router-dom';

export default function ErrorPage() {
  const error = useRouteError();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {error.status === 404 ? '페이지를 찾을 수 없습니다' : '오류가 발생했습니다'}
        </h1>
        
        <p className="text-gray-600 mb-6">
          {error.status === 404 
            ? '요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.'
            : '죄송합니다. 예기치 않은 오류가 발생했습니다.'}
        </p>

        <div className="text-sm text-gray-500 mb-6">
          <p>상태: {error.status || '알 수 없음'}</p>
          <p>메시지: {error.statusText || error.message}</p>
        </div>

        <Link
          to="/"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          메인 페이지로 돌아가기
        </Link>
      </div>
    </div>
  );
} 