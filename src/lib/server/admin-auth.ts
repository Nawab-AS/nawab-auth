import { env } from '$env/dynamic/private';
import { getSupabaseUrl } from '$lib/server/supabase';
import type { LinkedProvider } from '$lib/server/providers';

interface AdminIdentity {
	identity_id: string;
	provider?: string;
	created_at?: string;
}

interface AdminUserResponse {
	id: string;
	email?: string;
	identities?: AdminIdentity[];
}

interface AdminGenerateLinkResponse {
	action_link?: string;
}

function mapProviders(identities: AdminIdentity[] | undefined): LinkedProvider[] {
	return (identities ?? [])
		.map((identity) => ({
			provider: identity.provider ?? '',
			identityId: identity.identity_id,
			createdAt: identity.created_at ?? null
		}))
		.filter((identity) => identity.provider.length > 0);
}

function getServiceRoleKey() {
	return env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
}

function createAdminHeaders(serviceRoleKey: string): HeadersInit {
	return {
		apikey: serviceRoleKey,
		Authorization: `Bearer ${serviceRoleKey}`,
		'Content-Type': 'application/json'
	};
}

async function fetchAdminUser(userId: string): Promise<AdminUserResponse | null> {
	const serviceRoleKey = getServiceRoleKey();
	if (!serviceRoleKey) {
		return null;
	}

	const url = new URL(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, getSupabaseUrl());
	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: createAdminHeaders(serviceRoleKey)
	});

	if (!response.ok) {
		return null;
	}

	return (await response.json()) as AdminUserResponse;
}

export async function getAdminUserEmail(userId: string): Promise<string | null> {
	const user = await fetchAdminUser(userId);
	return user?.email ?? null;
}

export async function getAdminUserProviders(userId: string): Promise<LinkedProvider[] | null> {
	const user = await fetchAdminUser(userId);
	if (!user) {
		return null;
	}

	return mapProviders(user.identities);
}

export async function revokeProviderForUser(userId: string, provider: string): Promise<boolean | null> {
	const serviceRoleKey = getServiceRoleKey();
	if (!serviceRoleKey) {
		return null;
	}

	const providers = await getAdminUserProviders(userId);
	if (!providers) {
		return null;
	}

	const matchingIdentity = providers.find((identity) => identity.provider === provider);
	if (!matchingIdentity) {
		return false;
	}

	const url = new URL(
		`/auth/v1/admin/users/${encodeURIComponent(userId)}/identities/${encodeURIComponent(matchingIdentity.identityId)}`,
		getSupabaseUrl()
	);

	const response = await fetch(url.toString(), {
		method: 'DELETE',
		headers: createAdminHeaders(serviceRoleKey)
	});

	if (!response.ok) {
		throw new Error(`Failed to revoke provider: ${response.status} ${response.statusText}`);
	}

	return true;
}

export async function generateImpersonationMagicLink(
	email: string,
	redirectTo: string
): Promise<string | null> {
	const serviceRoleKey = getServiceRoleKey();
	if (!serviceRoleKey) {
		return null;
	}

	const url = new URL('/auth/v1/admin/generate_link', getSupabaseUrl());
	url.searchParams.set('redirect_to', redirectTo);
	const response = await fetch(url.toString(), {
		method: 'POST',
		headers: createAdminHeaders(serviceRoleKey),
		body: JSON.stringify({
			type: 'magiclink',
			email
		})
	});

	if (!response.ok) {
		throw new Error(`Failed to generate impersonation link: ${response.status} ${response.statusText}`);
	}

	const payload = (await response.json()) as AdminGenerateLinkResponse;
	if (!payload.action_link) {
		throw new Error('Supabase did not return an impersonation link.');
	}

	return payload.action_link;
}
