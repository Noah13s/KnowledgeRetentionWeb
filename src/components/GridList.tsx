import { useRef } from 'react';
import './GridList.css';

type Props<T> = {
    items: T[];
    getId: (item: T) => string;
    getTitle: (item: T) => string;
    isSelected?: (item: T) => boolean;
    isConfirmed?: (item: T) => boolean;
    onItemClick: (item: T) => void;
    onItemLongPress?: (item: T) => void;
    renderVisual: (item: T) => React.ReactNode;
};

export default function GridList<T>({
    items,
    getId,
    getTitle,
    isSelected,
    isConfirmed,
    onItemClick,
    onItemLongPress,
    renderVisual,
}: Props<T>) {
    const interactRef = useRef({ preventClick: false });

    return (
        <div className="gridlist">
            {items.map((item) => {
                let pressTimer: ReturnType<typeof setTimeout>;
                const selected = isSelected?.(item) ?? false;
                const confirmed = !selected && (isConfirmed?.(item) ?? false);

                return (
                    <div
                        key={getId(item)}
                        className={`card ${selected ? 'selected' : ''} ${confirmed ? 'confirmed' : ''}`}
                        onPointerDown={() => {
                            interactRef.current.preventClick = false;
                            pressTimer = setTimeout(() => {
                                interactRef.current.preventClick = true;
                                onItemLongPress?.(item);
                            }, 500);
                        }}
                        onPointerUp={() => clearTimeout(pressTimer)}
                        onPointerLeave={() => clearTimeout(pressTimer)}
                        onClick={() => {
                            clearTimeout(pressTimer);
                            if (!interactRef.current.preventClick) {
                                onItemClick(item);
                            }
                        }}
                    >
                        {renderVisual(item)}
                        <div className="title">{getTitle(item)}</div>
                        {selected && <div className="selection-indicator">✓</div>}
                        {confirmed && <div className="selection-indicator confirmed-indicator">✓</div>}
                    </div>
                );
            })}
        </div>
    );
}