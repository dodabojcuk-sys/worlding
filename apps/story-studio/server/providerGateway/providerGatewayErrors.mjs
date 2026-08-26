const PUBLIC_ERROR_DEFINITIONS = Object.freeze({
  "invalid-request": Object.freeze({ statusCode: 400, retryable: false, message: "当前模型请求内容无效。" }),
  unconfigured: Object.freeze({ statusCode: 503, retryable: false, message: "当前模型服务尚未配置。" }),
  unauthorized: Object.freeze({ statusCode: 503, retryable: false, message: "API Key 无效或已失效，请检查本机凭据。" }),
  forbidden: Object.freeze({ statusCode: 503, retryable: false, message: "账户或模型权限受限，请检查 Provider 权限。" }),
  "not-found": Object.freeze({ statusCode: 503, retryable: false, message: "接口地址或模型不存在，请检查连接设置。" }),
  "rate-limited": Object.freeze({ statusCode: 429, retryable: true, message: "当前模型服务请求过多，请稍后再试。" }),
  unavailable: Object.freeze({ statusCode: 503, retryable: true, message: "当前模型服务暂时不可用。" }),
  timeout: Object.freeze({ statusCode: 504, retryable: true, message: "模型响应超时，已停止本次请求。" }),
  cancelled: Object.freeze({ statusCode: 499, retryable: false, message: "本次模型请求已停止。" }),
  "invalid-response": Object.freeze({ statusCode: 502, retryable: false, message: "模型服务返回了无法读取的响应。" })
});

export class ProviderGatewayError extends Error {
  constructor(code) {
    const definition = PUBLIC_ERROR_DEFINITIONS[code] || PUBLIC_ERROR_DEFINITIONS.unavailable;
    super(definition.message);
    this.name = "ProviderGatewayError";
    this.code = PUBLIC_ERROR_DEFINITIONS[code] ? code : "unavailable";
    this.statusCode = definition.statusCode;
    this.retryable = definition.retryable;
  }
}

export function providerGatewayError(code) {
  return new ProviderGatewayError(code);
}

export function isProviderGatewayError(error) {
  return error instanceof ProviderGatewayError;
}

export function providerGatewayErrorPayload(error) {
  const normalized = isProviderGatewayError(error) ? error : providerGatewayError("unavailable");
  return Object.freeze({
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable
  });
}
