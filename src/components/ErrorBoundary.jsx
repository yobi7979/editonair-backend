import React from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    // 여기에 에러 로깅 서비스 호출을 추가할 수 있습니다
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              오류가 발생했습니다
            </h1>
            
            <p className="text-gray-600 mb-6">
              죄송합니다. 예기치 않은 오류가 발생했습니다.
            </p>

            {process.env.NODE_ENV === 'development' && (
              <div className="text-left bg-gray-100 p-4 rounded mb-6 overflow-auto max-h-60">
                <p className="text-sm font-mono text-red-600 whitespace-pre-wrap">
                  {this.state.error?.toString()}
                </p>
                <p className="text-sm font-mono text-gray-600 mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo?.componentStack}
                </p>
              </div>
            )}

            <div className="space-y-4">
              <button
                onClick={() => window.location.reload()}
                className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors w-full"
              >
                페이지 새로고침
              </button>
              
              <Link
                to="/"
                className="inline-block bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors w-full"
              >
                메인 페이지로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 