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
		'Your Nawab Auth account has been verified by an administrator.',
		'You can now use Login with Nawab Auth and receive your OpenRouter API key on first SSO approval.',
		'',
		`If this was unexpected, contact support at ${getSupportEmail()}.`
	].join('\n');
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<boolean> {
	const apiKey = getResendApiKey();
	const from = getFromAddress();
	if (!apiKey || !from || !input.to) {
		console.warn('Verification email skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL.');
		return false;
	}

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
			text: buildTextBody(input)
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Failed to send verification email:', response.status, errorText);
		return false;
	}

	return true;
}
