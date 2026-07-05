const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const {
  extractMessage,
  extractStack,
  extractCode,
  resolveErrorMessage,
} = require('./error-catalog');

let logsDirOverride = null;
let appVersionOverride = '1.0.0';

function setLogsDir(dir) {
  logsDirOverride = dir;
}

function setAppVersion(version) {
  appVersionOverride = version || '1.0.0';
}

function getLogsDir() {
  if (logsDirOverride) return logsDirOverride;
  return path.join(__dirname, '..', '..', 'logs');
}

function ensureLogsDir() {
  const dir = getLogsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getLogFilePath(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return path.join(ensureLogsDir(), `system-errors-${y}-${m}-${d}.jsonl`);
}

function normalizeErrorInput(error) {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  if (error && typeof error === 'object') {
    const err = new Error(error.message || error.error || JSON.stringify(error));
    if (error.code) err.code = error.code;
    if (error.stack) err.stack = error.stack;
    return err;
  }
  return new Error(String(error));
}

function buildContext(extra = {}) {
  return {
    platform: process.platform,
    hostname: os.hostname(),
    appVersion: appVersionOverride,
    ...extra,
  };
}

function logSystemError({
  subsystem = 'main',
  location = 'unknown',
  error,
  phase = 'runtime',
  severity,
  context = {},
}) {
  const err = normalizeErrorInput(error);
  const mergedContext = { ...context };
  const resolved = resolveErrorMessage({
    error: err,
    subsystem,
    location,
    context: mergedContext,
  });

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity: severity || resolved.severity || 'error',
    phase,
    subsystem,
    location,
    messageRu: resolved.messageRu,
    messageTech: extractMessage(err),
    stack: extractStack(err),
    code: extractCode(err),
    context: buildContext(mergedContext),
  };

  try {
    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(getLogFilePath(), line, 'utf8');
  } catch (writeErr) {
    console.error('[system-logger] Не удалось записать лог:', writeErr);
  }

  console.error(`[system-logger][${subsystem}/${location}]`, entry.messageRu, entry.messageTech);
  return entry;
}

function parseJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter((line) => line.trim());
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function listLogFiles(days) {
  const dir = getLogsDir();
  if (!fs.existsSync(dir)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  cutoff.setHours(0, 0, 0, 0);

  return fs
    .readdirSync(dir)
    .filter((name) => /^system-errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .map((name) => {
      const match = name.match(/^system-errors-(\d{4})-(\d{2})-(\d{2})\.jsonl$/);
      const fileDate = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(0);
      return { name, path: path.join(dir, name), fileDate };
    })
    .filter(({ fileDate }) => fileDate >= cutoff)
    .sort((a, b) => b.fileDate - a.fileDate);
}

function readErrorLogs(filters = {}) {
  const days = filters.days ?? 30;
  const limit = filters.limit ?? 500;
  const files = listLogFiles(days);

  let entries = [];
  for (const file of files) {
    entries = entries.concat(parseJsonlFile(file.path));
  }

  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (filters.severity) {
    entries = entries.filter((e) => e.severity === filters.severity);
  }
  if (filters.subsystem) {
    entries = entries.filter((e) => e.subsystem === filters.subsystem);
  }
  if (filters.location) {
    entries = entries.filter((e) => e.location === filters.location);
  }
  if (filters.date) {
    const dayStart = new Date(filters.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    entries = entries.filter((e) => {
      const ts = new Date(e.timestamp);
      return ts >= dayStart && ts < dayEnd;
    });
  }
  if (filters.sinceHours) {
    const since = Date.now() - filters.sinceHours * 60 * 60 * 1000;
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= since);
  }

  return entries.slice(0, limit);
}

function getErrorStats(logs) {
  const bySubsystem = {};
  const bySeverity = { critical: 0, error: 0, warning: 0 };
  const byLocation = {};
  const byDay = {};
  const byHour = {};

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  let todayCount = 0;
  let criticalCount = 0;
  let lastTimestamp = null;

  for (const entry of logs) {
    bySubsystem[entry.subsystem] = (bySubsystem[entry.subsystem] || 0) + 1;
    if (bySeverity[entry.severity] !== undefined) {
      bySeverity[entry.severity] += 1;
    }
    const locKey = entry.location || 'unknown';
    byLocation[locKey] = (byLocation[locKey] || 0) + 1;

    const dayKey = entry.timestamp.slice(0, 10);
    byDay[dayKey] = (byDay[dayKey] || 0) + 1;
    if (dayKey === todayKey) todayCount += 1;

    const hourKey = entry.timestamp.slice(0, 13);
    byHour[hourKey] = (byHour[hourKey] || 0) + 1;

    if (entry.severity === 'critical') criticalCount += 1;
    if (!lastTimestamp || entry.timestamp > lastTimestamp) {
      lastTimestamp = entry.timestamp;
    }
  }

  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7Days.push({ date: key, count: byDay[key] || 0 });
  }

  const topLocations = Object.entries(byLocation)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([location, count]) => ({ location, count }));

  return {
    total: logs.length,
    todayCount,
    criticalCount,
    lastTimestamp,
    bySubsystem,
    bySeverity,
    byDay: last7Days,
    byHour,
    topLocations,
  };
}

function getRecentErrorCount(sinceHours = 24) {
  return readErrorLogs({ sinceHours, limit: 10_000 }).length;
}

module.exports = {
  setLogsDir,
  setAppVersion,
  getLogsDir,
  logSystemError,
  readErrorLogs,
  getErrorStats,
  getRecentErrorCount,
};
