import express from "express";
import session from "express-session";
import passport from "passport";
import passportOpenIdConnect from "passport-openidconnect";

const app = express();
const { Strategy: OpenIDConnectStrategy } = passportOpenIdConnect;

const PORT = Number(process.env.PORT ?? 4000);
const DOMAIN_SERVER = (
	process.env.DOMAIN_SERVER ?? `http://localhost:${PORT}`
).replace(/\/$/, "");
const OPENID_ISSUER = (
	process.env.OPENID_ISSUER ?? "http://localhost:5173"
).replace(/\/$/, "");
const OPENID_CLIENT_ID = process.env.OPENID_CLIENT_ID ?? "librechat-client";
const OPENID_CLIENT_SECRET = process.env.OPENID_CLIENT_SECRET ?? "dev-secret";
const OPENID_SCOPE = process.env.OPENID_SCOPE ?? "openid profile email";
const OPENID_CALLBACK_URL =
	process.env.OPENID_CALLBACK_URL ?? `${DOMAIN_SERVER}/oauth/openid/callback`;
const SESSION_SECRET =
	process.env.SESSION_SECRET ?? "oidc-debug-session-secret-change-me";

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(
	session({
		secret: SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			sameSite: "lax",
			secure: false,
			maxAge: 15 * 60 * 1000
		}
	})
);
app.use(passport.initialize());

app.use((req, _res, next) => {
	console.log(
		`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
	);
	next();
});

const parseJwtPayload = (jwt) => {
	if (!jwt || typeof jwt !== "string") {
		return null;
	}

	const parts = jwt.split(".");
	if (parts.length < 2) {
		return null;
	}

	try {
		const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const pad = base64.length % 4;
		const normalized = pad ? `${base64}${"=".repeat(4 - pad)}` : base64;
		return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
	} catch {
		return null;
	}
};

const resolveHref = (value, fallback = DOMAIN_SERVER) => {
	if (typeof value !== "string" || !value.trim()) {
		return fallback;
	}

	try {
		return new URL(value.trim(), fallback).toString();
	} catch {
		return fallback;
	}
};

passport.use(
	"openid",
	new OpenIDConnectStrategy(
		{
			issuer: OPENID_ISSUER,
			authorizationURL: `${OPENID_ISSUER}/oauth/authorize`,
			tokenURL: `${OPENID_ISSUER}/oauth/token`,
			userInfoURL: `${OPENID_ISSUER}/oauth/userinfo`,
			clientID: OPENID_CLIENT_ID,
			clientSecret: OPENID_CLIENT_SECRET,
			callbackURL: OPENID_CALLBACK_URL,
			scope: OPENID_SCOPE,
			passReqToCallback: false
		},
		(...args) => {
			const done = args.at(-1);
			const issuer = args[0] ?? null;
			const profile = args[1] ?? null;
			const context = args[2] ?? null;
			const idToken = args[3] ?? null;
			const accessToken = args[4] ?? null;
			const refreshToken = args[5] ?? null;
			const params = args[6] ?? null;

			const validatedUser = {
				validated: true,
				issuer,
				profile,
				context,
				tokens: {
					id_token: idToken,
					access_token: accessToken,
					refresh_token: refreshToken,
					params
				},
				id_token_claims: parseJwtPayload(idToken)
			};

			return done(null, validatedUser);
		}
	)
);

app.get("/login", (req, res) => {
	const loginUrl = new URL("/oauth/openid", DOMAIN_SERVER);

	for (const key of ["scope", "state", "nonce"]) {
		const value = req.query[key];
		if (typeof value === "string" && value.trim()) {
			loginUrl.searchParams.set(key, value);
		}
	}

	const inferredRedirect = resolveHref(
		typeof req.query.redirect === "string" && req.query.redirect.trim()
			? req.query.redirect
			: req.get("referer") ?? req.get("referrer") ?? ""
	);

	const noRedirect = String(req.query.preview ?? "true").toLowerCase() === "false";
	if (noRedirect) {
		res.json({
			route: "/login",
			action: "simulate_login_attempt",
			next: loginUrl.toString(),
			callback: `${OPENID_CALLBACK_URL}?redirect=${encodeURIComponent(inferredRedirect)}`,
			redirect: inferredRedirect
		});
		return;
	}

	res.redirect(loginUrl.toString());
});

app.get("/oauth/openid", (req, res, next) => {
	const scope = String(req.query.scope ?? OPENID_SCOPE)
		.split(/\s+/)
		.filter(Boolean);
	const redirectTarget =
		resolveHref(
			typeof req.query.redirect === "string" && req.query.redirect.trim()
				? req.query.redirect
				: ""
			);
	const callbackURL = redirectTarget
		? `${OPENID_CALLBACK_URL}?redirect=${encodeURIComponent(redirectTarget)}`
		: OPENID_CALLBACK_URL;

	passport.authenticate("openid", {
		scope,
		session: false,
		state: String(req.query.state ?? crypto.randomUUID()),
		nonce: String(req.query.nonce ?? crypto.randomUUID()),
		callbackURL
	})(req, res, next);
});

const completeValidation = (req, res, next) => {
	passport.authenticate(
		"openid",
		{
			failureRedirect: "/oauth/error",
			failureMessage: true,
			session: false
		},
		(error, user, info) => {
			if (error) {
				res.status(401).json({
					validated: false,
					error: error.message,
					info
				});
				return;
			}

			if (!user) {
				res.status(401).json({
					validated: false,
					error: "OIDC validation failed",
					info
				});
				return;
			}

			res.json({
				validated: true,
				result: user,
				redirect:
					typeof req.query.redirect === "string"
						? resolveHref(req.query.redirect)
						: null
			});
		}
	)(req, res, next);
};

app.get("/oauth/openid/callback", completeValidation);

app.get("/oauth/error", (req, res) => {
	const errorMessage = req.session?.messages?.pop() ?? "Unknown OAuth error";
	res.status(401).json({
		error: "oauth_authentication_failed",
		message: errorMessage
	});
});

app.use((req, res) => {
	res.status(404).json({
		error: "not_found",
		message: `No route for ${req.method} ${req.originalUrl}`
	});
});

app.listen(PORT, () => {
	console.log(`OIDC debug server listening on http://localhost:${PORT}`);
	console.log(`OpenID issuer: ${OPENID_ISSUER}`);
});
