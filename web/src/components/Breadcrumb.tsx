import React from 'react';
import { useApp } from '../context/AppContext';
import { ChevronRight } from 'lucide-react';

export const Breadcrumb: React.FC = () => {
  const { breadcrumbs } = useApp();

  return (
    <div 
      className="flex items-center px-6 gap-2"
      style={{
        height: '48px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--border-color)',
        fontSize: '0.875rem',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return (
          <React.Fragment key={idx}>
            {idx > 0 && <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
            {isLast ? (
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {crumb.label}
              </span>
            ) : (
              <button
                onClick={crumb.action}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--primary-color)',
                  fontWeight: 500,
                  padding: '4px 6px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {crumb.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
