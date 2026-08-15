import React from 'react';
import Svg, {
  Path,
  Rect,
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  G,
} from 'react-native-svg';

interface GymAiIconProps {
  size?: number;
  primaryColor?: string;
  sparkleColor?: string;
  showSparkles?: boolean;
}

export const GymAiIcon: React.FC<GymAiIconProps> = ({
  size = 28,
  primaryColor = '#ffffff',
  sparkleColor = '#38bdf8',
  showSparkles = true,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        {/* Metallic Bar Gradient */}
        <LinearGradient id="gymBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
          <Stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.9" />
        </LinearGradient>

        {/* Primary Plate Gradient */}
        <LinearGradient id="gymPlateMainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <Stop offset="25%" stopColor="#ddd6fe" stopOpacity="0.9" />
          <Stop offset="70%" stopColor="#a78bfa" stopOpacity="1" />
          <Stop offset="100%" stopColor="#7c3aed" stopOpacity="1" />
        </LinearGradient>

        {/* Outer Plate Gradient */}
        <LinearGradient id="gymPlateOuterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#ede9fe" stopOpacity="0.9" />
          <Stop offset="50%" stopColor="#c4b5fd" stopOpacity="0.95" />
          <Stop offset="100%" stopColor="#6d28d9" stopOpacity="1" />
        </LinearGradient>

        {/* Collar & Accent Gradient */}
        <LinearGradient id="gymCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#f5f3ff" stopOpacity="1" />
          <Stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
        </LinearGradient>

        {/* AI Energy Sparkle Gradient */}
        <LinearGradient id="aiSparkleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="40%" stopColor="#fef08a" stopOpacity="1" />
          <Stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
        </LinearGradient>

        {/* Soft Ambient Core Glow */}
        <RadialGradient id="aiCoreAura" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#c084fc" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Ambient background glow behind dumbbell */}
      <Circle cx="24" cy="24" r="18" fill="url(#aiCoreAura)" />

      <G id="dumbbell-group">
        {/* Central Bar Handle */}
        <Rect
          x="12"
          y="22"
          width="24"
          height="4"
          rx="2"
          fill="url(#gymBarGrad)"
        />

        {/* Knurled Grip Center Highlights */}
        <Rect x="19" y="22.5" width="2" height="3" rx="0.5" fill="#ffffff" fillOpacity="0.6" />
        <Rect x="23" y="22.5" width="2" height="3" rx="0.5" fill="#ffffff" fillOpacity="0.6" />
        <Rect x="27" y="22.5" width="2" height="3" rx="0.5" fill="#ffffff" fillOpacity="0.6" />

        {/* Left Inner Collar / Stopper */}
        <Rect
          x="13.5"
          y="18.5"
          width="2.5"
          height="11"
          rx="1.25"
          fill="url(#gymCollarGrad)"
        />

        {/* Right Inner Collar / Stopper */}
        <Rect
          x="32"
          y="18.5"
          width="2.5"
          height="11"
          rx="1.25"
          fill="url(#gymCollarGrad)"
        />

        {/* Left Main Large Plate */}
        <Rect
          x="9"
          y="12.5"
          width="4"
          height="23"
          rx="2"
          fill="url(#gymPlateMainGrad)"
        />
        {/* Left Plate Specular Bevel Line */}
        <Rect x="10" y="14" width="1" height="20" rx="0.5" fill="#ffffff" fillOpacity="0.6" />

        {/* Right Main Large Plate */}
        <Rect
          x="35"
          y="12.5"
          width="4"
          height="23"
          rx="2"
          fill="url(#gymPlateMainGrad)"
        />
        {/* Right Plate Specular Bevel Line */}
        <Rect x="36" y="14" width="1" height="20" rx="0.5" fill="#ffffff" fillOpacity="0.6" />

        {/* Left Outer Secondary Plate */}
        <Rect
          x="5"
          y="15.5"
          width="3.5"
          height="17"
          rx="1.75"
          fill="url(#gymPlateOuterGrad)"
        />

        {/* Right Outer Secondary Plate */}
        <Rect
          x="39.5"
          y="15.5"
          width="3.5"
          height="17"
          rx="1.75"
          fill="url(#gymPlateOuterGrad)"
        />

        {/* Left End Cap */}
        <Rect
          x="2.5"
          y="21.5"
          width="2"
          height="5"
          rx="1"
          fill="url(#gymBarGrad)"
        />

        {/* Right End Cap */}
        <Rect
          x="43.5"
          y="21.5"
          width="2"
          height="5"
          rx="1"
          fill="url(#gymBarGrad)"
        />
      </G>

      {/* AI Intelligence Stars / Sparkles */}
      {showSparkles && (
        <G id="sparkles-group">
          {/* Primary 4-Point AI Star (Top Right) */}
          <Path
            d="M 37 4 Q 37 9.5 42.5 9.5 Q 37 9.5 37 15 Q 37 9.5 31.5 9.5 Q 37 9.5 37 4 Z"
            fill="url(#aiSparkleGrad)"
          />
          {/* Star Center Glow Point */}
          <Circle cx="37" cy="9.5" r="1.2" fill="#ffffff" />

          {/* Secondary Micro Sparkle (Bottom Left) */}
          <Path
            d="M 11 34 Q 11 37 14 37 Q 11 37 11 40 Q 11 37 8 37 Q 11 37 11 34 Z"
            fill="url(#aiSparkleGrad)"
            fillOpacity="0.85"
          />
        </G>
      )}
    </Svg>
  );
};

export default GymAiIcon;
