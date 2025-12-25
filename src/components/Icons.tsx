import React from 'react';

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, 'children'>;

function BaseIcon({ className, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {props.children}
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </BaseIcon>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M21 12.8A8.5 8.5 0 0 1 11.2 3a6.5 6.5 0 1 0 9.8 9.8Z" />
    </BaseIcon>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15 15 0 0 1 0 20" />
      <path d="M12 2a15 15 0 0 0 0 20" />
    </BaseIcon>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 2l1.2 4.1L17.3 7.3l-4.1 1.2L12 12l-1.2-3.5L6.7 7.3l4.1-1.2L12 2Z" />
      <path d="M19 12l.7 2.3L22 15l-2.3.7L19 18l-.7-2.3L16 15l2.3-.7L19 12Z" />
      <path d="M4.5 13l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2Z" />
    </BaseIcon>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 16h10l1-16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </BaseIcon>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 9h10v10H9z" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </BaseIcon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </BaseIcon>
  );
}

export function IconX(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </BaseIcon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M21 12a9 9 0 0 1-15.4 6.4" />
      <path d="M3 12a9 9 0 0 1 15.4-6.4" />
      <path d="M3 4v6h6" />
      <path d="M21 20v-6h-6" />
    </BaseIcon>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v10" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 21h16" />
    </BaseIcon>
  );
}

export function IconExpand(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 3H3v5" />
      <path d="M16 3h5v5" />
      <path d="M21 16v5h-5" />
      <path d="M3 16v5h5" />
    </BaseIcon>
  );
}

export function IconCollapse(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 8V3h5" />
      <path d="M21 8V3h-5" />
      <path d="M21 16v5h-5" />
      <path d="M3 16v5h5" />
      <path d="M8 8l-5-5" />
      <path d="M16 8l5-5" />
      <path d="M16 16l5 5" />
      <path d="M8 16l-5 5" />
    </BaseIcon>
  );
}

export function IconTree(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v6" />
      <path d="M5 9h14" />
      <path d="M7 9v5" />
      <path d="M17 9v5" />
      <path d="M7 14h10" />
      <path d="M9 14v7" />
      <path d="M15 14v7" />
    </BaseIcon>
  );
}

export function IconTable(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
      <path d="M8 6v12" />
      <path d="M16 6v12" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </BaseIcon>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </BaseIcon>
  );
}

export function IconBook(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 19a2 2 0 0 0 2 2h14" />
      <path d="M6 2h14v17H6a2 2 0 0 0-2 2V4a2 2 0 0 1 2-2Z" />
    </BaseIcon>
  );
}

export function IconClock(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </BaseIcon>
  );
}
