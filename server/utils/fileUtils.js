const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const config = require('../../config');

const CACHE_DIR_NAME = ".cache";
const IMAGE_MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
};
const SAFE_IMAGE_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif",
    ".bmp",
    ".svg",
]);

function safeJoin(base, target) {
    const resolvedBase = path.resolve(base);
    const targetPath = path.resolve(resolvedBase, target || "");
    const relative = path.relative(resolvedBase, targetPath);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("非法目录路径");
    }
    return targetPath;
}

function sanitizeFilename(filename) {
    try {
        if (filename.includes("%")) {
            filename = decodeURIComponent(filename);
        }
        if (Buffer.isBuffer(filename)) {
            filename = filename.toString("utf8");
        }
        if (config.storage.filename.sanitizeSpecialChars) {
            filename = filename.replace(
                /[<>:"/\\|?*]/g,
                config.storage.filename.specialCharReplacement
            );
        }
        return filename;
    } catch (error) {
        console.warn("文件名处理错误:", error);
        return filename.replace(
            /[<>:"/\\|?*]/g,
            config.storage.filename.specialCharReplacement
        );
    }
}

function normalizeOriginalName(originalName) {
    let normalized = originalName || "";
    if (Buffer.isBuffer(normalized)) {
        normalized = normalized.toString("utf8");
    }
    if (!/[^\u0000-\u00ff]/.test(normalized)) {
        try {
            normalized = Buffer.from(normalized, "latin1").toString("utf8");
        } catch (e) { }
    }
    return normalized;
}

function isImageMimeType(mimetype) {
    return String(mimetype || "").toLowerCase().startsWith("image/");
}

function getExtensionFromNameOrMime(originalName, mimetype, fallbackExt = ".png") {
    const nameExt = path.extname(originalName || "").toLowerCase();
    if (nameExt && (!isImageMimeType(mimetype) || SAFE_IMAGE_EXTENSIONS.has(nameExt))) {
        return nameExt;
    }

    const mimeExt = IMAGE_MIME_EXTENSIONS[String(mimetype || "").toLowerCase()];
    if (mimeExt) return mimeExt;

    const normalizedFallback = String(fallbackExt || ".png").toLowerCase();
    return normalizedFallback.startsWith(".") ? normalizedFallback : `.${normalizedFallback}`;
}

function formatDatePart(value) {
    return String(value).padStart(2, "0");
}

function getRenameDateParts(now = new Date()) {
    const year = now.getFullYear();
    const month = formatDatePart(now.getMonth() + 1);
    const day = formatDatePart(now.getDate());
    const hour = formatDatePart(now.getHours());
    const minute = formatDatePart(now.getMinutes());
    const second = formatDatePart(now.getSeconds());
    return {
        date: `${year}${month}${day}`,
        time: `${hour}${minute}${second}`,
        datetime: `${year}${month}${day}-${hour}${minute}${second}`,
    };
}

function buildAutoRenameFilename(originalName, mimetype, fallbackExt = ".png") {
    const normalizedName = normalizeOriginalName(originalName);
    const ext = getExtensionFromNameOrMime(normalizedName, mimetype, fallbackExt);
    const originalBase = sanitizeFilename(path.basename(normalizedName || "image", path.extname(normalizedName || ""))) || "image";
    const dateParts = getRenameDateParts();
    const tokens = {
        ...dateParts,
        timestamp: String(Date.now()),
        random: crypto.randomBytes(4).toString("hex"),
        uuid: crypto.randomUUID(),
        name: originalBase,
    };

    const rawPattern = config.upload.autoRename.pattern || "IMG_{datetime}_{random}";
    const rendered = rawPattern.replace(/\{(date|time|datetime|timestamp|random|uuid|name)\}/g, (_, key) => tokens[key]);
    const safeBase = sanitizeFilename(rendered).replace(/^\.+$/, "") || `IMG_${tokens.datetime}_${tokens.random}`;
    return `${safeBase}${ext}`;
}

function getUploadFilename(originalName, mimetype, fallbackExt = ".png", options = {}) {
    const normalizedName = normalizeOriginalName(originalName);
    if (!options.forceOriginal && config.upload.autoRename.enabled && isImageMimeType(mimetype)) {
        return buildAutoRenameFilename(normalizedName, mimetype, fallbackExt);
    }
    return sanitizeFilename(normalizedName || `upload${getExtensionFromNameOrMime("", mimetype, fallbackExt)}`);
}

function resolveDuplicateFilename(dest, filename) {
    if (config.upload.allowDuplicateNames) return filename;

    const ext = path.extname(filename);
    const nameWithoutExt = path.basename(filename, ext);
    let finalName = filename;
    let counter = 1;

    while (fs.existsSync(path.join(dest, finalName))) {
        if (config.upload.duplicateStrategy === "timestamp") {
            finalName = `${nameWithoutExt}_${Date.now()}_${counter}${ext}`;
        } else if (config.upload.duplicateStrategy === "counter") {
            finalName = `${nameWithoutExt}_${counter}${ext}`;
        } else if (config.upload.duplicateStrategy === "overwrite") {
            break;
        }
        counter++;
    }

    return finalName;
}

async function generateThumbHash(filePath) {
    try {
        const dir = path.dirname(filePath);
        const filename = path.basename(filePath);

        const ext = path.extname(filename).toLowerCase();
        if (['.mp4', '.webm'].includes(ext)) {
            return null;
        }

        const cacheDir = path.join(dir, CACHE_DIR_NAME);
        const cacheFile = path.join(cacheDir, `${filename}.th`);

        await fs.ensureDir(cacheDir);

        const image = sharp(filePath).resize(100, 100, { fit: 'inside' });
        const { data, info } = await image
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { rgbaToThumbHash } = await import("thumbhash");
        const binaryHash = rgbaToThumbHash(info.width, info.height, data);
        await fs.writeFile(cacheFile, Buffer.from(binaryHash));
        return Buffer.from(binaryHash).toString('base64');
    } catch (err) {
        console.error(`Failed to generate thumbhash for ${filePath}:`, err);
        return null;
    }
}

async function getThumbHash(filePath) {
    try {
        const dir = path.dirname(filePath);
        const filename = path.basename(filePath);
        const cacheFile = path.join(dir, CACHE_DIR_NAME, `${filename}.th`);

        if (await fs.pathExists(cacheFile)) {
            const buffer = await fs.readFile(cacheFile);
            return buffer.toString('base64');
        }
        return null;
    } catch (err) {
        return null;
    }
}

async function saveBase64Image(base64Data, dir, options = {}) {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('无效的 base64 图片格式');
    }

    const mimetype = matches[1];
    if (!/^image\//.test(mimetype)) {
        throw new Error('仅允许图片类型的 base64 上传');
    }
    const buffer = Buffer.from(matches[2], 'base64');

    const targetDir = safeJoin(config.storage.path, dir);
    await fs.ensureDir(targetDir);

    const ext = getExtensionFromNameOrMime(options.originalName, mimetype, "png");
    const initialFilename = config.upload.autoRename.enabled
        ? getUploadFilename(options.originalName || `upload${ext}`, mimetype, ext)
        : `${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`;
    const filename = resolveDuplicateFilename(targetDir, initialFilename);
    const filePath = path.join(targetDir, filename);
    await fs.promises.writeFile(filePath, buffer);

    return {
        filename,
        filePath,
        size: buffer.length,
        mimetype
    };
}

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }

    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
}

function isPrivateIPv6(ip) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice('::ffff:'.length);
        if (net.isIP(mapped) === 4) return isPrivateIPv4(mapped);
    }
    return false;
}

function isPublicAddress(address) {
    const family = net.isIP(address);
    if (family === 4) return !isPrivateIPv4(address);
    if (family === 6) return !isPrivateIPv6(address);
    return false;
}

async function resolvePublicAddress(hostname) {
    if (!hostname) throw new Error('URL 主机名无效');
    if (hostname.toLowerCase() === 'localhost') throw new Error('不允许访问本机地址');

    if (net.isIP(hostname)) {
        if (!isPublicAddress(hostname)) throw new Error('不允许访问私有或本机地址');
        return hostname;
    }

    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
        throw new Error('不允许访问私有或本机地址');
    }
    return addresses[0].address;
}

function validateDownloadUrl(urlObj) {
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('仅支持 http/https URL');
    }
    if (!urlObj.hostname) {
        throw new Error('URL 主机名无效');
    }
}

async function downloadFromUrl(imageUrl, redirectCount = 0) {
    const MAX_REDIRECTS = 5;
    const maxBytes = config.upload.maxFileSize;

    if (redirectCount > MAX_REDIRECTS) {
        throw new Error('重定向次数过多');
    }

    const urlObj = new URL(imageUrl);
    validateDownloadUrl(urlObj);
    const publicAddress = await resolvePublicAddress(urlObj.hostname);

    return new Promise((resolve, reject) => {
        const protocol = urlObj.protocol === 'https:' ? require('https') : require('http');

        const options = {
            hostname: publicAddress,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Host': urlObj.host,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            servername: urlObj.hostname,
            timeout: 30000
        };

        let settled = false;
        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        const req = protocol.request(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, urlObj).toString();
                settled = true;
                res.resume();
                downloadFromUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                fail(new Error(`下载失败: HTTP ${res.statusCode}`));
                return;
            }

            const contentType = res.headers['content-type'] || '';
            if (!contentType.startsWith('image/')) {
                res.resume();
                fail(new Error('URL 不是图片类型'));
                return;
            }

            const contentLength = Number(res.headers['content-length'] || 0);
            if (contentLength > maxBytes) {
                res.resume();
                fail(new Error(`图片大小超过限制，最大允许 ${Math.round((maxBytes / (1024 * 1024)) * 100) / 100}MB`));
                return;
            }

            const chunks = [];
            let received = 0;
            res.on('data', (chunk) => {
                received += chunk.length;
                if (received > maxBytes) {
                    req.destroy();
                    fail(new Error(`图片大小超过限制，最大允许 ${Math.round((maxBytes / (1024 * 1024)) * 100) / 100}MB`));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                if (settled) return;
                settled = true;
                const buffer = Buffer.concat(chunks);
                resolve({
                    buffer,
                    mimetype: contentType
                });
            });
            res.on('error', fail);
        });

        req.on('error', fail);
        req.on('timeout', () => {
            req.destroy();
            fail(new Error('下载超时'));
        });

        req.end();
    });
}

module.exports = {
    safeJoin,
    sanitizeFilename,
    generateThumbHash,
    getThumbHash,
    getUploadFilename,
    isImageMimeType,
    normalizeOriginalName,
    resolveDuplicateFilename,
    saveBase64Image,
    downloadFromUrl,
    CACHE_DIR_NAME,
    TRASH_DIR_NAME: ".trash",
    CONFIG_DIR_NAME: "config"
};
