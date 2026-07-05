import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import './OperatorLink.css';

interface OperatorLinkProps {
  operatorId: number;
  children: React.ReactNode;
  className?: string;
}

export function OperatorLink({ operatorId, children, className }: OperatorLinkProps) {
  const { user } = useAuth();

  if (user?.id === operatorId) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link to={`/profile/${operatorId}`} className={className}>
      {children}
    </Link>
  );
}
