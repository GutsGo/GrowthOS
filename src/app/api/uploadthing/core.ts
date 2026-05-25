import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

// 习惯打卡凭证图片上传路由配置
export const ourFileRouter = {
  // 定义习惯打卡凭证的上传路由
  habitAttachment: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      // 离线优先架构下，我们默认授予一个本地虚拟用户身份
      return { userId: "local-first-user" };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Upload complete for userId:", metadata.userId);
      console.log("file url:", file.url);
      return { uploadedBy: metadata.userId, url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
