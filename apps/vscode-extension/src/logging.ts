import * as vscode from 'vscode';

export const OUTPUT_CHANNEL_NAME = 'OCTOPUS Ghost';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';
type LogFields = Record<string, unknown>;

let channel: vscode.OutputChannel | null = null;

function getChannel(): vscode.OutputChannel | null {
  if (channel) {
    return channel;
  }

  if (typeof vscode.window?.createOutputChannel !== 'function') {
    return null;
  }

  channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  return channel;
}

function formatFields(fields?: LogFields) {
  if (!fields || Object.keys(fields).length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(fields)}`;
  } catch {
    return ' [unserializable fields]';
  }
}

function write(level: LogLevel, message: string, fields?: LogFields) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${formatFields(fields)}`;
  getChannel()?.appendLine(line);
}

export function describeError(error: unknown): {
  name?: string;
  message: string;
  stack?: string | undefined;
  statusCode?: unknown;
  code?: unknown;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...('statusCode' in error ? { statusCode: (error as { statusCode: unknown }).statusCode } : {}),
      ...('code' in error ? { code: (error as { code: unknown }).code } : {}),
    };
  }

  return { message: String(error) };
}

export const logger = {
  info(message: string, fields?: LogFields) {
    write('INFO', message, fields);
  },
  warn(message: string, fields?: LogFields) {
    write('WARN', message, fields);
  },
  error(message: string, error?: unknown, fields?: LogFields) {
    const details = error === undefined ? undefined : describeError(error);
    write('ERROR', message, { ...fields, ...(details ? { error: { ...details, stack: undefined } } : {}) });
    if (details?.stack) {
      getChannel()?.appendLine(details.stack);
    }
  },
  show() {
    getChannel()?.show(true);
  },
};

export function initializeLogging(context: vscode.ExtensionContext) {
  const outputChannel = getChannel();
  if (outputChannel) {
    context.subscriptions.push({
      dispose() {
        outputChannel.dispose();
        if (channel === outputChannel) {
          channel = null;
        }
      },
    });
  }
}
