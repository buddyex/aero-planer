const SUBSYSTEM_LABELS = {
  database: 'База данных',
  mysql: 'MySQL',
  sync: 'Синхронизация',
  api: 'API',
  auth: 'Аутентификация',
  websocket: 'WebSocket',
  renderer: 'Интерфейс',
  weather: 'Метеоданные',
  pdf: 'PDF',
};

const SEVERITY_LABELS = {
  critical: 'Критическая',
  error: 'Ошибка',
  warning: 'Предупреждение',
};

const CATALOG_RULES = [
  {
    test: (err) => /^ER_/i.test(String(err?.code || '')),
    messageRu: 'Ошибка запроса к базе данных MySQL. Проверьте целостность данных и ограничения СУБД.',
    severity: 'error',
  },
  {
    test: (err) => /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ENETUNREACH/i.test(String(err?.code || err?.message || '')),
    messageRu: 'Не удалось связаться с сервером API. Проверьте доступность backend и сетевое подключение.',
    severity: 'warning',
  },
  {
    test: (err, ctx) => ctx?.event === 'renderer-error' || ctx?.event === 'renderer-unhandledrejection',
    messageRu: 'Критическая ошибка в интерфейсе приложения.',
    severity: 'error',
  },
  {
    test: (err, ctx) => ctx?.reason === 'unknown_user' || ctx?.reason === 'invalid_pin',
    messageRu: 'Неудачная попытка входа в систему.',
    severity: 'warning',
  },
  {
    test: (err) => /JsonWebToken|jwt expired|invalid token/i.test(String(err?.message || '')),
    messageRu: 'Ошибка аутентификации: недействительный или просроченный токен.',
    severity: 'warning',
  },
  {
    test: (err, ctx) => ctx?.event === 'unhandledRejection',
    messageRu: 'Необработанное отклонение асинхронной операции на сервере.',
    severity: 'error',
  },
  {
    test: (err, ctx) => ctx?.event === 'uncaughtException',
    messageRu: 'Необработанное исключение на сервере приложения.',
    severity: 'critical',
  },
];

function extractMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

function extractStack(error) {
  if (!error) return null;
  if (typeof error === 'string') return null;
  return error.stack || null;
}

function extractCode(error) {
  if (!error) return null;
  if (typeof error === 'object' && error.code) return String(error.code);
  return null;
}

function resolveWeatherEventMessage(context) {
  if (context.event === 'weather-cascade-fallback') {
    const failed = (context.failedSources || []).join(', ') || 'основные API';
    const success = context.successSource || 'резервный';
    return {
      messageRu: `Погодные API (${failed}) недоступны. Метеоданные получены из резервного источника ${success}.`,
      severity: 'warning',
    };
  }

  if (context.event === 'weather-cascade-total-failure') {
    const attempted = (context.attemptedSources || ['CheckWX', 'NOAA', 'OpenMeteo']).join(', ');
    return {
      messageRu: `Все погодные API недоступны (${attempted}). Переключитесь на ручной ввод метеоданных.`,
      severity: 'error',
    };
  }

  if (context.event === 'weather-sync-summary') {
    const total = context.sectorsTotal ?? 0;
    const openMeteoUsed = context.openMeteoUsed ?? 0;
    return {
      messageRu: `При синхронизации погоды по ${total} секторам основные API (CheckWX, NOAA) недоступны. Данные получены из резервного источника OpenMeteo (${openMeteoUsed} секторов).`,
      severity: 'warning',
    };
  }

  if (context.weatherSource === 'CheckWX') {
    return {
      messageRu: 'API CheckWX недоступен (таймаут или ошибка HTTP).',
      severity: 'warning',
    };
  }

  return null;
}

function resolveErrorMessage({ error, subsystem, location, context = {} }) {
  const weatherMessage = resolveWeatherEventMessage(context);
  if (weatherMessage) {
    return weatherMessage;
  }

  for (const rule of CATALOG_RULES) {
    if (rule.test(error, context)) {
      return {
        messageRu: rule.messageRu,
        severity: rule.severity,
      };
    }
  }

  const subsystemLabel = SUBSYSTEM_LABELS[subsystem] || subsystem || 'система';
  const locationPart = location ? ` (${location})` : '';
  return {
    messageRu: `Произошла системная ошибка в модуле «${subsystemLabel}»${locationPart}.`,
    severity: context?.severityHint || 'error',
  };
}

module.exports = {
  SUBSYSTEM_LABELS,
  SEVERITY_LABELS,
  extractMessage,
  extractStack,
  extractCode,
  resolveErrorMessage,
};
