import React from 'react';

interface SkeletonCardProps {
  lines?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3 }) => {
  return (
    <div className="college-card p-5 animate-pulse space-y-3">
      <div className="h-4 bg-slate-200 rounded w-1/3" />
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className="h-3 bg-slate-100 rounded"
          style={{ width: `${85 - idx * 12}%` }}
        />
      ))}
    </div>
  );
};
