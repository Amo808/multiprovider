import { encodingForModel, getEncoding, Tiktoken } from 'js-tiktoken';
import { ModelInfo } from '../types';

// Функция для получения примерного количества токенов в тексте
export const estimateTokenCount = (text: string, model?: ModelInfo): number => {
  if (!text || text.trim().length === 0) return 0;
  
  try {
    let encoding: Tiktoken;
    
    // Выбираем кодировку в зависимости от провайдера и модели
    if (model?.provider === 'openai') {
      if (model.id.includes('gpt-4')) {
        encoding = encodingForModel('gpt-4');
      } else if (model.id.includes('gpt-3.5')) {
        encoding = encodingForModel('gpt-3.5-turbo');
      } else {
        encoding = getEncoding('cl100k_base');
      }
    } else if (model?.provider === 'anthropic') {
      // Claude использует аналогичную токенизацию
      encoding = getEncoding('cl100k_base');
    } else if (model?.provider === 'deepseek') {
      // DeepSeek использует аналогичную токенизацию
      encoding = getEncoding('cl100k_base');
    } else {
      // Для остальных провайдеров используем базовую кодировку
      encoding = getEncoding('cl100k_base');
    }
    
    const tokens = encoding.encode(text);
    // encoding.free(); // В некоторых версиях js-tiktoken нет метода free
    return tokens.length;
  } catch (error) {
    console.warn('Failed to count tokens, using approximation:', error);
    // Приблизительный подсчет: ~4 символа на токен для английского текста
    return Math.ceil(text.length / 4);
  }
};

// Получить максимальное количество токенов для ввода с учетом лимитов модели
export const getMaxInputTokens = (model?: ModelInfo, maxTokensConfig?: number): number => {
  if (!model) return 4000; // Дефолтное значение
  
  const contextLength = model.context_length || 4000;
  const maxOutput = maxTokensConfig || 4000;
  
  // Оставляем место для ответа и системных сообщений
  const reservedTokens = Math.max(maxOutput, 1000) + 500; // 500 токенов для системных сообщений
  
  return Math.max(contextLength - reservedTokens, 1000);
};

// Проверить, превышает ли текст лимит токенов
export const isTokenLimitExceeded = (text: string, model?: ModelInfo, maxTokensConfig?: number): boolean => {
  const tokenCount = estimateTokenCount(text, model);
  const maxTokens = getMaxInputTokens(model, maxTokensConfig);
  return tokenCount > maxTokens;
};

// Получить статистику токенов для отображения
export const getTokenStats = (text: string, model?: ModelInfo, maxTokensConfig?: number) => {
  const tokenCount = estimateTokenCount(text, model);
  const maxTokens = getMaxInputTokens(model, maxTokensConfig);
  const isExceeded = tokenCount > maxTokens;
  const percentage = Math.min((tokenCount / maxTokens) * 100, 100);
  
  return {
    current: tokenCount,
    max: maxTokens,
    percentage,
    isExceeded,
    remaining: Math.max(maxTokens - tokenCount, 0)
  };
};

// Форматирование числа токенов для отображения
export const formatTokenCount = (count: number): string => {
  if (count < 1000) {
    return count.toString();
  } else if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  } else {
    return `${(count / 1000000).toFixed(1)}M`;
  }
};

// Получить цвет для индикатора токенов в зависимости от процента использования
export const getTokenIndicatorColor = (percentage: number): string => {
  if (percentage < 60) return 'text-green-600 dark:text-green-400';
  if (percentage < 80) return 'text-yellow-600 dark:text-yellow-400';
  if (percentage < 95) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
};

// Получить цвет фона для прогресс-бара
export const getTokenProgressColor = (percentage: number): string => {
  if (percentage < 60) return 'bg-green-500';
  if (percentage < 80) return 'bg-yellow-500';
  if (percentage < 95) return 'bg-orange-500';
  return 'bg-red-500';
};
