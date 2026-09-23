// SettingsPanel.jsx
//
// Deps: @radix-ui/react-dialog, @radix-ui/react-switch, @tabler/icons-react, framer-motion
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { IconSettings, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { settingsSchema } from './SettingsSchema';
import ToggleRow from './ToggleRow';
import ChoiceRow from './ChoiceRow';

export default function SettingsPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const visibleCategories = settingsSchema.filter((c) => c.items.length > 0);

    return (
        <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
            <Dialog.Trigger asChild>
                <button
                    type="button"
                    aria-label="Mở settings"
                    className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center border border-neutral-700 bg-neutral-950/70 text-neutral-400 transition-colors hover:border-amber-600/70 hover:text-amber-500"
                >
                    <IconSettings size={17} aria-hidden="true" />
                </button>
            </Dialog.Trigger>

            {/* forceMount + AnimatePresence: Radix Dialog quản lý focus trap/Esc/scroll-lock,
          Framer Motion quản lý animation vào/ra (kể cả lúc đóng, khác với Radix mặc định
          unmount ngay lập tức). */}
            <AnimatePresence>
                {isOpen && (
                    <Dialog.Portal forceMount>
                        <Dialog.Overlay asChild forceMount>
                            <motion.div
                                className="fixed inset-0 z-40 bg-black/50"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.18 }}
                            />
                        </Dialog.Overlay>

                        <Dialog.Content
                            asChild
                            forceMount
                            aria-describedby={undefined}
                            className="fixed right-0 top-0 z-50 h-full w-75 max-w-[85vw] border-l border-neutral-800 bg-neutral-950 text-neutral-200 shadow-[-8px_0_24px_rgba(0,0,0,0.4)]"
                        >
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                            >
                                {/* corner tick — 1 điểm nhấn duy nhất */}
                                <span className="pointer-events-none absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-amber-600/70" />
                                <span className="pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-amber-600/70" />

                                <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3.5">
                                    <Dialog.Title className="font-mono text-[13px] uppercase tracking-[0.15em] text-neutral-300">
                                        Cài đặt
                                    </Dialog.Title>
                                    <Dialog.Close asChild>
                                        <button
                                            type="button"
                                            aria-label="Đóng settings"
                                            className="text-neutral-500 hover:text-amber-500"
                                        >
                                            <IconX size={15} aria-hidden="true" />
                                        </button>
                                    </Dialog.Close>
                                </div>

                                <div className="overflow-y-auto py-1">
                                    {visibleCategories.map((category) => (
                                        <div key={category.id} className="mt-2 first:mt-0">
                                            <div className="px-5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-600">
                                                {category.label}
                                            </div>
                                            {category.items.map((item) => (
                                                <SettingsItem key={item.id} item={item} />
                                            ))}
                                        </div>
                                    ))}

                                    {visibleCategories.length === 0 && (
                                        <div className="px-5 py-5 font-mono text-[12px] text-neutral-600">
                                            Chưa có tùy chọn nào.
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    );
}

function SettingsItem({ item }) {
    if (item.type === 'toggle') return <ToggleRow item={item} />;
    if (item.type === 'choice') return <ChoiceRow item={item} />;
    return null;
}
