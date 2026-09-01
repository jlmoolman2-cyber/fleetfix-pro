export type CompanyRateCategory = "labour" | "travelTime" | "travelling";

export type CompanyRateLine = {
  id: string;
  category: CompanyRateCategory;
  name: string;
  rate: number;
  cpk?: number;
  weekDays?: number[];
  statusId?: string;
  statusName?: string;
  statusIds?: string[];
  statusNames?: string[];
  startTime?: string;
  endTime?: string;
  timeZone?: string;
  active?: boolean;
};

function timerDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clockMinutes(value = "00:00") {
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function localMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  return (Number(parts.find((part) => part.type === "hour")?.value || 0) % 24) * 60 + Number(parts.find((part) => part.type === "minute")?.value || 0);
}

function localWeekDay(date: Date, timeZone: string) {
  const shortDay = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(shortDay);
}

function matchesWeekDay(date: Date, rate: CompanyRateLine) {
  return !Array.isArray(rate.weekDays) || rate.weekDays.length === 0 || rate.weekDays.includes(localWeekDay(date, rate.timeZone || "Africa/Johannesburg"));
}

function isInsideWindow(date: Date, rate: CompanyRateLine) {
  if (!matchesWeekDay(date, rate)) return false;
  if (!rate.startTime || !rate.endTime) return true;
  const current = localMinutes(date, rate.timeZone || "Africa/Johannesburg");
  const start = clockMinutes(rate.startTime);
  const end = clockMinutes(rate.endTime);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function matchesTimer(rate: CompanyRateLine, timer: any) {
  if (rate.active === false) return false;
  const statusIds = Array.isArray(rate.statusIds) ? rate.statusIds : rate.statusId ? [rate.statusId] : [];
  const statusNames = Array.isArray(rate.statusNames) ? rate.statusNames : rate.statusName ? [rate.statusName] : [];
  if (statusIds.length === 0 && statusNames.length === 0) return true;
  const timerStatusName = String(timer.statusName || timer.description || "").toLowerCase();
  return statusIds.includes(timer.statusId) || statusNames.some((name) => name.toLowerCase() === timerStatusName);
}

export function calculateCompanyRateTotals(rates: CompanyRateLine[], timers: any[], kilometres: number) {
  let labour = 0;
  let travelTime = 0;
  for (const timer of timers) {
    const start = timerDate(timer.startTime || timer.createdAt);
    const end = timerDate(timer.endTime);
    if (!start || !end || end <= start) continue;
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 60_000) {
      const sliceEnd = Math.min(cursor + 60_000, end.getTime());
      const at = new Date(cursor);
      for (const category of ["labour", "travelTime"] as const) {
        const rate = rates.find((line) => line.category === category && matchesTimer(line, timer) && isInsideWindow(at, line));
        if (!rate) continue;
        const amount = ((sliceEnd - cursor) / 3_600_000) * Number(rate.rate || 0);
        if (category === "labour") labour += amount;
        else travelTime += amount;
      }
    }
  }
  const latestTimerDate = timers.map((timer) => timerDate(timer.startTime || timer.createdAt)).filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0];
  const travellingRate = rates.find((rate) => rate.category === "travelling" && rate.active !== false && (!latestTimerDate || matchesWeekDay(latestTimerDate, rate)));
  const travelling = Math.max(0, kilometres) * Number(travellingRate?.rate || 0);
  const travellingCost = Math.max(0, kilometres) * Number(travellingRate?.cpk || 0);
  return { labour, travelTime, travelling, travellingCost, travel: travelTime + travelling };
}
