const config = require('../../config');
const crypto = require('crypto');

const AUTH_COOKIE_NAME = "cloudimgs_auth";
const AUTH_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60;

function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};

    return header.split(";").reduce((cookies, part) => {
        const index = part.indexOf("=");
        if (index === -1) return cookies;

        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!key) return cookies;

        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
        return cookies;
    }, {});
}

function timingSafeEqualString(a, b) {
    const aBuffer = Buffer.from(String(a));
    const bBuffer = Buffer.from(String(b));
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function signAuthTimestamp(timestamp) {
    return crypto
        .createHmac("sha256", config.security.password.accessPassword)
        .update(String(timestamp))
        .digest("hex");
}

function createAuthToken() {
    const timestamp = Date.now();
    return `${timestamp}.${signAuthTimestamp(timestamp)}`;
}

function verifyAuthToken(token) {
    if (!config.security.password.enabled || !token) return false;

    const [timestampRaw, signature] = String(token).split(".");
    const timestamp = Number(timestampRaw);
    if (!Number.isFinite(timestamp) || !signature) return false;

    const ageMs = Date.now() - timestamp;
    if (ageMs < 0 || ageMs > AUTH_TOKEN_MAX_AGE_SECONDS * 1000) return false;

    const expected = signAuthTimestamp(timestamp);
    return timingSafeEqualString(signature, expected);
}

function getRequestPassword(req) {
    return req.headers["x-access-password"] || req.body?.password || req.query?.password;
}

function hasValidAccess(req) {
    if (!config.security.password.enabled) return true;

    const password = getRequestPassword(req);
    if (password && timingSafeEqualString(password, config.security.password.accessPassword)) {
        return true;
    }

    const cookies = parseCookies(req);
    return verifyAuthToken(cookies[AUTH_COOKIE_NAME]);
}

function setAuthCookie(res) {
    if (!config.security.password.enabled) return;

    res.cookie(AUTH_COOKIE_NAME, createAuthToken(), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        maxAge: AUTH_TOKEN_MAX_AGE_SECONDS * 1000,
        path: "/"
    });
}

function clearAuthCookie(res) {
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        path: "/"
    });
}

function requirePassword(req, res, next) {
    if (!config.security.password.enabled) {
        return next();
    }

    if (!getRequestPassword(req) && !parseCookies(req)[AUTH_COOKIE_NAME]) {
        return res.status(401).json({ error: "需要提供访问密码" });
    }

    if (!hasValidAccess(req)) {
        clearAuthCookie(res);
        return res.status(401).json({ error: "密码错误" });
    }

    next();
}

module.exports = {
    AUTH_COOKIE_NAME,
    AUTH_TOKEN_MAX_AGE_SECONDS,
    clearAuthCookie,
    hasValidAccess,
    requirePassword,
    setAuthCookie
};
