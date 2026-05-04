import { env } from '$env/dynamic/private';

interface VerificationEmailInput {
	to: string;
	preferredName?: string | null;
}

function getSupportEmail() {
	return env.SUPPORT_EMAIL?.trim() || 'support@example.com';
}

function getFromAddress() {
	return env.RESEND_FROM_EMAIL?.trim() || '';
}

function getResendApiKey() {
	return env.RESEND_API_KEY?.trim() || '';
}

function buildTextBody(input: VerificationEmailInput): string {
	const name = input.preferredName?.trim() || 'there';
	return [
		`Hi ${name},`,
		'',
		'Your Nawab Auth account has been verified! You’re almost ready to go.',
		'',
		'Next Steps:',
		'1. Go to Nawab Chat (https://chat.nawab-as.dev) and click "Sign in with Nawab Auth"',
		'2. Click the "Generate API Key" Button and copy it',
		'3. Open the "set API key" menu (open the model seletor and hover over the gear icon) and paste the API key that you just copied',
		'4. Enjoy access to a library of 300+ LLMs',
		'',
		'Note: Treat your API key like a password. Anyone with it can access your credits. If your API key gets leaked, contact support immediately',
		'',
		'Signed,',
		' - A Robot',
		'',
		`If this was unexpected, contact support at mailto:${getSupportEmail()}.`
	].join('\n');
}

function buildHtmlBody(input: VerificationEmailInput): string {
	// Escape first to avoid HTML injection, then linkify the escaped text.
	let text = buildTextBody(input)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	// Linkify http/https URLs.
	text = text.replace(
		/(https?:\/\/[\w\-._~:\/?#[\]@!$&'()*+,;=%]+)\)/g,
		'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>)'
	);

	// Convert raw email addresses into mailto links.
	text = text.replace(
		/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
		'<a href="mailto:$1">$1</a>'
	);

	// Use HTML content so Resend can inject its open-tracking pixel (if enabled in your Resend settings).
	return `<p style="white-space: pre-wrap;">${text}</p>`;
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<boolean> {
	const apiKey = getResendApiKey();
	const from = getFromAddress();
	if (!apiKey || !from || !input.to) {
		console.warn('Verification email skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL.');
		return false;
	}

	const textBody = buildTextBody(input);
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from,
			to: [input.to],
			subject: 'Your Nawab Auth account is verified',
			// Adding HTML allows Resend to inject the tracking pixel (open tracking), when enabled on your Resend account.
			html: buildHtmlBody(input),
			text: textBody
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Failed to send verification email:', response.status, errorText);
		return false;
	}

	return true;
}
