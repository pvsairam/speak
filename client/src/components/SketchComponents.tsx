
import React, { useState } from 'react';
import { LucideIcon, Heart, ThumbsDown } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: LucideIcon;
  isLoading?: boolean;
}

export const SketchButton: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  icon: Icon,
  isLoading,
  ...props 
}) => {
  const baseStyles = "relative inline-flex items-center justify-center px-6 py-3 font-display font-bold transition-all duration-200 transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none border-2 border-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed";
  
  const hasCustomBg = className.includes('bg-');
  
  const variants = {
    primary: `${hasCustomBg ? '' : 'bg-teal'} text-black shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1 hover:-translate-x-1`,
    secondary: `${hasCustomBg ? '' : 'bg-white'} text-black shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1 hover:-translate-x-1`,
    danger: `${hasCustomBg ? '' : 'bg-red-400'} text-black shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1 hover:-translate-x-1`
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="animate-pulse">Ink drying...</span>
      ) : (
        <>
            {Icon && <Icon className="w-5 h-5 mr-2" strokeWidth={2.5} />}
            {children}
        </>
      )}
    </button>
  );
};

interface SketchCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  onClick?: () => void;
}

export const SketchCard: React.FC<SketchCardProps> = ({ children, className = '', delay = 0, onClick }) => {
  // We use an SVG to draw the border. 
  
  // Calculate animation delays
  const enterDelay = delay * 100; // ms
  const drawDelay = enterDelay + 200; // Starts slightly after the card appears

  // FIX: Separated the Hover/Layout container from the Animation container.
  // The outer div handles interactions (hover) and layout.
  // The inner div handles the 'sketch-in' entry animation.
  // This prevents the 'transform' conflict that caused overlapping.
  
  return (
    <div 
      onClick={onClick}
      className={`relative rounded-xl transition-transform duration-300 hover:-translate-y-1 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
        <div 
            className="bg-white rounded-xl shadow-sketch opacity-0 animate-sketch-in"
            style={{ animationDelay: `${enterDelay}ms` }}
        >
            {/* Animated Border Layer */}
            <div className="absolute inset-0 w-full h-full pointer-events-none rounded-xl overflow-hidden">
                <svg className="w-full h-full" preserveAspectRatio="none">
                    <rect 
                    x="1.5" y="1.5" 
                    width="calc(100% - 3px)" 
                    height="calc(100% - 3px)" 
                    rx="10" ry="10"
                    fill="none" 
                    stroke="black" 
                    strokeWidth="2.5" 
                    strokeDasharray="2000"
                    strokeDashoffset="2000"
                    className="animate-draw-border"
                    style={{ animationDelay: `${drawDelay}ms` }}
                    />
                </svg>
            </div>

            {/* Content */}
            <div className="relative z-10 p-5">
                {children}
            </div>
        </div>
    </div>
  );
};

export const SketchInput: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea 
    className="w-full bg-paper border-2 border-black rounded-lg p-4 font-sans text-lg focus:outline-none focus:shadow-sketch transition-shadow resize-none placeholder-gray-400"
    {...props}
  />
);

export const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = 'bg-gray-200' }) => (
  <span className={`inline-block border-2 border-black rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${color}`}>
    {children}
  </span>
);

interface SketchVoteButtonProps {
    type: 'like' | 'dislike';
    isActive: boolean;
    count: number;
    onClick: (e: React.MouseEvent) => void;
}

export const SketchVoteButton: React.FC<SketchVoteButtonProps> = ({ type, isActive, count, onClick }) => {
    const [isAnimating, setIsAnimating] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        // Prevent event bubbling if used inside a clickable card
        e.stopPropagation();
        
        setIsAnimating(true);
        onClick(e);
        setTimeout(() => setIsAnimating(false), 500); // Reset after animation duration
    };

    return (
        <button 
            onClick={handleClick}
            className={`
                relative
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 
                transition-all active:scale-90 overflow-visible
                ${isActive 
                    ? 'border-black bg-black text-white shadow-none' 
                    : 'border-transparent hover:bg-gray-100 text-gray-500 hover:text-black'}
            `}
        >
            {/* Ink Splash Animation Element */}
            {isAnimating && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-8 h-8 rounded-full border-2 ${isActive ? 'border-white' : 'border-teal-500'} animate-ink-splash`} />
                </div>
            )}

            {type === 'like' ? (
                <Heart 
                    size={16} 
                    className={isActive ? 'fill-red-500 text-red-500' : ''} 
                    strokeWidth={isActive ? 0 : 2.5}
                />
            ) : (
                <ThumbsDown 
                    size={16} 
                    className={isActive ? 'fill-white text-white' : ''}
                    strokeWidth={2.5}
                />
            )}
            <span className="text-sm font-bold font-mono min-w-[1ch] text-center z-10">{count}</span>
        </button>
    );
};
