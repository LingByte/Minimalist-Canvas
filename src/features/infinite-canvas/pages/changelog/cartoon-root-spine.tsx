import { useLayoutEffect, useRef, useState } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";

/** One long cartoon trunk (chroma-keyed). Slices reconnect if stacked. */
export const ROOT_LONG_SRC = "/images/release/cartoon/root-long.png";

export const ROOT_SLICES = [
    "/images/release/cartoon/slices/slice-00.png",
    "/images/release/cartoon/slices/slice-01.png",
    "/images/release/cartoon/slices/slice-02.png",
    "/images/release/cartoon/slices/slice-03.png",
    "/images/release/cartoon/slices/slice-04.png",
    "/images/release/cartoon/slices/slice-05.png",
    "/images/release/cartoon/slices/slice-06.png",
    "/images/release/cartoon/slices/slice-07.png",
] as const;

type CartoonRootSpineProps = {
    grow: MotionValue<number>;
};

/**
 * Stack trunk slices at natural aspect — never stretch.
 * Soft mask fade for growth tip. No side branches.
 */
export function CartoonRootSpine({ grow }: CartoonRootSpineProps) {
    const spineRef = useRef<HTMLDivElement>(null);
    const [repeats, setRepeats] = useState(1);
    const [sliceAspect, setSliceAspect] = useState(305 / 320);

    useLayoutEffect(() => {
        const el = spineRef.current;
        if (!el) return;

        const probe = new Image();
        probe.src = ROOT_SLICES[0];
        const measure = () => {
            const width = el.clientWidth || 1;
            const height = el.clientHeight || 1;
            const aspect =
                probe.naturalWidth > 0 ? probe.naturalHeight / probe.naturalWidth : sliceAspect;
            const sliceHeight = width * aspect;
            const oneRun = sliceHeight * ROOT_SLICES.length;
            setRepeats(Math.max(1, Math.ceil(height / oneRun) + 1));
        };

        probe.onload = () => {
            if (probe.naturalWidth > 0) {
                setSliceAspect(probe.naturalHeight / probe.naturalWidth);
            }
            measure();
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [sliceAspect]);

    const maskImage = useTransform(grow, (value) => {
        const tip = Math.min(100, Math.max(10, value * 100));
        const solid = Math.max(0, tip - 12);
        return `linear-gradient(to bottom, #000 0%, #000 ${solid}%, transparent ${tip}%)`;
    });

    return (
        <div ref={spineRef} className="root-spine" aria-hidden="true">
            <motion.div
                className="root-spine-grow"
                style={{
                    maskImage,
                    WebkitMaskImage: maskImage,
                }}
            >
                <div className="root-spine-track">
                    {Array.from({ length: repeats }, (_, run) =>
                        ROOT_SLICES.map((src, index) => (
                            <img
                                key={`${run}-${index}`}
                                src={src}
                                alt=""
                                decoding="async"
                                draggable={false}
                                className="root-spine-slice"
                            />
                        )),
                    )}
                </div>
            </motion.div>
        </div>
    );
}
