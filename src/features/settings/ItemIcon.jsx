// Map icon key (schema) -> component Tabler thật.

import { IconCompass, IconMap, IconRuler, IconTooltip } from '@tabler/icons-react';

// Thêm item mới có icon mới trong schema -> thêm 1 dòng ở đây.
const ICONS = {
    map: IconMap,
    ruler: IconRuler,
    tooltip: IconTooltip,
    compass: IconCompass,
};

export default function ItemIcon({ name }) {
    const Icon = ICONS[name];
    if (!Icon) return null;
    return <Icon size={15} className="text-neutral-500" aria-hidden="true" />;
}
