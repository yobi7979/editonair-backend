import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OverlayPage from './pages/OverlayPage';
import ErrorPage from './pages/ErrorPage';

// 인증 상태 체크 함수
const isAuthenticated = () => {
    return !!localStorage.getItem('token');
};

// 인증이 필요한 라우트를 위한 래퍼 컴포넌트
const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

// 인증된 사용자가 접근하면 메인 페이지로 리다이렉트하는 래퍼 컴포넌트
const PublicOnlyRoute = ({ children }) => {
    if (isAuthenticated()) {
        return <Navigate to="/" replace />;
    }
    return children;
};

export const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <ProtectedRoute>
                <App />
            </ProtectedRoute>
        ),
        errorElement: <ErrorPage />
    },
    {
        path: '/login',
        element: (
            <PublicOnlyRoute>
                <LoginPage />
            </PublicOnlyRoute>
        ),
        errorElement: <ErrorPage />
    },
    {
        path: '/register',
        element: (
            <PublicOnlyRoute>
                <RegisterPage />
            </PublicOnlyRoute>
        ),
        errorElement: <ErrorPage />
    },
    {
        path: '/overlay/:projectId/:sceneId',
        element: <OverlayPage />,
        errorElement: <ErrorPage />
    },
    {
        path: '*',
        element: <ErrorPage />,
        errorElement: <ErrorPage />
    }
]); 