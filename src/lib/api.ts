/**
 * 封装的 fetch 辅助函数，会自动在头部添加基于站点密码的授权 Bearer Token。
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("growthOS_auth_token") : null;
  
  const headers = {
    ...options.headers,
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
