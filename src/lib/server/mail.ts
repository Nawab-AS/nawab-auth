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
		'Your Nawab Auth account has been verified by an admin.',
		"You can now use 'Login with Nawab Auth' to access allowed services.",
		'',
		`If this was unexpected, contact support at ${getSupportEmail()}.`
	].join('\n');
}

function buildHtmlBody(input: VerificationEmailInput): string {
	const text = buildTextBody(input)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

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
