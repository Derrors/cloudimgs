# 云图 CloudImgs

> 自托管图床、相册管理与图片处理服务。

本仓库是 [qazzxxx/cloudimgs](https://github.com/qazzxxx/cloudimgs) 的 fork，当前维护仓库为 [Derrors/cloudimgs](https://github.com/Derrors/cloudimgs)。
本项目保留原项目的图床、相册、分享、地图轨迹、流量看板和魔法搜索能力，并在访问控制、上传安全、模型加载稳定性和上传命名策略上做了增强。

[![Fork Repo](https://img.shields.io/badge/fork-Derrors%2Fcloudimgs-blue?style=flat-square&logo=github)](https://github.com/Derrors/cloudimgs)
[![Original Repo](https://img.shields.io/badge/original-qazzxxx%2Fcloudimgs-lightgrey?style=flat-square&logo=github)](https://github.com/qazzxxx/cloudimgs)

---

## 原项目说明

原项目：[qazzxxx/cloudimgs](https://github.com/qazzxxx/cloudimgs)

原项目定位是一个简单、开放且强大的自托管图像托管解决方案，适合 NAS、自建服务、自动化工作流和 PicGo 等场景。本 fork 在原项目基础上继续维护，重点补强了公网部署时的安全边界和上传链路可控性。

原项目演示与文档：

- 演示地址：[https://yt.qazz.site](https://yt.qazz.site)
- 文档地址：[https://ytdoc.qazz.site/](https://ytdoc.qazz.site/)

---

## 本 Fork 的主要改动

- 增强访问控制：`/api/settings`、魔法搜索管理接口等敏感 API 需要访问密码。
- 增强图片直链保护：设置 `PASSWORD` 后，图片/文件直链默认需要登录态或分享 token。
- 保留公开图床兼容：可通过 `PUBLIC_IMAGE_ACCESS=true` 显式保持图片直链公开。
- 增强分享兼容：分享页返回的图片 URL 自动带 `shareToken`，受保护直链仍可在分享页正常展示。
- 增强相册隐私：锁定相册下的图片直链需要登录态、相册 token 或相册密码。
- 增强 URL 上传安全：阻断 localhost/私有网段访问，限制重定向次数和下载大小，降低 SSRF 与大文件风险。
- 新增上传自动重命名：通过 `AUTO_RENAME_UPLOADS` 与 `UPLOAD_RENAME_PATTERN` 控制图片上传命名。
- 优化魔法搜索：增加 CLIP/翻译模型预热、模型缓存持久化、损坏 ONNX 文件校验与清理。
- 修复分页路径处理、文件名编码、`upload-file` 重名分支等问题。

---

## 功能概览

### 核心功能

- 多格式上传：图片、视频、音频和通用文件上传。
- 图片管理：瀑布流展示、批量选择、删除、移动、重命名。
- 目录与相册：多级目录管理，相册封面，相册密码保护。
- 分享能力：相册分享、过期时间、阅后即焚、撤销分享。
- 实时图片处理：支持 URL 参数缩放、质量、格式转换、宫格切片。
- 图片工具：在线编辑、裁剪、压缩、SVG 转 PNG。
- 统计看板：上传量、访问量、热门图片。
- 地图轨迹：读取照片 GPS 信息并在地图展示。
- 魔法搜索：基于本地 CLIP 小模型的自然语言搜图。

### API 能力

- 上传：`/api/upload`、`/api/upload-base64`、`/api/upload-url`、`/api/upload-file`
- 管理：`/api/images`、`/api/directories`、`/api/batch/move`
- 分享：`/api/share/generate`、`/api/share/access`
- 搜索：`/api/search/semantic`
- 图片访问：`/api/images/<path>?w=500&h=300&q=80&fmt=webp`

---

## 软件预览

<details open>
<summary><b>点击收起/展开截图</b></summary>
<br>

### 魔法搜索 & 主要界面

| 魔法搜索 | 登录页面 |
| :---: | :---: |
| ![魔法搜索](client/public/magicsearch.jpeg) | ![登录页面](client/public/login.jpg) |

| 图片管理 | 批量操作 |
| :---: | :---: |
| ![图片管理](client/public/cloudimgs.jpg) | ![批量操作](client/public/batch.jpg) |

### 功能展示

| 相册分享 | 整页上传 |
| :---: | :---: |
| ![相册分享](client/public/share.jpg) | ![整页上传](client/public/upload.jpg) |

| 轨迹地图 | 图片编辑 |
| :---: | :---: |
| ![照片轨迹](client/public/map.jpg) | ![图片编辑](client/public/edit.jpg) |

| 开放接口 | 移动端 |
| :---: | :---: |
| ![开放接口](client/public/api.jpg) | ![移动端](client/public/mobile.jpg) |

</details>

---

## 快速部署

推荐使用 Docker Compose。生产环境建议固定版本号，避免 `latest` 自动变化带来不可预期的升级。

```yaml
services:
  cloudimgs:
    image: ghcr.io/derrors/cloudimgs:v2.0.0
    container_name: cloudimgs-app
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./uploads:/app/uploads:rw
      - ./logs:/app/logs:rw
    environment:
      - PUID=1000
      - PGID=1000
      - UMASK=002
      - NODE_ENV=production
      - PORT=3001
      - STORAGE_PATH=/app/uploads

      # 可选配置
      # - PASSWORD=your_secure_password_here
      # - PUBLIC_IMAGE_ACCESS=false
      # - MAX_FILE_SIZE=104857600
      # - THUMBNAIL_WIDTH=0
      # - AUTO_RENAME_UPLOADS=true
      # - UPLOAD_RENAME_PATTERN=IMG_{datetime}_{random}
      # - ENABLE_MAGIC_SEARCH=true
```

可用镜像标签：

- `ghcr.io/derrors/cloudimgs:v2.0.0`：当前发布版本，推荐生产环境使用。
- `ghcr.io/derrors/cloudimgs:2.0.0`：同版本的无 `v` 标签。
- `ghcr.io/derrors/cloudimgs:latest`：最新发布镜像，适合测试或跟随更新。

如果 GHCR 拉取提示无权限，请先在 GitHub Packages 中确认镜像可见性，或执行 `docker login ghcr.io` 后再部署。原项目镜像 `qazzxxx/cloudimgs:latest` 可用于体验上游能力，但不会包含本 fork 未合并到上游的改动。

---

## 环境变量

| 变量名 | 说明 | 默认值 / 示例 |
| :--- | :--- | :--- |
| `PORT` | 服务端口 | `3001` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `STORAGE_PATH` | 上传与缓存目录 | `./uploads` |
| `PASSWORD` | 访问密码；设置后启用登录保护 | 留空 |
| `PUBLIC_IMAGE_ACCESS` | 图片/文件直链是否公开；设置 `PASSWORD` 后默认不公开 | 未设置时跟随 `PASSWORD` |
| `MAX_FILE_SIZE` | 最大上传大小，单位 Byte | `104857600` |
| `ALLOWED_EXTENSIONS` | 允许上传的扩展名 | `.jpg,.jpeg,.png,...` |
| `THUMBNAIL_WIDTH` | 列表缩略图宽度，`0` 表示原图 | `0` |
| `AUTO_RENAME_UPLOADS` | 上传图片是否自动重命名 | `false` |
| `UPLOAD_RENAME_PATTERN` | 自动重命名格式 | `IMG_{datetime}_{random}` |
| `ENABLE_MAGIC_SEARCH` | 是否启用 CLIP 魔法搜索 | `false` |
| `HF_ENDPOINT` | HuggingFace 镜像地址 | Docker 默认 `https://hf-mirror.com` |
| `PUID` / `PGID` | 容器内运行用户 UID/GID | `1000` |
| `UMASK` | 文件权限掩码 | `002` / `0022` |

---

## 上传自动重命名

开启：

```env
AUTO_RENAME_UPLOADS=true
UPLOAD_RENAME_PATTERN=IMG_{datetime}_{random}
```

可用占位符：

| 占位符 | 含义 | 示例 |
| :--- | :--- | :--- |
| `{datetime}` | 日期时间 | `20260627-214501` |
| `{date}` | 日期 | `20260627` |
| `{time}` | 时间 | `214501` |
| `{timestamp}` | 毫秒时间戳 | `1782577501000` |
| `{random}` | 8 位随机十六进制 | `a1b2c3d4` |
| `{uuid}` | UUID | `550e8400-e29b-41d4-a716-446655440000` |
| `{name}` | 原始文件名，不含扩展名 | `cat` |

推荐格式：

- `IMG_{datetime}_{random}`：排序友好，适合大多数场景。
- `{name}_{datetime}`：保留来源名称，适合人工管理。
- `{uuid}`：最强唯一性，适合机器集成。
- `{timestamp}_{random}`：简单稳定，适合日志排查。

说明：

- 只在 `AUTO_RENAME_UPLOADS=true` 时启用。
- 扩展名会根据原文件或 MIME 自动保留。
- 对图片 MIME 不会继承危险扩展名，例如原始名 `evil.php` 会按 MIME 保存为 `.png`、`.jpg` 等图片扩展名。
- 显式传入 `overwrite=true` 或 `/api/upload-file` 的 `filename` 时，仍以调用方指定名称优先。
- 重名处理继续使用原有 `ALLOW_DUPLICATE_NAMES` 与 `DUPLICATE_STRATEGY`。

---

## 访问控制说明

设置 `PASSWORD` 后：

- Web 管理端需要登录。
- 上传、删除、移动、设置、统计、魔法搜索等 API 需要访问密码或登录 cookie。
- 图片/文件直链默认也需要登录态。
- 分享页可通过分享 token 访问对应图片。
- 如需传统公开图床直链，设置 `PUBLIC_IMAGE_ACCESS=true`。

相册密码：

- 锁定相册的列表访问需要相册密码。
- 锁定相册下的图片直链需要登录态、相册 token 或相册密码。
- 目录封面不会泄露锁定相册内部图片。

---

## 本地开发

安装依赖：

```bash
npm ci --legacy-peer-deps
cd client && npm ci --legacy-peer-deps
```

开发运行：

```bash
npm run dev
```

构建前端：

```bash
npm run build
```

启动生产服务：

```bash
npm start
```

---

## Change Log

### Unreleased

- README 更新为当前 fork 项目说明，补充原项目来源、fork 改动、访问控制和变更记录。
- Docker Compose 部署示例改为使用本 fork 已发布的 GHCR 镜像。

### 2026-06-27

- 新增上传图片自动重命名开关：`AUTO_RENAME_UPLOADS`。
- 新增重命名格式配置：`UPLOAD_RENAME_PATTERN`。
- 支持 `{datetime}`、`{date}`、`{time}`、`{timestamp}`、`{random}`、`{uuid}`、`{name}` 占位符。
- 自动重命名覆盖普通上传、base64 上传、URL 上传、图片处理后保存等入口。
- 强化图片扩展名推导，避免图片上传继承危险扩展名。
- 敏感 API 补充鉴权，包括设置接口和魔法搜索管理接口。
- 设置 `PASSWORD` 后，图片/文件直链默认需要登录态或分享 token。
- 新增 `PUBLIC_IMAGE_ACCESS` 兼容开关。
- URL 上传增加 SSRF 防护、重定向限制和下载大小限制。
- 修复 `upload-file` 自定义文件名重名时的运行时错误。

### 原项目能力

- 自托管图床、相册管理、分享链接、图片处理、地图轨迹、流量看板、魔法搜索、在线图片工具等能力来自原项目 [qazzxxx/cloudimgs](https://github.com/qazzxxx/cloudimgs)。

---

## 致谢

感谢原项目 [qazzxxx/cloudimgs](https://github.com/qazzxxx/cloudimgs) 的设计与实现。本 fork 的改动均建立在原项目基础之上。

## License

沿用原项目许可证。
