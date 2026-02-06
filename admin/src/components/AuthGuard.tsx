import { Navigate, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';

interface AuthGuardProps {
    isLoggedIn: boolean;
    children: ReactNode;
}

export function AuthGuard({ isLoggedIn, children }: AuthGuardProps) {
    const location = useLocation();

    if (!isLoggedIn) {
        // Redirect to login page, but save the current location they were trying to go to
        // so we can send them there after they login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
