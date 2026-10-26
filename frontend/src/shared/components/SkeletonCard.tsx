import React from 'react';

interface SkeletonCardProps {
  lines?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3 }) => {
  return (
    <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-5 shadow-xs animate-pulse space-y-3.5">
      <div className="h-4 bg-slate-200 rounded-lg w-1/3" />
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className="h-3 bg-slate-100 rounded-md"
          style={{ width: `${85 - idx * 12}%` }}
        />
      ))}
    </div>
  );
};
