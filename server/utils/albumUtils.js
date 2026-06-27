const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const config = require('../../config');
const { safeJoin, CACHE_DIR_NAME, CONFIG_DIR_NAME, TRASH_DIR_NAME } = require('./fileUtils');

const STORAGE_PATH = config.storage.path;
const ALBUM_TOKEN_MAX_AGE_SECONDS = 60 * 60;

function normalizeDirPath(dirPath) {
    return (dirPath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function timingSafeEqualString(a, b) {
    const aBuffer = Buffer.from(String(a));
    const bBuffer = Buffer.from(String(b));
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

async function getAlbumPasswordPath(dirPath) {
    const absDir = safeJoin(STORAGE_PATH, dirPath);
    return path.join(absDir, "config", "album_password.json");
}

async function verifyAlbumPassword(dirPath, password) {
    try {
        const configPath = await getAlbumPasswordPath(dirPath);
        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath);
            return timingSafeEqualString(data.password || "", password || "");
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function readAlbumPassword(dirPath) {
    const configPath = await getAlbumPasswordPath(dirPath);
    if (!await fs.pathExists(configPath)) return null;
    const data = await fs.readJson(configPath);
    return data.password || null;
}

async function isAlbumLocked(dirPath) {
    try {
        const configPath = await getAlbumPasswordPath(dirPath);
        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath);
            return !!data.password;
        }
    } catch (e) { }
    return false;
}

async function getAllLockedDirectories() {
    const lockedDirs = [];
    async function scan(dir) {
        const absDir = safeJoin(STORAGE_PATH, dir);
        try {
            const files = await fs.readdir(absDir);
            for (const file of files) {
                if (file === CACHE_DIR_NAME || file === CONFIG_DIR_NAME || file === TRASH_DIR_NAME) continue;
                if (file.startsWith('.')) continue;

                const filePath = path.join(absDir, file);
                const stats = await fs.stat(filePath);
                if (stats.isDirectory()) {
                    const relPath = path.join(dir, file).replace(/\\/g, "/");
                    if (await isAlbumLocked(relPath)) {
                        lockedDirs.push(relPath);
                    }
                    await scan(relPath);
                }
            }
        } catch (e) { }
    }
    await scan("");
    return lockedDirs;
}

async function getLockedDirectoryForPath(relPath) {
    const normalized = normalizeDirPath(relPath);
    if (!normalized) return null;

    const lockedDirs = await getAllLockedDirectories();
    return lockedDirs
        .sort((a, b) => b.length - a.length)
        .find((dir) => normalized === dir || normalized.startsWith(`${dir}/`)) || null;
}

function signAlbumToken(dirPath, password, timestamp) {
    return crypto
        .createHmac("sha256", password)
        .update(`${normalizeDirPath(dirPath)}:${timestamp}`)
        .digest("hex");
}

function createAlbumAccessToken(dirPath, password) {
    if (!password) return null;
    const timestamp = Date.now();
    return `${timestamp}.${signAlbumToken(dirPath, password, timestamp)}`;
}

async function verifyAlbumAccessToken(dirPath, token) {
    if (!token) return false;

    try {
        const password = await readAlbumPassword(dirPath);
        if (!password) return true;

        const [timestampRaw, signature] = String(token).split(".");
        const timestamp = Number(timestampRaw);
        if (!Number.isFinite(timestamp) || !signature) return false;

        const ageMs = Date.now() - timestamp;
        if (ageMs < 0 || ageMs > ALBUM_TOKEN_MAX_AGE_SECONDS * 1000) return false;

        const expected = signAlbumToken(dirPath, password, timestamp);
        return timingSafeEqualString(signature, expected);
    } catch {
        return false;
    }
}

module.exports = {
    ALBUM_TOKEN_MAX_AGE_SECONDS,
    createAlbumAccessToken,
    getAlbumPasswordPath,
    getLockedDirectoryForPath,
    verifyAlbumPassword,
    verifyAlbumAccessToken,
    isAlbumLocked,
    getAllLockedDirectories
};
