import type { AvatarConfig } from "../types";

type ExplorerAvatarProps = {
  config: AvatarConfig;
  className?: string;
  label?: string;
};

const skinColors = { light: "#f2c7a5", medium: "#bd815e", deep: "#70452f" };
const hairColors = { brown: "#513426", black: "#1b211d", blonde: "#d3a94f", copper: "#a64f2d" };
const outfitColors = {
  explorer: { shirt: "#92c95b", vest: "#315f40" },
  ranger: { shirt: "#d4b266", vest: "#315142" },
  field: { shirt: "#6ba7a1", vest: "#273f35" },
};
const backgroundColors = {
  forest: { sky: "#b9dfac", land: "#285b3c", accent: "#173e2b" },
  mountain: { sky: "#b8dce2", land: "#56756a", accent: "#e7e4cd" },
  river: { sky: "#c5e1c5", land: "#397d70", accent: "#83c9c6" },
};

export function ExplorerAvatar({ config, className = "h-24 w-24", label = "Avatar del explorador" }: ExplorerAvatarProps) {
  const skin = skinColors[config.skinTone];
  const hair = hairColors[config.hairColor];
  const outfit = outfitColors[config.outfit];
  const background = backgroundColors[config.background];
  const faceRx = config.appearance === "round" ? 24 : config.appearance === "angular" ? 15 : 20;

  return (
    <svg viewBox="0 0 160 160" role="img" aria-label={label} className={className}>
      <defs><clipPath id="avatar-circle"><circle cx="80" cy="80" r="76" /></clipPath></defs>
      <g clipPath="url(#avatar-circle)">
        <rect width="160" height="160" fill={background.sky} />
        {config.background === "forest" ? <><path d="M0 105 28 55l25 50 28-67 30 67 24-48 25 48v55H0Z" fill={background.land} /><path d="M0 127h160v33H0Z" fill={background.accent} /></> : null}
        {config.background === "mountain" ? <><path d="M-8 119 48 48l23 31 22-34 72 74v41H-8Z" fill={background.land} /><path d="m35 65 13-17 12 17-12-6Zm45-2 13-18 18 19-18-8Z" fill={background.accent} /></> : null}
        {config.background === "river" ? <><path d="M0 83c29-22 46-16 69 0 28 20 52 11 91-9v86H0Z" fill={background.land} /><path d="M-8 123c32-19 56-22 81-5 28 19 55 8 95-16v58H-8Z" fill={background.accent} /></> : null}

        {config.accessory === "backpack" ? <path d="M29 105c0-20 13-34 28-34h7v72H36c-5-10-7-23-7-38Z" fill="#ad683a" stroke="#593b29" strokeWidth="4" /> : null}
        <path d="M34 160v-35c0-24 19-42 46-42s46 18 46 42v35Z" fill={outfit.shirt} />
        <path d="M52 91 80 119l28-28 10 69H42Z" fill={outfit.vest} />
        <path d="m72 91 8 28 8-28" fill="none" stroke="#f1eedb" strokeWidth="5" strokeLinejoin="round" />
        <rect x="69" y="72" width="22" height="25" rx="9" fill={skin} />
        <rect x="52" y="28" width="56" height="66" rx={faceRx} fill={skin} />
        {config.appearance === "angular" ? <path d="M54 66 66 91h28l12-25v-23H54Z" fill={skin} /> : null}

        {config.hairStyle === "short" ? <path d="M51 58V43c0-17 13-26 30-26 20 0 31 12 29 34-9-11-19-15-30-15-12 0-21 8-29 22Z" fill={hair} /> : null}
        {config.hairStyle === "curly" ? <path d="M48 54c-7-10 1-20 10-19-4-11 8-20 17-14 6-10 21-6 22 4 12-4 20 9 13 18 8 8 2 18-5 20-5-19-14-27-27-27-12 0-21 7-30 18Z" fill={hair} /> : null}
        {config.hairStyle === "long" ? <path d="M48 78V46c0-20 14-30 32-30s32 11 32 31v48l-17-10V42c-11-9-22-9-31 0v43Z" fill={hair} /> : null}
        {config.hairStyle === "shaved" ? <path d="M53 44c2-18 14-27 28-27 17 0 27 10 29 29-17-12-39-12-57-2Z" fill={hair} /> : null}

        <circle cx="69" cy="59" r="3" fill="#202922" /><circle cx="92" cy="59" r="3" fill="#202922" />
        <path d="M72 76c5 4 12 4 17 0" fill="none" stroke="#713f34" strokeWidth="2.5" strokeLinecap="round" />

        {config.accessory === "cap" ? <><path d="M48 39c3-19 17-27 32-27 18 0 31 10 34 29H48Z" fill="#315f40" /><path d="M75 40h52c-4 8-17 11-29 9Z" fill="#92c95b" /></> : null}
        {config.accessory === "adventure-hat" ? <><path d="M46 37c4-19 17-27 34-27 18 0 31 9 35 27Z" fill="#b38b4a" /><path d="M28 37h104c-8 10-24 13-52 13s-44-3-52-13Z" fill="#d3b66d" /></> : null}
        {config.accessory === "binoculars" ? <g transform="translate(58 100)"><path d="M5 0h11l4 17H0Zm23 0h11l5 17H24Z" fill="#26342c" /><path d="M14 4h16" stroke="#26342c" strokeWidth="5" /><circle cx="9" cy="18" r="8" fill="#1c2922" /><circle cx="35" cy="18" r="8" fill="#1c2922" /></g> : null}
        {config.accessory === "camera" ? <g transform="translate(59 106)"><path d="m0 5 8-5h25l7 5v27H0Z" fill="#29362f" /><circle cx="20" cy="18" r="9" fill="#78a69c" stroke="#e1ddbf" strokeWidth="3" /><path d="M8 0 3-18m29 18 4-18" stroke="#29362f" strokeWidth="3" /></g> : null}
      </g>
      <circle cx="80" cy="80" r="76" fill="none" stroke="#a5d66d" strokeWidth="5" />
    </svg>
  );
}
