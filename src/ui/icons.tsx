/**
 * Ícones desenhados em SVG traçado, na mesma grade e espessura.
 * Nada de emoji: eles não recolorem, não escalam bem e mudam por plataforma.
 */
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

export interface IconProps {
  readonly size?: number;
  readonly color: string;
}

const STROKE = 2.1;

function base(size: number | undefined) {
  return { width: size ?? 24, height: size ?? 24, viewBox: '0 0 24 24', fill: 'none' as const };
}

export const IconBack = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M19 12H5" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    <Polyline points="12 19 5 12 12 5" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconPlus = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  </Svg>
);

export const IconCheck = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconChevron = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Polyline points="9 18 15 12 9 6" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconUsers = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="9" cy="7" r="4" stroke={color} strokeWidth={STROKE} />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
  </Svg>
);

export const IconCopy = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
  </Svg>
);

export const IconInfo = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={STROKE} />
    <Path d="M12 16v-5M12 8h.01" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
  </Svg>
);

export const IconShare = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M16 6l-4-4-4 4M12 2v14" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconTrash = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Um ícone por categoria da lista fechada do spec (§5.3). */
export const IconMore = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="5" cy="12" r="1.4" fill={color} stroke={color} strokeWidth={1.4} />
    <Circle cx="12" cy="12" r="1.4" fill={color} stroke={color} strokeWidth={1.4} />
    <Circle cx="19" cy="12" r="1.4" fill={color} stroke={color} strokeWidth={1.4} />
  </Svg>
);

export const IconClock = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2.2} />
    <Path d="M12 7.5V12l3 2" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconSun = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="4.2" stroke={color} strokeWidth={STROKE} />
    <Path
      d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.4 6.4 4.9 4.9M19.1 19.1l-1.5-1.5M17.6 6.4l1.5-1.5M4.9 19.1l1.5-1.5"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
    />
  </Svg>
);

export const IconMoon = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Path
      d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.2 8.2 0 1 0 9.4 9.4z"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/** Tema seguindo o sistema: metade sol, metade lua. */
export const IconAuto = ({ size, color }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="8.4" stroke={color} strokeWidth={STROKE} />
    <Path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill={color} stroke={color} strokeWidth={0.5} />
  </Svg>
);

export const CATEGORY_ICONS: Readonly<Record<string, (p: IconProps) => React.JSX.Element>> = {
  restaurant: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M3 2v7a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V2M5.5 2v20" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M18 2c-1.7 1.3-3 3.5-3 6.5 0 2 1 3.5 3 3.5v10" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  lodging: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M3 20V9l9-5 9 5v11M3 20h18M9 20v-6h6v6" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  transport: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M5 17h14M6 17V9l1.8-4h8.4L18 9v8M6 12h12" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="8" cy="17" r="1.6" stroke={color} strokeWidth={1.6} />
      <Circle cx="16" cy="17" r="1.6" stroke={color} strokeWidth={1.6} />
    </Svg>
  ),
  groceries: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="10" cy="20" r="1.4" stroke={color} strokeWidth={1.6} />
      <Circle cx="18" cy="20" r="1.4" stroke={color} strokeWidth={1.6} />
    </Svg>
  ),
  flight: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M2 13l20-7-7 20-3-8-10-5z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  car: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2M20 16v2" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="8" cy="16" r="1.5" stroke={color} strokeWidth={1.6} />
      <Circle cx="16" cy="16" r="1.5" stroke={color} strokeWidth={1.6} />
    </Svg>
  ),
  activity: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  ),
  shopping: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  fees: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Path d="M4 6h16v12H4zM4 10h16" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  ),
  other: ({ size, color }: IconProps) => (
    <Svg {...base(size)}>
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.9} />
      <Path d="M12 8v4l3 2" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  ),
};
