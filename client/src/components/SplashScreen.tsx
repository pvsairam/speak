import { useState, useEffect } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 2500 }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / minDuration) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
        setFadeOut(true);
        setTimeout(onComplete, 500);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [minDuration, onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      style={{
        backgroundColor: '#fdfbf7',
        backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="absolute w-[500px] h-[500px] bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 transform -translate-y-10" />
      
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 mb-6 relative drop-shadow-xl">
          <svg 
            viewBox="0 0 100 100" 
            fill="none" 
            stroke="black" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="w-full h-full"
          >
            <path d="M50 95 L50 65 L20 20 C15 15 15 5 25 5 L75 5 C85 5 85 15 80 20 L50 65" fill="white" />
            <path d="M50 65 L50 35" />
            <circle cx="50" cy="25" r="5" fill="black" />
          </svg>
        </div>

        <h1 className="text-5xl font-display font-black tracking-tight mb-3 text-black">
          Speak.
        </h1>
        <p className="text-gray-500 font-mono text-sm tracking-widest uppercase mb-8">
          Into the void
        </p>

        <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden border border-black">
          <div 
            className="h-full bg-black transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-6 text-gray-400 font-mono text-xs tracking-wider">
          Initializing Web3 Security...
        </p>
      </div>
    </div>
  );
}
