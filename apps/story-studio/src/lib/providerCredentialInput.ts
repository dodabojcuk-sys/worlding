export const MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS = 512;

export function normalizeProviderCredentialInput(value: string): string {
  const credential = value.trim();
  if (
    credential.length < 8
    || credential.length > MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS
    || /[\r\n\0]/u.test(credential)
  ) {
    throw new TypeError("API Key 输入异常，请只粘贴当前 Provider 的完整 Key。");
  }
  return credential;
}
