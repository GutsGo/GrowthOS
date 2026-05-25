import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// 导出 GET 和 POST 处理方法以响应 uploadthing 客户端 SDK 的连接请求
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});
