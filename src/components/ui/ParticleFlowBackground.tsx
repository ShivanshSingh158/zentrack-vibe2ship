import React, { useRef, useEffect } from 'react';

interface ParticleFlowBackgroundProps {
  speedMultiplier?: number;
  opacity?: number;
}

interface Particle {
  angle: number;
  radius: number;
  z: number;
  size: number;
  color: string;
}

export const ParticleFlowBackground: React.FC<ParticleFlowBackgroundProps> = ({ 
  speedMultiplier = 1.0,
  opacity = 0.3
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speedMultiplier);
  const opacityRef = useRef(opacity);

  useEffect(() => {
    speedRef.current = speedMultiplier;
    opacityRef.current = opacity;
  }, [speedMultiplier, opacity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Optimize by making canvas opaque (black)
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = [];
    const PARTICLE_COUNT = window.innerWidth < 768 ? 200 : 400; // drastically reduced for consumer lite performance
    const MAX_DEPTH = 2000;
    const FOV = 350;
    const BASE_SPEED = 4.0;
    
    // ZenTrack Palette
    const colors = [
      'rgb(0, 243, 255)', // Neon Cyan
      'rgb(0, 85, 255)', // Deep Blue
      'rgb(93, 0, 255)', // Purple/Magenta
      'rgb(255, 255, 255)'  // Pure White (rare core sparks)
    ];

    // Initialize particles in a cylinder/tube
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const isCore = Math.random() > 0.95;
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: isCore ? (Math.random() * 50) : (100 + Math.random() * 400), // core vs outer shell
        z: Math.random() * MAX_DEPTH,
        size: isCore ? (1.5 + Math.random() * 1.5) : (0.5 + Math.random()),
        color: isCore ? 'rgb(255, 255, 255)' : colors[Math.floor(Math.random() * (colors.length - 1))]
      });
    }

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      // Clear with slight trailing effect for motion blur
      ctx.fillStyle = `rgba(5, 5, 8, 0.4)`; // ZenTrack dark background
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      
      const currentSpeed = speedRef.current;
      const currentOpacity = opacityRef.current;

      time += 0.01 * currentSpeed;

      ctx.globalCompositeOperation = 'screen'; // Creates the glowing energy effect

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        
        // Move towards viewer
        p.z -= BASE_SPEED * speedMultiplier;
        
        // Loop back
        if (p.z < 1) {
          p.z = MAX_DEPTH;
        }

        // Apply sine wave distortion based on Z-depth and time (the "Flow State" undulation)
        const waveX = Math.sin(p.z * 0.002 + time) * 150;
        const waveY = Math.cos(p.z * 0.003 + time * 1.2) * 100;
        const torsion = Math.sin(time * 0.5 + p.z * 0.001) * 0.5;

        // Base cylindrical coordinates
        const x = Math.cos(p.angle + torsion) * p.radius;
        const y = Math.sin(p.angle + torsion) * p.radius;

        // 3D Projection
        const scale = FOV / (FOV + p.z);
        const projectedX = centerX + (x + waveX) * scale;
        const projectedY = centerY + (y + waveY) * scale;
        const projectedSize = p.size * scale;

        // Fade out particles that are far away or too close
        let alpha = 1;
        if (p.z > MAX_DEPTH - 500) alpha = (MAX_DEPTH - p.z) / 500;
        if (p.z < 200) alpha = p.z / 200;

        // Draw particle
        ctx.beginPath();
        ctx.arc(projectedX, projectedY, projectedSize, 0, Math.PI * 2);
        
        ctx.globalAlpha = alpha * currentOpacity;
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      ctx.globalAlpha = 1.0; // Reset
      ctx.globalCompositeOperation = 'source-over'; // Reset
      animationFrameId = requestAnimationFrame(render);
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div 
      style={{ 
        position: 'absolute', 
        inset: 0, 
        zIndex: 0, 
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#050508'
      }}
    >
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%', display: 'block' }} 
      />
    </div>
  );
};
