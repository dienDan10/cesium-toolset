import ItemIcon from './ItemIcon';
import { useUiSettingsStore } from './UseUISettingsStore';

export default function ChoiceRow({ item }) {
    const value = useUiSettingsStore((s) => s.values[item.id]);
    const set = useUiSettingsStore((s) => s.set);
    return (
        <div className="px-5 py-2.5">
            <span className="mb-1.5 flex items-center gap-2 font-mono text-[13px] text-neutral-300">
                <ItemIcon name={item.icon} />
                {item.label}
            </span>
            <div className="ml-6 flex gap-1.5">
                {item.choices.map((choice) => {
                    const active = value === choice.value;
                    return (
                        <button
                            key={choice.value}
                            type="button"
                            onClick={() => set(item.id, choice.value)}
                            className={`border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                                active
                                    ? 'border-amber-600 bg-amber-900/40 text-amber-400'
                                    : 'border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
                            }`}
                        >
                            {choice.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
