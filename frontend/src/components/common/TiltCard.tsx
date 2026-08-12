import { ReactNode, useRef, useState, MouseEvent } from 'react';
import { motion } from 'motion/react';
import { Box } from '@mui/material';

interface TiltCardProps {
  children: ReactNode;
  maxTilt?: number;
  scale?: number;
  className?: string;
  sx?: object;
}

export function TiltCard({ children, maxTilt = 12, scale = 1.02, className = '', sx = {} }: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const rY = ((mouseX - width / 2) / (width / 2)) * maxTilt;
    const rX = -((mouseY - height / 2) / (height / 2)) * maxTilt;

    setRotateX(rX);
    setRotateY(rY);
    setGlarePos({
      x: (mouseX / width) * 100,
      y: (mouseY / height) * 100,
      opacity: 0.16,
    });
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setGlarePos((g) => ({ ...g, opacity: 0 }));
  };

  return (
    <Box
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      sx={{
        perspective: '1000px',
        // Do NOT use preserve-3d on the outer wrapper — it causes child
        // hit-test misalignment. Only apply it on the motion.div.
        ...sx,
      }}
    >
      <motion.div
        animate={{
          rotateX,
          rotateY,
          scale: rotateX !== 0 || rotateY !== 0 ? scale : 1,
        }}
        transition={{
          type: 'spring',
          damping: 20,
          stiffness: 250,
          mass: 0.5,
        }}
        className={className}
        style={{
          position: 'relative',
          // NO transformStyle preserve-3d — this causes pointer hit-test misalignment
          height: '100%',
        }}
      >
        {children}
        {/* Specular Glare — always pointerEvents:none so it never blocks clicks */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255, 255, 255, ${glarePos.opacity}) 0%, transparent 60%)`,
            transition: 'opacity 0.2s ease',
            zIndex: 1,
          }}
        />
      </motion.div>
    </Box>
  );
}
