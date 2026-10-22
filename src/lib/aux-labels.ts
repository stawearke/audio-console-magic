import { AUX_NAMES } from "./mixer-state";

export const auxLabel = (i: number) => AUX_NAMES[i] ?? `AUX ${i + 1}`;
