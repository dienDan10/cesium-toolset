// MeasureToolbar.jsx
import { IconTrash, IconX } from '@tabler/icons-react';
import { useMeasureToolbar } from './UseMeasureToolbar';
import {
    SURFACE_OPTION_FLAT,
    SURFACE_OPTION_GROUND,
    TYPE_OPTION_AREA,
    TYPE_OPTION_DISTANCE,
} from './MeasureConstants';

const TYPE_OPTIONS = [
    [TYPE_OPTION_DISTANCE, 'Khoảng cách'],
    [TYPE_OPTION_AREA, 'Diện tích'],
];
const SURFACE_OPTIONS = [
    [SURFACE_OPTION_FLAT, 'Phẳng'],
    [SURFACE_OPTION_GROUND, 'Bám đất'],
];
const TYPE_LABEL = { [TYPE_OPTION_DISTANCE]: 'Khoảng cách', [TYPE_OPTION_AREA]: 'Diện tích' };
const SURFACE_LABEL = { [SURFACE_OPTION_FLAT]: 'phẳng', [SURFACE_OPTION_GROUND]: 'bám đất' };

export default function MeasureToolbar() {
    const {
        showMeasure,
        type,
        surface,
        liveResult,
        measurements,
        selectType,
        selectSurface,
        clearAll,
        removeOne,
    } = useMeasureToolbar();

    if (!showMeasure) return null;

    return (
        <div className="absolute left-4 top-4 z-10 flex w-56 flex-col gap-1.5 border border-neutral-700 bg-neutral-950/80 p-2 font-mono text-[12px] text-neutral-300">
            <div className="flex gap-1">
                {TYPE_OPTIONS.map(([val, label]) => (
                    <button
                        key={val}
                        type="button"
                        onClick={() => selectType(val)}
                        className={`border px-2 py-1 uppercase tracking-wide transition-colors ${
                            type === val
                                ? 'border-amber-600 bg-amber-900/40 text-amber-400'
                                : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex gap-1">
                {SURFACE_OPTIONS.map(([val, label]) => (
                    <button
                        key={val}
                        type="button"
                        onClick={() => selectSurface(val)}
                        className={`border px-2 py-1 uppercase tracking-wide transition-colors ${
                            surface === val
                                ? 'border-amber-600 bg-amber-900/40 text-amber-400'
                                : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-1.5">
                <span className={liveResult ? 'text-amber-400' : 'text-neutral-600'}>
                    {liveResult ?? '—'}
                </span>
                <button
                    type="button"
                    onClick={clearAll}
                    aria-label="Xoá tất cả"
                    title="Xoá tất cả"
                    className="flex h-6 w-6 items-center justify-center border border-neutral-700 text-neutral-500 transition-colors hover:border-amber-600/70 hover:text-amber-500"
                >
                    <IconTrash size={13} aria-hidden="true" />
                </button>
            </div>

            {measurements.length > 0 && (
                <div className="measurements-scrollbar flex max-h-40 flex-col gap-1 overflow-y-auto border-t border-neutral-800 pt-1.5 pr-1">
                    {measurements.map((m, i) => (
                        <div
                            key={m.id}
                            className="flex items-center gap-2 rounded-sm px-1 py-0.5 transition-colors hover:bg-neutral-900"
                        >
                            <span className="min-w-0 flex-1 truncate text-neutral-500">
                                {i + 1}. {TYPE_LABEL[m.type]} ({SURFACE_LABEL[m.surface]})
                            </span>
                            <span className="shrink-0 text-amber-400">{m.label}</span>
                            <button
                                type="button"
                                onClick={() => removeOne(m.id)}
                                aria-label="Xoá phép đo này"
                                className="shrink-0 text-neutral-600 hover:text-amber-500"
                            >
                                <IconX size={12} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
