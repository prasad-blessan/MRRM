// Joins class names, skipping falsy values: cx('btn', active && 'btn--active').
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')
