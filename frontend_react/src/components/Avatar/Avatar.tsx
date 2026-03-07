import React from 'react';
import './Avatar.css';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'small' | 'medium' | 'large';
  status?: 'online' | 'offline' | 'ausente' | null;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'medium',
  status,
  className = '',
}) => {
  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const statusIcon = {
    online: '🟢',
    offline: '⚫',
    ausente: '🟡',
  };

  return (
    <div className={`avatar avatar-${size} ${className}`}>
      <div className="avatar-image">
        {src ? (
          <img src={src} alt={name} />
        ) : (
          <div className="avatar-placeholder">
            {getInitials(name)}
          </div>
        )}
      </div>
      {status && (
        <div className={`avatar-status avatar-status-${status}`}>
          {statusIcon[status]}
        </div>
      )}
    </div>
  );
};
