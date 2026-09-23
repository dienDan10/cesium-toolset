import * as Switch from '@radix-ui/react-switch';
import { useUiSettingsStore } from './UseUISettingsStore';
import ItemIcon from './ItemIcon';

export default function ToggleRow({ item }) {
    const value = useUiSettingsStore((s) => s.values[item.id]);
    const set = useUiSettingsStore((s) => s.set);
    return (
        <div className="flex items-center justify-between px-5 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[13px] text-neutral-300">
                <ItemIcon name={item.icon} />
                {item.label}
            </span>
            <Switch.Root
                checked={!!value}
                onCheckedChange={(v) => set(item.id, v)}
                className="relative h-5 w-9 shrink-0 border border-neutral-700 bg-neutral-900 outline-none data-[state=checked]:border-amber-600/70 data-[state=checked]:bg-amber-900/40"
            >
                <Switch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 bg-neutral-600 transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-amber-500 data-[state=checked]:shadow-[0_0_4px_rgba(217,155,61,0.8)]" />
            </Switch.Root>
        </div>
    );
}
