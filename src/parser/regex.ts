export const RE_HEADER = /^\s*(?:🔼BUY|🔽SELL)\s+([A-Z]{6})\s*$/m;
export const RE_SL = /🔴\s*SL\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_TP1 = /🟢\s*TP1\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_TP2 = /🟢\s*TP2\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_TP3 = /🟢\s*TP3\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_EXEC = /Execution\s*Price\s*:\s*([0-9]+(?:\.[0-9]+)?)/i;